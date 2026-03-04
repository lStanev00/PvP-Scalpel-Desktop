import type { MatchPlayer, MatchTimelineEntry } from "../Components/Data-Activity/types";
import { resolveIntentAttempts } from "../Components/Data-Activity/spellCastResolver";
import {
    computeKickTelemetrySnapshot,
    resolveTelemetryVersion,
} from "../Components/Data-Activity/kickTelemetry";

type SpellOutcomeCounts = {
    succeeded: number;
    interrupted: number;
    failed: number;
};

type OwnerKickSummary = {
    intentAttempts: number;
    succeeded: number;
    failed: number;
};

export type MatchComputed = {
    spellOutcomesBySpellId: Record<string, SpellOutcomeCounts>;
    ownerKicks: OwnerKickSummary;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const toSafeCount = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return Math.max(0, Math.trunc(Number(value)));
    }
    return 0;
};

export const extractMatchKey = (rawMatch: unknown) => {
    if (!isRecord(rawMatch)) return null;
    const matchKey = rawMatch.matchKey;
    if (typeof matchKey !== "string") return null;
    const trimmed = matchKey.trim();
    return trimmed ? trimmed : null;
};

export const buildMatchComputed = (rawMatch: unknown, kickSpellIds: number[]): MatchComputed | null => {
    if (!isRecord(rawMatch)) return null;

    const players = Array.isArray(rawMatch.players) ? (rawMatch.players as MatchPlayer[]) : [];
    const timeline = Array.isArray(rawMatch.timeline)
        ? (rawMatch.timeline as MatchTimelineEntry[])
        : [];

    const { resolvedAttempts } = resolveIntentAttempts(timeline);
    const spellOutcomesBySpellId: Record<string, SpellOutcomeCounts> = {};

    resolvedAttempts.forEach((attempt) => {
        const spellKey = String(attempt.spellId);
        const row = spellOutcomesBySpellId[spellKey] ?? {
            succeeded: 0,
            interrupted: 0,
            failed: 0,
        };

        if (attempt.resolvedOutcome === "succeeded") row.succeeded += 1;
        if (attempt.resolvedOutcome === "interrupted") row.interrupted += 1;
        if (attempt.resolvedOutcome === "failed") row.failed += 1;
        spellOutcomesBySpellId[spellKey] = row;
    });

    const owner = players.find((player) => player.isOwner) ?? players[0] ?? null;
    const telemetryVersion = resolveTelemetryVersion(rawMatch);
    const kickSnapshot = computeKickTelemetrySnapshot({
        matchId: extractMatchKey(rawMatch) ?? "unknown",
        timeline,
        kickSpellIds,
        owner,
        telemetryVersion,
        interruptSpellsBySource: rawMatch.interruptSpellsBySource,
        includeDiagnostics: false,
    });

    const issuedFallback = toSafeCount(kickSnapshot.issued);
    const rawIntentAttempts = toSafeCount(kickSnapshot.intentAttempts);
    const intentAttempts =
        rawIntentAttempts > 0 ? rawIntentAttempts : issuedFallback;
    const succeeded = toSafeCount(kickSnapshot.succeeded);
    const failed = Math.max(0, intentAttempts - succeeded);

    return {
        spellOutcomesBySpellId,
        ownerKicks: {
            intentAttempts,
            succeeded,
            failed,
        },
    };
};

const resolveDurationSeconds = (rawMatch: unknown) => {
    if (!isRecord(rawMatch)) return null;

    const soloShuffle = rawMatch.soloShuffle;
    if (isRecord(soloShuffle)) {
        const duration = toSafeCount(soloShuffle.duration);
        if (duration > 0) return duration;
    }

    if (Array.isArray(rawMatch.timeline) && rawMatch.timeline.length > 0) {
        const maxTime = rawMatch.timeline.reduce((max, entry) => {
            if (!isRecord(entry)) return max;
            const t = typeof entry.t === "number" && Number.isFinite(entry.t) ? entry.t : 0;
            return t > max ? t : max;
        }, 0);
        if (maxTime > 0) return Math.max(0, Math.round(maxTime));
    }

    const matchDetails = rawMatch.matchDetails;
    if (isRecord(matchDetails)) {
        const rawLength = matchDetails.matchLength ?? matchDetails.duration;
        if (typeof rawLength === "number" && Number.isFinite(rawLength) && rawLength > 0) {
            return Math.max(0, Math.round(rawLength));
        }
        if (typeof rawLength === "string") {
            const trimmed = rawLength.trim();
            if (/^\d+:\d{2}$/.test(trimmed)) {
                const [mins, secs] = trimmed.split(":").map((part) => Number(part));
                if (Number.isFinite(mins) && Number.isFinite(secs)) {
                    return Math.max(0, Math.round(mins * 60 + secs));
                }
            }
            if (Number.isFinite(Number(trimmed)) && Number(trimmed) > 0) {
                return Math.max(0, Math.round(Number(trimmed)));
            }
        }
    }

    return null;
};

export const toStoredComputedMatch = (rawMatch: unknown, computed: MatchComputed) => {
    const cloned = JSON.parse(JSON.stringify(rawMatch ?? {})) as Record<string, unknown>;
    const durationSeconds = resolveDurationSeconds(rawMatch);
    delete cloned.timeline;
    delete cloned.castRecords;

    if (isRecord(cloned.soloShuffle)) {
        const soloShuffle = cloned.soloShuffle as Record<string, unknown>;
        delete soloShuffle.timeline;
        if (Array.isArray(soloShuffle.rounds)) {
            soloShuffle.rounds = soloShuffle.rounds.map((round) => {
                if (!isRecord(round)) return round;
                const out = { ...round };
                delete out.timeline;
                delete out.castRecords;
                return out;
            });
        }
        cloned.soloShuffle = soloShuffle;
    }

    cloned.computed = computed as unknown;
    if (durationSeconds !== null) {
        cloned.durationSeconds = durationSeconds;
    }
    return cloned;
};
