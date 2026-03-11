export const BRACKET_UNKNOWN = 0;
export const BRACKET_SOLO_SHUFFLE = 1;
export const BRACKET_BATTLEGROUND_BLITZ = 2;
export const BRACKET_RATED_ARENA_2V2 = 3;
export const BRACKET_RATED_ARENA_3V3 = 4;
export const BRACKET_RATED_ARENA = 5;
export const BRACKET_RATED_BATTLEGROUND = 6;
export const BRACKET_ARENA_SKIRMISH = 7;
export const BRACKET_BRAWL = 8;
export const BRACKET_RANDOM_BATTLEGROUND = 9;
export const BRACKET_RANDOM_EPIC_BATTLEGROUND = 10;
export const BRACKET_RANDOM_BATTLEGROUND_GROUP = 90;

export type BracketId =
    | typeof BRACKET_UNKNOWN
    | typeof BRACKET_SOLO_SHUFFLE
    | typeof BRACKET_BATTLEGROUND_BLITZ
    | typeof BRACKET_RATED_ARENA_2V2
    | typeof BRACKET_RATED_ARENA_3V3
    | typeof BRACKET_RATED_ARENA
    | typeof BRACKET_RATED_BATTLEGROUND
    | typeof BRACKET_ARENA_SKIRMISH
    | typeof BRACKET_BRAWL
    | typeof BRACKET_RANDOM_BATTLEGROUND
    | typeof BRACKET_RANDOM_EPIC_BATTLEGROUND;

export type BracketScopeId = BracketId | typeof BRACKET_RANDOM_BATTLEGROUND_GROUP;

type BracketMeta = {
    label: string;
    persistedFormats: string[];
    isRated: boolean;
    isBattleground: boolean;
};

const BRACKET_META: Record<BracketId, BracketMeta> = {
    [BRACKET_UNKNOWN]: {
        label: "Unknown",
        persistedFormats: [],
        isRated: false,
        isBattleground: false,
    },
    [BRACKET_SOLO_SHUFFLE]: {
        label: "Solo Shuffle",
        persistedFormats: ["Solo Shuffle"],
        isRated: true,
        isBattleground: false,
    },
    [BRACKET_BATTLEGROUND_BLITZ]: {
        label: "BG Blitz",
        persistedFormats: ["Battleground Blitz"],
        isRated: true,
        isBattleground: true,
    },
    [BRACKET_RATED_ARENA_2V2]: {
        label: "Rated Arena 2v2",
        persistedFormats: ["Rated Arena 2v2"],
        isRated: true,
        isBattleground: false,
    },
    [BRACKET_RATED_ARENA_3V3]: {
        label: "Rated Arena 3v3",
        persistedFormats: ["Rated Arena 3v3"],
        isRated: true,
        isBattleground: false,
    },
    [BRACKET_RATED_ARENA]: {
        label: "Rated Arena",
        persistedFormats: ["Rated Arena"],
        isRated: true,
        isBattleground: false,
    },
    [BRACKET_RATED_BATTLEGROUND]: {
        label: "Rated BG",
        persistedFormats: ["Rated Battleground"],
        isRated: true,
        isBattleground: true,
    },
    [BRACKET_ARENA_SKIRMISH]: {
        label: "Arena Skirmish",
        persistedFormats: ["Arena Skirmish"],
        isRated: false,
        isBattleground: false,
    },
    [BRACKET_BRAWL]: {
        label: "Brawl",
        persistedFormats: ["Brawl"],
        isRated: false,
        isBattleground: false,
    },
    [BRACKET_RANDOM_BATTLEGROUND]: {
        label: "Random BG",
        persistedFormats: ["Random Battleground"],
        isRated: false,
        isBattleground: true,
    },
    [BRACKET_RANDOM_EPIC_BATTLEGROUND]: {
        label: "Random Epic BG",
        persistedFormats: ["Random Epic Battleground"],
        isRated: false,
        isBattleground: true,
    },
};

const LEGACY_BRACKET_IDS: Record<string, BracketScopeId> = {
    unknown: BRACKET_UNKNOWN,
    solo: BRACKET_SOLO_SHUFFLE,
    solo_shuffle: BRACKET_SOLO_SHUFFLE,
    battleground_blitz: BRACKET_BATTLEGROUND_BLITZ,
    blitz: BRACKET_BATTLEGROUND_BLITZ,
    rated2: BRACKET_RATED_ARENA_2V2,
    rated_arena_2v2: BRACKET_RATED_ARENA_2V2,
    rated3: BRACKET_RATED_ARENA_3V3,
    rated_arena_3v3: BRACKET_RATED_ARENA_3V3,
    rated_arena: BRACKET_RATED_ARENA,
    rbg: BRACKET_RATED_BATTLEGROUND,
    rated_battleground: BRACKET_RATED_BATTLEGROUND,
    skirmish: BRACKET_ARENA_SKIRMISH,
    arena_skirmish: BRACKET_ARENA_SKIRMISH,
    brawl: BRACKET_BRAWL,
    randombg: BRACKET_RANDOM_BATTLEGROUND,
    random_battleground: BRACKET_RANDOM_BATTLEGROUND,
    random_epic_battleground: BRACKET_RANDOM_EPIC_BATTLEGROUND,
    random_battleground_group: BRACKET_RANDOM_BATTLEGROUND_GROUP,
};

const NORMALIZED_FORMAT_TO_BRACKET: Record<string, BracketId> = Object.values(
    Object.entries(BRACKET_META).flatMap(([rawId, meta]) => {
        const bracketId = Number(rawId) as BracketId;
        return meta.persistedFormats.map((format) => [normalizePersistedFormat(format), bracketId] as const);
    })
).reduce<Record<string, BracketId>>((out, [format, bracketId]) => {
    out[format] = bracketId;
    return out;
}, {});

const EXACT_BRACKET_ORDER: BracketId[] = [
    BRACKET_SOLO_SHUFFLE,
    BRACKET_BATTLEGROUND_BLITZ,
    BRACKET_RATED_ARENA_2V2,
    BRACKET_RATED_ARENA_3V3,
    BRACKET_RATED_ARENA,
    BRACKET_RATED_BATTLEGROUND,
    BRACKET_ARENA_SKIRMISH,
    BRACKET_BRAWL,
    BRACKET_RANDOM_BATTLEGROUND,
    BRACKET_RANDOM_EPIC_BATTLEGROUND,
    BRACKET_UNKNOWN,
];

export function normalizePersistedFormat(format?: string | null) {
    return (format ?? "").trim().toLowerCase();
}

export function isBracketId(value: number): value is BracketId {
    return value in BRACKET_META;
}

export function isBracketScopeId(value: number): value is BracketScopeId {
    return isBracketId(value) || value === BRACKET_RANDOM_BATTLEGROUND_GROUP;
}

export function parseBracketScopeId(value: unknown): BracketScopeId | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        const normalized = Math.trunc(value);
        return isBracketScopeId(normalized) ? normalized : null;
    }

    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d+$/.test(trimmed)) {
        const parsed = Number(trimmed);
        return isBracketScopeId(parsed) ? parsed : null;
    }

    return LEGACY_BRACKET_IDS[normalizePersistedFormat(trimmed)] ?? null;
}

export function parseBracketId(value: unknown): BracketId | null {
    const parsed = parseBracketScopeId(value);
    return parsed !== null && parsed !== BRACKET_RANDOM_BATTLEGROUND_GROUP ? parsed : null;
}

export function resolveBracketIdFromFormat(format?: string | null): BracketId {
    return NORMALIZED_FORMAT_TO_BRACKET[normalizePersistedFormat(format)] ?? BRACKET_UNKNOWN;
}

export function getBracketLabel(bracketId: BracketScopeId): string {
    if (bracketId === BRACKET_RANDOM_BATTLEGROUND_GROUP) {
        return "Random BG";
    }
    return BRACKET_META[bracketId]?.label ?? BRACKET_META[BRACKET_UNKNOWN].label;
}

export function getBracketLabelForFormat(format?: string | null, bracketId?: unknown): string {
    const parsed = parseBracketId(bracketId);
    if (parsed !== null && parsed !== BRACKET_UNKNOWN) {
        return getBracketLabel(parsed);
    }

    const resolved = resolveBracketIdFromFormat(format);
    if (resolved === BRACKET_UNKNOWN) {
        const trimmed = (format ?? "").trim();
        return trimmed || getBracketLabel(BRACKET_UNKNOWN);
    }

    return getBracketLabel(resolved);
}

export function isRatedBracket(bracketId: BracketId) {
    return BRACKET_META[bracketId]?.isRated ?? false;
}

export function isBattlegroundBracket(bracketId: BracketId) {
    return BRACKET_META[bracketId]?.isBattleground ?? false;
}

export function collapseBracketId(
    bracketId: BracketId,
    collapseRandomBattlegrounds: boolean,
): BracketScopeId {
    if (
        collapseRandomBattlegrounds &&
        (bracketId === BRACKET_RANDOM_BATTLEGROUND ||
            bracketId === BRACKET_RANDOM_EPIC_BATTLEGROUND)
    ) {
        return BRACKET_RANDOM_BATTLEGROUND_GROUP;
    }

    return bracketId;
}

export function matchesBracketScope(
    bracketId: BracketId,
    scopeId: BracketScopeId,
    collapseRandomBattlegrounds: boolean,
) {
    if (scopeId === BRACKET_RANDOM_BATTLEGROUND_GROUP) {
        return (
            collapseRandomBattlegrounds &&
            (bracketId === BRACKET_RANDOM_BATTLEGROUND ||
                bracketId === BRACKET_RANDOM_EPIC_BATTLEGROUND)
        );
    }
    return bracketId === scopeId;
}

export function buildVisibleBracketScopeIds(
    bracketIds: Iterable<BracketId>,
    collapseRandomBattlegrounds: boolean,
): BracketScopeId[] {
    const present = new Set(bracketIds);
    const out: BracketScopeId[] = [];

    EXACT_BRACKET_ORDER.forEach((bracketId) => {
        if (
            collapseRandomBattlegrounds &&
            (bracketId === BRACKET_RANDOM_BATTLEGROUND ||
                bracketId === BRACKET_RANDOM_EPIC_BATTLEGROUND)
        ) {
            if (
                !out.includes(BRACKET_RANDOM_BATTLEGROUND_GROUP) &&
                (present.has(BRACKET_RANDOM_BATTLEGROUND) ||
                    present.has(BRACKET_RANDOM_EPIC_BATTLEGROUND))
            ) {
                out.push(BRACKET_RANDOM_BATTLEGROUND_GROUP);
            }
            return;
        }

        if (present.has(bracketId)) {
            out.push(bracketId);
        }
    });

    return out;
}
