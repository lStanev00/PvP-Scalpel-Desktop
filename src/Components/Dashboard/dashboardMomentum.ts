import type { MatchSummary } from "../DataActivity/utils";

export type DashboardMomentumPoint = {
    id: string;
    rating: number;
};

export type DashboardMomentumRecentMatch = {
    id: string;
    mapName: string;
    result: "win" | "loss" | "neutral";
};

export type DashboardRatedMovementChartPoint = DashboardMomentumPoint & {
    rating: number;
    displayLabel: string;
    x: number;
    y: number;
};

export type DashboardRatedMovementChart = {
    width: number;
    height: number;
    nextGoal: number;
    baselineY: number;
    goalY: number;
    linePoints: string;
    areaPoints: string;
    markerPoints: DashboardRatedMovementChartPoint[];
    defaultMarkerIds: string[];
    currentRating: number;
    netDelta: number;
};

const DEFAULT_BASE_RATING = 1500;

const resolveGoal = (rating: number) => {
    if (rating < 1800) return 1800;
    if (rating < 2200) return 2200;
    if (rating < 2500) return 2500;

    let goal = 2650;
    while (rating >= goal) {
        goal += 150;
    }
    return goal;
};

export const buildDashboardRatedMovementPoints = (summaries: MatchSummary[]) =>
    summaries
        .map((match) => {
            const owner =
                match.raw.players?.find((player) => player.isOwner === true) ??
                match.raw.players?.[0] ??
                null;
            const postmatchMmr = owner?.postmatchMMR;
            return typeof postmatchMmr === "number" && Number.isFinite(postmatchMmr)
                ? {
                      id: match.id,
                      rating: postmatchMmr,
                  }
                : null;
        })
        .filter((point): point is DashboardMomentumPoint => point !== null)
        .slice(0, 20)
        .reverse();

export const buildDashboardRatedMovementChart = (
    points: DashboardMomentumPoint[]
): DashboardRatedMovementChart | null => {
    if (points.length < 2) return null;

    const resolvedCurrentRating = points[points.length - 1]?.rating ?? DEFAULT_BASE_RATING;
    const netDelta = resolvedCurrentRating - (points[0]?.rating ?? resolvedCurrentRating);
    const nextGoal = resolveGoal(resolvedCurrentRating);

    const width = 360;
    const height = 170;
    const paddingLeft = 24;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 24;

    const drawableWidth = width - paddingLeft - paddingRight;
    const drawableHeight = height - paddingTop - paddingBottom;

    const minDisplay = Math.min(
        DEFAULT_BASE_RATING,
        ...points.map((point) => point.rating)
    );
    const maxDisplay = Math.max(nextGoal, ...points.map((point) => point.rating));
    const displayRange = Math.max(1, maxDisplay - minDisplay);
    const stepX = points.length > 1 ? drawableWidth / (points.length - 1) : 0;

    const toY = (rating: number) =>
        paddingTop + ((maxDisplay - rating) / displayRange) * drawableHeight;

    const chartPoints: DashboardRatedMovementChartPoint[] = points.map((point, index) => ({
        ...point,
        displayLabel: String(point.rating),
        x: paddingLeft + index * stepX,
        y: toY(point.rating),
    }));

    const markerIndexes = new Set<number>([0, chartPoints.length - 1]);

    for (let index = 1; index < chartPoints.length - 1; index += 1) {
        const previousDirection = Math.sign(
            chartPoints[index].rating - chartPoints[index - 1].rating
        );
        const nextDirection = Math.sign(
            chartPoints[index + 1].rating - chartPoints[index].rating
        );

        if (
            previousDirection !== 0 &&
            nextDirection !== 0 &&
            previousDirection !== nextDirection
        ) {
            markerIndexes.add(index);
        }
    }

    const firstGoalCrossIndex = chartPoints.findIndex((point) => point.rating >= nextGoal);
    if (firstGoalCrossIndex >= 0) {
        markerIndexes.add(firstGoalCrossIndex);
    }

    const markerPoints = Array.from(markerIndexes)
        .sort((a, b) => a - b)
        .map((index) => chartPoints[index]);

    const highestMarkerIndex = markerPoints.reduce((bestIndex, point, index, source) => {
        if (point.rating > source[bestIndex].rating) return index;
        return bestIndex;
    }, 0);

    const defaultMarkerIndexes = new Set<number>([0, highestMarkerIndex, markerPoints.length - 1]);
    const defaultMarkerIds = Array.from(defaultMarkerIndexes)
        .sort((a, b) => a - b)
        .map((index) => markerPoints[index]?.id)
        .filter((id): id is string => !!id);

    const linePoints = markerPoints.map((point) => `${point.x},${point.y}`).join(" ");
    const baselineY = toY(DEFAULT_BASE_RATING);
    const goalY = toY(nextGoal);
    const areaPoints = [
        `${markerPoints[0].x},${baselineY}`,
        ...markerPoints.map((point) => `${point.x},${point.y}`),
        `${markerPoints[markerPoints.length - 1].x},${baselineY}`,
    ].join(" ");

    return {
        width,
        height,
        nextGoal,
        baselineY,
        goalY,
        linePoints,
        areaPoints,
        markerPoints,
        defaultMarkerIds,
        currentRating: resolvedCurrentRating,
        netDelta,
    };
};
