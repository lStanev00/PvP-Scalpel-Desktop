// Telemetry v2 types (SavedVariables schema).
export type TimelineEventType =
    | "SENT"
    | "START"
    | "STOP"
    | "SUCCEEDED"
    | "FAILED"
    | "FAILED_QUIET"
    | "INTERRUPTED"
    | "CHANNEL_START"
    | "CHANNEL_STOP";

export interface BuildInfoSnapshot {
    version: string;
    build: string | number;
    date: string;
    interface: number;
    localized: string;
    info: string;
    versionString: string;
}

export interface TargetInfoSnapshot {
    hasTarget: boolean;
    disposition: "none" | "unknown" | "friendly" | "hostile";
    isPlayer?: boolean;
    canAttack?: boolean;
    isFriend?: boolean;
    reaction?: number;
}

export interface TimelineEventV2 {
    t: number;
    event: TimelineEventType;
    spellID?: number;
    castGUID?: string;
    targetInfo?: TargetInfoSnapshot;
    hp?: number;
    power?: number;
    resourceType?: number;
    pvpRole?: string | number;
    hasSpellDataEntry?: boolean;
}

export interface CastEvent {
    t: number;
    event: TimelineEventType;
}

export interface CastRecord {
    castGUID: string;
    spellID?: number;
    startEvent?: TimelineEventType;
    startTime?: number;
    lastEvent?: TimelineEventType;
    lastTime?: number;
    targetInfo?: TargetInfoSnapshot;
    events: CastEvent[];
}

export interface MatchDetailsV2 {
    timestamp: string;
    format: string;
    mapName: string;
    build?: BuildInfoSnapshot;
}

export interface PlayerEntryV2 {
    name: string;
    realm: string;
    guid?: string;
    class?: string;
    spec?: string;
    faction?: number;
    rating?: number;
    ratingChange?: number;
    prematchMMR?: number;
    postmatchMMR?: number;
    damage?: number;
    healing?: number;
    interrupts?: [number, number];
    kills?: number;
    deaths?: number;
    MSS?: [string, number][];
    isOwner?: boolean;
    pvpTalents?: number[];
}

export interface ScoreSnapshotPlayer {
    name?: string;
    realm?: string;
    guid?: string;
    classToken?: string;
    talentSpec?: string;
    faction?: number;
    rating?: number;
    ratingChange?: number;
    prematchMMR?: number;
    postmatchMMR?: number;
    damageDone?: number;
    healingDone?: number;
    killingBlows?: number;
    deaths?: number;
    stats?: Array<{
        pvpStatID: number;
        pvpStatValue: number;
    }>;
}

export interface ScoreSnapshot {
    statColumns: Array<{
        pvpStatID: number;
        name?: string;
    }>;
    players: ScoreSnapshotPlayer[];
}

export interface SoloShuffleRoundV2 {
    roundIndex: number;
    stateStartTime: number;
    stateEndTime?: number;
    duration?: number;
    timeline: TimelineEventV2[];
    castRecords: CastRecord[];
    scoreSnapshot?: ScoreSnapshot;
    outcome?: {
        result: string;
        reason: string;
    };
}

export interface SoloShuffleDataV2 {
    matchKey: string;
    timestamp: string;
    format: string;
    mapName: string;
    duration: number;
    roundsExpected: number;
    roundsCaptured: number;
    timeline: TimelineEventV2[];
    rounds: SoloShuffleRoundV2[];
    matchSummary: {
        statColumns: ScoreSnapshot["statColumns"];
        players: ScoreSnapshotPlayer[];
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

export interface MatchV2 {
    matchKey: string;
    telemetryVersion: number; // current: 2
    winner?: "victory" | "defeat" | "draw";
    matchDetails: MatchDetailsV2;
    players: PlayerEntryV2[];
    timeline?: TimelineEventV2[];
    castRecords?: CastRecord[];
    spellTotals?: Record<string, {
        damage: number;
        healing: number;
        overheal?: number;
        absorbed?: number;
        hits?: number;
        crits?: number;
        targets?: Record<string, number>;
        interrupts?: number;
        dispels?: number;
    }>;
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
    soloShuffle?: SoloShuffleDataV2;
}
