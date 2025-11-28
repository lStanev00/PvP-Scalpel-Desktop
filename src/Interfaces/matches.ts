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

export interface Match {
    matchDetails: MatchDetails;
    players: Player[];
    interrupts?: Interrupts;
    auras?: Auras;
}

export interface MatchWithId extends Match {
  id: string;
}
