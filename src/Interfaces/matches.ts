export interface Player {
    name: string;
    realm: string; // slugified realm
    class: string; // WARRIOR, MAGE, ROGUE...
    spec: string; // Protection, Arms, Frost...
    faction: number; // 0 Alliance, 1 Horde
    rating: number | null;
    ratingChange: number | null;
    prematchMMR: number | null;
    postmatchMMR: number | null;
    damage: number;
    healing: number;
    kills: number;
    deaths: number;
    isOwner: boolean;
    MSS?: [string, number][];
    pvpTalents?: number[]; // only present for owner
}

export type Interrupts = Record<
    string, // srcName
    Record<
        string, // dstName
        Record<string, number> // interruptedSpell: count
    >
>;

export type Auras = Record<
    string, // srcName
    Record<
        string, // dstName
        Record<string, number> // auraName: count
    >
>;

export interface MatchDetails {
    timestamp: string; // "2025-02-14 21:17:05"
    format: string; // "Solo Shuffle", "RBG", "Arena 2v2", etc.
    mapName: string; // "Nagrand Arena", "Warsong Gulch", etc.
}

export interface SoloShuffleOutcome {
    result: string;
    reason?: string;
}

export interface SoloShuffleScoreSnapshot {
    statColumns: string[];
    players: Player[];
}

export interface SoloShuffleRound {
    roundIndex: number;
    stateStartTime: number;
    stateEndTime: number;
    duration: number;
    timeline?: TimelineEntry[];
    scoreSnapshot?: SoloShuffleScoreSnapshot;
    outcome?: SoloShuffleOutcome;
}

export interface SoloShuffleMatchSummary {
    statColumns: string[];
    players: Player[];
    ratingChange: number | null;
    prematchMMR: number | null;
    postmatchMMR: number | null;
}

export interface SoloShuffleIntegrity {
    scoreboardComplete: boolean;
    timelineComplete: boolean;
    roundsComplete: boolean;
    notes: string[];
}

export interface SoloShuffleData {
    roundsExpected: number;
    roundsCaptured: number;
    rounds: SoloShuffleRound[];
    matchSummary?: SoloShuffleMatchSummary;
    integrity?: SoloShuffleIntegrity;
}

export interface TimelineEntry {
    t: number;               // seconds since match start
    event: string;           // "START" | "STOP" | "SUCCEEDED" | ...
    spellID: number;
    castGUID: string;
    hp: number | null;       // 0.0 - 1.0
    power: number | null;    // 0.0 - 1.0
    resourceType: number;    // Rage=1, Energy=3, Mana=0, etc.
    pvpRole?: string | null; // Tank / Healer / Damage in PvP classification
}


export interface Match {
    matchDetails: MatchDetails;
    players: Player[];
    interrupts?: Interrupts;
    auras?: Auras;
    timeline?: TimelineEntry[];
    matchKey?: string;
    soloShuffle?: SoloShuffleData;
}

export interface MatchWithId extends Match {
  id: string;
}
