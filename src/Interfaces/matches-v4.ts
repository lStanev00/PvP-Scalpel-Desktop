import type { ComputedAnalyticsV2 } from "./local-spell-model";
import type { MatchDetailsV2, PlayerEntryV2, ScoreSnapshot } from "./matches-v2";

export interface LocalSpellCaptureGroup {
    spellID?: number;
    spellId?: number;
    casts?: unknown[] | Record<string, unknown>;
    [key: string]: unknown;
}

export interface LocalSpellCapturePayload {
    [key: string]: LocalSpellCaptureGroup | unknown;
}

export interface LocalLossOfControlPayload {
    entries?: unknown[] | Record<string, unknown>;
    [key: string]: unknown;
}

export interface SoloShuffleRoundV4 {
    roundIndex: number;
    stateStartTime: number;
    stateEndTime?: number;
    duration?: number;
    scoreSnapshot?: ScoreSnapshot;
    outcome?: {
        result: string;
        reason?: string;
    };
}

export interface SoloShuffleDataV4 {
    matchKey: string;
    timestamp: string;
    format: string;
    mapName: string;
    duration: number;
    roundsExpected: number;
    roundsCaptured: number;
    rounds: SoloShuffleRoundV4[];
    matchSummary: {
        statColumns: ScoreSnapshot["statColumns"];
        players: ScoreSnapshot["players"];
        ratingChange: number;
        prematchMMR: number;
        postmatchMMR: number;
    };
    integrity: {
        scoreboardComplete: boolean;
        timelineComplete: boolean;
        roundsComplete: boolean;
        notes: string[];
    };
}

export interface MatchV4 {
    matchKey: string;
    telemetryVersion: number;
    durationSeconds?: number;
    winner?: "victory" | "defeat" | "draw";
    matchDetails: MatchDetailsV2 & {
        bgGameType?: string;
    };
    players: PlayerEntryV2[];
    spellTotalsBySource?: Record<string, Record<string, {
        damage: number;
        healing: number;
        overheal?: number;
        absorbed?: number;
        hits?: number;
        crits?: number;
        targets?: Record<string, number>;
        interrupts?: number;
        dispels?: number;
    }>>;
    interruptSpellsBySource?: Record<string, Record<string, number>>;
    crowdControlTakenBySource?: Record<string, unknown>;
    localSpellCapture?: LocalSpellCapturePayload;
    localLossOfControl?: LocalLossOfControlPayload;
    computed?: ComputedAnalyticsV2;
    soloShuffle?: SoloShuffleDataV4;
}
