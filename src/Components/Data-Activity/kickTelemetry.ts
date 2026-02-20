import { resolveIntentAttempts, type AttemptRecord } from "./spellCastResolver";
import type { MatchPlayer, MatchTimelineEntry } from "./types";

export const INTERRUPT_TRACKING_VERSION = 3;
const KICK_COLLAPSE_WINDOW_SECONDS = 0.35;

const isIntentSignalEvent = (event: string) => event === "SENT" || event === "START";

const normalizeNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return Number(value);
    }
    return 0;
};

const normalizeCount = (value: unknown) => Math.max(0, Math.trunc(normalizeNumber(value)));

const getCastGuidCollapseKey = (castGUID?: string) => {
    if (!castGUID) return null;
    const match = castGUID.match(/^(.*-)([0-9a-fA-F]{10})$/);
    if (!match) return castGUID;
    const [, prefix, tail] = match;
    return `${prefix}${tail.slice(0, 4)}${tail.slice(5)}`;
};

const hasIntentSignal = (attempt: AttemptRecord) =>
    attempt.events.some((event) => isIntentSignalEvent(event.event));

const collapseKickAttempts = (input: AttemptRecord[]) => {
    const sorted = [...input].sort((a, b) =>
        a.startTime === b.startTime ? a.id.localeCompare(b.id) : a.startTime - b.startTime
    );
    const collapsed: AttemptRecord[] = [];
    let active: AttemptRecord | null = null;

    sorted.forEach((attempt) => {
        if (!active) {
            active = attempt;
            return;
        }

        const sameSpell = active.spellId === attempt.spellId;
        const delta = Math.abs(attempt.startTime - active.endTime);
        const activeGuidKey = getCastGuidCollapseKey(active.castGUID);
        const incomingGuidKey = getCastGuidCollapseKey(attempt.castGUID);
        const similarGuid =
            !!activeGuidKey && !!incomingGuidKey && activeGuidKey === incomingGuidKey;

        if (sameSpell && (similarGuid || delta <= KICK_COLLAPSE_WINDOW_SECONDS)) {
            active = {
                ...active,
                startTime: Math.min(active.startTime, attempt.startTime),
                endTime: Math.max(active.endTime, attempt.endTime),
                events: [...active.events, ...attempt.events].sort((a, b) =>
                    a.t === b.t ? a.index - b.index : a.t - b.t
                ),
                resolvedOutcome:
                    active.resolvedOutcome === "succeeded" || attempt.resolvedOutcome === "succeeded"
                        ? "succeeded"
                        : active.resolvedOutcome === "interrupted" ||
                            attempt.resolvedOutcome === "interrupted"
                          ? "interrupted"
                          : active.resolvedOutcome ?? attempt.resolvedOutcome,
            };
            return;
        }

        collapsed.push(active);
        active = attempt;
    });

    if (active) collapsed.push(active);
    return collapsed;
};

const parseInterruptTuple = (player: MatchPlayer | null) => {
    if (!player) return { issued: null, succeeded: null };
    const raw = (
        player as MatchPlayer & { interrupts?: unknown; interruptions?: unknown }
    ).interruptions ??
        (player as MatchPlayer & { interrupts?: unknown; interruptions?: unknown }).interrupts;

    if (Array.isArray(raw)) {
        return {
            issued: normalizeCount(raw[0]),
            succeeded: normalizeCount(raw[1]),
        };
    }

    if (raw && typeof raw === "object") {
        const tuple = raw as Record<string, unknown>;
        return {
            issued: normalizeCount(tuple["0"] ?? tuple["1"]),
            succeeded: normalizeCount(tuple["1"] ?? tuple["2"]),
        };
    }

    return { issued: null, succeeded: null };
};

export const resolveTelemetryVersion = (rawMatch: unknown) => {
    const raw = rawMatch as { telemetryVersion?: unknown; dataVersion?: unknown };
    const telemetryVersion = normalizeNumber(raw.telemetryVersion);
    if (telemetryVersion > 0) return telemetryVersion;
    const dataVersion = normalizeNumber(raw.dataVersion);
    if (dataVersion > 0) return dataVersion;
    return null;
};

export type KickTelemetrySnapshot = {
    matchId: string;
    telemetryVersion: number | null;
    isLegacyMatch: boolean;
    intentAttempts: number;
    castEvents: number;
    outcomeOnlyAttempts: number;
    succeededAttempts: number;
    interruptedAttempts: number;
    failedAttempts: number;
    unresolvedAttempts: number;
    issued: number | null;
    succeeded: number | null;
};

export const computeKickTelemetrySnapshot = ({
    matchId,
    timeline,
    kickSpellIds,
    owner,
    telemetryVersion,
    includeDiagnostics = false,
}: {
    matchId: string;
    timeline: MatchTimelineEntry[];
    kickSpellIds: number[];
    owner: MatchPlayer | null;
    telemetryVersion: number | null;
    includeDiagnostics?: boolean;
}): KickTelemetrySnapshot => {
    const kickSet = new Set(kickSpellIds.filter((value) => Number.isFinite(value) && value > 0));
    const { rawEvents, attempts } = resolveIntentAttempts(timeline);

    const kickAttemptsRaw = attempts.filter((attempt) => kickSet.has(attempt.spellId));
    const collapsedKickAttempts = collapseKickAttempts(kickAttemptsRaw);
    const attemptsWithIntent = collapsedKickAttempts.filter(hasIntentSignal);

    const intentAttempts = attemptsWithIntent.length;
    let castEvents = 0;
    let outcomeOnlyAttempts = 0;
    let succeededAttempts = 0;
    let interruptedAttempts = 0;
    let failedAttempts = 0;
    let unresolvedAttempts = 0;

    if (includeDiagnostics) {
        const rawKickEvents = rawEvents.filter((event) => kickSet.has(event.spellId));
        castEvents = rawKickEvents.filter((event) => isIntentSignalEvent(event.event)).length;
        outcomeOnlyAttempts = Math.max(0, collapsedKickAttempts.length - intentAttempts);
        succeededAttempts = attemptsWithIntent.filter(
            (attempt) => attempt.resolvedOutcome === "succeeded"
        ).length;
        interruptedAttempts = attemptsWithIntent.filter(
            (attempt) => attempt.resolvedOutcome === "interrupted"
        ).length;
        failedAttempts = attemptsWithIntent.filter(
            (attempt) => attempt.resolvedOutcome === "failed"
        ).length;
        unresolvedAttempts = attemptsWithIntent.filter((attempt) => !attempt.resolvedOutcome).length;
    }

    const { issued, succeeded } = parseInterruptTuple(owner);
    const isLegacyMatch =
        telemetryVersion !== null && telemetryVersion < INTERRUPT_TRACKING_VERSION;

    return {
        matchId,
        telemetryVersion,
        isLegacyMatch,
        intentAttempts,
        castEvents,
        outcomeOnlyAttempts,
        succeededAttempts,
        interruptedAttempts,
        failedAttempts,
        unresolvedAttempts,
        issued,
        succeeded,
    };
};
