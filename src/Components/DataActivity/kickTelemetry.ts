import type { MatchPlayer } from "./types";
import type {
    NormalizedLocalSpellAttempt,
    NormalizedLocalSpellEvent,
    NormalizedLocalSpellModel,
} from "../../Interfaces/local-spell-model";

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

const hasIntentSignal = (attempt: NormalizedLocalSpellAttempt) =>
    attempt.events.some((event) => isIntentSignalEvent(event.event));

const collapseKickIntentEvents = (input: NormalizedLocalSpellEvent[]) => {
    const sorted = [...input].sort((a, b) =>
        a.t === b.t ? a.index - b.index : a.t - b.t
    );
    const collapsed: NormalizedLocalSpellEvent[] = [];
    let active: NormalizedLocalSpellEvent | null = null;

    sorted.forEach((event) => {
        if (!active) {
            active = event;
            return;
        }

        const sameSpell = active.spellId === event.spellId;
        const delta = Math.abs(event.t - active.t);
        const activeGuidKey = getCastGuidCollapseKey(active.castGUID);
        const incomingGuidKey = getCastGuidCollapseKey(event.castGUID);
        const similarGuid =
            !!activeGuidKey && !!incomingGuidKey && activeGuidKey === incomingGuidKey;

        if (sameSpell && (similarGuid || delta <= KICK_COLLAPSE_WINDOW_SECONDS)) {
            if (event.t < active.t || (event.t === active.t && event.index < active.index)) {
                active = event;
            }
            return;
        }

        collapsed.push(active);
        active = event;
    });

    if (active) collapsed.push(active);
    return collapsed;
};

const collapseKickAttempts = (input: NormalizedLocalSpellAttempt[]) => {
    const sorted = [...input].sort((a, b) =>
        a.startTime === b.startTime ? a.id.localeCompare(b.id) : a.startTime - b.startTime
    );
    const collapsed: NormalizedLocalSpellAttempt[] = [];
    let active: NormalizedLocalSpellAttempt | null = null;

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
                outcomes: Array.from(new Set([...active.outcomes, ...attempt.outcomes])),
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

const parseSucceededFromInterruptSpellsBySource = (
    interruptSpellsBySource: unknown,
    owner: MatchPlayer | null
): number | null => {
    const ownerGuid =
        typeof (owner as { guid?: unknown } | null)?.guid === "string"
            ? ((owner as { guid?: string }).guid ?? "").trim()
            : "";
    if (!ownerGuid || !interruptSpellsBySource || typeof interruptSpellsBySource !== "object") {
        return null;
    }

    const bySource = interruptSpellsBySource as Record<string, unknown>;
    const ownerSpells = bySource[ownerGuid];
    if (!ownerSpells || typeof ownerSpells !== "object" || Array.isArray(ownerSpells)) {
        return null;
    }

    const spellCounts = ownerSpells as Record<string, unknown>;
    const total = Object.values(spellCounts).reduce<number>(
        (sum, value) => sum + normalizeCount(value),
        0
    );
    return total > 0 ? total : 0;
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
    isSupported: boolean;
    totalKickAttempts: number;
    intentAttempts: number;
    eventIntentAttempts: number;
    castEvents: number;
    outcomeOnlyAttempts: number;
    landedAttempts: number;
    succeededAttempts: number;
    interruptedAttempts: number;
    failedAttempts: number;
    unresolvedAttempts: number;
    issued: number | null;
    perSourceConfirmedInterrupts: number | null;
    confirmationSource: "per-source" | "scoreboard" | "unavailable";
    confirmedInterrupts: number | null;
    missedKicks: number | null;
    failed: number | null;
    succeeded: number | null;
};

export const computeKickTelemetrySnapshot = ({
    matchId,
    localSpellModel,
    kickSpellIds,
    owner,
    telemetryVersion,
    interruptSpellsBySource,
    includeDiagnostics = false,
}: {
    matchId: string;
    localSpellModel: NormalizedLocalSpellModel | null;
    kickSpellIds: number[];
    owner: MatchPlayer | null;
    telemetryVersion: number | null;
    interruptSpellsBySource?: unknown;
    includeDiagnostics?: boolean;
}): KickTelemetrySnapshot => {
    const kickSet = new Set(kickSpellIds.filter((value) => Number.isFinite(value) && value > 0));
    const isLegacyMatch =
        telemetryVersion !== null && telemetryVersion < INTERRUPT_TRACKING_VERSION;
    const isSupported =
        telemetryVersion !== null &&
        Number.isFinite(telemetryVersion) &&
        telemetryVersion >= INTERRUPT_TRACKING_VERSION;
    const sourceFormat = localSpellModel?.sourceFormat ?? "legacy-timeline";
    const allAttempts = localSpellModel?.attempts ?? [];
    const allEvents = localSpellModel?.events ?? [];

    const kickAttemptsRaw = allAttempts.filter((attempt) => kickSet.has(attempt.spellId));
    const collapsedKickAttempts = collapseKickAttempts(kickAttemptsRaw);
    const attemptsWithIntent = collapsedKickAttempts.filter(hasIntentSignal);
    const scopedAttempts =
        sourceFormat === "legacy-timeline" ? attemptsWithIntent : collapsedKickAttempts;
    const rawKickIntentEvents = allEvents.filter(
        (event) => kickSet.has(event.spellId) && isIntentSignalEvent(event.event)
    );
    const eventIntentAttempts = collapseKickIntentEvents(rawKickIntentEvents).length;

    const totalKickAttempts =
        scopedAttempts.length > 0 ? scopedAttempts.length : eventIntentAttempts;
    const intentAttempts = totalKickAttempts;
    const landedAttempts = scopedAttempts.filter(
        (attempt) => attempt.resolvedOutcome === "succeeded"
    ).length;
    const succeededAttempts = landedAttempts;
    const interruptedAttempts = scopedAttempts.filter(
        (attempt) => attempt.resolvedOutcome === "interrupted"
    ).length;
    const failedAttempts = scopedAttempts.filter(
        (attempt) => attempt.resolvedOutcome === "failed"
    ).length;
    const unresolvedAttempts = scopedAttempts.filter((attempt) => !attempt.resolvedOutcome).length;
    let castEvents = rawKickIntentEvents.length;
    let outcomeOnlyAttempts = 0;

    if (includeDiagnostics) {
        outcomeOnlyAttempts = Math.max(0, collapsedKickAttempts.length - attemptsWithIntent.length);
    }

    const { issued, succeeded } = parseInterruptTuple(owner);
    const perSourceConfirmedInterrupts = isSupported
        ? parseSucceededFromInterruptSpellsBySource(interruptSpellsBySource, owner)
        : null;
    const rawConfirmedInterrupts = isSupported
        ? perSourceConfirmedInterrupts ?? succeeded ?? 0
        : succeeded;
    const confirmationSource =
        perSourceConfirmedInterrupts !== null
            ? "per-source"
            : succeeded !== null
              ? "scoreboard"
              : "unavailable";
    const clampedConfirmedInterrupts =
        rawConfirmedInterrupts === null
            ? null
            : Math.max(0, Math.min(totalKickAttempts, Math.trunc(rawConfirmedInterrupts)));
    const missedKicks =
        clampedConfirmedInterrupts === null
            ? null
            : Math.max(0, totalKickAttempts - clampedConfirmedInterrupts);
    const failed = missedKicks;

    if (
        import.meta.env.DEV &&
        kickSet.size > 0 &&
        (totalKickAttempts > 0 ||
            eventIntentAttempts > 0 ||
            castEvents > 0 ||
            perSourceConfirmedInterrupts !== null ||
            issued !== null ||
            succeeded !== null)
    ) {
        console.log("[kickTelemetry] computed snapshot", {
            matchId,
            telemetryVersion,
            sourceFormat,
            totalKickAttempts,
            eventIntentAttempts,
            castEvents,
            landedAttempts,
            interruptedAttempts,
            failedAttempts,
            unresolvedAttempts,
            perSourceConfirmedInterrupts,
            confirmationSource,
            confirmedInterrupts: clampedConfirmedInterrupts,
            issued,
            succeeded,
            missedKicks,
        });
    }

    return {
        matchId,
        telemetryVersion,
        isLegacyMatch,
        isSupported,
        totalKickAttempts,
        intentAttempts,
        eventIntentAttempts,
        castEvents,
        outcomeOnlyAttempts,
        landedAttempts,
        succeededAttempts,
        interruptedAttempts,
        failedAttempts,
        unresolvedAttempts,
        issued,
        perSourceConfirmedInterrupts,
        confirmationSource,
        confirmedInterrupts: clampedConfirmedInterrupts,
        missedKicks,
        failed,
        succeeded: isSupported ? clampedConfirmedInterrupts : succeeded,
    };
};
