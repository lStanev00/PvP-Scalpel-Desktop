import { isRenderableSpellMeta, type GameSpellEntry } from "../../Domain/spellMetaCache";
import type { MatchPlayer } from "./types";
import { compareByValueDesc, stableSort } from "./spellMetrics.sort";

export type SpellMetricType = "damage" | "healing" | "interrupts";
export type SpellViewMode = "personal" | "compare";

export type AttemptCounts = {
    spellId: number;
    succeeded: number;
    failed: number;
    interrupted: number;
};

export type SpellMetricRow = {
    spellId: number;
    name: string;
    icon?: string;
    description?: string | null;
    value: number;
    sharePct: number;
    totalAttempts: number;
    succeeded: number;
    failed: number;
    interrupted: number;
    avgPerCast: number | null;
};

export type ComparePlayerRow = {
    key: string;
    guid?: string;
    name: string;
    className?: string;
    value: number;
    sharePct: number;
    spells: SpellMetricRow[];
};

export type PersonalModel = {
    rows: SpellMetricRow[];
    maxValue: number;
    isFallbackToMatchTotals: boolean;
};

export type CompareModel = {
    rows: ComparePlayerRow[];
    maxValue: number;
};

export type ParsedSpellTotalEntry = {
    damage: number;
    healing: number;
    overheal?: number;
    absorbed?: number;
    hits?: number;
    crits?: number;
    targets?: Record<string, number>;
    interrupts?: number;
    dispels?: number;
};

export type ParsedSpellTotals = Map<number, ParsedSpellTotalEntry>;
export type ParsedSpellTotalsBySource = Map<string, ParsedSpellTotals>;
export type ParsedInterruptsBySource = Map<string, Map<number, number>>;

export interface SpellMetricsMockData {
    ownerGuid: string;
    players: Array<{
        guid: string;
        name: string;
        className: string;
        damage: number;
        healing: number;
    }>;
    spellTotalsBySource: Record<string, Record<string, ParsedSpellTotalEntry>>;
    interruptSpellsBySource: Record<string, Record<string, number>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);

const normalizeGuid = (value?: string | null) => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : null;
};

export const getPlayerGuid = (player: MatchPlayer) => {
    const maybe = player as MatchPlayer & { guid?: unknown };
    return typeof maybe.guid === "string" ? maybe.guid : null;
};

const getPlayerInterruptIssued = (player: MatchPlayer) => {
    const maybe = player as MatchPlayer & { interrupts?: unknown };
    const raw = maybe.interrupts;

    if (Array.isArray(raw)) {
        if (raw.length < 1) return null;
        const totalIssued = raw[0];
        if (typeof totalIssued !== "number" || !Number.isFinite(totalIssued)) return null;
        return Math.max(0, totalIssued);
    }

    if (raw && typeof raw === "object") {
        const tuple = raw as Record<string, unknown>;
        const totalIssued = tuple["1"] ?? tuple["0"];
        if (typeof totalIssued !== "number" || !Number.isFinite(totalIssued)) return null;
        return Math.max(0, totalIssued);
    }

    return null;
};

const asFiniteNumber = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value)
        ? value
        : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
          ? Number(value)
          : null;

const zeroAttempts: AttemptCounts = {
    spellId: 0,
    succeeded: 0,
    failed: 0,
    interrupted: 0,
};

export const buildPlayerKey = (player: MatchPlayer, index: number) => {
    const guid = normalizeGuid(getPlayerGuid(player));
    if (guid) return guid;
    const name = typeof player.name === "string" ? player.name.trim().toLowerCase() : "";
    const realm = typeof player.realm === "string" ? player.realm.trim().toLowerCase() : "";
    const composite = [name, realm].filter(Boolean).join("-");
    if (composite) return composite;
    return `player-${index}`;
};

export const findOwnerPlayer = (players: MatchPlayer[]) => {
    return players.find((player) => player.isOwner) ?? players[0] ?? null;
};

export const parseSpellTotals = (input: unknown): ParsedSpellTotals => {
    const out: ParsedSpellTotals = new Map();
    if (!isRecord(input)) return out;

    Object.entries(input).forEach(([spellIdRaw, entry]) => {
        const spellId = Number(spellIdRaw);
        if (!Number.isFinite(spellId) || spellId <= 0) return;
        if (!isRecord(entry)) return;

        const damage = asFiniteNumber(entry.damage) ?? asFiniteNumber(entry.damageDone);
        const healing = asFiniteNumber(entry.healing) ?? asFiniteNumber(entry.healingDone);
        if (damage === null || healing === null) return;

        out.set(spellId, {
            damage,
            healing,
            overheal: asFiniteNumber(entry.overheal) ?? undefined,
            absorbed: asFiniteNumber(entry.absorbed) ?? undefined,
            hits: asFiniteNumber(entry.hits) ?? undefined,
            crits: asFiniteNumber(entry.crits) ?? undefined,
            targets: isRecord(entry.targets)
                ? Object.fromEntries(
                      Object.entries(entry.targets)
                          .map(([k, v]) => [k, asFiniteNumber(v)])
                          .filter((item): item is [string, number] => item[1] !== null)
                  )
                : undefined,
            interrupts: asFiniteNumber(entry.interrupts) ?? undefined,
            dispels: asFiniteNumber(entry.dispels) ?? undefined,
        });
    });

    return out;
};

export const parseSpellTotalsBySource = (input: unknown): ParsedSpellTotalsBySource => {
    const out: ParsedSpellTotalsBySource = new Map();
    if (!isRecord(input)) return out;

    const rootSpellMap = parseSpellTotals(input);
    if (rootSpellMap.size > 0) {
        out.set("unknown", rootSpellMap);
        return out;
    }

    Object.entries(input).forEach(([sourceGuidRaw, value]) => {
        const sourceGuid = normalizeGuid(sourceGuidRaw);
        if (!sourceGuid) return;
        const parsed = parseSpellTotals(value);
        if (parsed.size === 0) return;
        out.set(sourceGuid, parsed);
    });

    return out;
};

export const parseInterruptSpellsBySource = (input: unknown): ParsedInterruptsBySource => {
    const out: ParsedInterruptsBySource = new Map();
    if (!isRecord(input)) return out;

    const rootInterruptMap = new Map<number, number>();
    Object.entries(input).forEach(([spellIdRaw, countRaw]) => {
        const spellId = Number(spellIdRaw);
        const count = asFiniteNumber(countRaw);
        if (!Number.isFinite(spellId) || spellId <= 0 || count === null || count <= 0) return;
        rootInterruptMap.set(spellId, count);
    });
    if (rootInterruptMap.size > 0) {
        out.set("unknown", rootInterruptMap);
        return out;
    }

    Object.entries(input).forEach(([sourceGuidRaw, value]) => {
        const sourceGuid = normalizeGuid(sourceGuidRaw);
        if (!sourceGuid || !isRecord(value)) return;
        const perSource = new Map<number, number>();

        Object.entries(value).forEach(([spellIdRaw, countRaw]) => {
            const spellId = Number(spellIdRaw);
            const count = asFiniteNumber(countRaw);
            if (!Number.isFinite(spellId) || spellId <= 0 || count === null || count <= 0) return;
            perSource.set(spellId, count);
        });

        if (perSource.size > 0) out.set(sourceGuid, perSource);
    });

    return out;
};

export const collectSpellIdsForFetch = (
    attemptCounts: Map<number, AttemptCounts>,
    spellTotals: ParsedSpellTotals,
    spellTotalsBySource: ParsedSpellTotalsBySource,
    interruptsBySource: ParsedInterruptsBySource
) => {
    const ids = new Set<number>();
    attemptCounts.forEach((_, spellId) => ids.add(spellId));
    spellTotals.forEach((_, spellId) => ids.add(spellId));
    spellTotalsBySource.forEach((sourceRows) => {
        sourceRows.forEach((_, spellId) => ids.add(spellId));
    });
    interruptsBySource.forEach((sourceRows) => {
        sourceRows.forEach((_, spellId) => ids.add(spellId));
    });
    return Array.from(ids).filter((spellId) => Number.isFinite(spellId) && spellId > 0);
};

const getSpellValueFromEntry = (entry: ParsedSpellTotalEntry, metric: SpellMetricType) => {
    if (metric === "damage") return entry.damage;
    if (metric === "healing") return entry.healing;
    return entry.interrupts ?? 0;
};

const buildSpellMetricRows = (
    spellValues: Map<number, number>,
    attemptCounts: Map<number, AttemptCounts>,
    spellMetaById: Record<string, GameSpellEntry | null>
): SpellMetricRow[] => {
    const rawRows = Array.from(spellValues.entries())
        .map(([spellId, value]): SpellMetricRow | null => {
            if (value <= 0) return null;
            const meta = spellMetaById[String(spellId)];
            if (!isRenderableSpellMeta(meta)) return null;
            if (!meta) return null;
            const metaName = typeof meta.name === "string" ? meta.name : null;
            if (!metaName || !metaName.trim()) return null;

            const attempts = attemptCounts.get(spellId) ?? { ...zeroAttempts, spellId };
            const totalAttempts = attempts.succeeded + attempts.failed + attempts.interrupted;

            return {
                spellId,
                name: metaName,
                icon: meta.media ?? undefined,
                description: meta.description ?? null,
                value,
                sharePct: 0,
                totalAttempts,
                succeeded: attempts.succeeded,
                failed: attempts.failed,
                interrupted: attempts.interrupted,
                avgPerCast: totalAttempts > 0 ? value / totalAttempts : null,
            };
        })
        .filter((row): row is SpellMetricRow => row !== null);

    const sorted = stableSort(rawRows, (a, b) => {
        const valueCmp = compareByValueDesc(a, b);
        if (valueCmp !== 0) return valueCmp;
        const nameCmp = a.name.localeCompare(b.name);
        if (nameCmp !== 0) return nameCmp;
        return a.spellId - b.spellId;
    });

    const total = sorted.reduce((sum, row) => sum + row.value, 0);
    if (total <= 0) return sorted;

    return sorted.map((row) => ({
        ...row,
        sharePct: (row.value / total) * 100,
    }));
};

const getPlayerMetricValue = (
    player: MatchPlayer,
    metric: SpellMetricType,
    interruptsBySource: ParsedInterruptsBySource
) => {
    const anyPlayer = player as MatchPlayer & {
        damageDone?: unknown;
        healingDone?: unknown;
    };
    if (metric === "damage") {
        const value = asFiniteNumber(player.damage) ?? asFiniteNumber(anyPlayer.damageDone);
        return value && value > 0 ? value : 0;
    }
    if (metric === "healing") {
        const value = asFiniteNumber(player.healing) ?? asFiniteNumber(anyPlayer.healingDone);
        return value && value > 0 ? value : 0;
    }
    const guid = normalizeGuid(getPlayerGuid(player));
    if (guid) {
        const map = interruptsBySource.get(guid);
        if (map && map.size > 0) {
            return Array.from(map.values()).reduce((sum, count) => sum + count, 0);
        }
    }
    return getPlayerInterruptIssued(player) ?? 0;
};

const getSourceSpellValues = (
    sourceGuid: string | null,
    metric: SpellMetricType,
    spellTotalsBySource: ParsedSpellTotalsBySource
) => {
    const out = new Map<number, number>();
    if (!sourceGuid) return out;
    const source = spellTotalsBySource.get(sourceGuid);
    if (!source) return out;
    source.forEach((entry, spellId) => {
        const value = getSpellValueFromEntry(entry, metric);
        if (value > 0) out.set(spellId, value);
    });
    return out;
};

const getMatchSpellValues = (metric: SpellMetricType, spellTotals: ParsedSpellTotals) => {
    const out = new Map<number, number>();
    spellTotals.forEach((entry, spellId) => {
        const value = getSpellValueFromEntry(entry, metric);
        if (value > 0) out.set(spellId, value);
    });
    return out;
};

const getInterruptSpellValues = (sourceGuid: string | null, interruptsBySource: ParsedInterruptsBySource) => {
    const out = new Map<number, number>();
    if (!sourceGuid) return out;
    const source = interruptsBySource.get(sourceGuid);
    if (!source) return out;
    source.forEach((count, spellId) => {
        if (count > 0) out.set(spellId, count);
    });
    return out;
};

export const buildPersonalModel = ({
    metric,
    ownerGuid,
    attemptCounts,
    spellMetaById,
    spellTotals,
    spellTotalsBySource,
    interruptsBySource,
}: {
    metric: SpellMetricType;
    ownerGuid: string | null;
    attemptCounts: Map<number, AttemptCounts>;
    spellMetaById: Record<string, GameSpellEntry | null>;
    spellTotals: ParsedSpellTotals;
    spellTotalsBySource: ParsedSpellTotalsBySource;
    interruptsBySource: ParsedInterruptsBySource;
}): PersonalModel => {
    const sourceSpellValues =
        metric === "interrupts"
            ? getInterruptSpellValues(ownerGuid, interruptsBySource)
            : getSourceSpellValues(ownerGuid, metric, spellTotalsBySource);

    const fallbackSpellValues =
        metric === "interrupts" ? sourceSpellValues : getMatchSpellValues(metric, spellTotals);

    const useFallback = metric !== "interrupts" && sourceSpellValues.size === 0;
    const rows = buildSpellMetricRows(
        useFallback ? fallbackSpellValues : sourceSpellValues,
        attemptCounts,
        spellMetaById
    );

    return {
        rows,
        maxValue: rows[0]?.value ?? 1,
        isFallbackToMatchTotals: useFallback,
    };
};

export const buildCompareModel = ({
    metric,
    players,
    attemptCounts,
    spellMetaById,
    spellTotalsBySource,
    interruptsBySource,
}: {
    metric: SpellMetricType;
    players: MatchPlayer[];
    attemptCounts: Map<number, AttemptCounts>;
    spellMetaById: Record<string, GameSpellEntry | null>;
    spellTotalsBySource: ParsedSpellTotalsBySource;
    interruptsBySource: ParsedInterruptsBySource;
}): CompareModel => {
    const playerRows = players
        .map((player, index): ComparePlayerRow | null => {
            const guid = normalizeGuid(getPlayerGuid(player));
            const value = getPlayerMetricValue(player, metric, interruptsBySource);
            if (value <= 0) return null;

            const spellValues =
                metric === "interrupts"
                    ? getInterruptSpellValues(guid, interruptsBySource)
                    : getSourceSpellValues(guid, metric, spellTotalsBySource);

            const spells = buildSpellMetricRows(spellValues, attemptCounts, spellMetaById);

            return {
                key: buildPlayerKey(player, index),
                guid: guid ?? undefined,
                name: player.name,
                className: player.class,
                value,
                sharePct: 0,
                spells,
            };
        })
        .filter((row): row is ComparePlayerRow => row !== null);

    const sorted = stableSort(playerRows, (a, b) => {
        const valueCmp = compareByValueDesc(a, b);
        if (valueCmp !== 0) return valueCmp;
        return a.name.localeCompare(b.name);
    });

    const total = sorted.reduce((sum, row) => sum + row.value, 0);
    const rows =
        total <= 0
            ? sorted
            : sorted.map((row) => ({
                  ...row,
                  sharePct: (row.value / total) * 100,
              }));

    return {
        rows,
        maxValue: rows[0]?.value ?? 1,
    };
};

export const toMetricLabel = (metric: SpellMetricType) => {
    if (metric === "damage") return "Damage";
    if (metric === "healing") return "Healing";
    return "Interrupts";
};

export const toImpactLabel = (metric: SpellMetricType) => {
    if (metric === "damage") return "Total Damage";
    if (metric === "healing") return "Total Healing";
    return "Times Interrupted";
};
