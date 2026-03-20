import type { MatchPlayer } from "../Components/DataActivity/types";
import {
    computeKickTelemetrySnapshot,
    resolveTelemetryVersion,
} from "../Components/DataActivity/kickTelemetry";
import {
    buildSpellOutcomeCounts,
    resolveLocalSpellModel,
    resolveMatchDurationSeconds,
} from "./localSpellModel";
import type { ComputedAnalyticsV2, ComputedOwnerKickSummary } from "../Interfaces/local-spell-model";

export type MatchComputed = ComputedAnalyticsV2;

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
    const localSpellModel = resolveLocalSpellModel(rawMatch);
    const spellOutcomesBySpellId = buildSpellOutcomeCounts(localSpellModel);
    const owner = players.find((player) => player.isOwner) ?? players[0] ?? null;
    const telemetryVersion = resolveTelemetryVersion(rawMatch);
    const kickSnapshot = computeKickTelemetrySnapshot({
        matchId: extractMatchKey(rawMatch) ?? "unknown",
        localSpellModel,
        kickSpellIds,
        owner,
        telemetryVersion,
        interruptSpellsBySource: rawMatch.interruptSpellsBySource,
        rawLocalSpellCapture: rawMatch.localSpellCapture,
        includeDiagnostics: false,
    });

    const totalKickAttempts = toSafeCount(kickSnapshot.totalKickCasts);
    const intentAttempts = toSafeCount(kickSnapshot.totalKickCasts);
    const landed = toSafeCount(kickSnapshot.successfulKickCasts);
    const confirmedInterrupts = toSafeCount(kickSnapshot.confirmedInterrupts);
    const missed = toSafeCount(kickSnapshot.missedKickCasts);
    const failed = toSafeCount(kickSnapshot.missedKickCasts);

    const ownerKicks: ComputedOwnerKickSummary = kickSnapshot.isSupported
        ? {
              total: totalKickAttempts,
              intentAttempts,
              landed,
              confirmedInterrupts,
              missed,
              succeeded: confirmedInterrupts,
              failed,
          }
        : {
              total: totalKickAttempts,
              intentAttempts,
          };

    return {
        schemaVersion: 2,
        spellOutcomesBySpellId,
        ownerKicks,
        localSpellModel: localSpellModel ?? undefined,
    };
};

export const toStoredComputedMatch = (rawMatch: unknown, computed: MatchComputed) => {
    const cloned = JSON.parse(JSON.stringify(rawMatch ?? {})) as Record<string, unknown>;
    const durationSeconds = resolveMatchDurationSeconds(rawMatch);
    const canStripV4Payload =
        isRecord(computed.localSpellModel) &&
        computed.localSpellModel.detailAvailable === true;
    delete cloned.timeline;
    delete cloned.castRecords;
    delete cloned.castOutcomes;
    if (canStripV4Payload) {
        delete cloned.localSpellCapture;
        delete cloned.localLossOfControl;
    }

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
