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

const CIRCLE_RADIUS = 52;
const CIRCLE_CENTER = 64;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

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
}: {
    percent: number;
    color: string;
    centerValue: string;
    centerLabel: string;
    tooltipTitle: string;
    tooltipRows: MetricTooltipRow[];
}) {
    const [animatedPercent, setAnimatedPercent] = useState(0);
    const finalPercent = clampPercent(percent);
    const fillLength = CIRCLE_CIRCUMFERENCE * (animatedPercent / 100);
    const startOffset = CIRCLE_CIRCUMFERENCE * 0.25;

    useEffect(() => {
        const raf = window.requestAnimationFrame(() => setAnimatedPercent(finalPercent));
        return () => window.cancelAnimationFrame(raf);
    }, [finalPercent]);

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
    averageReactionMs,
    tooltipRows,
}: {
    telemetry: KickHeaderTelemetry;
    averageReactionMs: number | null;
    tooltipRows: MetricTooltipRow[];
}) {
    const [animationFactor, setAnimationFactor] = useState(0);
    const total = telemetry.total;
    const successful = telemetry.successful;
    const failed = telemetry.failed;
    const successPct = total > 0 ? successful / total : 0;
    const failedPct = total > 0 ? failed / total : 0;
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;

    useEffect(() => {
        const raf = window.requestAnimationFrame(() => setAnimationFactor(1));
        return () => window.cancelAnimationFrame(raf);
    }, [successful, failed, telemetry.isAvailable]);

    const animatedSuccessLength = CIRCLE_CIRCUMFERENCE * successPct * animationFactor;
    const animatedFailedLength = CIRCLE_CIRCUMFERENCE * failedPct * animationFactor;
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
                              ...(averageReactionMs === null
                                  ? []
                                  : [
                                        {
                                            label: "Avg Reaction",
                                            value: `${averageReactionMs} ms`,
                                        },
                                    ]),
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

    useEffect(() => {
        setIsExpanded(false);
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
    const teamHealing = ownerTeam.reduce((sum, player) => sum + normalizeCount(player.healing), 0);
    const role = getRoleBySpec(owner?.spec);
    const isHealer = role === "healer";
    const outputLabel = isHealer ? "Healing" : "Damage";
    const outputTotal = isHealer ? ownerHealing : ownerDamage;
    const outputTeamTotal = isHealer ? teamHealing : teamDamage;
    const contributionPct = outputTeamTotal > 0 ? (outputTotal / outputTeamTotal) * 100 : 0;

    const contributionCohort = useMemo(() => {
        if (!ownerTeam.length) return [];
        if (role === "dps") {
            return ownerTeam.filter((player) => getRoleBySpec(player.spec) === "dps");
        }
        if (role === "healer") {
            return ownerTeam.filter((player) => getRoleBySpec(player.spec) === "healer");
        }
        return ownerTeam;
    }, [ownerTeam, role]);

    const contributionAveragePct = useMemo(() => {
        if (outputTeamTotal <= 0) return 0;
        const shares = contributionCohort.map((player) => {
            const total = isHealer ? normalizeCount(player.healing) : normalizeCount(player.damage);
            return (total / outputTeamTotal) * 100;
        });
        if (!shares.length) return 0;
        return shares.reduce((sum, value) => sum + value, 0) / shares.length;
    }, [contributionCohort, isHealer, outputTeamTotal]);

    const contributionIsPositive = contributionPct >= contributionAveragePct;
    const contributionColor = contributionIsPositive ? "var(--good)" : "var(--bad)";
    const performanceOutcome = contributionIsPositive ? "Above role average" : "Below role average";

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

    const contributionTooltipRows: MetricTooltipRow[] = [
        { label: `Player ${outputLabel.toLowerCase()}`, value: formatInteger(outputTotal) },
        { label: `Team ${outputLabel.toLowerCase()}`, value: formatInteger(outputTeamTotal) },
        { label: "Contribution", value: `${clampPercent(contributionPct).toFixed(1)}%` },
        { label: "Role average", value: `${clampPercent(contributionAveragePct).toFixed(1)}%` },
        { label: "Outcome", value: performanceOutcome },
    ];

    const kickTooltipRows: MetricTooltipRow[] = [
        { label: "Successful", value: String(kickTelemetry.successful) },
        { label: "Failed", value: String(kickTelemetry.failed) },
    ];

    const expandedMetrics: Array<{ label: string; value: string }> = [
        { label: "Performance", value: performanceOutcome },
        {
            label: `${outputLabel} / Team Total`,
            value: `${formatInteger(outputTotal)} / ${formatInteger(outputTeamTotal)}`,
        },
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

            <div className={styles.summaryMainRow}>
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

                <div className={styles.summaryMetricColumn}>
                    <ContributionCircle
                        percent={contributionPct}
                        color={contributionColor}
                        centerValue={`${Math.round(clampPercent(contributionPct))}%`}
                        centerLabel="Contribution"
                        tooltipTitle={`${isHealer ? "Team Healing" : "Team Damage"} Contribution`}
                        tooltipRows={contributionTooltipRows}
                    />
                </div>

                <div className={styles.summaryMetricColumn}>
                    <KickEfficiencyCircle
                        telemetry={kickTelemetry}
                        averageReactionMs={kickTelemetrySnapshot.averageReactionMs}
                        tooltipRows={kickTooltipRows}
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
