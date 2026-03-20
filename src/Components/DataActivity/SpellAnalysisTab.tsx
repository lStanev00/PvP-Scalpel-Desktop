import { useEffect, useMemo, useRef, useState } from "react";
import { LuCircleHelp, LuTarget } from "react-icons/lu";
import AnalysisTabBar from "./AnalysisTabBar";
import TelemetryUnavailableState from "./TelemetryUnavailableState";
import SpellMetricsTooltip, {
    type SpellMetricsTooltipPayload,
} from "./SpellMetricsTooltip";
import {
    buildAttemptSummaryBySpellId,
    buildOutcomeRows,
    collectRoundOptions,
    filterAttemptsByRound,
    formatAnalysisTime,
    resolveSpellPresentation,
    summarizeUnknownValue,
    type RoundFilterValue,
} from "./matchAnalysis.utils";
import { toImpactLabel, type SpellMetricType } from "./spellMetrics.utils";
import type { SpellAnalyticsModel } from "./useSpellAnalyticsModel";
import type { NormalizedLocalLossOfControlEntry, NormalizedLocalSpellModel } from "../../Interfaces/local-spell-model";
import styles from "./DataActivity.module.css";

type SpellAnalysisView = "abilities" | "outcomes" | "timeline";

interface SpellAnalysisTabProps {
    resetToken: string;
    analysisModel: SpellAnalyticsModel;
    localSpellModel: NormalizedLocalSpellModel | null;
}

const metricOptions: Array<{ value: SpellMetricType; label: string }> = [
    { value: "damage", label: "Damage" },
    { value: "healing", label: "Healing" },
    { value: "interrupts", label: "Interrupts" },
];

export default function SpellAnalysisTab({
    resetToken,
    analysisModel,
    localSpellModel,
}: SpellAnalysisTabProps) {
    const [activeTab, setActiveTab] = useState<SpellAnalysisView>("abilities");
    const [metric, setMetric] = useState<SpellMetricType>("damage");
    const [selectedRound, setSelectedRound] = useState<RoundFilterValue>("all");
    const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
    const [activeTooltipSpellId, setActiveTooltipSpellId] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
    const shellRef = useRef<HTMLDivElement | null>(null);
    const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
    const tooltipRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setActiveTab("abilities");
        setMetric("damage");
        setSelectedRound("all");
        setSelectedAttemptId(null);
        setActiveTooltipSpellId(null);
        setTooltipPos(null);
    }, [resetToken]);

    const detailAvailable = localSpellModel?.detailAvailable === true;
    if (!localSpellModel || !detailAvailable) {
        return (
            <TelemetryUnavailableState
                message="Detailed local spell analysis is unavailable for this match."
                detail={localSpellModel?.failureReason ?? null}
            />
        );
    }

    const allAttempts = localSpellModel.attempts ?? [];
    const roundOptions = collectRoundOptions(localSpellModel);
    const filteredAttempts = filterAttemptsByRound(allAttempts, selectedRound);
    const attemptSummaryBySpellId = useMemo(
        () => buildAttemptSummaryBySpellId(filteredAttempts),
        [filteredAttempts]
    );
    const personalModel = analysisModel.personalModels[metric];
    const abilityRows = personalModel.rows;
    const outcomeRows = useMemo(
        () => buildOutcomeRows({ attempts: filteredAttempts, gameMap: analysisModel.gameMap }),
        [analysisModel.gameMap, filteredAttempts]
    );
    const locById = useMemo(() => {
        const map = new Map<number, NormalizedLocalLossOfControlEntry>();
        localSpellModel.locEntries.forEach((entry) => map.set(entry.id, entry));
        return map;
    }, [localSpellModel.locEntries]);
    const selectedAttempt =
        filteredAttempts.find((attempt) => attempt.id === selectedAttemptId) ?? filteredAttempts[0] ?? null;

    useEffect(() => {
        if (!selectedAttemptId) return;
        if (!filteredAttempts.some((attempt) => attempt.id === selectedAttemptId)) {
            setSelectedAttemptId(filteredAttempts[0]?.id ?? null);
        }
    }, [filteredAttempts, selectedAttemptId]);

    const tooltipPayload = useMemo<SpellMetricsTooltipPayload | null>(() => {
        if (activeTooltipSpellId === null) return null;
        const row = personalModel.rows.find((item) => item.spellId === activeTooltipSpellId);
        if (!row) return null;
        return {
            kind: "spell",
            title: row.name,
            iconUrl: row.icon ? (row.icon.startsWith("http") || row.icon.startsWith("/") || row.icon.includes(".")
                ? row.icon
                : `https://render.worldofwarcraft.com/us/icons/56/${row.icon}.jpg`) : null,
            impactValue: row.value.toLocaleString(),
            impactLabel: toImpactLabel(metric),
            castsValue: String(row.totalAttempts),
            showCastsMetric: metric !== "interrupts",
            avgValue: row.avgPerCast === null ? "--" : Math.round(row.avgPerCast).toLocaleString(),
            shareValue: `${row.sharePct.toFixed(1)}%`,
            successful: row.succeeded,
            interrupted: row.interrupted,
            failed: row.failed,
            description: row.description,
        };
    }, [activeTooltipSpellId, metric, personalModel.rows]);

    useEffect(() => {
        if (activeTooltipSpellId === null || !tooltipPayload) {
            setTooltipPos(null);
            return;
        }

        let raf = 0;
        const anchorKey = `spell:${activeTooltipSpellId}`;

        const compute = () => {
            raf = 0;
            const anchor = rowRefs.current.get(anchorKey);
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
    }, [activeTooltipSpellId, tooltipPayload]);

    const renderAbilities = () => {
        if (abilityRows.length === 0) {
            return (
                <div className={styles.analysisInlineEmpty}>
                    No local-player spell totals were captured for this metric.
                </div>
            );
        }

        const maxValue = Math.max(1, personalModel.maxValue);

        return (
            <div className={styles.analysisAbilityList} ref={shellRef}>
                {selectedRound !== "all" ? (
                    <div className={styles.analysisInlineHint}>
                        Round filtering scopes the outcome chips and fake-cast signals below.
                        Aggregate damage, healing, and interrupt values still reflect the full
                        match capture.
                    </div>
                ) : null}

                {abilityRows.map((row) => {
                    const summary = attemptSummaryBySpellId.get(row.spellId);
                    const barWidth = `${Math.max(4, (row.value / maxValue) * 100)}%`;
                    const rowKey = `spell:${row.spellId}`;
                    return (
                        <article
                            key={row.spellId}
                            ref={(element) => {
                                if (element) rowRefs.current.set(rowKey, element);
                                else rowRefs.current.delete(rowKey);
                            }}
                            className={styles.analysisAbilityRow}
                            tabIndex={0}
                            onMouseEnter={() => {
                                setActiveTooltipSpellId(row.spellId);
                                setTooltipPos(null);
                            }}
                            onMouseLeave={() => setActiveTooltipSpellId(null)}
                            onFocus={() => {
                                setActiveTooltipSpellId(row.spellId);
                                setTooltipPos(null);
                            }}
                            onBlur={() => setActiveTooltipSpellId(null)}
                        >
                            <div className={styles.analysisAbilityLead}>
                                {row.icon ? (
                                    <img
                                        className={styles.analysisSpellIcon}
                                        src={
                                            row.icon.startsWith("http") ||
                                            row.icon.startsWith("/") ||
                                            row.icon.includes(".")
                                                ? row.icon
                                                : `https://render.worldofwarcraft.com/us/icons/56/${row.icon}.jpg`
                                        }
                                        alt=""
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className={styles.analysisSpellIconFallback}>
                                        {row.isUnknownMeta ? (
                                            <LuCircleHelp aria-hidden="true" />
                                        ) : (
                                            row.name.slice(0, 1).toUpperCase()
                                        )}
                                    </div>
                                )}
                                <div className={styles.analysisAbilityText}>
                                    <div className={styles.analysisAbilityName}>{row.name}</div>
                                    <div className={styles.analysisAbilityMeta}>
                                        <span>{row.totalAttempts} total attempts</span>
                                        <span>{row.sharePct.toFixed(1)}% share</span>
                                        {summary?.topStopReason ? <span>{summary.topStopReason}</span> : null}
                                    </div>
                                </div>
                            </div>

                            <div className={styles.analysisAbilityBarTrack}>
                                <div
                                    className={`${styles.analysisAbilityBarFill} ${
                                        metric === "healing"
                                            ? styles.analysisAbilityBarFillHealing
                                            : metric === "interrupts"
                                              ? styles.analysisAbilityBarFillInterrupt
                                              : styles.analysisAbilityBarFillDamage
                                    }`}
                                    style={{ width: barWidth }}
                                />
                            </div>

                            <div className={styles.analysisAbilityValue}>
                                {row.value.toLocaleString()}
                            </div>

                            <div className={styles.analysisAbilityChips}>
                                <span
                                    className={`${styles.analysisOutcomeChip} ${styles.analysisOutcomeChipSuccess}`}
                                >
                                    S {summary?.succeeded ?? row.succeeded}
                                </span>
                                <span
                                    className={`${styles.analysisOutcomeChip} ${styles.analysisOutcomeChipInterrupt}`}
                                >
                                    I {summary?.interrupted ?? row.interrupted}
                                </span>
                                <span className={`${styles.analysisOutcomeChip} ${styles.analysisOutcomeChipFail}`}>
                                    F {summary?.failed ?? row.failed}
                                </span>
                                {(summary?.fakeCastCount ?? 0) > 0 ? (
                                    <span className={styles.analysisChipAmber}>
                                        Fake {summary?.fakeCastCount}
                                    </span>
                                ) : null}
                            </div>
                        </article>
                    );
                })}

                <SpellMetricsTooltip
                    payload={tooltipPayload}
                    position={tooltipPos}
                    tooltipRef={tooltipRef}
                />
            </div>
        );
    };

    const renderOutcomes = () => {
        if (outcomeRows.length === 0) {
            return (
                <div className={styles.analysisInlineEmpty}>
                    No local cast attempts were captured for this round scope.
                </div>
            );
        }

        return (
            <div className={styles.outcomeTable}>
                <div className={styles.outcomeTableHeader}>
                    <span>Spell</span>
                    <span>Attempts</span>
                    <span>Succeeded</span>
                    <span>Interrupted</span>
                    <span>Failed</span>
                    <span>Success</span>
                    <span>Top stop reason</span>
                </div>
                {outcomeRows.map((row) => (
                    <div key={row.spellId} className={styles.outcomeTableRow}>
                        <div className={styles.outcomeSpellCell}>
                            {row.iconUrl ? (
                                <img
                                    className={styles.analysisSpellIcon}
                                    src={row.iconUrl}
                                    alt=""
                                    loading="lazy"
                                />
                            ) : (
                                <div className={styles.analysisSpellIconFallback}>
                                    {row.name.slice(0, 1).toUpperCase()}
                                </div>
                            )}
                            <span className={styles.outcomeSpellName}>{row.name}</span>
                        </div>
                        <span>{row.attempts}</span>
                        <span>{row.succeeded}</span>
                        <span>{row.interrupted}</span>
                        <span>{row.failed}</span>
                        <span>{row.successRate}%</span>
                        <span>{row.topStopReason ?? "--"}</span>
                    </div>
                ))}
            </div>
        );
    };

    const renderTimeline = () => {
        if (filteredAttempts.length === 0) {
            return (
                <div className={styles.analysisInlineEmpty}>
                    No local cast attempts were captured for this round scope.
                </div>
            );
        }

        return (
            <div className={styles.timelineWorkspace}>
                <div className={styles.timelineList}>
                    {filteredAttempts
                        .slice()
                        .sort((a, b) => a.startTime - b.startTime)
                        .map((attempt) => {
                            const presentation = resolveSpellPresentation(
                                attempt.spellId,
                                analysisModel.gameMap
                            );
                            const isSelected = selectedAttempt?.id === attempt.id;
                            return (
                                <button
                                    key={attempt.id}
                                    type="button"
                                    className={`${styles.timelineRow} ${
                                        isSelected ? styles.timelineRowActive : ""
                                    }`}
                                    onClick={() => setSelectedAttemptId(attempt.id)}
                                >
                                    <div className={styles.timelineRowTime}>
                                        {formatAnalysisTime(attempt.startTime)}
                                    </div>
                                    <div className={styles.timelineRowBody}>
                                        <div className={styles.timelineRowTitle}>
                                            {presentation.name}
                                        </div>
                                        <div className={styles.timelineRowMeta}>
                                            {typeof attempt.roundIndex === "number" ? (
                                                <span className={styles.analysisChipMuted}>
                                                    Round {attempt.roundIndex}
                                                </span>
                                            ) : null}
                                            {attempt.resolvedOutcome ? (
                                                <span
                                                    className={`${styles.analysisOutcomeChip} ${
                                                        attempt.resolvedOutcome === "succeeded"
                                                            ? styles.analysisOutcomeChipSuccess
                                                            : attempt.resolvedOutcome === "interrupted"
                                                              ? styles.analysisOutcomeChipInterrupt
                                                              : styles.analysisOutcomeChipFail
                                                    }`}
                                                >
                                                    {attempt.resolvedOutcome}
                                                </span>
                                            ) : (
                                                <span className={styles.analysisChipMuted}>
                                                    unresolved
                                                </span>
                                            )}
                                            {attempt.fakeCastStopReason ? (
                                                <span className={styles.analysisChipAmber}>
                                                    {attempt.fakeCastStopReason}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                </div>

                <aside className={styles.timelineDetail}>
                    {selectedAttempt ? (
                        <>
                            <header className={styles.timelineDetailHeader}>
                                <div>
                                    <div className={styles.analysisModuleEyebrow}>
                                        Local Attempt Detail
                                    </div>
                                    <h3 className={styles.analysisModuleTitle}>
                                        {
                                            resolveSpellPresentation(
                                                selectedAttempt.spellId,
                                                analysisModel.gameMap
                                            ).name
                                        }
                                    </h3>
                                </div>
                                <div className={styles.timelineDetailMeta}>
                                    {formatAnalysisTime(selectedAttempt.startTime)} to{" "}
                                    {formatAnalysisTime(selectedAttempt.endTime)}
                                </div>
                            </header>

                            <div className={styles.timelineDetailSection}>
                                <div className={styles.timelineDetailLabel}>Outcome</div>
                                <div className={styles.timelineDetailValue}>
                                    {selectedAttempt.resolvedOutcome ?? "Unresolved"}
                                </div>
                            </div>

                            <div className={styles.timelineDetailSection}>
                                <div className={styles.timelineDetailLabel}>Events</div>
                                <div className={styles.timelineEventList}>
                                    {selectedAttempt.events.map((event) => (
                                        <div key={`${selectedAttempt.id}-${event.id}`} className={styles.timelineEventRow}>
                                            <span>{formatAnalysisTime(event.t)}</span>
                                            <span>{event.event}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {selectedAttempt.linkedLoc && selectedAttempt.linkedLoc.length > 0 ? (
                                <div className={styles.timelineDetailSection}>
                                    <div className={styles.timelineDetailLabel}>Linked lockouts</div>
                                    <div className={styles.timelineLinkedList}>
                                        {selectedAttempt.linkedLoc
                                            .map((locId) => locById.get(locId))
                                            .filter((entry): entry is NormalizedLocalLossOfControlEntry => !!entry)
                                            .map((entry) => (
                                                <span key={`${selectedAttempt.id}-${entry.id}`} className={styles.analysisChipAmber}>
                                                    {entry.displayText ?? entry.locType ?? "Linked LoC"} /{" "}
                                                    {formatAnalysisTime(entry.t)}
                                                </span>
                                            ))}
                                    </div>
                                </div>
                            ) : null}

                            {selectedAttempt.targetInfo ? (
                                <div className={styles.timelineDetailSection}>
                                    <div className={styles.timelineDetailLabel}>
                                        <LuTarget aria-hidden="true" /> Target snapshot
                                    </div>
                                    <div className={styles.timelineDetailValueMuted}>
                                        {summarizeUnknownValue(selectedAttempt.targetInfo) ?? "Available"}
                                    </div>
                                </div>
                            ) : null}

                            {selectedAttempt.provenance && selectedAttempt.provenance.length > 0 ? (
                                <div className={styles.timelineDetailSection}>
                                    <div className={styles.timelineDetailLabel}>Provenance</div>
                                    <div className={styles.timelineLinkedList}>
                                        {selectedAttempt.provenance.map((item) => (
                                            <span key={`${selectedAttempt.id}-${item}`} className={styles.analysisChipMuted}>
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <div className={styles.analysisInlineEmpty}>
                            Select an attempt to inspect its event stream and linked context.
                        </div>
                    )}
                </aside>
            </div>
        );
    };

    return (
        <div className={styles.analysisTabStack}>
            <div className={styles.analysisModuleIntro}>
                <div>
                    <div className={styles.analysisModuleEyebrow}>Local Player Only</div>
                    <h3 className={styles.analysisModuleTitle}>Spell Analysis</h3>
                </div>
                <div className={styles.analysisModuleMeta}>
                    Normalized cast attempts, outcomes, and event telemetry
                </div>
            </div>

            <div className={styles.analysisControlRow}>
                <AnalysisTabBar
                    tabs={[
                        { id: "abilities", label: "Abilities" },
                        { id: "outcomes", label: "Outcomes" },
                        { id: "timeline", label: "Timeline" },
                    ]}
                    activeTab={activeTab}
                    onSelect={setActiveTab}
                    ariaLabel="Spell analysis views"
                    prominence="secondary"
                />

                <div className={styles.analysisInlineControls}>
                    <div className={styles.selectControl}>
                        <select
                            className={styles.filterSelect}
                            aria-label="Spell analysis metric"
                            value={metric}
                            onChange={(event) => setMetric(event.target.value as SpellMetricType)}
                        >
                            {metricOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {roundOptions.length > 1 ? (
                <div className={styles.analysisRoundFilter}>
                    {roundOptions.map((option) => (
                        <button
                            key={String(option.value)}
                            type="button"
                            className={`${styles.analysisRoundButton} ${
                                selectedRound === option.value ? styles.analysisRoundButtonActive : ""
                            }`}
                            onClick={() => setSelectedRound(option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            ) : null}

            <section className={styles.analysisModule}>
                {activeTab === "abilities"
                    ? renderAbilities()
                    : activeTab === "outcomes"
                      ? renderOutcomes()
                      : renderTimeline()}
            </section>
        </div>
    );
}
