import { useEffect, useMemo, useState } from "react";
import { LuArrowLeft, LuChevronDown, LuChevronUp } from "react-icons/lu";
import {
    getClassColor,
    getClassMedia,
    getRoleBySpec,
    getSpecMedia,
} from "../../Domain/CombatDomainContext";
import type { KickTelemetrySnapshot } from "./kickTelemetry";
import type { MatchPlayer } from "./types";
import type { MatchSummary } from "./utils";
import styles from "./DataActivity.module.css";

interface MatchSummaryHeaderProps {
    match: MatchSummary;
    players: MatchPlayer[];
    kickTelemetrySnapshot: KickTelemetrySnapshot;
    onBack?: () => void;
}

type MetricTooltipRow = {
    label: string;
    value: string;
};

type KickHeaderTelemetry = {
    isAvailable: boolean;
    message?: string;
    successful: number;
    failed: number;
    total: number;
};

type ContributionMetricKind = "damage" | "healing";

type ContributionMetricView = {
    kind: ContributionMetricKind;
    label: "Damage" | "Healing";
    percent: number;
    averagePercent: number;
    deltaPercent: number;
    color: string;
    outcome: string;
    ownerTotal: number;
    teamTotal: number;
    deductionRows?: MetricTooltipRow[];
};

type RoleToken = "dps" | "healer" | "tank" | "unknown";

const CIRCLE_RADIUS = 52;
const CIRCLE_CENTER = 64;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;
const WARNING_LOWER_THRESHOLD_PCT = -5;
const GREEN_TOLERANCE_THRESHOLD_PCT = -0.5;

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const normalizeNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return Number(value);
    }
    return 0;
};

const normalizeCount = (value: unknown) => Math.max(0, Math.trunc(normalizeNumber(value)));

const formatInteger = (value: number) => value.toLocaleString();

const formatRealm = (realm?: string) => {
    if (!realm) return "Unknown Realm";
    return realm
        .replace(/-/g, " ")
        .replace(/\b\w/g, (value) => value.toUpperCase());
};

const roleLabelMap: Record<string, string> = {
    dps: "DPS",
    healer: "Healer",
    tank: "Tank",
    unknown: "Unknown",
};

const getContributionOutcome = (deltaPercent: number) => {
    if (deltaPercent >= GREEN_TOLERANCE_THRESHOLD_PCT) return "Above role average";
    if (deltaPercent >= WARNING_LOWER_THRESHOLD_PCT) return "Near role average";
    return "Below role average";
};

const getContributionColor = (deltaPercent: number) => {
    if (deltaPercent >= GREEN_TOLERANCE_THRESHOLD_PCT) return "var(--good)";
    if (deltaPercent >= WARNING_LOWER_THRESHOLD_PCT) return "var(--warn)";
    return "var(--bad)";
};

const asRoleToken = (value: string): RoleToken => {
    if (value === "dps" || value === "healer" || value === "tank") return value;
    return "unknown";
};

const getHealingWeightByOwnerRole = (
    ownerRole: RoleToken,
    playerRole: RoleToken,
    hasHealer: boolean,
    hasTank: boolean
) => {
    if (ownerRole === "tank") {
        if (!hasHealer) return 1;
        if (playerRole === "tank") return 1;
        if (playerRole === "healer") return 0.65;
        return 0;
    }
    if (ownerRole === "healer") {
        if (!hasTank) return playerRole === "healer" ? 1 : 0;
        if (playerRole === "healer") return 1;
        if (playerRole === "tank") return 0.35;
        return 0;
    }
    if (ownerRole === "dps") {
        if (!hasTank) return playerRole === "dps" ? 1 : 0;
        if (playerRole === "dps") return 1;
        if (playerRole === "tank") return 0.2;
        return 0;
    }
    return 1;
};

const getHealingDeductionRows = (
    ownerRole: RoleToken,
    hasHealer: boolean,
    hasTank: boolean
): MetricTooltipRow[] => {
    const buildRows = (weights: Array<{ role: "Tank" | "Healer" | "DPS"; weight: number }>) =>
        weights
            .filter((entry) => entry.weight > 0)
            .map((entry) => ({ label: entry.role, value: `${Math.round(entry.weight * 100)}%` }));

    if (ownerRole === "tank") {
        if (!hasHealer) {
            return buildRows([
                { role: "Tank", weight: 1 },
                { role: "Healer", weight: 1 },
                { role: "DPS", weight: 1 },
            ]);
        }
        return buildRows([
            { role: "Tank", weight: 1 },
            { role: "Healer", weight: 0.65 },
            { role: "DPS", weight: 0 },
        ]);
    }
    if (ownerRole === "healer") {
        if (!hasTank) {
            return buildRows([
                { role: "Healer", weight: 1 },
                { role: "Tank", weight: 0 },
                { role: "DPS", weight: 0 },
            ]);
        }
        return buildRows([
            { role: "Healer", weight: 1 },
            { role: "Tank", weight: 0.35 },
            { role: "DPS", weight: 0 },
        ]);
    }
    if (ownerRole === "dps") {
        if (!hasTank) {
            return buildRows([
                { role: "DPS", weight: 1 },
                { role: "Tank", weight: 0 },
                { role: "Healer", weight: 0 },
            ]);
        }
        return buildRows([
            { role: "DPS", weight: 1 },
            { role: "Tank", weight: 0.2 },
            { role: "Healer", weight: 0 },
        ]);
    }
    return buildRows([
        { role: "Tank", weight: 1 },
        { role: "Healer", weight: 1 },
        { role: "DPS", weight: 1 },
    ]);
};

const resolveMediaUrl = (value?: string) => {
    if (!value) return null;
    if (value.startsWith("http") || value.startsWith("/") || value.includes(".")) return value;
    if (/^\d+$/.test(value)) return `https://render.worldofwarcraft.com/us/icons/56/${value}.jpg`;
    return `https://render.worldofwarcraft.com/us/icons/56/${value}.jpg`;
};

function MetricTooltip({
    title,
    rows,
    note,
    align = "center",
}: {
    title?: string;
    rows: MetricTooltipRow[];
    note?: string;
    align?: "center" | "right";
}) {
    return (
        <div
            className={`${styles.summaryMetricTooltip} ${
                align === "right" ? styles.summaryMetricTooltipRight : ""
            }`}
            role="tooltip"
        >
            {title ? <div className={styles.summaryMetricTooltipTitle}>{title}</div> : null}
            {note ? <div className={styles.summaryMetricTooltipNote}>{note}</div> : null}
            {rows.map((row) => (
                <div key={row.label} className={styles.summaryMetricTooltipRow}>
                    <span>{row.label}</span>
                    <span>{row.value}</span>
                </div>
            ))}
        </div>
    );
}

function ContributionCircle({
    percent,
    color,
    centerValue,
    centerLabel,
    tooltipTitle,
    tooltipRows,
    animationProgress,
}: {
    percent: number;
    color: string;
    centerValue: string;
    centerLabel: string;
    tooltipTitle: string;
    tooltipRows: MetricTooltipRow[];
    animationProgress: number;
}) {
    const finalPercent = clampPercent(percent);
    const fillLength = CIRCLE_CIRCUMFERENCE * (finalPercent / 100) * animationProgress;
    const startOffset = CIRCLE_CIRCUMFERENCE * 0.25;

    return (
        <div className={styles.summaryCircleShell} tabIndex={0}>
            <svg className={styles.summaryCircle} viewBox="0 0 128 128" aria-hidden="true">
                <circle
                    className={styles.summaryCircleTrack}
                    cx={CIRCLE_CENTER}
                    cy={CIRCLE_CENTER}
                    r={CIRCLE_RADIUS}
                />
                <circle
                    className={styles.summaryCircleArc}
                    cx={CIRCLE_CENTER}
                    cy={CIRCLE_CENTER}
                    r={CIRCLE_RADIUS}
                    stroke={color}
                    strokeDasharray={`${fillLength} ${CIRCLE_CIRCUMFERENCE - fillLength}`}
                    strokeDashoffset={startOffset}
                />
            </svg>
            <div className={styles.summaryCircleText}>
                <div className={styles.summaryCircleValue}>{centerValue}</div>
                <div className={styles.summaryCircleLabel}>{centerLabel}</div>
            </div>
            <MetricTooltip title={tooltipTitle} rows={tooltipRows} />
        </div>
    );
}

function KickEfficiencyCircle({
    telemetry,
    tooltipRows,
    animationProgress,
}: {
    telemetry: KickHeaderTelemetry;
    tooltipRows: MetricTooltipRow[];
    animationProgress: number;
}) {
    const total = telemetry.total;
    const successful = telemetry.successful;
    const failed = telemetry.failed;
    const successPct = total > 0 ? successful / total : 0;
    const failedPct = total > 0 ? failed / total : 0;
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;
    const animatedSuccessLength = CIRCLE_CIRCUMFERENCE * successPct * animationProgress;
    const animatedFailedLength = CIRCLE_CIRCUMFERENCE * failedPct * animationProgress;
    const startOffset = CIRCLE_CIRCUMFERENCE * 0.25;

    return (
        <div className={styles.summaryCircleShell} tabIndex={0}>
            <svg className={styles.summaryCircle} viewBox="0 0 128 128" aria-hidden="true">
                <circle
                    className={styles.summaryCircleTrack}
                    cx={CIRCLE_CENTER}
                    cy={CIRCLE_CENTER}
                    r={CIRCLE_RADIUS}
                />
                {telemetry.isAvailable ? (
                    <>
                        <circle
                            className={styles.summaryCircleArcSegment}
                            cx={CIRCLE_CENTER}
                            cy={CIRCLE_CENTER}
                            r={CIRCLE_RADIUS}
                            stroke="var(--good)"
                            strokeDasharray={`${animatedSuccessLength} ${
                                CIRCLE_CIRCUMFERENCE - animatedSuccessLength
                            }`}
                            strokeDashoffset={startOffset}
                        />
                        <circle
                            className={styles.summaryCircleArcSegment}
                            cx={CIRCLE_CENTER}
                            cy={CIRCLE_CENTER}
                            r={CIRCLE_RADIUS}
                            stroke="var(--bad)"
                            strokeDasharray={`${animatedFailedLength} ${CIRCLE_CIRCUMFERENCE - animatedFailedLength}`}
                            strokeDashoffset={startOffset - animatedSuccessLength}
                        />
                    </>
                ) : null}
            </svg>
            <div className={styles.summaryCircleText}>
                <div className={styles.summaryCircleValue}>
                    {telemetry.isAvailable ? (total === 0 ? "?" : `${successful} / ${total}`) : "?"}
                </div>
                <div className={styles.summaryCircleLabel}>Kick Status</div>
            </div>
            <MetricTooltip
                title="Kick Status"
                align="right"
                note={
                    telemetry.isAvailable
                        ? total === 0
                            ? "No interrupt attempts recorded."
                            : undefined
                        : telemetry.message ?? "Interrupt telemetry not available for this match."
                }
                rows={
                    telemetry.isAvailable && total > 0
                        ? [
                              ...tooltipRows,
                              { label: "Success Rate", value: `${successRate}%` },
                          ]
                        : []
                }
            />
        </div>
    );
}

export default function MatchSummaryHeader({
    match,
    players,
    kickTelemetrySnapshot,
    onBack,
}: MatchSummaryHeaderProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [animationProgress, setAnimationProgress] = useState(0);

    useEffect(() => {
        setIsExpanded(false);
    }, [match.id]);

    useEffect(() => {
        setAnimationProgress(0);
        const raf = window.requestAnimationFrame(() => setAnimationProgress(1));
        return () => window.cancelAnimationFrame(raf);
    }, [match.id]);

    const owner = useMemo(
        () => players.find((player) => player.isOwner) ?? players[0] ?? null,
        [players]
    );
    const ownerTeam = useMemo(() => {
        if (!owner || typeof owner.faction !== "number") return players;
        const factionPlayers = players.filter((player) => player.faction === owner.faction);
        return factionPlayers.length > 0 ? factionPlayers : players;
    }, [owner, players]);

    const ownerDamage = normalizeCount(owner?.damage);
    const ownerHealing = normalizeCount(owner?.healing);
    const teamDamage = ownerTeam.reduce((sum, player) => sum + normalizeCount(player.damage), 0);
    const role = getRoleBySpec(owner?.spec);
    const ownerRole = asRoleToken(role);
    const rolePresence = useMemo(() => {
        const roles = ownerTeam.map((player) => asRoleToken(getRoleBySpec(player.spec)));
        return {
            hasHealer: roles.includes("healer"),
            hasTank: roles.includes("tank"),
        };
    }, [ownerTeam]);

    const contributionCohort = useMemo(() => {
        if (!ownerTeam.length) return [];
        if (role === "dps" || role === "healer" || role === "tank") {
            const sameRole = ownerTeam.filter((player) => getRoleBySpec(player.spec) === role);
            return sameRole.length ? sameRole : ownerTeam;
        }
        return ownerTeam;
    }, [ownerTeam, role]);

    const contributionMetrics = useMemo<ContributionMetricView[]>(() => {
        const buildMetric = (kind: ContributionMetricKind): ContributionMetricView => {
            const isHealingMetric = kind === "healing";
            const ownerTotal = isHealingMetric
                ? ownerHealing *
                  getHealingWeightByOwnerRole(
                      ownerRole,
                      ownerRole,
                      rolePresence.hasHealer,
                      rolePresence.hasTank
                  )
                : ownerDamage;
            const teamTotal = isHealingMetric
                ? ownerTeam.reduce((sum, player) => {
                      const playerRole = asRoleToken(getRoleBySpec(player.spec));
                      const weightedHealing =
                          normalizeCount(player.healing) *
                          getHealingWeightByOwnerRole(
                              ownerRole,
                              playerRole,
                              rolePresence.hasHealer,
                              rolePresence.hasTank
                          );
                      return sum + weightedHealing;
                  }, 0)
                : teamDamage;
            const percent = teamTotal > 0 ? (ownerTotal / teamTotal) * 100 : 0;
            const shares = contributionCohort.map((player) => {
                const sourceTotal = isHealingMetric
                    ? normalizeCount(player.healing) *
                      getHealingWeightByOwnerRole(
                          ownerRole,
                          asRoleToken(getRoleBySpec(player.spec)),
                          rolePresence.hasHealer,
                          rolePresence.hasTank
                      )
                    : normalizeCount(player.damage);
                return teamTotal > 0 ? (sourceTotal / teamTotal) * 100 : 0;
            });
            const averagePercent = shares.length
                ? shares.reduce((sum, value) => sum + value, 0) / shares.length
                : 0;
            const deltaPercent = percent - averagePercent;
            const color = getContributionColor(deltaPercent);
            const outcome = getContributionOutcome(deltaPercent);

            return {
                kind,
                label: isHealingMetric ? "Healing" : "Damage",
                percent,
                averagePercent,
                deltaPercent,
                color,
                outcome,
                ownerTotal,
                teamTotal,
                deductionRows: isHealingMetric
                    ? getHealingDeductionRows(
                          ownerRole,
                          rolePresence.hasHealer,
                          rolePresence.hasTank
                      )
                    : undefined,
            };
        };

        if (ownerRole === "tank") {
            return [buildMetric("damage"), buildMetric("healing")];
        }
        if (ownerRole === "healer") {
            return [buildMetric("healing")];
        }
        if (ownerRole === "dps") {
            return [buildMetric("damage"), buildMetric("healing")];
        }
        return [buildMetric("damage"), buildMetric("healing")];
    }, [
        contributionCohort,
        ownerDamage,
        ownerHealing,
        ownerRole,
        ownerTeam,
        rolePresence.hasHealer,
        rolePresence.hasTank,
        teamDamage,
    ]);

    const primaryContribution = contributionMetrics[0] ?? {
        kind: "damage" as const,
        label: "Damage" as const,
        percent: 0,
        averagePercent: 0,
        deltaPercent: 0,
        color: "var(--good)",
        outcome: "Above role average",
        ownerTotal: 0,
        teamTotal: 0,
    };
    const performanceOutcome = primaryContribution.outcome;

    const contributionRenderItems = useMemo(
        () =>
            contributionMetrics
                .filter((metric) => metric.kind === "damage" || ownerRole === "healer")
                .map((metric) => {
                const tooltipRows: MetricTooltipRow[] = [
                    {
                        label: `Player ${metric.label.toLowerCase()}`,
                        value: formatInteger(metric.ownerTotal),
                    },
                    {
                        label: `Team ${metric.label.toLowerCase()}`,
                        value: formatInteger(metric.teamTotal),
                    },
                    {
                        label: "Contribution",
                        value: `${clampPercent(metric.percent).toFixed(1)}%`,
                    },
                    {
                        label: "Role average",
                        value: `${clampPercent(metric.averagePercent).toFixed(1)}%`,
                    },
                    ...(metric.kind === "healing" && metric.deductionRows
                        ? [
                              { label: "Healing deduction:", value: "" },
                              ...metric.deductionRows,
                          ]
                        : []),
                    { label: "Outcome", value: metric.outcome },
                ];
                return {
                    key: metric.kind,
                    centerLabel: metric.label,
                    tooltipTitle: `Team ${metric.label} Contribution`,
                    color: metric.color,
                    percent: metric.percent,
                    tooltipRows,
                };
            }),
        [contributionMetrics, ownerRole]
    );

    const contributionExpandedMetrics = useMemo(
        () =>
            contributionMetrics
                .filter((metric) => metric.kind === "damage" || ownerRole === "healer")
                .map((metric) => ({
                    label: `${metric.label} / Team Total`,
                    value: `${formatInteger(metric.ownerTotal)} / ${formatInteger(metric.teamTotal)}`,
                })),
        [contributionMetrics, ownerRole]
    );

    const kickTelemetry = useMemo<KickHeaderTelemetry>(() => {
        const isAvailable =
            !kickTelemetrySnapshot.isLegacyMatch && kickTelemetrySnapshot.succeeded !== null;
        if (!isAvailable) {
            return {
                isAvailable: false,
                message: kickTelemetrySnapshot.isLegacyMatch
                    ? "Data version is not supported for this analytics."
                    : "Interrupt telemetry not available for this match.",
                successful: 0,
                failed: 0,
                total: 0,
            };
        }

        const total = Math.max(0, Math.trunc(kickTelemetrySnapshot.intentAttempts));
        const successful = Math.max(0, Math.trunc(kickTelemetrySnapshot.succeeded ?? 0));
        const failed = Math.max(0, total - successful);

        return { isAvailable: true, successful, failed, total };
    }, [kickTelemetrySnapshot]);

    const ownerClassColor = getClassColor(owner?.class) ?? "#8a94a6";
    const classMedia = resolveMediaUrl(getClassMedia(owner?.class) ?? getSpecMedia(owner?.spec));
    const roleLabel = roleLabelMap[role] ?? "Unknown";
    const showMmrDelta = match.delta !== 0;

    const kickTooltipRows: MetricTooltipRow[] = [
        { label: "Successful", value: String(kickTelemetry.successful) },
        { label: "Failed", value: String(kickTelemetry.failed) },
    ];

    const expandedMetrics: Array<{ label: string; value: string }> = [
        { label: "Performance", value: performanceOutcome },
        ...contributionExpandedMetrics,
        {
            label: "Successful Kicks",
            value: kickTelemetry.isAvailable ? formatInteger(kickTelemetry.successful) : "N/A",
        },
        {
            label: "Failed Kicks",
            value: kickTelemetry.isAvailable ? formatInteger(kickTelemetry.failed) : "N/A",
        },
        {
            label: "Kick Attempts",
            value: kickTelemetry.isAvailable ? formatInteger(kickTelemetry.total) : "N/A",
        },
    ];

    return (
        <section className={styles.summaryHeader}>
            <div className={styles.summaryTopBar}>
                {onBack ? (
                    <button type="button" className={styles.backButton} onClick={onBack}>
                        <LuArrowLeft aria-hidden="true" className={styles.backIcon} />
                        Match History
                    </button>
                ) : (
                    <span />
                )}
                <button
                    type="button"
                    className={styles.summaryExpandButton}
                    onClick={() => setIsExpanded((value) => !value)}
                    aria-expanded={isExpanded}
                >
                    {isExpanded ? "Hide Performance" : `Show Performance - ${performanceOutcome}`}
                    {isExpanded ? <LuChevronUp aria-hidden="true" /> : <LuChevronDown aria-hidden="true" />}
                </button>
            </div>

            <div
                className={`${styles.summaryMainRow} ${
                    contributionRenderItems.length > 1
                        ? styles.summaryMainRowWithThreeMetrics
                        : ""
                }`}
            >
                <div className={styles.summaryIdentity}>
                    <div className={styles.summaryAvatar} aria-hidden="true">
                        {classMedia ? (
                            <img src={classMedia} alt="" loading="lazy" />
                        ) : (
                            <span>{(owner?.class ?? "?").slice(0, 1).toUpperCase()}</span>
                        )}
                    </div>
                    <div className={styles.summaryIdentityText}>
                        <div className={styles.summaryNameRow}>
                            <h2
                                className={styles.summaryPlayerName}
                                style={{
                                    color: ownerClassColor,
                                    textShadow: `${ownerClassColor}44 0 0 10px`,
                                }}
                            >
                                {owner?.name ?? "Unknown Player"}
                            </h2>
                        </div>
                        <div className={styles.summaryRealmLine}>{formatRealm(owner?.realm)}</div>
                        <div className={styles.summaryMetaRow}>
                            <span>{owner?.spec ?? "Unknown Spec"}</span>
                            <span>{roleLabel}</span>
                            <span>{match.durationLabel}</span>
                            <span>{match.mapName}</span>
                            {showMmrDelta ? <span>MMR {match.deltaLabel}</span> : null}
                        </div>
                    </div>
                </div>

                {contributionRenderItems.map((item) => (
                    <div key={item.key} className={styles.summaryMetricColumn}>
                        <ContributionCircle
                            percent={item.percent}
                            color={item.color}
                            centerValue={`${Math.round(clampPercent(item.percent))}%`}
                            centerLabel={item.centerLabel}
                            tooltipTitle={item.tooltipTitle}
                            tooltipRows={item.tooltipRows}
                            animationProgress={animationProgress}
                        />
                    </div>
                ))}

                <div className={styles.summaryMetricColumn}>
                    <KickEfficiencyCircle
                        telemetry={kickTelemetry}
                        tooltipRows={kickTooltipRows}
                        animationProgress={animationProgress}
                    />
                </div>
            </div>

            <div
                className={`${styles.summaryExpandedLayer} ${
                    isExpanded ? styles.summaryExpandedLayerOpen : ""
                }`}
            >
                <div className={styles.summaryExpandedGrid}>
                    {expandedMetrics.map((metric) => (
                        <div key={metric.label} className={styles.summaryExpandedMetric}>
                            <span className={styles.summaryExpandedMetricLabel}>{metric.label}</span>
                            <span className={styles.summaryExpandedMetricValue}>{metric.value}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
