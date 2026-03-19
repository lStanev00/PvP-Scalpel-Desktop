import { useMemo, useState } from "react";
import styles from "./DashboardMomentumCard.module.css";
import {
    buildDashboardRatedMovementChart,
    type DashboardRatedMovementChartPoint,
    type DashboardMomentumPoint,
    type DashboardMomentumRecentMatch,
} from "./dashboardMomentum";

type Props = {
    isRatedContext: boolean;
    ratedPoints: DashboardMomentumPoint[];
    recentMatches: DashboardMomentumRecentMatch[];
    scopeLabel: string;
    onOpenMatch: (matchId: string) => void;
};

const resolveNetValueTone = (value: number) => {
    if (value > 0) return styles.netValuePositive;
    if (value < 0) return styles.netValueNegative;
    return styles.netValueNeutral;
};

const resolveLabelPlacement = (
    markerPoints: DashboardRatedMovementChartPoint[],
    pointId: string,
    baselineY: number
) => {
    const index = markerPoints.findIndex((point) => point.id === pointId);
    const current = index >= 0 ? markerPoints[index] : null;
    const previous = index > 0 ? markerPoints[index - 1] : null;
    const next = index >= 0 && index < markerPoints.length - 1 ? markerPoints[index + 1] : null;

    if (!current) return "above" as const;

    const isNearBaseline = current.y >= baselineY - 18;
    if (isNearBaseline) {
        return "below" as const;
    }

    if (previous && next) {
        if (current.rating <= previous.rating && current.rating <= next.rating) {
            return "below" as const;
        }
        if (previous.rating > current.rating) {
            return "below" as const;
        }
        return "above" as const;
    }

    if (!previous && next) {
        return next.rating > current.rating ? ("below" as const) : ("above" as const);
    }

    if (previous && !next) {
        return previous.rating > current.rating ? ("below" as const) : ("above" as const);
    }

    return "above" as const;
};

export default function DashboardMomentumCard({
    isRatedContext,
    ratedPoints,
    recentMatches,
    scopeLabel,
    onOpenMatch,
}: Props) {
    const [isChartHovered, setIsChartHovered] = useState(false);
    const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
    const chart = useMemo(() => buildDashboardRatedMovementChart(ratedPoints), [ratedPoints]);
    const defaultMarkerIds = chart?.defaultMarkerIds ?? [];
    const visibleMarkers = useMemo(() => {
        if (!chart) return [];
        if (isChartHovered) return chart.markerPoints;
        const visibleIdSet = new Set(chart.defaultMarkerIds);
        return chart.markerPoints.filter((point) => visibleIdSet.has(point.id));
    }, [chart, isChartHovered]);

    return (
        <article className={styles.card}>
            <div className={styles.header}>
                <div>
                    <div className={styles.eyebrow}>Momentum</div>
                    <h3 className={styles.title}>
                        {isRatedContext ? "MMR Movement" : "Recent Results"}
                    </h3>
                </div>

                <span className={styles.scopePill}>{scopeLabel}</span>
            </div>

            {isRatedContext ? (
                chart ? (
                    <div
                        className={styles.graphWrap}
                        onMouseEnter={() => setIsChartHovered(true)}
                        onMouseLeave={() => {
                            setIsChartHovered(false);
                            setHoveredMarkerId(null);
                        }}
                    >
                        <div className={styles.metaRow}>
                            <span className={styles.metaLabel}>
                                Last {ratedPoints.length} rated matches
                            </span>

                            <span
                                className={`${styles.netValue} ${resolveNetValueTone(
                                    chart.netDelta
                                )}`}
                            >
                                {chart.netDelta > 0 ? "+" : ""}
                                {chart.netDelta} net
                            </span>
                        </div>

                        <svg
                            className={styles.svg}
                            viewBox={`0 0 ${chart.width} ${chart.height}`}
                            role="img"
                            aria-label="MMR movement chart based on rating progression"
                        >
                            <line
                                className={styles.goalLine}
                                x1="0"
                                y1={chart.goalY}
                                x2={chart.width}
                                y2={chart.goalY}
                            />
                            <text
                                className={styles.axisLabel}
                                x={chart.width - 8}
                                y={chart.goalY - 6}
                                textAnchor="end"
                            >
                                Goal {chart.nextGoal}
                            </text>

                            <line
                                className={styles.baseline}
                                x1="0"
                                y1={chart.baselineY}
                                x2={chart.width}
                                y2={chart.baselineY}
                            />

                            <polygon className={styles.area} points={chart.areaPoints} />

                            <polyline className={styles.line} points={chart.linePoints} />

                            {visibleMarkers.map((point) => {
                                const showLabel =
                                    defaultMarkerIds.includes(point.id) ||
                                    hoveredMarkerId === point.id;
                                const labelPlacement = resolveLabelPlacement(
                                    chart.markerPoints,
                                    point.id,
                                    chart.baselineY
                                );
                                return (
                                <g key={point.id}>
                                    <circle
                                        className={`${styles.point} ${
                                            defaultMarkerIds.includes(point.id)
                                                ? styles.pointDefault
                                                : styles.pointHoverOnly
                                        }`}
                                        cx={point.x}
                                        cy={point.y}
                                        r="4.5"
                                        onMouseEnter={() => setHoveredMarkerId(point.id)}
                                        onMouseLeave={() => setHoveredMarkerId((current) => (current === point.id ? null : current))}
                                    />
                                    {showLabel ? (
                                        <text
                                            className={`${styles.pointLabel} ${
                                                labelPlacement === "below"
                                                    ? styles.pointLabelBelow
                                                    : styles.pointLabelAbove
                                            }`}
                                            x={point.x}
                                            y={point.y + (labelPlacement === "below" ? 24 : -12)}
                                            textAnchor="middle"
                                        >
                                            {point.displayLabel}
                                        </text>
                                    ) : null}
                                </g>
                                );
                            })}
                        </svg>
                    </div>
                ) : (
                    <div className={styles.empty}>Not enough rated matches yet.</div>
                )
            ) : recentMatches.length > 0 ? (
                <div className={styles.resultStrip}>
                    {recentMatches.map((match) => (
                        <button
                            key={match.id}
                            type="button"
                            className={`${styles.resultBubble} ${
                                match.result === "win"
                                    ? styles.resultWin
                                    : match.result === "loss"
                                      ? styles.resultLoss
                                      : styles.resultNeutral
                            }`}
                            onClick={() => onOpenMatch(match.id)}
                            aria-label={`Open ${match.mapName} match details`}
                            title={`Open ${match.mapName}`}
                        >
                            <span>
                                {match.result === "win"
                                    ? "W"
                                    : match.result === "loss"
                                      ? "L"
                                      : "?"}
                            </span>
                        </button>
                    ))}
                </div>
            ) : (
                <div className={styles.empty}>
                    Recent {scopeLabel.toLowerCase()} snapshots fill in once captures are detected.
                </div>
            )}
        </article>
    );
}
