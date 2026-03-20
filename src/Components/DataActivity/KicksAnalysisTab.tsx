import { LuCircleOff, LuShield, LuSword, LuZap } from "react-icons/lu";
import TelemetryUnavailableState from "./TelemetryUnavailableState";
import {
    buildKickJourneyRows,
    formatAnalysisTime,
    toLocDurationLabel,
} from "./matchAnalysis.utils";
import type { KickTelemetrySnapshot } from "./kickTelemetry";
import type { NormalizedLocalSpellModel } from "../../Interfaces/local-spell-model";
import type { GameSpellEntry } from "../../Domain/spellMetaCache";
import styles from "./DataActivity.module.css";

interface KicksAnalysisTabProps {
    localSpellModel: NormalizedLocalSpellModel | null;
    kickTelemetrySnapshot: KickTelemetrySnapshot;
    kickSpellIds: number[];
    gameMap: Record<string, GameSpellEntry | null>;
}

function Scorecard({
    label,
    value,
    icon,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
}) {
    return (
        <article className={styles.analysisMetricCard}>
            <div className={styles.analysisMetricIcon}>{icon}</div>
            <div>
                <div className={styles.analysisMetricLabel}>{label}</div>
                <div className={styles.analysisMetricValue}>{value}</div>
            </div>
        </article>
    );
}

export default function KicksAnalysisTab({
    localSpellModel,
    kickTelemetrySnapshot,
    kickSpellIds,
    gameMap,
}: KicksAnalysisTabProps) {
    const kickSummarySupported = kickTelemetrySnapshot.summarySupported;
    const kickTotal = Math.max(0, kickTelemetrySnapshot.totalKickCasts ?? 0);
    const kickSuccessful = Math.max(0, kickTelemetrySnapshot.successfulKickCasts ?? 0);
    const kickFailed = Math.max(
        0,
        kickTelemetrySnapshot.failed ??
            kickTelemetrySnapshot.missedKickCasts ??
            kickTelemetrySnapshot.missedKicks ??
            (kickTotal - kickSuccessful)
    );
    const kickEff =
        kickSummarySupported && kickTotal > 0
            ? `${Math.round((kickSuccessful / kickTotal) * 100)}%`
            : kickSummarySupported
              ? "0%"
              : "N/A";
    const hasLocalDetail = !!localSpellModel && localSpellModel.detailAvailable === true;
    const kickRows =
        hasLocalDetail && localSpellModel
            ? buildKickJourneyRows({
                  attempts: localSpellModel.attempts,
                  locEntries: localSpellModel.locEntries,
                  kickSpellIds,
                  gameMap,
              })
            : [];

    return (
        <div className={styles.analysisTabStack}>
            <div className={styles.analysisMetricStrip}>
                <Scorecard
                    label="Total kicks"
                    value={kickSummarySupported ? String(kickTotal) : "N/A"}
                    icon={<LuSword aria-hidden="true" />}
                />
                <Scorecard
                    label="Successful kicks"
                    value={kickSummarySupported ? String(kickSuccessful) : "N/A"}
                    icon={<LuShield aria-hidden="true" />}
                />
                <Scorecard
                    label="Failed kicks"
                    value={kickSummarySupported ? String(kickFailed) : "N/A"}
                    icon={<LuCircleOff aria-hidden="true" />}
                />
                <Scorecard
                    label="Kick Eff."
                    value={kickEff}
                    icon={<LuZap aria-hidden="true" />}
                />
            </div>

            {!kickSummarySupported ? (
                <div className={styles.analysisInlineHint}>
                    Kick summary is only supported for telemetry version 5 or newer. Legacy
                    matches can still show local interrupt journey data below when it exists.
                </div>
            ) : null}

            {!hasLocalDetail ? (
                <TelemetryUnavailableState
                    message="Kick scorecards are still available, but the local interrupt journey for this match is unavailable."
                    detail={localSpellModel?.failureReason ?? null}
                />
            ) : (
                <section className={styles.analysisModule}>
                    <header className={styles.analysisModuleHeader}>
                        <div>
                            <div className={styles.analysisModuleEyebrow}>Local Telemetry</div>
                            <h3 className={styles.analysisModuleTitle}>Interrupt Journey</h3>
                        </div>
                        <div className={styles.analysisModuleMeta}>
                            {kickRows.length} kick events
                        </div>
                    </header>

                    {kickRows.length > 0 ? (
                        <div className={styles.kickJourneyList}>
                            {kickRows.map((row) => (
                                <article key={row.id} className={styles.kickJourneyRow}>
                                    <div className={styles.kickJourneyLead}>
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

                                        <div>
                                            <div className={styles.kickJourneyTitle}>{row.name}</div>
                                            <div className={styles.kickJourneyMeta}>
                                                <span>{formatAnalysisTime(row.time)}</span>
                                                {typeof row.roundIndex === "number" ? (
                                                    <span className={styles.analysisChipMuted}>
                                                        Round {row.roundIndex}
                                                    </span>
                                                ) : null}
                                                {row.resolvedOutcome ? (
                                                    <span
                                                        className={`${styles.analysisOutcomeChip} ${
                                                            row.resolvedOutcome === "succeeded"
                                                                ? styles.analysisOutcomeChipSuccess
                                                                : row.resolvedOutcome === "interrupted"
                                                                  ? styles.analysisOutcomeChipInterrupt
                                                                  : styles.analysisOutcomeChipFail
                                                        }`}
                                                    >
                                                        {row.resolvedOutcome}
                                                    </span>
                                                ) : (
                                                    <span className={styles.analysisChipMuted}>
                                                        unresolved
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className={styles.kickJourneyContext}>
                                        {row.fakeCastStopReason ? (
                                            <span className={styles.analysisHintStrong}>
                                                Stop reason: {row.fakeCastStopReason}
                                            </span>
                                        ) : null}
                                        {row.interruptedByLabel ? (
                                            <span>Interrupt context: {row.interruptedByLabel}</span>
                                        ) : (
                                            <span>Interrupt context available when linked telemetry exists.</span>
                                        )}
                                    </div>

                                    {row.linkedLocEntries.length > 0 ? (
                                        <div className={styles.kickJourneyLinkedLoc}>
                                            {row.linkedLocEntries.map((entry) => (
                                                <span key={`${row.id}-${entry.id}`} className={styles.analysisChipAmber}>
                                                    {entry.displayText ?? entry.locType ?? "Linked lockout"} /{" "}
                                                    {toLocDurationLabel(entry)}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.analysisInlineEmpty}>
                            No kick attempts were captured for this match.
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
