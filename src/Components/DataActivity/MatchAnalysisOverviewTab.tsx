import { LuShield, LuSwords, LuTimerReset, LuZap } from "react-icons/lu";
import type { KickTelemetrySnapshot } from "./kickTelemetry";
import {
    buildLocSummary,
    formatAnalysisTime,
} from "./matchAnalysis.utils";
import type { ComputedSpellOutcomeMap, SpellAnalyticsModel } from "./useSpellAnalyticsModel";
import type { NormalizedLocalSpellModel } from "../../Interfaces/local-spell-model";
import styles from "./DataActivity.module.css";

const sumOutcomeTotals = (
    computedSpellOutcomes: ComputedSpellOutcomeMap | null,
    localSpellModel: NormalizedLocalSpellModel | null
) => {
    if (computedSpellOutcomes && Object.keys(computedSpellOutcomes).length > 0) {
        return Object.values(computedSpellOutcomes).reduce(
            (totals, row) => {
                totals.succeeded += Math.max(0, Math.trunc(row.succeeded));
                totals.interrupted += Math.max(0, Math.trunc(row.interrupted));
                totals.failed += Math.max(0, Math.trunc(row.failed));
                return totals;
            },
            { succeeded: 0, interrupted: 0, failed: 0 }
        );
    }

    return (localSpellModel?.attempts ?? []).reduce(
        (totals, attempt) => {
            if (attempt.resolvedOutcome === "succeeded") totals.succeeded += 1;
            if (attempt.resolvedOutcome === "interrupted") totals.interrupted += 1;
            if (attempt.resolvedOutcome === "failed") totals.failed += 1;
            return totals;
        },
        { succeeded: 0, interrupted: 0, failed: 0 }
    );
};

const toPercent = (value: number, total: number) =>
    total > 0 ? `${Math.round((value / total) * 100)}%` : "--";

function OverviewCard({
    title,
    icon,
    headline,
    detail,
    subRows,
}: {
    title: string;
    icon: React.ReactNode;
    headline: string;
    detail: string;
    subRows: Array<{ label: string; value: string }>;
}) {
    return (
        <article className={styles.analysisOverviewCard}>
            <div className={styles.analysisOverviewCardHeader}>
                <div className={styles.analysisOverviewIcon}>{icon}</div>
                <div>
                    <div className={styles.analysisOverviewTitle}>{title}</div>
                    <div className={styles.analysisOverviewHeadline}>{headline}</div>
                </div>
            </div>
            <div className={styles.analysisOverviewDetail}>{detail}</div>
            <div className={styles.analysisOverviewStats}>
                {subRows.map((row) => (
                    <div key={row.label} className={styles.analysisOverviewStat}>
                        <span className={styles.analysisOverviewStatLabel}>{row.label}</span>
                        <span className={styles.analysisOverviewStatValue}>{row.value}</span>
                    </div>
                ))}
            </div>
        </article>
    );
}

interface MatchAnalysisOverviewTabProps {
    analysisModel: SpellAnalyticsModel;
    localSpellModel: NormalizedLocalSpellModel | null;
    computedSpellOutcomes: ComputedSpellOutcomeMap | null;
    kickTelemetrySnapshot: KickTelemetrySnapshot;
}

export default function MatchAnalysisOverviewTab({
    analysisModel,
    localSpellModel,
    computedSpellOutcomes,
    kickTelemetrySnapshot,
}: MatchAnalysisOverviewTabProps) {
    const topDamage = analysisModel.personalModels.damage.rows[0] ?? null;
    const topHealing = analysisModel.personalModels.healing.rows[0] ?? null;
    const outcomeTotals = sumOutcomeTotals(computedSpellOutcomes, localSpellModel);
    const totalAttempts =
        outcomeTotals.succeeded + outcomeTotals.interrupted + outcomeTotals.failed;
    const locSummary = buildLocSummary(localSpellModel?.locEntries ?? []);
    const detailAvailable = localSpellModel?.detailAvailable === true;

    return (
        <div className={styles.analysisOverview}>
            <div className={styles.analysisOverviewGrid}>
                <OverviewCard
                    title="Personal Spell Performance"
                    icon={<LuSwords aria-hidden="true" />}
                    headline={topDamage ? topDamage.name : "No local spell impact"}
                    detail={
                        topDamage
                            ? `${topDamage.value.toLocaleString()} damage from top impact ability`
                            : "Aggregate spell totals are not available for this match."
                    }
                    subRows={[
                        {
                            label: "Top healing",
                            value: topHealing
                                ? `${topHealing.name} / ${topHealing.value.toLocaleString()}`
                                : "--",
                        },
                        {
                            label: "Tracked abilities",
                            value: String(
                                Math.max(
                                    analysisModel.personalModels.damage.rows.length,
                                    analysisModel.personalModels.healing.rows.length,
                                    analysisModel.personalModels.interrupts.rows.length
                                )
                            ),
                        },
                    ]}
                />

                <OverviewCard
                    title="Cast Outcomes Snapshot"
                    icon={<LuZap aria-hidden="true" />}
                    headline={toPercent(outcomeTotals.succeeded, totalAttempts)}
                    detail={
                        totalAttempts > 0
                            ? `${outcomeTotals.succeeded} succeeded from ${totalAttempts} resolved attempts`
                            : "Detailed local cast attempts are not available."
                    }
                    subRows={[
                        { label: "Interrupted", value: String(outcomeTotals.interrupted) },
                        { label: "Failed", value: String(outcomeTotals.failed) },
                    ]}
                />

                <OverviewCard
                    title="CC / Lockout Summary"
                    icon={<LuShield aria-hidden="true" />}
                    headline={formatAnalysisTime(locSummary.totalCcSeconds)}
                    detail={
                        locSummary.totalCcSeconds > 0
                            ? `${locSummary.topControlType ?? "Control"} was the biggest local disruptor`
                            : "No local CC detail captured for this match."
                    }
                    subRows={[
                        {
                            label: "Lockouts",
                            value: formatAnalysisTime(locSummary.totalLockoutSeconds),
                        },
                        {
                            label: "Top lock",
                            value: locSummary.topLockoutLabel ?? "--",
                        },
                    ]}
                />

                <OverviewCard
                    title="Kick Summary"
                    icon={<LuTimerReset aria-hidden="true" />}
                    headline={
                        kickTelemetrySnapshot.confirmedInterrupts !== null ||
                        kickTelemetrySnapshot.totalKickCasts > 0
                            ? `${kickTelemetrySnapshot.confirmedInterrupts ?? 0} confirmed`
                            : "No confirmed interrupts"
                    }
                    detail={
                        kickTelemetrySnapshot.totalKickCasts > 0
                            ? `${kickTelemetrySnapshot.totalKickCasts} kick casts used in this match`
                            : "No kick casts were captured in this match."
                    }
                    subRows={[
                        {
                            label: "Successful casts",
                            value: String(kickTelemetrySnapshot.successfulKickCasts ?? 0),
                        },
                        {
                            label: "Missed casts",
                            value: String(kickTelemetrySnapshot.missedKickCasts ?? 0),
                        },
                    ]}
                />
            </div>

            {!detailAvailable ? (
                <div className={styles.analysisInlineHint}>
                    Local-player detailed telemetry is unavailable for this match. Overview keeps
                    the summary surfaces that can still be derived from the current payload.
                </div>
            ) : null}
        </div>
    );
}
