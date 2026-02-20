import { useEffect, useMemo, useRef, useState } from "react";
import useUserContext from "../../Hooks/useUserContext";
import { getClassColor, getClassMedia, getSpecMedia } from "../../Domain/CombatDomainContext";
import {
    extractSpellPayload,
    getGameSpellMap,
    loadSpellMetaCache,
    normalizeGameVersionKey,
    saveSpellMetaCache,
    upsertGameSpells,
    type SpellMetaCache,
} from "../../Domain/spellMetaCache";
import type { MatchPlayer, MatchTimelineEntry } from "./types";
import { resolveIntentAttempts } from "./spellCastResolver";
import SpellMetricsTooltip, {
    toPlayerTooltipRows,
    type SpellMetricsTooltipPayload,
} from "./SpellMetricsTooltip";
import {
    buildCompareModel,
    buildPersonalModel,
    collectSpellIdsForFetch,
    findOwnerPlayer,
    getPlayerGuid,
    parseInterruptSpellsBySource,
    parseSpellTotals,
    parseSpellTotalsBySource,
    toImpactLabel,
    toMetricLabel,
    type AttemptCounts,
    type SpellMetricType,
    type SpellViewMode,
} from "./spellMetrics.utils";
import styles from "./DataActivity.module.css";

interface SpellCastGraphProps {
    timeline: MatchTimelineEntry[];
    players: MatchPlayer[];
    gameVersion?: string | null;
    spellTotals?: Record<string, unknown> | Record<number, unknown> | null;
    spellTotalsBySource?: Record<string, unknown> | null;
    interruptSpellsBySource?: Record<string, unknown> | null;
}

type ActiveTooltipState =
    | { kind: "personal"; spellId: number }
    | { kind: "compare"; playerKey: string }
    | null;

const normalizeGuid = (value?: string | null) => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim().toLowerCase();
    return trimmed ? trimmed : null;
};

export default function SpellCastGraph({
    timeline,
    players,
    gameVersion,
    spellTotals,
    spellTotalsBySource,
    interruptSpellsBySource,
}: SpellCastGraphProps) {
    const { httpFetch } = useUserContext();
    const gameKey = useMemo(() => normalizeGameVersionKey(gameVersion), [gameVersion]);
    const [spellCache, setSpellCache] = useState<SpellMetaCache>(() => loadSpellMetaCache());
    const [isFetching, setIsFetching] = useState(false);
    const [viewMode, setViewMode] = useState<SpellViewMode>("personal");
    const [metric, setMetric] = useState<SpellMetricType>("damage");
    const [activeTooltip, setActiveTooltip] = useState<ActiveTooltipState>(null);
    const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
    const shellRef = useRef<HTMLDivElement | null>(null);
    const inFlight = useRef<Set<string>>(new Set());
    const pendingFetches = useRef(0);
    const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
    const tooltipRef = useRef<HTMLDivElement | null>(null);

    const gameMap = useMemo(() => getGameSpellMap(spellCache, gameKey), [spellCache, gameKey]);
    const owner = useMemo(() => findOwnerPlayer(players), [players]);
    const ownerGuid = useMemo(
        () => normalizeGuid(owner ? getPlayerGuid(owner) : null),
        [owner]
    );

    const { resolvedAttempts } = useMemo(() => resolveIntentAttempts(timeline), [timeline]);

    const attemptCounts = useMemo(() => {
        const map = new Map<number, AttemptCounts>();
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

    const parsedSpellTotals = useMemo(() => parseSpellTotals(spellTotals), [spellTotals]);
    const parsedSpellTotalsBySource = useMemo(
        () => parseSpellTotalsBySource(spellTotalsBySource),
        [spellTotalsBySource]
    );
    const parsedInterruptsBySource = useMemo(
        () => parseInterruptSpellsBySource(interruptSpellsBySource),
        [interruptSpellsBySource]
    );

    const usedSpellIds = useMemo(() => {
        return collectSpellIdsForFetch(
            attemptCounts,
            parsedSpellTotals,
            parsedSpellTotalsBySource,
            parsedInterruptsBySource
        );
    }, [attemptCounts, parsedSpellTotals, parsedSpellTotalsBySource, parsedInterruptsBySource]);

    useEffect(() => {
        const missing = usedSpellIds.filter((spellId) => {
            const requestKey = `${gameKey}:${spellId}`;
            return !(String(spellId) in gameMap) && !inFlight.current.has(requestKey);
        });
        if (!missing.length) return;

        missing.forEach((spellId) => inFlight.current.add(`${gameKey}:${spellId}`));
        pendingFetches.current += 1;
        setIsFetching(true);
        let cancelled = false;

        const run = async () => {
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
                missing.forEach((spellId) => inFlight.current.delete(`${gameKey}:${spellId}`));
                pendingFetches.current = Math.max(0, pendingFetches.current - 1);
                if (pendingFetches.current === 0 && !cancelled) {
                    setIsFetching(false);
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [gameMap, gameKey, httpFetch, usedSpellIds]);

    const personalModel = useMemo(
        () =>
            buildPersonalModel({
                metric,
                ownerGuid,
                attemptCounts,
                spellMetaById: gameMap,
                spellTotals: parsedSpellTotals,
                spellTotalsBySource: parsedSpellTotalsBySource,
                interruptsBySource: parsedInterruptsBySource,
            }),
        [
            metric,
            ownerGuid,
            attemptCounts,
            gameMap,
            parsedSpellTotals,
            parsedSpellTotalsBySource,
            parsedInterruptsBySource,
        ]
    );

    const compareModel = useMemo(
        () =>
            buildCompareModel({
                metric,
                players,
                attemptCounts,
                spellMetaById: gameMap,
                spellTotalsBySource: parsedSpellTotalsBySource,
                interruptsBySource: parsedInterruptsBySource,
            }),
        [metric, players, attemptCounts, gameMap, parsedSpellTotalsBySource, parsedInterruptsBySource]
    );

    const resolveIconUrl = (icon?: string) => {
        if (!icon) return null;
        if (icon.startsWith("http") || icon.startsWith("/") || icon.includes(".")) return icon;
        if (/^\d+$/.test(icon)) return `https://render.worldofwarcraft.com/us/icons/56/${icon}.jpg`;
        return `https://render.worldofwarcraft.com/us/icons/56/${icon}.jpg`;
    };

    const personalTooltipMap = useMemo(() => {
        const map = new Map<number, SpellMetricsTooltipPayload>();
        personalModel.rows.forEach((row) => {
            map.set(row.spellId, {
                kind: "spell",
                title: row.name,
                iconUrl: resolveIconUrl(row.icon),
                impactValue: row.value.toLocaleString(),
                impactLabel: toImpactLabel(metric),
                castsValue: String(row.totalAttempts),
                avgValue: row.avgPerCast === null ? "--" : Math.round(row.avgPerCast).toLocaleString(),
                shareValue: `${row.sharePct.toFixed(1)}%`,
                successful: row.succeeded,
                interrupted: row.interrupted,
                failed: row.failed,
                description: row.description,
            });
        });
        return map;
    }, [metric, personalModel.rows]);

    const compareTooltipMap = useMemo(() => {
        const map = new Map<string, SpellMetricsTooltipPayload>();
        compareModel.rows.forEach((row) => {
            map.set(row.key, {
                kind: "player",
                title: row.name,
                subtitle: `${toMetricLabel(metric)} Breakdown`,
                totalValue: row.value.toLocaleString(),
                rows: toPlayerTooltipRows(row.spells, resolveIconUrl),
                emptyLabel:
                    metric === "interrupts"
                        ? "No interrupted enemy spells captured for this player."
                        : "Per-player spell breakdown is not available in this telemetry payload.",
            });
        });
        return map;
    }, [compareModel.rows, metric]);

    const activeAnchorKey = useMemo(() => {
        if (!activeTooltip) return null;
        if (activeTooltip.kind === "personal") return `spell:${activeTooltip.spellId}`;
        return `player:${activeTooltip.playerKey}`;
    }, [activeTooltip]);

    const tooltipPayload = useMemo(() => {
        if (!activeTooltip) return null;
        if (activeTooltip.kind === "personal") {
            return personalTooltipMap.get(activeTooltip.spellId) ?? null;
        }
        return compareTooltipMap.get(activeTooltip.playerKey) ?? null;
    }, [activeTooltip, personalTooltipMap, compareTooltipMap]);

    useEffect(() => {
        if (!activeAnchorKey || !tooltipPayload) {
            setTooltipPos(null);
            return;
        }

        let raf = 0;
        const compute = () => {
            raf = 0;
            const anchor = rowRefs.current.get(activeAnchorKey);
            const tooltip = tooltipRef.current;
            if (!anchor || !tooltip) return;

            const anchorRect = anchor.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            const margin = 12;

            let left = anchorRect.right - tooltipRect.width;
            left = Math.min(left, window.innerWidth - tooltipRect.width - margin);
            left = Math.max(margin, left);

            let top = anchorRect.bottom + 8;
            if (top + tooltipRect.height + margin > window.innerHeight) {
                top = anchorRect.top - tooltipRect.height - 8;
            }
            top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));

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
    }, [activeAnchorKey, tooltipPayload]);

    useEffect(() => {
        setActiveTooltip(null);
        setTooltipPos(null);
    }, [metric, viewMode]);

    const title = viewMode === "personal" ? `Personal ${toMetricLabel(metric)}` : `Lobby ${toMetricLabel(metric)}`;

    const activeRows = viewMode === "personal" ? personalModel.rows : compareModel.rows;
    const maxValue = viewMode === "personal" ? personalModel.maxValue : compareModel.maxValue;

    const emptyLabel = useMemo(() => {
        if (viewMode === "personal") {
            if (metric === "interrupts") return "No interrupts captured for the current player.";
            return "No spell totals captured for the current player.";
        }
        if (metric === "interrupts") return "No interrupt activity captured for this match.";
        return "No player totals captured for this metric.";
    }, [metric, viewMode]);

    const showFallbackNotice =
        viewMode === "personal" &&
        (metric === "damage" || metric === "healing") &&
        personalModel.isFallbackToMatchTotals;

    useEffect(() => {
        if (!import.meta.env.DEV) return;
        const debugBase = {
            metric,
            viewMode,
            players: players.length,
            ownerGuid,
            usedSpellIds: usedSpellIds.length,
            totals: parsedSpellTotals.size,
            totalsBySource: parsedSpellTotalsBySource.size,
            interruptsBySource: parsedInterruptsBySource.size,
            personalRows: personalModel.rows.length,
            compareRows: compareModel.rows.length,
        };

        console.log("[SpellMetrics] state", debugBase);

        if (viewMode === "personal" && personalModel.rows.length === 0) {
            const sourceKeys = Array.from(parsedSpellTotalsBySource.keys()).slice(0, 6);
            const interruptKeys = Array.from(parsedInterruptsBySource.keys()).slice(0, 6);
            console.error("[SpellMetrics] personal view has no rows", {
                ...debugBase,
                hasOwnerGuid: !!ownerGuid,
                fallbackToMatchTotals: personalModel.isFallbackToMatchTotals,
                sourceKeysSample: sourceKeys,
                interruptKeysSample: interruptKeys,
                ownerSourceFound:
                    !!ownerGuid &&
                    (parsedSpellTotalsBySource.has(ownerGuid) ||
                        parsedInterruptsBySource.has(ownerGuid)),
            });
            return;
        }

        if (viewMode === "compare" && compareModel.rows.length === 0) {
            console.error("[SpellMetrics] compare view has no rows", debugBase);
        }
    }, [
        metric,
        viewMode,
        players.length,
        ownerGuid,
        usedSpellIds.length,
        parsedSpellTotals,
        parsedSpellTotalsBySource,
        parsedInterruptsBySource,
        personalModel.rows.length,
        personalModel.isFallbackToMatchTotals,
        compareModel.rows.length,
    ]);

    return (
        <section className={styles["spells-panel"]}>
            <header className={styles["spells-panel__header"]}>
                <div className={styles.spellsPanelTitleArea}>
                    <h2 className={styles["spells-panel__title"]}>{title}</h2>
                    <div className={styles.spellViewToggle} role="tablist" aria-label="Metric scope">
                        <button
                            type="button"
                            className={`${styles.spellViewButton} ${
                                viewMode === "personal" ? styles.spellViewButtonActive : ""
                            }`}
                            onClick={() => setViewMode("personal")}
                            role="tab"
                            aria-selected={viewMode === "personal"}
                        >
                            Personal
                        </button>
                        <button
                            type="button"
                            className={`${styles.spellViewButton} ${
                                viewMode === "compare" ? styles.spellViewButtonActive : ""
                            }`}
                            onClick={() => setViewMode("compare")}
                            role="tab"
                            aria-selected={viewMode === "compare"}
                        >
                            Lobby
                        </button>
                    </div>
                </div>

                <div className={styles["spells-panel__controls"]}>
                    <div className={styles.spellsPanelControlGroup}>
                        <div className={styles.selectControl}>
                            <select
                                id="spell-metric"
                                className={styles.filterSelect}
                                value={metric}
                                onChange={(event) => setMetric(event.target.value as SpellMetricType)}
                                aria-label="Metric type"
                            >
                                <option value="damage">Damage</option>
                                <option value="healing">Healing</option>
                                <option value="interrupts">Interrupts</option>
                            </select>
                        </div>
                    </div>
                </div>
            </header>

            {showFallbackNotice ? (
                <div className={styles.spellMetricHint}>
                    Per-player spell totals are not present in this payload. Showing match-level spell totals.
                </div>
            ) : null}

            <div className={styles["spells-panel__body"]} ref={shellRef}>
                {isFetching ? (
                    <div className={styles.spellFetchNotice}>
                        <div className={styles.spellFetchTitle}>Retrieving spell data</div>
                        <div className={styles.spellFetchSpinner} aria-hidden="true" />
                    </div>
                ) : null}

                {activeRows.length === 0 ? (
                    <div className={styles.spellEmpty}>{emptyLabel}</div>
                ) : viewMode === "personal" ? (
                    <ol className={styles["spell-list"]}>
                        {personalModel.rows.map((row, index) => {
                            const barWidth = `${(row.value / maxValue) * 100}%`;
                            const iconUrl = resolveIconUrl(row.icon);
                            const rowKey = `spell:${row.spellId}`;
                            return (
                                <li
                                    key={row.spellId}
                                    ref={(el) => {
                                        if (el) rowRefs.current.set(rowKey, el);
                                        else rowRefs.current.delete(rowKey);
                                    }}
                                    className={`${styles["spell-row"]} ${
                                        metric === "interrupts" && index === 0
                                            ? styles.spellRowPrimaryImpact
                                            : ""
                                    }`}
                                    tabIndex={0}
                                    onMouseEnter={() => {
                                        setActiveTooltip({ kind: "personal", spellId: row.spellId });
                                        setTooltipPos(null);
                                    }}
                                    onMouseLeave={() => setActiveTooltip(null)}
                                    onFocus={() => {
                                        setActiveTooltip({ kind: "personal", spellId: row.spellId });
                                        setTooltipPos(null);
                                    }}
                                    onBlur={() => setActiveTooltip(null)}
                                >
                                    <span className={styles["spell-row__rank"]}>{index + 1}</span>
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
                                            className={`${styles["spell-row__bar"]} ${
                                                metric === "healing"
                                                    ? styles.spellBarFillHealing
                                                    : metric === "damage"
                                                      ? styles.spellBarFillDamage
                                                      : styles.spellBarFillInterrupt
                                            }`}
                                            style={{ width: barWidth }}
                                        />
                                    </div>
                                    <span className={styles["spell-row__value"]}>
                                        {row.value.toLocaleString()}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                ) : (
                    <ol className={styles["spell-list"]}>
                        {compareModel.rows.map((row, index) => {
                            const rowKey = `player:${row.key}`;
                            const barWidth = `${(row.value / maxValue) * 100}%`;
                            const classToken = (row.className ?? "?").slice(0, 1).toUpperCase();
                            const classColor = getClassColor(row.className) ?? "rgba(230, 234, 240, 0.8)";
                            const specMediaUrl = resolveIconUrl(getSpecMedia(row.specName));
                            const classMediaUrl = resolveIconUrl(getClassMedia(row.className));
                            const badgeMediaUrl = specMediaUrl ?? classMediaUrl;
                            return (
                                <li
                                    key={row.key}
                                    ref={(el) => {
                                        if (el) rowRefs.current.set(rowKey, el);
                                        else rowRefs.current.delete(rowKey);
                                    }}
                                    className={`${styles["spell-row"]} ${styles.spellRowCompare}`}
                                    tabIndex={0}
                                    onMouseEnter={() => {
                                        setActiveTooltip({ kind: "compare", playerKey: row.key });
                                        setTooltipPos(null);
                                    }}
                                    onMouseLeave={() => setActiveTooltip(null)}
                                    onFocus={() => {
                                        setActiveTooltip({ kind: "compare", playerKey: row.key });
                                        setTooltipPos(null);
                                    }}
                                    onBlur={() => setActiveTooltip(null)}
                                >
                                    <span className={styles["spell-row__rank"]}>{index + 1}</span>
                                    <span
                                        className={styles.playerClassBadge}
                                        style={{
                                            color: classColor,
                                            borderColor: `${classColor}55`,
                                            background: `${classColor}1a`,
                                        }}
                                        aria-hidden="true"
                                    >
                                        {badgeMediaUrl ? (
                                            <img
                                                className={styles.playerClassMedia}
                                                src={badgeMediaUrl}
                                                alt=""
                                                loading="lazy"
                                            />
                                        ) : (
                                            classToken
                                        )}
                                    </span>
                                    <span
                                        className={styles["spell-row__name"]}
                                        style={{ color: classColor }}
                                    >
                                        {row.name}
                                    </span>
                                    <div className={styles["spell-row__bar-container"]}>
                                        <div
                                            className={`${styles["spell-row__bar"]} ${
                                                metric === "healing"
                                                    ? styles.spellBarFillHealing
                                                    : metric === "damage"
                                                      ? styles.spellBarFillDamage
                                                      : styles.spellBarFillInterrupt
                                            }`}
                                            style={{ width: barWidth }}
                                        />
                                    </div>
                                    <span className={styles["spell-row__value"]}>
                                        {row.value.toLocaleString()}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>

            <SpellMetricsTooltip payload={tooltipPayload} position={tooltipPos} tooltipRef={tooltipRef} />
        </section>
    );
}
