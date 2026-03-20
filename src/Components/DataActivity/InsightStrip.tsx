import type { ReactNode } from "react";
import { LuShieldAlert, LuSword, LuTimerReset, LuZap } from "react-icons/lu";
import { buildLocSummary, formatAnalysisTime } from "./matchAnalysis.utils";
import type { KickTelemetrySnapshot } from "./kickTelemetry";
import type { ComputedSpellOutcomeMap, SpellAnalyticsModel } from "./useSpellAnalyticsModel";
import type { NormalizedLocalSpellModel } from "../../Interfaces/local-spell-model";
import styles from "./DataActivity.module.css";

interface InsightStripProps {
    analysisModel: SpellAnalyticsModel;
    localSpellModel: NormalizedLocalSpellModel | null;
    computedSpellOutcomes: ComputedSpellOutcomeMap | null;
    kickTelemetrySnapshot: KickTelemetrySnapshot;
}

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

function InsightCard({
    title,
    headline,
    detail,
    supporting,
    icon,
    featured = false,
}: {
    title: string;
    headline: string;
    detail: string;
    supporting: string;
    icon: ReactNode;
    featured?: boolean;
}) {
    return (
        <article
            className={`${styles.debriefInsightCard} ${
                featured ? styles.debriefInsightCardFeatured : ""
            }`}
        >
            <div className={styles.debriefInsightHeader}>
                <div className={styles.debriefInsightIcon}>{icon}</div>
                <div className={styles.debriefInsightLabel}>{title}</div>
            </div>
            <div className={styles.debriefInsightHeadline}>{headline}</div>
            <div className={styles.debriefInsightDetail}>{detail}</div>
            <div className={styles.debriefInsightSupporting}>{supporting}</div>
        </article>
    );
}

export default function InsightStrip({
    analysisModel,
    localSpellModel,
    computedSpellOutcomes,
    kickTelemetrySnapshot,
}: InsightStripProps) {
    const topDamage = analysisModel.personalModels.damage.rows[0] ?? null;
    const topHealing = analysisModel.personalModels.healing.rows[0] ?? null;
    const topInterrupt = analysisModel.personalModels.interrupts.rows[0] ?? null;
    const leadSpell = topDamage ?? topHealing ?? topInterrupt;

    const outcomeTotals = sumOutcomeTotals(computedSpellOutcomes, localSpellModel);
    const totalAttempts =
        outcomeTotals.succeeded + outcomeTotals.interrupted + outcomeTotals.failed;
    const reliability =
        totalAttempts > 0 ? Math.round((outcomeTotals.succeeded / totalAttempts) * 100) : null;
    const locSummary = buildLocSummary(localSpellModel?.locEntries ?? []);
    const ccTotal = locSummary.totalCcSeconds + locSummary.totalLockoutSeconds;

    return (
        <section className={styles.debriefInsightStrip}>
            <InsightCard
                title="Most Impactful Ability"
                headline={leadSpell?.name ?? "No standout spell"}
                detail={
                    leadSpell
                        ? `${leadSpell.value.toLocaleString()} total output`
                        : "No local spell impact was captured."
                }
                supporting={
                    leadSpell
                        ? `${leadSpell.totalAttempts} attempts / ${leadSpell.sharePct.toFixed(1)}% share`
                        : "Aggregate-only match or no local spell totals"
                }
                icon={<LuSword aria-hidden="true" />}
                featured
            />

            <InsightCard
                title="Cast Reliability"
                headline={reliability !== null ? `${reliability}% success` : "No cast profile"}
                detail={
                    totalAttempts > 0
                        ? `${outcomeTotals.succeeded} succeeded from ${totalAttempts} resolved attempts`
                        : "Detailed attempt outcomes were not captured."
                }
                supporting={`${outcomeTotals.interrupted} interrupted / ${outcomeTotals.failed} failed`}
                icon={<LuZap aria-hidden="true" />}
            />

            <InsightCard
                title="Control Suffered"
                headline={ccTotal > 0 ? formatAnalysisTime(ccTotal) : "No local control"}
                detail={
                    ccTotal > 0
                        ? `${locSummary.topControlType ?? "Control"} created the biggest loss of agency`
                        : "No local CC or lockout entries were recorded."
                }
                supporting={
                    locSummary.totalLockoutSeconds > 0
                        ? `${formatAnalysisTime(locSummary.totalLockoutSeconds)} lockout time`
                        : "No meaningful lockout pressure captured"
                }
                icon={<LuShieldAlert aria-hidden="true" />}
            />

            <InsightCard
                title="Kick Impact"
                headline={
                    kickTelemetrySnapshot.confirmedInterrupts !== null ||
                    kickTelemetrySnapshot.totalKickCasts > 0
                        ? `${kickTelemetrySnapshot.confirmedInterrupts ?? 0} confirmed`
                        : "No confirmed interrupts"
                }
                detail={
                    kickTelemetrySnapshot.totalKickCasts > 0
                        ? `${kickTelemetrySnapshot.totalKickCasts} kick casts used in this match`
                        : "No local kick journey was recorded in this match."
                }
                supporting={`${kickTelemetrySnapshot.missedKickCasts ?? 0} missed / ${kickTelemetrySnapshot.successfulKickCasts ?? 0} successful casts`}
                icon={<LuTimerReset aria-hidden="true" />}
            />
        </section>
    );
}
