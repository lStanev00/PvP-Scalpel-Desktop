import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useUserContext from "../../Hooks/useUserContext";
import {
    extractSpellPayload,
    getGameSpellMap,
    isRenderableSpellMeta,
    loadSpellMetaCache,
    normalizeGameVersionKey,
    saveSpellMetaCache,
    upsertGameSpells,
    type SpellMetaCache,
} from "../../Domain/spellMetaCache";
import type { MatchTimelineEntry } from "./types";
import { resolveIntentAttempts } from "./spellCastResolver";
import styles from "./DataActivity.module.css";

interface SpellCastGraphProps {
    timeline: MatchTimelineEntry[];
    gameVersion?: string | null;
    spellTotals?: Record<string, unknown> | Record<number, unknown> | null;
}

type CastCounts = {
    spellId: number;
    succeeded: number;
    failed: number;
    interrupted: number;
};

type SpellRow = CastCounts & {
    totalAttempts: number;
    metricTotal: number;
    sharePct: number;
    avgPerCast: number | null;
    name: string;
    icon?: string;
    description?: string | null;
};

type MetricMode = "damage" | "healing";

type SpellTotalEntry = {
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);

const isSpellTotalEntry = (value: unknown): value is SpellTotalEntry => {
    if (!isRecord(value)) return false;
    const damage = value.damage;
    const healing = value.healing;
    return typeof damage === "number" && typeof healing === "number";
};

export default function SpellCastGraph({ timeline, gameVersion, spellTotals }: SpellCastGraphProps) {
    const { httpFetch } = useUserContext();
    const gameKey = useMemo(() => normalizeGameVersionKey(gameVersion), [gameVersion]);
    const [spellCache, setSpellCache] = useState<SpellMetaCache>(() => loadSpellMetaCache());
    const [isFetching, setIsFetching] = useState(false);
    const shellRef = useRef<HTMLDivElement | null>(null);
    const inFlight = useRef<Set<string>>(new Set());
    const pendingFetches = useRef(0);
    const [metric, setMetric] = useState<MetricMode>("damage");
    const rowRefs = useRef<Map<number, HTMLElement>>(new Map());
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const [activeSpellId, setActiveSpellId] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

    const { resolvedAttempts } = useMemo(() => resolveIntentAttempts(timeline), [timeline]);

    const usedSpellIds = useMemo(() => {
        const ids = new Set<number>();
        resolvedAttempts.forEach((attempt) => ids.add(attempt.spellId));
        if (spellTotals && isRecord(spellTotals)) {
            Object.entries(spellTotals).forEach(([key, val]) => {
                const id = Number(key);
                if (!Number.isFinite(id) || id <= 0) return;
                if (!isSpellTotalEntry(val)) return;
                ids.add(id);
            });
        }
        return Array.from(ids);
    }, [resolvedAttempts, spellTotals]);

    useEffect(() => {
        const gameMap = getGameSpellMap(spellCache, gameKey);
        const missing = usedSpellIds.filter((id) => {
            const key = `${gameKey}:${id}`;
            return !(String(id) in gameMap) && !inFlight.current.has(key);
        });
        if (!missing.length) return;

        missing.forEach((id) => inFlight.current.add(`${gameKey}:${id}`));
        pendingFetches.current += 1;
        setIsFetching(true);
        let cancelled = false;

        const fetchSpells = async () => {
            try {
                const res = await httpFetch("/game/spells", {
                    method: "POST",
                    body: JSON.stringify({ ids: missing }),
                });

                if (!res.ok || !res.data || cancelled) return;

                const payload = extractSpellPayload(res.data);
                setSpellCache((prev) => {
                    const next = upsertGameSpells(prev, gameKey, payload, missing);
                    saveSpellMetaCache(next);
                    return next;
                });
            } finally {
                missing.forEach((id) => inFlight.current.delete(`${gameKey}:${id}`));
                pendingFetches.current = Math.max(0, pendingFetches.current - 1);
                if (pendingFetches.current === 0 && !cancelled) {
                    setIsFetching(false);
                }
            }
        };

        void fetchSpells();

        return () => {
            cancelled = true;
        };
    }, [usedSpellIds, spellCache, httpFetch, gameKey]);

    const totals = useMemo(() => {
        const out = new Map<number, SpellTotalEntry>();
        if (!spellTotals || !isRecord(spellTotals)) return out;
        Object.entries(spellTotals).forEach(([key, val]) => {
            const id = Number(key);
            if (!Number.isFinite(id) || id <= 0) return;
            if (!isSpellTotalEntry(val)) return;
            out.set(id, val);
        });
        return out;
    }, [spellTotals]);

    const attemptCounts = useMemo(() => {
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
        return map;
    }, [resolvedAttempts]);

    const rows = useMemo(() => {
        const gameMap = getGameSpellMap(spellCache, gameKey);
        const hasTotals = totals.size > 0;
        const items = usedSpellIds
            .map((spellId): SpellRow | null => {
                const meta = gameMap[String(spellId)];
                if (meta === undefined || meta === null) return null;
                if (!isRenderableSpellMeta(meta)) return null;

                const attempts = attemptCounts.get(spellId) ?? {
                    spellId,
                    succeeded: 0,
                    failed: 0,
                    interrupted: 0,
                };
                const totalAttempts = attempts.succeeded + attempts.failed + attempts.interrupted;
                if (!hasTotals && totalAttempts <= 0) return null;

                const totalsEntry = totals.get(spellId) ?? null;
                const metricTotal = hasTotals
                    ? metric === "healing"
                        ? totalsEntry?.healing ?? 0
                        : totalsEntry?.damage ?? 0
                    : totalAttempts;

                if (metricTotal <= 0) return null;

                return {
                    ...attempts,
                    totalAttempts,
                    metricTotal,
                    sharePct: 0,
                    avgPerCast: hasTotals && totalAttempts > 0 ? metricTotal / totalAttempts : null,
                    name: meta.name ?? `Spell ${spellId}`,
                    icon: meta.media ?? undefined,
                    description: meta.description ?? null,
                };
            })
            .filter((row): row is SpellRow => row !== null)
            .sort((a, b) => b.metricTotal - a.metricTotal);

        const totalMetric = items.reduce((acc, row) => acc + row.metricTotal, 0);
        if (totalMetric <= 0) return items;
        return items.map((row) => ({
            ...row,
            sharePct: (row.metricTotal / totalMetric) * 100,
        }));
    }, [spellCache, gameKey, usedSpellIds, totals, metric, attemptCounts]);

    const hasTotals = totals.size > 0;
    const maxMetric = rows[0]?.metricTotal ?? 1;

    const resolveIconUrl = (icon?: string) => {
        if (!icon) return null;
        if (icon.startsWith("http") || icon.startsWith("/") || icon.includes(".")) {
            return icon;
        }
        if (/^\\d+$/.test(icon)) {
            return `https://render.worldofwarcraft.com/us/icons/56/${icon}.jpg`;
        }
        return `https://render.worldofwarcraft.com/us/icons/56/${icon}.jpg`;
    };

    const activeRow = useMemo(() => {
        if (activeSpellId === null) return null;
        return rows.find((row) => row.spellId === activeSpellId) ?? null;
    }, [activeSpellId, rows]);

    useEffect(() => {
        if (activeSpellId === null) {
            setTooltipPos(null);
            return;
        }

        let raf = 0;
        const compute = () => {
            raf = 0;
            const anchor = rowRefs.current.get(activeSpellId) ?? null;
            const tooltip = tooltipRef.current;
            if (!anchor || !tooltip) return;

            const a = anchor.getBoundingClientRect();
            const t = tooltip.getBoundingClientRect();
            const margin = 12;

            let left = a.right - t.width;
            left = Math.min(left, window.innerWidth - t.width - margin);
            left = Math.max(margin, left);

            let top = a.bottom + 8;
            if (top + t.height + margin > window.innerHeight) {
                top = a.top - t.height - 8;
            }
            top = Math.max(margin, Math.min(top, window.innerHeight - t.height - margin));

            setTooltipPos({ top, left });
        };

        const schedule = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(compute);
        };

        schedule();

        const shell = shellRef.current;
        window.addEventListener("resize", schedule);
        window.addEventListener("scroll", schedule, true);
        shell?.addEventListener("scroll", schedule, { passive: true });

        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            window.removeEventListener("resize", schedule);
            window.removeEventListener("scroll", schedule, true);
            shell?.removeEventListener("scroll", schedule);
        };
    }, [activeSpellId, metric]);

    const tooltipIconUrl = activeRow ? resolveIconUrl(activeRow.icon) : null;
    const tooltip = activeRow ? (
        <div
            ref={tooltipRef}
            className={`${styles["spell-tooltip"]} ${styles.spellTooltipPortal}`}
            role="tooltip"
            style={{
                top: tooltipPos?.top ?? 0,
                left: tooltipPos?.left ?? 0,
                visibility: tooltipPos ? "visible" : "hidden",
            }}
        >
            <header className={styles["spell-tooltip__header"]}>
                {tooltipIconUrl ? (
                    <img
                        className={styles["spell-tooltip__icon"]}
                        src={tooltipIconUrl}
                        alt=""
                        loading="lazy"
                    />
                ) : null}
                <h3 className={styles["spell-tooltip__title"]}>{activeRow.name}</h3>
            </header>

            <section className={styles["spell-tooltip__impact"]}>
                <span className={styles["spell-tooltip__impact-value"]}>
                    {hasTotals
                        ? activeRow.metricTotal.toLocaleString?.() ?? activeRow.metricTotal
                        : activeRow.totalAttempts}
                </span>
                <span className={styles["spell-tooltip__impact-label"]}>
                    {hasTotals
                        ? metric === "damage"
                            ? "Total Damage"
                            : "Total Healing"
                        : "Casts"}
                </span>
            </section>

            <section className={styles["spell-tooltip__context"]}>
                <div className={styles.metric}>
                    <span className={styles["metric__value"]}>{activeRow.totalAttempts}</span>
                    <span className={styles["metric__label"]}>Casts</span>
                </div>
                <div className={styles.metric}>
                    <span className={styles["metric__value"]}>
                        {hasTotals && activeRow.avgPerCast !== null
                            ? Math.round(activeRow.avgPerCast).toLocaleString()
                            : "--"}
                    </span>
                    <span className={styles["metric__label"]}>Avg</span>
                </div>
                <div className={styles.metric}>
                    <span className={styles["metric__value"]}>{`${activeRow.sharePct.toFixed(1)}%`}</span>
                    <span className={styles["metric__label"]}>Share</span>
                </div>
            </section>

            <section className={styles["spell-tooltip__execution"]}>
                <h4 className={styles["section-title"]}>Execution</h4>
                <ul className={styles["spell-tooltip__list"]}>
                    <li>Successful: {activeRow.succeeded}</li>
                    <li>Interrupted: {activeRow.interrupted}</li>
                    <li>Failed: {activeRow.failed}</li>
                </ul>
            </section>

            {activeRow.description ? (
                <section className={styles["spell-tooltip__ability"]}>
                    <h4 className={styles["section-title"]}>Ability</h4>
                    <p className={styles["spell-tooltip__desc"]}>{activeRow.description}</p>
                </section>
            ) : null}
        </div>
    ) : null;

    return (
        <section className={styles["spells-panel"]}>
            <header className={styles["spells-panel__header"]}>
                <h2 className={styles["spells-panel__title"]}>
                    {!hasTotals
                        ? "Spell Casts"
                        : metric === "damage"
                          ? "Spell Damage"
                          : "Spell Healing"}
                </h2>
                <div className={styles["spells-panel__controls"]}>
                    {hasTotals ? (
                        <div className={styles.spellsPanelControlGroup}>
                            <label className={styles["spells-panel__label"]} htmlFor="spell-metric">
                                Graph
                            </label>
                            <div className={styles.selectControl}>
                                <select
                                    id="spell-metric"
                                    className={styles.filterSelect}
                                    value={metric}
                                    onChange={(event) => setMetric(event.target.value as MetricMode)}
                                >
                                    <option value="damage">Damage</option>
                                    <option value="healing">Healing</option>
                                </select>
                            </div>
                        </div>
                    ) : null}
                </div>
            </header>
            <div className={styles["spells-panel__body"]} ref={shellRef}>
                {isFetching ? (
                    <div className={styles.spellFetchNotice}>
                        <div className={styles.spellFetchTitle}>Retrieving spell data</div>
                        <div className={styles.spellFetchSpinner} aria-hidden="true" />
                    </div>
                ) : null}
                {rows.length === 0 ? (
                    <div className={styles.spellEmpty}>
                        {hasTotals
                            ? metric === "damage"
                                ? "No damage totals recorded for this match."
                                : "No healing totals recorded for this match."
                            : "No spell activity captured for this match."}
                    </div>
                ) : (
                    <ol className={styles["spell-list"]}>
                        {rows.map((row, idx) => {
                            const barWidth = `${(row.metricTotal / maxMetric) * 100}%`;
                            const iconUrl = resolveIconUrl(row.icon);
                            const fillClass = !hasTotals
                                ? styles.spellBarFillCasts
                                : metric === "damage"
                                  ? styles.spellBarFillDamage
                                  : styles.spellBarFillHealing;
                            const attemptsTotal = row.totalAttempts || 1;
                            const successWidth = `${(row.succeeded / attemptsTotal) * 100}%`;
                            const failWidth = `${(row.failed / attemptsTotal) * 100}%`;
                            const interruptWidth = `${(row.interrupted / attemptsTotal) * 100}%`;

                            return (
                                <li
                                    key={row.spellId}
                                    ref={(el) => {
                                        if (el) rowRefs.current.set(row.spellId, el);
                                        else rowRefs.current.delete(row.spellId);
                                    }}
                                    className={styles["spell-row"]}
                                    tabIndex={0}
                                    onMouseEnter={() => {
                                        setActiveSpellId(row.spellId);
                                        setTooltipPos(null);
                                    }}
                                    onMouseLeave={() => setActiveSpellId(null)}
                                    onFocus={() => {
                                        setActiveSpellId(row.spellId);
                                        setTooltipPos(null);
                                    }}
                                    onBlur={() => setActiveSpellId(null)}
                                >
                                    <span className={styles["spell-row__rank"]}>{idx + 1}</span>
                                    {iconUrl ? (
                                        <img
                                            className={styles["spell-row__icon"]}
                                            src={iconUrl}
                                            alt=""
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className={styles["spell-row__icon-fallback"]}>
                                            {row.name.slice(0, 1).toUpperCase()}
                                        </div>
                                    )}
                                    <span className={styles["spell-row__name"]}>{row.name}</span>

                                    <div className={styles["spell-row__bar-container"]}>
                                        <div
                                            className={`${styles["spell-row__bar"]} ${fillClass}`}
                                            style={{ width: barWidth }}
                                        >
                                            {!hasTotals ? (
                                                <>
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
                                                </>
                                            ) : null}
                                        </div>
                                    </div>

                                    <span className={styles["spell-row__value"]}>
                                        {hasTotals
                                            ? row.metricTotal.toLocaleString?.() ?? row.metricTotal
                                            : row.totalAttempts}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
            {tooltip ? createPortal(tooltip, document.body) : null}
        </section>
    );
}
