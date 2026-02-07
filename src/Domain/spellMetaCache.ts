export type GameSpellEntry = {
    _id: number;
    name?: string | null;
    description?: string | null;
    media?: string | null;
};

export type SpellMetaCache = {
    schemaVersion: 2;
    byGame: Record<string, Record<string, GameSpellEntry | null>>;
};

export const SPELL_META_CACHE_KEY = "pvp_scalpel_spell_cache_v1";

export const normalizeGameVersionKey = (value?: string | null) => {
    const trimmed = (value ?? "").trim();
    return trimmed ? trimmed : "unknown";
};

const isSpellEntryLike = (value: unknown): value is GameSpellEntry | null => {
    if (value === null) return true;
    if (!value || typeof value !== "object") return false;
    return typeof (value as { _id?: unknown })._id === "number";
};

export const loadSpellMetaCache = (): SpellMetaCache => {
    try {
        const raw = localStorage.getItem(SPELL_META_CACHE_KEY);
        if (!raw) return { schemaVersion: 2, byGame: {} };
        const parsed = JSON.parse(raw) as unknown;

        // New schema (versioned wrapper).
        if (
            parsed &&
            typeof parsed === "object" &&
            (parsed as { schemaVersion?: unknown }).schemaVersion === 2 &&
            typeof (parsed as { byGame?: unknown }).byGame === "object" &&
            (parsed as { byGame?: unknown }).byGame !== null
        ) {
            return parsed as SpellMetaCache;
        }

        // Legacy schema: a flat id -> entry map. Migrate into "unknown" game key.
        if (parsed && typeof parsed === "object") {
            const legacy = parsed as Record<string, unknown>;
            const migrated: Record<string, GameSpellEntry | null> = {};
            Object.entries(legacy).forEach(([key, val]) => {
                if (!/^\d+$/.test(key)) return;
                if (!isSpellEntryLike(val)) return;
                migrated[key] = val as GameSpellEntry | null;
            });
            return { schemaVersion: 2, byGame: { unknown: migrated } };
        }
    } catch {
        // ignore
    }
    return { schemaVersion: 2, byGame: {} };
};

export const saveSpellMetaCache = (cache: SpellMetaCache) => {
    localStorage.setItem(SPELL_META_CACHE_KEY, JSON.stringify(cache));
};

export const extractSpellPayload = (data: unknown): GameSpellEntry[] | null => {
    if (Array.isArray(data)) return data as GameSpellEntry[];
    if (data && typeof data === "object") {
        const maybe = data as { data?: unknown; spells?: unknown; items?: unknown };
        if (Array.isArray(maybe.data)) return maybe.data as GameSpellEntry[];
        if (Array.isArray(maybe.spells)) return maybe.spells as GameSpellEntry[];
        if (Array.isArray(maybe.items)) return maybe.items as GameSpellEntry[];
    }
    return null;
};

export const isRenderableSpellMeta = (entry: GameSpellEntry | null | undefined) => {
    if (!entry) return false;
    return typeof entry.name === "string" && entry.name.trim().length > 0;
};

export const getGameSpellMap = (cache: SpellMetaCache, gameVersionKey: string) => {
    return cache.byGame[gameVersionKey] ?? {};
};

export const upsertGameSpells = (
    cache: SpellMetaCache,
    gameVersionKey: string,
    incoming: GameSpellEntry[] | null,
    requestedIds: number[]
) => {
    const next: SpellMetaCache = {
        schemaVersion: 2,
        byGame: { ...cache.byGame },
    };

    const currentGameMap: Record<string, GameSpellEntry | null> = {
        ...(next.byGame[gameVersionKey] ?? {}),
    };

    const returned = new Set<number>();
    if (incoming) {
        incoming.forEach((entry) => {
            if (!entry || typeof entry._id !== "number") return;
            currentGameMap[String(entry._id)] = entry;
            returned.add(entry._id);
        });
    }

    // Mark not-returned ids as null to avoid refetch spam.
    requestedIds.forEach((id) => {
        if (!returned.has(id)) currentGameMap[String(id)] = null;
    });

    next.byGame[gameVersionKey] = currentGameMap;
    return next;
};

