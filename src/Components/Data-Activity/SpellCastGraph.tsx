import { useEffect, useMemo, useRef, useState } from "react";
import useSpellData from "../../Hooks/useSpellData";
import useUserContext from "../../Hooks/useUserContext";
import { getSpellContext } from "../../Domain/CombatDomainContext";
import type { MatchTimelineEntry } from "./types";
import { resolveIntentAttempts } from "./spellCastResolver";
import styles from "./DataActivity.module.css";

interface SpellCastGraphProps {
    timeline: MatchTimelineEntry[];
}

type CastCounts = {
    spellId: number;
    succeeded: number;
    failed: number;
    interrupted: number;
};

type SpellRow = CastCounts & {
    total: number;
    name: string;
    icon?: string;
    type: string;
};

type GameSpellEntry = {
    _id: number;
    name?: string | null;
    description?: string | null;
    media?: string | null;
};

type SpellCacheMap = Record<string, GameSpellEntry | null>;

const SPELL_CACHE_KEY = "pvp_scalpel_spell_cache_v1";

const loadSpellCache = (): SpellCacheMap => {
    try {
        const raw = localStorage.getItem(SPELL_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as SpellCacheMap;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
};

const saveSpellCache = (cache: SpellCacheMap) => {
    localStorage.setItem(SPELL_CACHE_KEY, JSON.stringify(cache));
};

const extractSpellPayload = (data: unknown): GameSpellEntry[] | null => {
    if (Array.isArray(data)) return data as GameSpellEntry[];
    if (data && typeof data === "object") {
        const maybe = data as { data?: unknown; spells?: unknown; items?: unknown };
        if (Array.isArray(maybe.data)) return maybe.data as GameSpellEntry[];
        if (Array.isArray(maybe.spells)) return maybe.spells as GameSpellEntry[];
        if (Array.isArray(maybe.items)) return maybe.items as GameSpellEntry[];
    }
    return null;
};

const isValidSpellEntry = (entry: GameSpellEntry | null | undefined) => {
    if (!entry) return false;
    return Boolean(entry.name || entry.description || entry.media);
};

export default function SpellCastGraph({ timeline }: SpellCastGraphProps) {
    const spellData = useSpellData();
    const { httpFetch } = useUserContext();
    const [spellCache, setSpellCache] = useState<SpellCacheMap>(() => loadSpellCache());
    const inFlight = useRef<Set<number>>(new Set());

    const { resolvedAttempts } = useMemo(() => resolveIntentAttempts(timeline), [timeline]);

    const usedSpellIds = useMemo(() => {
        const ids = new Set<number>();
        resolvedAttempts.forEach((attempt) => ids.add(attempt.spellId));
        return Array.from(ids);
    }, [resolvedAttempts]);

    useEffect(() => {
        const missing = usedSpellIds.filter(
            (id) => !(String(id) in spellCache) && !inFlight.current.has(id)
        );
        if (!missing.length) return;

        missing.forEach((id) => inFlight.current.add(id));
        let cancelled = false;

        const fetchSpells = async () => {
            const res = await httpFetch("/game/spells", {
                method: "POST",
                body: JSON.stringify({ ids: missing }),
            });
            if (!res.ok || !res.data || cancelled) {
                missing.forEach((id) => inFlight.current.delete(id));
                return;
            }
            const payload = extractSpellPayload(res.data);
            setSpellCache((prev) => {
                const next: SpellCacheMap = { ...prev };
                const returned = new Set<number>();
                if (payload) {
                    payload.forEach((entry) => {
                        if (typeof entry?._id !== "number") return;
                        next[String(entry._id)] = entry;
                        returned.add(entry._id);
                    });
                }
                missing.forEach((id) => {
                    if (!returned.has(id)) {
                        next[String(id)] = null;
                    }
                });
                saveSpellCache(next);
                return next;
            });
            missing.forEach((id) => inFlight.current.delete(id));
        };

        void fetchSpells();

        return () => {
            cancelled = true;
        };
    }, [usedSpellIds, spellCache, httpFetch]);

    const rows = useMemo(() => {
        const map = new Map<number, CastCounts>();
        resolvedAttempts.forEach((attempt) => {
            const outcome = attempt.resolvedOutcome;
            if (!outcome) return;
            const existing = map.get(attempt.spellId) ?? {
                spellId: attempt.spellId,
                succeeded: 0,
                failed: 0,
                interrupted: 0,
            };
            existing[outcome] += 1;
            map.set(attempt.spellId, existing);
        });

        const items = Array.from(map.values())
            .map((row): SpellRow | null => {
                const total = row.succeeded + row.failed + row.interrupted;
                const cacheEntry = spellCache[String(row.spellId)];
                if (cacheEntry === null) return null;
                if (!isValidSpellEntry(cacheEntry)) return null;
                const context = getSpellContext(row.spellId, spellData);
                const name = cacheEntry?.name ?? context.name ?? `Spell ${row.spellId}`;
                const icon = cacheEntry?.media ?? context.icon;
                return {
                    ...row,
                    total,
                    name,
                    icon,
                    type: context.type ?? "unknown",
                };
            })
            .filter((row): row is SpellRow => row !== null && row.total > 0)
            .sort((a, b) => b.total - a.total);

        return items;
    }, [resolvedAttempts, spellCache, spellData]);

    if (rows.length === 0) return null;

    const maxTotal = rows[0]?.total ?? 1;

    const resolveIconUrl = (icon?: string) => {
        if (!icon) return null;
        if (icon.startsWith("http") || icon.startsWith("/") || icon.includes(".")) {
            return icon;
        }
        if (/^\d+$/.test(icon)) {
            return `https://render.worldofwarcraft.com/us/icons/56/${icon}.jpg`;
        }
        return `https://render.worldofwarcraft.com/us/icons/56/${icon}.jpg`;
    };

    return (
        <div className={styles.spellGraphShell}>
            <div className={styles.spellGraph}>
                {rows.map((row) => {
                    const barWidth = `${(row.total / maxTotal) * 100}%`;
                    const total = row.total || 1;
                    const successWidth = `${(row.succeeded / total) * 100}%`;
                    const failWidth = `${(row.failed / total) * 100}%`;
                    const interruptWidth = `${(row.interrupted / total) * 100}%`;
                    const iconUrl = resolveIconUrl(row.icon);

                    return (
                        <div key={row.spellId} className={styles.spellRow} tabIndex={0}>
                            <div className={styles.spellInfo}>
                                {iconUrl ? (
                                    <img
                                        className={styles.spellIcon}
                                        src={iconUrl}
                                        alt=""
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className={styles.spellIconFallback}>
                                        {row.name.slice(0, 1).toUpperCase()}
                                    </div>
                                )}
                                <span className={styles.spellName}>{row.name}</span>
                            </div>

                            <div className={styles.spellBarTrack}>
                                <div className={styles.spellBarFill} style={{ width: barWidth }}>
                                    {row.succeeded > 0 ? (
                                        <span
                                            className={`${styles.spellSeg} ${styles.spellSegSuccess}`}
                                            style={{ width: successWidth }}
                                        />
                                    ) : null}
                                    {row.failed > 0 ? (
                                        <span
                                            className={`${styles.spellSeg} ${styles.spellSegFail}`}
                                            style={{ width: failWidth }}
                                        />
                                    ) : null}
                                    {row.interrupted > 0 ? (
                                        <span
                                            className={`${styles.spellSeg} ${styles.spellSegInterrupt}`}
                                            style={{ width: interruptWidth }}
                                        />
                                    ) : null}
                                </div>
                            </div>

                            <span className={styles.spellCount}>{row.total}</span>

                            <div className={styles.spellTooltip} role="tooltip">
                                <div className={styles.spellTooltipTitle}>
                                    {iconUrl ? (
                                        <img
                                            className={styles.spellTooltipIcon}
                                            src={iconUrl}
                                            alt=""
                                            loading="lazy"
                                        />
                                    ) : null}
                                    <span>{row.name}</span>
                                </div>
                                <div className={styles.spellTooltipRow}>
                                    <span>Succeeded</span>
                                    <span>{row.succeeded}</span>
                                </div>
                                <div className={styles.spellTooltipRow}>
                                    <span>Failed</span>
                                    <span>{row.failed}</span>
                                </div>
                                <div className={styles.spellTooltipRow}>
                                    <span>Interrupted</span>
                                    <span>{row.interrupted}</span>
                                </div>
                                <div className={styles.spellTooltipRow}>
                                    <span>Total</span>
                                    <span>{row.total}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
