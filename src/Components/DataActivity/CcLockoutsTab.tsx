import { LuClock3, LuShieldAlert, LuSparkles, LuZap } from "react-icons/lu";
import TelemetryUnavailableState from "./TelemetryUnavailableState";
import {
    buildLocSummary,
    classifyLocEntry,
    formatAnalysisTime,
    toLinkedLocHint,
    toLocDurationLabel,
} from "./matchAnalysis.utils";
import type { NormalizedLocalSpellModel } from "../../Interfaces/local-spell-model";
import styles from "./DataActivity.module.css";

interface CcLockoutsTabProps {
    localSpellModel: NormalizedLocalSpellModel | null;
}

export default function CcLockoutsTab({ localSpellModel }: CcLockoutsTabProps) {
    if (!localSpellModel || localSpellModel.detailAvailable === false) {
        return (
            <TelemetryUnavailableState
                message="Local crowd-control and lockout telemetry is not available for this match."
                detail={localSpellModel?.failureReason ?? null}
            />
        );
    }

    const locEntries = localSpellModel.locEntries ?? [];
    if (!locEntries.length) {
        return (
            <TelemetryUnavailableState
                title="No control events captured"
                message="This match has detailed local telemetry, but no local Loss-of-Control entries were recorded."
            />
        );
    }

    const summary = buildLocSummary(locEntries);
    const maxDuration = Math.max(1, ...locEntries.map((entry) => entry.duration ?? 0));
    const linkedCounts = new Map<number, number>();
    locEntries.forEach((entry) => {
        linkedCounts.set(entry.id, 0);
    });

    localSpellModel.attempts.forEach((attempt) => {
        (attempt.linkedLoc ?? []).forEach((locId) => {
            linkedCounts.set(locId, (linkedCounts.get(locId) ?? 0) + 1);
        });
    });

    const controlRows = locEntries
        .filter((entry) => classifyLocEntry(entry) === "control")
        .sort((a, b) => a.t - b.t);
    const lockoutRows = locEntries
        .filter((entry) => classifyLocEntry(entry) === "lockout")
        .sort((a, b) => a.t - b.t);

    const sections = [
        {
            key: "control",
            title: "Crowd Control",
            rows: controlRows,
        },
        {
            key: "lockout",
            title: "School Lockouts",
            rows: lockoutRows,
        },
    ];

    return (
        <div className={styles.analysisTabStack}>
            <div className={styles.analysisMetricStrip}>
                <article className={styles.analysisMetricCard}>
                    <div className={styles.analysisMetricIcon}>
                        <LuShieldAlert aria-hidden="true" />
                    </div>
                    <div>
                        <div className={styles.analysisMetricLabel}>Total CC seconds</div>
                        <div className={styles.analysisMetricValue}>
                            {formatAnalysisTime(summary.totalCcSeconds)}
                        </div>
                    </div>
                </article>

                <article className={styles.analysisMetricCard}>
                    <div className={styles.analysisMetricIcon}>
                        <LuZap aria-hidden="true" />
                    </div>
                    <div>
                        <div className={styles.analysisMetricLabel}>Total lockout seconds</div>
                        <div className={styles.analysisMetricValue}>
                            {formatAnalysisTime(summary.totalLockoutSeconds)}
                        </div>
                    </div>
                </article>

                <article className={styles.analysisMetricCard}>
                    <div className={styles.analysisMetricIcon}>
                        <LuSparkles aria-hidden="true" />
                    </div>
                    <div>
                        <div className={styles.analysisMetricLabel}>Top control type</div>
                        <div className={styles.analysisMetricValueCompact}>
                            {summary.topControlType ?? "--"}
                        </div>
                    </div>
                </article>

                <article className={styles.analysisMetricCard}>
                    <div className={styles.analysisMetricIcon}>
                        <LuClock3 aria-hidden="true" />
                    </div>
                    <div>
                        <div className={styles.analysisMetricLabel}>Top lockout</div>
                        <div className={styles.analysisMetricValueCompact}>
                            {summary.topLockoutLabel ?? "--"}
                        </div>
                    </div>
                </article>
            </div>

            <div className={styles.analysisDualColumn}>
                {sections.map((section) => (
                    <section key={section.key} className={styles.analysisModule}>
                        <header className={styles.analysisModuleHeader}>
                            <div>
                                <div className={styles.analysisModuleEyebrow}>Local Telemetry</div>
                                <h3 className={styles.analysisModuleTitle}>{section.title}</h3>
                            </div>
                            <div className={styles.analysisModuleMeta}>
                                {section.rows.length} entries
                            </div>
                        </header>

                        <div className={styles.controlList}>
                            {section.rows.length > 0 ? (
                                section.rows.map((entry) => {
                                    const duration = typeof entry.duration === "number" ? entry.duration : 0;
                                    const linkedHint = toLinkedLocHint(linkedCounts.get(entry.id) ?? 0);
                                    return (
                                        <article key={entry.id} className={styles.controlRow}>
                                            <div className={styles.controlRowHeader}>
                                                <div>
                                                    <div className={styles.controlRowTitle}>
                                                        {entry.displayText ?? entry.locType ?? "Unknown effect"}
                                                    </div>
                                                    <div className={styles.controlRowMeta}>
                                                        <span>{entry.locType ?? "Local control"}</span>
                                                        <span>{formatAnalysisTime(entry.t)}</span>
                                                        {typeof entry.roundIndex === "number" ? (
                                                            <span className={styles.analysisChipMuted}>
                                                                Round {entry.roundIndex}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <div className={styles.controlRowDuration}>
                                                    {toLocDurationLabel(entry)}
                                                </div>
                                            </div>

                                            <div className={styles.controlRowBarTrack}>
                                                <div
                                                    className={`${styles.controlRowBarFill} ${
                                                        section.key === "lockout"
                                                            ? styles.controlRowBarFillLockout
                                                            : styles.controlRowBarFillControl
                                                    }`}
                                                    style={{
                                                        width: `${Math.max(
                                                            8,
                                                            (duration / maxDuration) * 100
                                                        )}%`,
                                                    }}
                                                />
                                            </div>

                                            <div className={styles.controlRowFooter}>
                                                <span>
                                                    {entry.school !== null && entry.school !== undefined
                                                        ? `School: ${String(entry.school)}`
                                                        : "Crowd-control effect"}
                                                </span>
                                                {linkedHint ? (
                                                    <span className={styles.analysisHintStrong}>
                                                        {linkedHint}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </article>
                                    );
                                })
                            ) : (
                                <div className={styles.analysisInlineEmpty}>
                                    No {section.title.toLowerCase()} entries were captured for this
                                    match.
                                </div>
                            )}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
