import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuClock3, LuFlame, LuPercent, LuTrendingUp } from "react-icons/lu";
import useMatches from "../../Hooks/useMatches";
import updatePersence from "../../Helpers/updatePresence";
import RouteLayout from "../RouteLayout/RouteLayout";
import FiltersBar from "./FiltersBar";
import MatchHistoryList from "./MatchHistoryList";
import MatchDetailsPanel from "./MatchDetailsPanel";
import {
    buildMatchSummary,
    type MatchMode,
    filterMatches,
    getDefaultSelectedId,
    type MatchFilters,
    type MatchSummary,
} from "./utils";
import styles from "./DataActivity.module.css";

const formatDurationLabel = (seconds: number) => {
    const total = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(total / 60);
    const remainingSeconds = total % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

export default function DataActivity() {
    const matches = useMatches();
    const [rpcUpdate, setRpcUpdate] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState<"list" | "details">("list");
    const [filters, setFilters] = useState<MatchFilters>({
        mode: "all",
        character: "all",
        query: "",
    });
    const listScrollTop = useRef(0);

    useEffect(() => {
        if (matches.length > 0) {
            setIsLoading(false);
        }
    }, [matches.length]);

    useEffect(() => {
        const timer = setTimeout(() => setIsLoading(false), 600);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        setView("list");
    }, [filters.mode, filters.character, filters.query]);

    const summaries = useMemo(() => {
        return matches
            .map(buildMatchSummary)
            .sort((a, b) => b.timestampMs - a.timestampMs);
    }, [matches]);
    const modeOptions = useMemo(() => {
        const order: MatchMode[] = [
            "skirmish",
            "solo",
            "rated2",
            "rated3",
            "randombg",
            "rbg",
            "unknown",
        ];
        const present = new Set(summaries.map((summary) => summary.mode));
        const options = order
            .filter((mode) => present.has(mode))
            .map((mode) => {
                const label =
                    mode === "solo"
                        ? "Solo Shuffle"
                        : mode === "skirmish"
                          ? "Skirmish"
                          : mode === "rated2"
                            ? "Rated 2v2"
                            : mode === "rated3"
                              ? "Rated 3v3"
                              : mode === "randombg"
                                ? "Random BG"
                              : mode === "rbg"
                                ? "RBG"
                                : "Unknown";
                return { label, value: mode };
            });
        return [{ label: "All Modes", value: "all" as const }, ...options];
    }, [summaries]);

    const characterOptions = useMemo(() => {
        const ownerName = summaries.find((summary) => summary.owner.isOwner)?.owner.name;
        const unique = Array.from(new Set(summaries.map((summary) => summary.owner.name)));
        const sorted = unique.sort((a, b) => a.localeCompare(b));
        if (ownerName) {
            const idx = sorted.indexOf(ownerName);
            if (idx > 0) {
                sorted.splice(idx, 1);
                sorted.unshift(ownerName);
            }
        }
        return [
            { label: "All Characters", value: "all" as const },
            ...sorted.map((name) => ({ label: name, value: name })),
        ];
    }, [summaries]);

    useEffect(() => {
        const modeValues = new Set(modeOptions.map((option) => option.value));
        if (!modeValues.has(filters.mode)) {
            setFilters((prev) => ({ ...prev, mode: "all" }));
        }
    }, [modeOptions, filters.mode]);

    useEffect(() => {
        const characterValues = new Set(characterOptions.map((option) => option.value));
        if (!characterValues.has(filters.character)) {
            setFilters((prev) => ({ ...prev, character: "all" }));
        }
    }, [characterOptions, filters.character]);
    const filtered = useMemo(() => filterMatches(summaries, filters), [summaries, filters]);
    const historyStats = useMemo(() => {
        const winCount = filtered.filter((match) => match.result === "win").length;
        const lossCount = filtered.filter((match) => match.result === "loss").length;
        const resolvedCount = winCount + lossCount;
        const winRate = resolvedCount > 0 ? Math.round((winCount / resolvedCount) * 100) : 0;

        const durationSamples = filtered
            .map((match) => match.durationSeconds)
            .filter((seconds): seconds is number => typeof seconds === "number" && seconds > 0);
        const averageDurationSeconds =
            durationSamples.length > 0
                ? durationSamples.reduce((sum, value) => sum + value, 0) / durationSamples.length
                : null;

        const ratingNet = filtered.reduce((sum, match) => {
            if (typeof match.delta !== "number") return sum;
            return sum + match.delta;
        }, 0);
        const hasRatingDeltas = filtered.some((match) => typeof match.delta === "number");
        const latestRating =
            filtered.find((match) => typeof match.owner.rating === "number")?.owner.rating ?? null;

        let winStreak = 0;
        for (const match of filtered) {
            if (match.result !== "win") break;
            winStreak += 1;
        }

        return {
            winRateLabel: `${winRate}%`,
            winBreakdownLabel:
                resolvedCount > 0 ? `${winCount}W - ${lossCount}L` : "No resolved matches",
            currentRatingLabel:
                typeof latestRating === "number" ? String(Math.round(latestRating)) : "--",
            ratingNetLabel: hasRatingDeltas
                ? `${ratingNet > 0 ? "+" : ""}${ratingNet} net`
                : "No rating deltas",
            averageDurationLabel:
                averageDurationSeconds === null ? "--" : formatDurationLabel(averageDurationSeconds),
            averageDurationDetail:
                durationSamples.length > 0
                    ? `${durationSamples.length} match${durationSamples.length === 1 ? "" : "es"}`
                    : "No duration data",
            winStreakLabel: String(winStreak),
            winStreakDetail: "current",
        };
    }, [filtered]);
    const needsScopedStats = filters.mode === "all" || filters.character === "all";
    const displayedHistoryStats = needsScopedStats
        ? {
              winRateLabel: "--",
              winBreakdownLabel: "Select bracket and character",
              currentRatingLabel: "--",
              ratingNetLabel: "Select bracket and character",
              averageDurationLabel: "--",
              averageDurationDetail: "Select bracket and character",
              winStreakLabel: "--",
              winStreakDetail: "Select bracket and character",
          }
        : historyStats;

    useEffect(() => {
        const nextId = getDefaultSelectedId(selectedId, filtered);
        if (nextId && nextId !== selectedId) {
            setSelectedId(nextId);
        }
    }, [filtered, selectedId]);

    const selectedMatch =
        filtered.find((match) => match.id === selectedId) ?? filtered[0] ?? null;

    useEffect(() => {
        const ownerName = selectedMatch?.owner.name ?? "";
        updatePersence(rpcUpdate === "" ? "" : `Match lookup: ${ownerName}`);
    }, [rpcUpdate, selectedMatch?.owner.name]);

    useEffect(() => {
        const ownerName = selectedMatch?.owner.name ?? "";
        if (ownerName && ownerName !== rpcUpdate) {
            setRpcUpdate(ownerName);
        }
    }, [selectedMatch?.owner.name, rpcUpdate]);

    const showRouteHeader = view === "list";
    const headerActions = useMemo(
        () => <div className={styles.headerMeta}>Total matches: {matches.length}</div>,
        [matches.length]
    );

    const onSelectMatch = useCallback((match: MatchSummary) => {
        listScrollTop.current = window.scrollY;
        setSelectedId(match.id);
        setView("details");
    }, []);

    const onBackToList = useCallback(() => {
        setView("list");
        requestAnimationFrame(() => {
            window.scrollTo(0, listScrollTop.current);
        });
    }, []);

    useEffect(() => {
        if (view !== "details") return;
        const handler = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onBackToList();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [view, onBackToList]);

    useEffect(() => {
        const handler = () => {
            setView("list");
            requestAnimationFrame(() => {
                window.scrollTo(0, 0);
            });
        };
        window.addEventListener("match-history-reset", handler as EventListener);
        return () => window.removeEventListener("match-history-reset", handler as EventListener);
    }, []);

    return (
        <RouteLayout
            title="Match History"
            actions={showRouteHeader ? headerActions : undefined}
            showHeader={showRouteHeader}
        >
            <div className={styles.page}>
                {view === "list" ? (
                    <div className={`${styles.viewPanel} ${styles.viewList}`}>
                        <section className={styles.historyStatsGrid} aria-label="Match history overview">
                            {needsScopedStats ? (
                                <div
                                    className={styles.historyStatsPrompt}
                                    role="status"
                                    aria-live="polite"
                                >
                                    Select a character and a bracket to unlock these statistics.
                                </div>
                            ) : null}
                            <article className={styles.historyStatCard}>
                                <span
                                    className={`${styles.historyStatIcon} ${styles.historyStatIconGood}`}
                                    aria-hidden="true"
                                >
                                    <LuPercent />
                                </span>
                                <div className={styles.historyStatContent}>
                                    <span className={styles.historyStatLabel}>Win Rate</span>
                                    <span className={styles.historyStatValue}>
                                        {displayedHistoryStats.winRateLabel}
                                    </span>
                                    <span className={styles.historyStatDetail}>
                                        {displayedHistoryStats.winBreakdownLabel}
                                    </span>
                                </div>
                            </article>

                            <article className={styles.historyStatCard}>
                                <span
                                    className={`${styles.historyStatIcon} ${styles.historyStatIconInfo}`}
                                    aria-hidden="true"
                                >
                                    <LuTrendingUp />
                                </span>
                                <div className={styles.historyStatContent}>
                                    <span className={styles.historyStatLabel}>Current Rating</span>
                                    <span className={styles.historyStatValue}>
                                        {displayedHistoryStats.currentRatingLabel}
                                    </span>
                                    <span className={styles.historyStatDetail}>
                                        {displayedHistoryStats.ratingNetLabel}
                                    </span>
                                </div>
                            </article>

                            <article className={styles.historyStatCard}>
                                <span
                                    className={`${styles.historyStatIcon} ${styles.historyStatIconAccent}`}
                                    aria-hidden="true"
                                >
                                    <LuClock3 />
                                </span>
                                <div className={styles.historyStatContent}>
                                    <span className={styles.historyStatLabel}>Avg Duration</span>
                                    <span className={styles.historyStatValue}>
                                        {displayedHistoryStats.averageDurationLabel}
                                    </span>
                                    <span className={styles.historyStatDetail}>
                                        {displayedHistoryStats.averageDurationDetail}
                                    </span>
                                </div>
                            </article>

                            <article className={styles.historyStatCard}>
                                <span
                                    className={`${styles.historyStatIcon} ${styles.historyStatIconWarn}`}
                                    aria-hidden="true"
                                >
                                    <LuFlame />
                                </span>
                                <div className={styles.historyStatContent}>
                                    <span className={styles.historyStatLabel}>Win Streak</span>
                                    <span className={styles.historyStatValue}>
                                        {displayedHistoryStats.winStreakLabel}
                                    </span>
                                    <span className={styles.historyStatDetail}>
                                        {displayedHistoryStats.winStreakDetail}
                                    </span>
                                </div>
                            </article>
                        </section>

                        <FiltersBar
                            filters={filters}
                            onChange={setFilters}
                            modeOptions={modeOptions}
                            characterOptions={characterOptions}
                        />

                        <MatchHistoryList
                            matches={filtered}
                            selectedId={selectedId}
                            isLoading={isLoading}
                            onSelect={onSelectMatch}
                        />
                    </div>
                ) : (
                    <div className={`${styles.viewPanel} ${styles.viewDetails}`}>
                        <MatchDetailsPanel
                            match={selectedMatch}
                            isLoading={isLoading}
                            onBack={onBackToList}
                        />
                    </div>
                )}
            </div>
        </RouteLayout>
    );
}

