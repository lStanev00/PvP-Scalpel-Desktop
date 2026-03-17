import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuClock3, LuFlame, LuPercent, LuTrendingUp } from "react-icons/lu";
import { useLocation, useNavigate } from "react-router-dom";
import { resolveCachedCharacterProfile } from "../../Hooks/useCharacterProfile";
import useMatches from "../../Hooks/useMatches";
import updatePersence from "../../Helpers/updatePresence";
import { usePreferences } from "../../Context-Providers/preferences-context";
import RouteLayout from "../RouteLayout/RouteLayout";
import FiltersBar from "./FiltersBar";
import MatchHistoryList from "./MatchHistoryList";
import MatchDetailsPanel from "./MatchDetailsPanel";
import {
    BRACKET_UNKNOWN,
    buildCharacterOptions,
    buildScopeOptions,
    buildMatchSummary,
    filterMatches,
    getDefaultSelectedId,
    getModeLabel,
    isRatedBracket,
    resolveStoredCharacterValue,
    type MatchFilters,
    type MatchScopeMode,
    type MatchSummary,
    resolveSummaryScopeId,
} from "./utils";
import styles from "./DataActivity.module.css";

const CHARACTER_API_SERVER = "eu";

type DataActivityLocationState = {
    scopedFilters?: {
        mode?: MatchScopeMode | "all";
        character?: string | "all";
        query?: string;
    };
    selectedMatchId?: string;
    openDetails?: boolean;
};

const canHandleDetailsBackNavigation = (eventTarget: EventTarget | null) => {
    if (!document.hasFocus()) return false;
    if (!(eventTarget instanceof HTMLElement)) return true;

    const tagName = eventTarget.tagName.toLowerCase();
    if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        eventTarget.isContentEditable
    ) {
        return false;
    }

    if (eventTarget.closest("[contenteditable='true']")) {
        return false;
    }

    return true;
};

const formatDurationLabel = (seconds: number) => {
    const total = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(total / 60);
    const remainingSeconds = total % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

export default function DataActivity() {
    const location = useLocation();
    const navigate = useNavigate();
    const matches = useMatches();
    const {
        autoScopeStrategy,
        autoScopeCharacter,
        setAutoScopeCharacter,
        autoScopeBracket,
        autoScopeRatedPreference,
        collapseRandomBattlegrounds,
    } = usePreferences();
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
    const hasInitializedScopedFilters = useRef(false);
    const handledRouteSelectionKey = useRef<string | null>(null);

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
        const options = buildScopeOptions(summaries, collapseRandomBattlegrounds);
        return [{ label: "All Modes", value: "all" as const }, ...options];
    }, [summaries, collapseRandomBattlegrounds]);

    const characterOptions = useMemo(() => {
        const options = buildCharacterOptions(summaries).map((option) => {
            const profile = resolveCachedCharacterProfile({
                server: CHARACTER_API_SERVER,
                realm: option.realm ?? null,
                name: option.name ?? null,
            });
            return {
                ...option,
                label:
                    option.name && profile?.playerRealm?.name
                        ? `${option.name} - ${profile.playerRealm.name}`
                        : option.label,
                avatarUrl: profile?.media?.avatar ?? profile?.media?.charImg ?? null,
            };
        });

        return [
            { label: "All Characters", value: "all" as const },
            ...options,
        ];
    }, [summaries]);
    const characterLabelByValue = useMemo(
        () => new Map(characterOptions.map((option) => [option.value, option.label] as const)),
        [characterOptions]
    );

    const resolvedAutoScopeCharacter = useMemo(
        () => resolveStoredCharacterValue(autoScopeCharacter, characterOptions),
        [autoScopeCharacter, characterOptions]
    );

    useEffect(() => {
        if (resolvedAutoScopeCharacter === autoScopeCharacter) return;
        if (resolvedAutoScopeCharacter === "all") {
            setAutoScopeCharacter("auto");
            return;
        }
        setAutoScopeCharacter(resolvedAutoScopeCharacter);
    }, [resolvedAutoScopeCharacter, autoScopeCharacter, setAutoScopeCharacter]);

    const latestSummary = summaries[0] ?? null;
    const autoScopeResolution = useMemo(() => {
        if (!summaries.length) {
            return { filters: null, isLimited: false, limitedReason: null as string | null };
        }

        const limitedReason =
            autoScopeRatedPreference === "prefer_rated"
                ? "No rated matches fit the current auto-scope rules."
                : autoScopeRatedPreference === "prefer_non_rated"
                  ? "No non-rated matches fit the current auto-scope rules."
                  : null;

        const pickPreferredMatch = (candidates: MatchSummary[]) => {
            if (!candidates.length) {
                return { match: null, isLimited: false, limitedReason: null as string | null };
            }

            if (autoScopeRatedPreference === "prefer_rated") {
                const preferred = candidates.find((match) => isRatedBracket(match.bracketId)) ?? null;
                return {
                    match: preferred ?? candidates[0],
                    isLimited: !preferred,
                    limitedReason: preferred ? null : limitedReason,
                };
            }

            if (autoScopeRatedPreference === "prefer_non_rated") {
                const preferred =
                    candidates.find(
                        (match) =>
                            !isRatedBracket(match.bracketId) &&
                            match.bracketId !== BRACKET_UNKNOWN
                    ) ?? null;
                return {
                    match: preferred ?? candidates[0],
                    isLimited: !preferred,
                    limitedReason: preferred ? null : limitedReason,
                };
            }

            return { match: candidates[0], isLimited: false, limitedReason: null as string | null };
        };

        if (autoScopeStrategy === "latest_character_latest_bracket") {
            const result = pickPreferredMatch(summaries);
            return {
                filters: result.match
                    ? {
                          character: result.match.owner.key,
                          mode: resolveSummaryScopeId(result.match, collapseRandomBattlegrounds),
                      }
                    : null,
                isLimited: result.isLimited,
                limitedReason: result.limitedReason,
            };
        }

        const resolvedCharacter =
            resolvedAutoScopeCharacter !== "auto"
                ? resolvedAutoScopeCharacter
                : latestSummary?.owner.key ?? null;
        if (!resolvedCharacter) {
            return { filters: null, isLimited: false, limitedReason: null as string | null };
        }

        const characterMatches = summaries.filter(
            (summary) => summary.owner.key === resolvedCharacter
        );

        if (autoScopeStrategy === "selected_character_latest_bracket") {
            const result = pickPreferredMatch(characterMatches);
            return {
                filters: result.match
                    ? {
                          character: resolvedCharacter,
                          mode: resolveSummaryScopeId(result.match, collapseRandomBattlegrounds),
                      }
                    : null,
                isLimited: result.isLimited,
                limitedReason: result.limitedReason,
            };
        }

        const resolvedMode: MatchScopeMode | null =
            autoScopeBracket !== "auto"
                ? autoScopeBracket
                : (() => {
                      const preferred = pickPreferredMatch(characterMatches).match ?? latestSummary;
                      return preferred
                          ? resolveSummaryScopeId(preferred, collapseRandomBattlegrounds)
                          : null;
                  })();

        return {
            filters: resolvedMode
                ? { character: resolvedCharacter, mode: resolvedMode }
                : null,
            isLimited: false,
            limitedReason: null as string | null,
        };
    }, [
        summaries,
        latestSummary,
        autoScopeStrategy,
        resolvedAutoScopeCharacter,
        autoScopeBracket,
        autoScopeRatedPreference,
        collapseRandomBattlegrounds,
    ]);
    const latestScopedFilters = autoScopeResolution.filters;

    const applyAutoScope = useCallback(() => {
        if (!latestScopedFilters) return;

        setFilters((prev) => ({
            ...prev,
            mode: latestScopedFilters.mode,
            character: latestScopedFilters.character,
            query: "",
        }));
    }, [latestScopedFilters]);

    const clearAutoScope = useCallback(() => {
        setFilters({
            mode: "all",
            character: "all",
            query: "",
        });
    }, []);

    useEffect(() => {
        if (hasInitializedScopedFilters.current) return;

        const routeState = location.state as DataActivityLocationState | null;
        const routeScopedFilters = routeState?.scopedFilters;
        if (routeScopedFilters) {
            hasInitializedScopedFilters.current = true;
            setFilters((prev) => ({
                ...prev,
                mode: routeScopedFilters.mode ?? "all",
                character: routeScopedFilters.character ?? "all",
                query: routeScopedFilters.query ?? "",
            }));
            return;
        }

        if (!latestScopedFilters) return;

        setFilters((prev) => {
            if (prev.mode !== "all" || prev.character !== "all" || prev.query.trim() !== "") {
                hasInitializedScopedFilters.current = true;
                return prev;
            }

            hasInitializedScopedFilters.current = true;
            return {
                ...prev,
                mode: latestScopedFilters.mode,
                character: latestScopedFilters.character,
            };
        });
    }, [latestScopedFilters, location.state]);

    const routeState = location.state as DataActivityLocationState | null;
    const routeSelectionKey = useMemo(() => {
        if (!routeState?.selectedMatchId) return null;
        return [
            routeState.selectedMatchId,
            routeState.openDetails ? "details" : "list",
            routeState.scopedFilters?.character ?? "all",
            routeState.scopedFilters?.mode ?? "all",
            routeState.scopedFilters?.query ?? "",
        ].join("|");
    }, [routeState]);
    const routeScopedFiltersApplied = useMemo(() => {
        if (!routeState?.scopedFilters) return true;

        return (
            filters.mode === (routeState.scopedFilters.mode ?? "all") &&
            filters.character === (routeState.scopedFilters.character ?? "all") &&
            filters.query === (routeState.scopedFilters.query ?? "")
        );
    }, [filters.character, filters.mode, filters.query, routeState]);

    const isAutoLockedContext =
        !!latestScopedFilters &&
        filters.query.trim() === "" &&
        filters.mode === latestScopedFilters.mode &&
        filters.character === latestScopedFilters.character;
    const latestScopedCharacterLabel = latestScopedFilters
        ? characterLabelByValue.get(latestScopedFilters.character) ??
          latestScopedFilters.character
        : null;
    const autoLockedLabel = latestScopedFilters
        ? isAutoLockedContext
            ? autoScopeResolution.isLimited
                ? `${autoScopeResolution.limitedReason} Click to clear auto scope and show all matches.`
                : "Click to clear auto scope and show all matches."
            : autoScopeResolution.isLimited
              ? `${autoScopeResolution.limitedReason} Click to reapply auto scope for ${latestScopedCharacterLabel} in ${getModeLabel(latestScopedFilters.mode)}.`
              : `Click to reapply auto scope for ${latestScopedCharacterLabel} in ${getModeLabel(latestScopedFilters.mode)}.`
        : null;

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
    const filtered = useMemo(
        () => filterMatches(summaries, filters, collapseRandomBattlegrounds),
        [summaries, filters, collapseRandomBattlegrounds]
    );
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
        if (!routeState?.selectedMatchId || !routeSelectionKey) return;
        if (!routeScopedFiltersApplied) return;
        if (handledRouteSelectionKey.current === routeSelectionKey) return;

        const routeSelectedMatch = filtered.find((match) => match.id === routeState.selectedMatchId);
        if (!routeSelectedMatch) return;

        handledRouteSelectionKey.current = routeSelectionKey;
        setSelectedId(routeSelectedMatch.id);
        if (routeState.openDetails) {
            setView("details");
        }
    }, [filtered, routeScopedFiltersApplied, routeSelectionKey, routeState]);

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
                return;
            }

            if (event.key === "Backspace" && canHandleDetailsBackNavigation(event.target)) {
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
            showHeader={false}
        >
            <div className={styles.page}>
                {view === "list" ? (
                    <div className={`${styles.viewPanel} ${styles.viewList}`}>
                        <section className={styles.historyStatsGrid} aria-label="Match history overview">
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
                            filteredCount={filtered.length}
                            infoMessage={autoLockedLabel}
                            autoScopeActive={isAutoLockedContext}
                            autoScopeLimited={autoScopeResolution.isLimited}
                            onApplyAutoScope={
                                latestScopedFilters
                                    ? isAutoLockedContext
                                        ? clearAutoScope
                                        : applyAutoScope
                                    : undefined
                            }
                            onOpenAutoScopeSettings={() =>
                                navigate("/settings", {
                                    state: { highlightAutoScope: true },
                                })
                            }
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
