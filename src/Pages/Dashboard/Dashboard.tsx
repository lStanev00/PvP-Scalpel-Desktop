import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FaDiscord } from "react-icons/fa6";
import {
    LuBadgeCheck,
    LuClock3,
    LuRadar,
    LuShield,
    LuSwords,
    LuTriangleAlert,
    LuTrendingUp,
} from "react-icons/lu";
import AutoScopeBadge from "../../Components/AutoScopeBadge/AutoScopeBadge";
import useMatches from "../../Hooks/useMatches";
import useCharacterProfile, {
    resolveCharacterProfile,
    resolveCharacterBracketSnapshot,
} from "../../Hooks/useCharacterProfile";
import { usePreferences } from "../../Context-Providers/preferences-context";
import { getRoleBySpec } from "../../Domain/CombatDomainContext";
import RouteLayout from "../../Components/RouteLayout/RouteLayout";
import DashboardMomentumCard from "../../Components/Dashboard/DashboardMomentumCard";
import {
    buildDashboardRatedMovementPoints,
    type DashboardMomentumRecentMatch,
} from "../../Components/Dashboard/dashboardMomentum";
import {
    BRACKET_BATTLEGROUND_BLITZ,
    BRACKET_RATED_ARENA,
    BRACKET_RATED_ARENA_2V2,
    BRACKET_RATED_ARENA_3V3,
    BRACKET_RATED_BATTLEGROUND,
    BRACKET_SOLO_SHUFFLE,
    buildCharacterOptions,
    buildMatchSummary,
    getModeLabel,
    isBattlegroundBracket,
    isRatedBracket,
    matchesBracketScope,
    resolveStoredCharacterValue,
    resolveSummaryScopeId,
    type MatchSummary,
    type MatchScopeMode,
} from "../../Components/DataActivity/utils";
import { openUrl } from "../../Helpers/open";
import styles from "./Dashboard.module.css";

const CHARACTER_API_SERVER = "eu";
const DISCORD_INVITE_URL = "https://discord.com/invite/2h45zpyJdb";

type CombatSnapshot = {
    damage: number;
    healing: number;
    kills: number;
    deaths: number;
    durationLabel: string;
    result: "win" | "loss" | "neutral";
    id: string;
};

type NonRatedAverageMetric = {
    label: string;
    value: string;
    detail: string;
};

type DashboardAutoScopeResolution = {
    filters: { character: string; mode: MatchScopeMode } | null;
    isLimited: boolean;
    limitedReason: string | null;
    referenceMatch: MatchSummary | null;
};

type DashboardMetricCardProps = {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    detail: string;
};

type DashboardScopedCardProps = {
    showDashboardData: boolean;
    isLimited: boolean;
    dashboardAutoScopeMessage: string;
    dashboardFilters: { character: string; mode: MatchScopeMode } | null;
    scopeCardTitle: string;
    scopeCardMetaPrimary: string | null;
    scopeCardMetaSecondary: string | null;
    navigate: ReturnType<typeof useNavigate>;
};

type DashboardSpotlightPanelProps = {
    dashboardLatest: MatchSummary | null;
    isRatedContext: boolean;
    ownerName: string;
    latestCombatStats: CombatSnapshot;
    resultBadgeClass: string;
    verdictInsight: string;
    latestDeltaTone: string;
};

const RATED_SCOPE_IDS = [
    BRACKET_SOLO_SHUFFLE,
    BRACKET_BATTLEGROUND_BLITZ,
    BRACKET_RATED_ARENA_2V2,
    BRACKET_RATED_ARENA_3V3,
    BRACKET_RATED_ARENA,
    BRACKET_RATED_BATTLEGROUND,
];

const formatResultLabel = (result: "win" | "loss" | "neutral") => {
    if (result === "win") return "Victory";
    if (result === "loss") return "Defeat";
    return "Unresolved";
};

const normalizeNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return Number(value);
    }
    return 0;
};

const normalizeCount = (value: unknown) => Math.max(0, Math.trunc(normalizeNumber(value)));

const formatCompactNumber = (value: number) =>
    new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: value >= 100_000 ? 0 : 1,
    }).format(value);

const formatKdRatio = (kills: number, deaths: number) => {
    if (kills <= 0 && deaths <= 0) return "0.00";
    if (deaths <= 0) return kills.toFixed(2);
    return (kills / deaths).toFixed(2);
};

const formatDuration = (seconds: number | null) => {
    if (seconds === null) return "--";
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const resolveOwnerPlayer = (match: MatchSummary | null) => {
    if (!match) return null;
    return match.raw.players?.find((player) => player.isOwner === true) ?? match.raw.players?.[0] ?? null;
};

const resolveOwnerCombatStats = (match: MatchSummary | null): CombatSnapshot => {
    if (!match) {
        return {
            damage: 0,
            healing: 0,
            kills: 0,
            deaths: 0,
            durationLabel: "--",
            result: "neutral",
            id: "",
        };
    }

    const owner = resolveOwnerPlayer(match);
    const ownerWithFallbacks = owner as
        | (typeof owner & {
              damageDone?: unknown;
              healingDone?: unknown;
              killingBlows?: unknown;
          })
        | null;

    return {
        damage: normalizeCount(owner?.damage ?? ownerWithFallbacks?.damageDone),
        healing: normalizeCount(owner?.healing ?? ownerWithFallbacks?.healingDone),
        kills: normalizeCount(owner?.kills ?? ownerWithFallbacks?.killingBlows),
        deaths: normalizeCount(owner?.deaths),
        durationLabel: match.durationLabel,
        result: match.result,
        id: match.id,
    };
};

const resolveScopedNonRatedAverageMetric = (
    matches: MatchSummary[],
    bracketId: MatchSummary["bracketId"] | null,
    ownerSpec?: string,
): NonRatedAverageMetric | null => {
    if (!matches.length || bracketId === null) return null;

    if (isBattlegroundBracket(bracketId)) {
        const kdRatios = matches.map((match) => {
            const stats = resolveOwnerCombatStats(match);
            if (stats.kills <= 0 && stats.deaths <= 0) return 0;
            return stats.deaths <= 0 ? stats.kills : stats.kills / stats.deaths;
        });

        const averageKd = kdRatios.reduce((sum, value) => sum + value, 0) / kdRatios.length;

        return {
            label: "Avg K/D ratio",
            value: averageKd.toFixed(2),
            detail: `Across last ${matches.length} ${getModeLabel(bracketId)} matches`,
        };
    }

    const role = getRoleBySpec(ownerSpec);
    const useHealing = role === "healer";
    const contributionSamples = matches.map((match) => {
        const owner = resolveOwnerPlayer(match);

        if (!owner || typeof owner.faction !== "number") return 0;

        const teamPlayers =
            match.raw.players?.filter((player) => player.faction === owner.faction) ?? [];

        if (!teamPlayers.length) return 0;

        const ownerFallback = owner as typeof owner & {
            damageDone?: unknown;
            healingDone?: unknown;
        };

        const ownerAmount = normalizeCount(
            useHealing ? owner.healing ?? ownerFallback.healingDone : owner.damage ?? ownerFallback.damageDone,
        );

        const teamAmount = teamPlayers.reduce((sum, player) => {
            const playerFallback = player as typeof player & {
                damageDone?: unknown;
                healingDone?: unknown;
            };

            return (
                sum +
                normalizeCount(
                    useHealing
                        ? player.healing ?? playerFallback.healingDone
                        : player.damage ?? playerFallback.damageDone,
                )
            );
        }, 0);

        if (teamAmount <= 0) return 0;

        return (ownerAmount / teamAmount) * 100;
    });

    const averageContribution =
        contributionSamples.reduce((sum, value) => sum + value, 0) / contributionSamples.length;

    return {
        label: useHealing ? "Avg heal share" : "Avg dmg share",
        value: `${Math.round(averageContribution)}%`,
        detail: `Across last ${matches.length} ${getModeLabel(bracketId)} matches`,
    };
};

const resolveCurrentRating = (
    summaries: MatchSummary[],
    apiBracketSnapshot?: { rating?: number | null } | null,
) => {
    for (const match of summaries) {
        const owner = resolveOwnerPlayer(match);
        if (typeof owner?.rating === "number" && Number.isFinite(owner.rating)) {
            return owner.rating;
        }
    }

    return apiBracketSnapshot?.rating ?? null;
};

const resolveLatestDeltaTone = (latestDelta: number | null) => {
    if (latestDelta === null) return styles.metricNeutral;
    if (latestDelta > 0) return styles.metricGood;
    if (latestDelta < 0) return styles.metricBad;
    return styles.metricNeutral;
};

const resolveVerdictInsight = (
    dashboardLatest: MatchSummary | null,
    latestDelta: number | null,
) => {
    if (!dashboardLatest) return "Waiting for the first captured match.";

    if (latestDelta !== null) {
        if (latestDelta > 0) return "Positive rating swing captured in the latest match.";
        if (latestDelta < 0) return "Rating slipped in the latest capture.";
        return "No rating movement recorded for this capture.";
    }

    if (dashboardLatest.result === "win") {
        return "Win captured. Local telemetry has no rating delta for this mode.";
    }

    if (dashboardLatest.result === "loss") {
        return "Loss captured. Local telemetry has no rating delta for this mode.";
    }

    return "Capture recorded. Awaiting a decisive outcome.";
};

const resolveDashboardAutoScopeMessage = ({
    autoScopeResolution,
    latestScopeId,
    dashboardLatest,
    latest,
    currentBracketLabel,
}: {
    autoScopeResolution: DashboardAutoScopeResolution;
    latestScopeId: MatchScopeMode | null;
    dashboardLatest: MatchSummary | null;
    latest: MatchSummary | null;
    currentBracketLabel: string;
}) => {
    if (autoScopeResolution.isLimited) {
        return `${autoScopeResolution.limitedReason} Scoped bracket: ${
            latestScopeId !== null ? getModeLabel(latestScopeId) : "Unknown"
        }.`;
    }

    if (dashboardLatest) {
        return `Auto scope selected: ${currentBracketLabel}. Latest entry is ${dashboardLatest.mapName}. Click to inspect scoped history.`;
    }

    if (latest) {
        return "Auto scope is configured, but there are no entries in the current scope.";
    }

    return "Auto scope becomes available after the first captured match.";
};

const resolveAutoScope = ({
    summaries,
    latest,
    autoScopeRatedPreference,
    autoScopeStrategy,
    autoScopeBracket,
    collapseRandomBattlegrounds,
    resolvedAutoScopeCharacter,
}: {
    summaries: MatchSummary[];
    latest: MatchSummary | null;
    autoScopeRatedPreference: string;
    autoScopeStrategy: string;
    autoScopeBracket: MatchScopeMode | "auto";
    collapseRandomBattlegrounds: boolean;
    resolvedAutoScopeCharacter: string | "auto" | null;
}): DashboardAutoScopeResolution => {
    if (!summaries.length) {
        return {
            filters: null,
            isLimited: false,
            limitedReason: null,
            referenceMatch: null,
        };
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
                match: preferred,
                isLimited: !preferred,
                limitedReason: preferred ? null : limitedReason,
            };
        }

        if (autoScopeRatedPreference === "prefer_non_rated") {
            const preferred =
                candidates.find(
                    (match) => !isRatedBracket(match.bracketId) && match.bracketId !== 0,
                ) ?? null;

            return {
                match: preferred,
                isLimited: !preferred,
                limitedReason: preferred ? null : limitedReason,
            };
        }

        return {
            match: candidates[0],
            isLimited: false,
            limitedReason: null as string | null,
        };
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
            referenceMatch: result.match ?? latest,
        };
    }

    const resolvedCharacter =
        resolvedAutoScopeCharacter !== "auto"
            ? resolvedAutoScopeCharacter
            : latest?.owner.key ?? null;

    if (!resolvedCharacter) {
        return {
            filters: null,
            isLimited: false,
            limitedReason: null,
            referenceMatch: latest,
        };
    }

    const characterMatches = summaries.filter((summary) => summary.owner.key === resolvedCharacter);
    const referenceMatch = characterMatches[0] ?? latest;

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
            referenceMatch,
        };
    }

    if (autoScopeBracket === "auto") {
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
            referenceMatch,
        };
    }

    return {
        filters: { character: resolvedCharacter, mode: autoScopeBracket },
        isLimited: false,
        limitedReason: null,
        referenceMatch,
    };
};

function DashboardMetricCard({ icon, label, value, detail }: DashboardMetricCardProps) {
    return (
        <article className={styles.metricCard}>
            <div className={styles.metricIcon}>{icon}</div>
            <div>
                <div className={styles.metricLabel}>{label}</div>
                <div className={styles.metricValue}>{value}</div>
                <div className={styles.metricDetail}>{detail}</div>
            </div>
        </article>
    );
}

function DashboardDevWarning() {
    return (
        <section className={styles.devWarning} aria-label="Dashboard warning">
            <span className={styles.devWarningIcon} aria-hidden="true">
                <LuTriangleAlert />
            </span>

            <div className={styles.devWarningBody}>
                <span className={styles.devWarningText}>
                    This whole dashboard module is still testing, unfinished, and under active
                    development. Report bugs or anything suspicious in Discord.
                </span>

                <button
                    className={styles.devWarningAction}
                    type="button"
                    onClick={() => {
                        void openUrl(DISCORD_INVITE_URL);
                    }}
                >
                    <FaDiscord aria-hidden="true" />
                    <span>Report on Discord</span>
                </button>
            </div>
        </section>
    );
}

function DashboardScopedCard({
    showDashboardData,
    isLimited,
    dashboardAutoScopeMessage,
    dashboardFilters,
    scopeCardTitle,
    scopeCardMetaPrimary,
    scopeCardMetaSecondary,
    navigate,
}: DashboardScopedCardProps) {
    return (
        <article
            className={`${styles.signalCard} ${
                isLimited
                    ? styles.signalCardLimited
                    : showDashboardData
                      ? styles.signalCardActive
                      : styles.signalCardInactive
            }`}
        >
            <div className={styles.signalTop}>
                <span className={styles.signalLabel}>Scoped now</span>

                <AutoScopeBadge
                    message={dashboardAutoScopeMessage}
                    active={showDashboardData}
                    limited={isLimited}
                    variant="dashboard"
                    onClick={
                        dashboardFilters
                            ? () =>
                                  navigate("/data", {
                                      state: {
                                          scopedFilters: {
                                              character: dashboardFilters.character,
                                              mode: dashboardFilters.mode,
                                              query: "",
                                          },
                                      },
                                  })
                            : undefined
                    }
                    onContextMenu={(event) => {
                        event.preventDefault();
                        navigate("/settings", {
                            state: { highlightAutoScope: true },
                        });
                    }}
                />
            </div>

            <div className={styles.signalValue}>{scopeCardTitle}</div>

            <div className={styles.signalMeta}>
                <span>{scopeCardMetaPrimary}</span>
                <span>{scopeCardMetaSecondary}</span>
            </div>
        </article>
    );
}

function DashboardSpotlightPanel({
    dashboardLatest,
    isRatedContext,
    ownerName,
    latestCombatStats,
    resultBadgeClass,
    verdictInsight,
    latestDeltaTone,
}: DashboardSpotlightPanelProps) {
    return (
        <article className={styles.panel}>
            <div className={styles.panelHeader}>
                <div>
                    <div className={styles.panelEyebrow}>Spotlight</div>
                    <h3 className={styles.panelTitle}>
                        {isRatedContext ? "Latest captured match" : "Latest battleground snapshot"}
                    </h3>
                </div>

                {dashboardLatest ? (
                    <span className={styles.panelTag}>{dashboardLatest.modeLabel}</span>
                ) : null}
            </div>

            {dashboardLatest ? (
                <>
                    <div className={styles.spotlightMetaRow}>
                        <span className={`${styles.resultBadge} ${resultBadgeClass}`}>
                            {formatResultLabel(dashboardLatest.result)}
                        </span>
                        <span className={styles.spotlightMetaText}>{ownerName}</span>
                        <span className={styles.spotlightMetaDivider} aria-hidden="true">
                            ·
                        </span>
                        <span className={styles.spotlightMetaText}>
                            {dashboardLatest.durationLabel}
                        </span>
                        <span className={styles.spotlightMetaDivider} aria-hidden="true">
                            ·
                        </span>
                        <span className={styles.spotlightMetaText}>
                            {isRatedContext
                                ? dashboardLatest.modeLabel
                                : `${formatKdRatio(
                                      latestCombatStats.kills,
                                      latestCombatStats.deaths,
                                  )} K/D`}
                        </span>
                    </div>

                    <div className={styles.spotlightGrid}>
                        <div className={styles.spotlightCard}>
                            <span className={styles.spotlightLabel}>Map</span>
                            <span className={styles.spotlightValue}>{dashboardLatest.mapName}</span>
                        </div>

                        {isRatedContext ? (
                            <>
                                <div className={styles.spotlightCard}>
                                    <span className={styles.spotlightLabel}>Verdict</span>
                                    <span className={styles.spotlightValue}>{verdictInsight}</span>
                                </div>

                                <div className={styles.spotlightCard}>
                                    <span className={styles.spotlightLabel}>MMR delta</span>
                                    <span className={`${styles.spotlightValue} ${latestDeltaTone}`}>
                                        {dashboardLatest.deltaLabel}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={styles.spotlightCard}>
                                    <span className={styles.spotlightLabel}>Output</span>
                                    <span className={styles.spotlightValue}>
                                        {formatCompactNumber(latestCombatStats.damage)} dmg /{" "}
                                        {formatCompactNumber(latestCombatStats.healing)} heal
                                    </span>
                                </div>

                                <div className={styles.spotlightCard}>
                                    <span className={styles.spotlightLabel}>K/D Ratio</span>
                                    <span className={styles.spotlightValue}>
                                        {formatKdRatio(
                                            latestCombatStats.kills,
                                            latestCombatStats.deaths,
                                        )}
                                    </span>
                                </div>
                            </>
                        )}

                        <div className={styles.spotlightCard}>
                            <span className={styles.spotlightLabel}>Captured</span>
                            <span className={styles.spotlightValue}>
                                {dashboardLatest.timestampLabel}
                            </span>
                        </div>
                    </div>
                </>
            ) : (
                <div className={styles.emptyPanel}>
                    <div className={styles.emptyTitle}>No matches recorded yet</div>
                    <p className={styles.emptyCopy}>
                        Start queueing, and this space will turn into a match spotlight with map,
                        result, rating swing, and jump-off points into history.
                    </p>
                </div>
            )}
        </article>
    );
}

export default function Dashboard() {
    const matches = useMatches();
    const navigate = useNavigate();

    const {
        autoScopeStrategy,
        autoScopeCharacter,
        autoScopeBracket,
        autoScopeRatedPreference,
        collapseRandomBattlegrounds,
    } = usePreferences();

    const summaries = useMemo(
        () =>
            matches
                .map(buildMatchSummary)
                .sort((a, b) => b.timestampMs - a.timestampMs),
        [matches],
    );

    const characterOptions = useMemo(() => buildCharacterOptions(summaries), [summaries]);

    const resolvedAutoScopeCharacter = useMemo(
        () => resolveStoredCharacterValue(autoScopeCharacter, characterOptions),
        [autoScopeCharacter, characterOptions],
    );

    const latest = summaries[0] ?? null;

    const autoScopeResolution = useMemo(
        () =>
            resolveAutoScope({
                summaries,
                latest,
                autoScopeRatedPreference,
                autoScopeStrategy,
                autoScopeBracket,
                collapseRandomBattlegrounds,
                resolvedAutoScopeCharacter,
            }),
        [
            summaries,
            latest,
            autoScopeRatedPreference,
            autoScopeStrategy,
            autoScopeBracket,
            collapseRandomBattlegrounds,
            resolvedAutoScopeCharacter,
        ],
    );

    const dashboardFilters = autoScopeResolution.filters;

    const dashboardSummaries = useMemo(() => {
        if (!dashboardFilters) return [];

        return summaries.filter(
            (match) =>
                match.owner.key === dashboardFilters.character &&
                matchesBracketScope(
                    match.bracketId,
                    dashboardFilters.mode,
                    collapseRandomBattlegrounds,
                ),
        );
    }, [dashboardFilters, summaries, collapseRandomBattlegrounds]);

    const dashboardLatest = dashboardSummaries[0] ?? null;
    const heroMatch = dashboardLatest ?? autoScopeResolution.referenceMatch ?? latest;
    const latestOwner = useMemo(() => resolveOwnerPlayer(heroMatch), [heroMatch]);
    const latestOwnerRealm = latestOwner?.realm ?? null;

    const profiles = useCharacterProfile({
        server: heroMatch ? CHARACTER_API_SERVER : null,
        realm: latestOwnerRealm,
        name: heroMatch?.owner.name ?? null,
    });

    const profile = useMemo(
        () =>
            resolveCharacterProfile(profiles, {
                server: heroMatch ? CHARACTER_API_SERVER : null,
                realm: latestOwnerRealm,
                name: heroMatch?.owner.name ?? null,
            }),
        [heroMatch, latestOwnerRealm, profiles],
    );

    const resolvedMatches = dashboardSummaries.filter((match) => match.result !== "neutral");
    const recentWindow = resolvedMatches.slice(0, 6);
    const recentScopedSummaries = dashboardSummaries.slice(0, 6);
    const winCount = recentWindow.filter((match) => match.result === "win").length;
    const lossCount = recentWindow.filter((match) => match.result === "loss").length;
    const recentWinRate =
        recentWindow.length > 0 ? Math.round((winCount / recentWindow.length) * 100) : null;

    const recentDurationSamples = recentScopedSummaries
        .map((match) => match.durationSeconds)
        .filter((value): value is number => typeof value === "number" && value > 0);

    const averageDuration =
        recentDurationSamples.length > 0
            ? Math.round(
                  recentDurationSamples.reduce((sum, value) => sum + value, 0) /
                      recentDurationSamples.length,
              )
            : null;

    const apiBracketSnapshot = resolveCharacterBracketSnapshot(profiles, dashboardLatest ?? latest);

    const currentRating = useMemo(
        () => resolveCurrentRating(dashboardSummaries, apiBracketSnapshot),
        [dashboardSummaries, apiBracketSnapshot],
    );

    const latestCombatStats = useMemo(() => resolveOwnerCombatStats(dashboardLatest), [dashboardLatest]);

    const ratedMovementPoints = useMemo(
        () => buildDashboardRatedMovementPoints(dashboardSummaries),
        [dashboardSummaries],
    );
    const recentMomentumMatches = useMemo<DashboardMomentumRecentMatch[]>(
        () =>
            recentScopedSummaries.map((match) => ({
                id: match.id,
                mapName: match.mapName,
                result: match.result,
            })),
        [recentScopedSummaries],
    );

    const ownerName = heroMatch?.owner.name ?? "Your character";
    const latestScopeId = dashboardFilters?.mode ?? null;

    const isRatedContext =
        latestScopeId !== null
            ? RATED_SCOPE_IDS.includes(latestScopeId)
            : dashboardLatest
              ? isRatedBracket(dashboardLatest.bracketId)
              : false;

    const ownerSpec = profile?.activeSpec?.name ?? heroMatch?.owner.spec ?? "Spec pending";
    const ownerClass = profile?.class?.name ?? heroMatch?.owner.class ?? "Class pending";

    const currentBracketLabel =
        latestScopeId !== null ? getModeLabel(latestScopeId) : heroMatch?.modeLabel ?? "Current bracket";

    const ownerRealmLabel =
        profile?.playerRealm?.name ??
        latestOwnerRealm
            ?.split("-")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ") ??
        "Realm pending";

    const ownerGuild = profile?.guildName ?? null;

    const nonRatedAverageMetric = useMemo(
        () =>
            !isRatedContext && dashboardLatest
                ? resolveScopedNonRatedAverageMetric(
                      recentScopedSummaries,
                      dashboardLatest.bracketId,
                      profile?.activeSpec?.name ?? dashboardLatest.owner.spec,
                  )
                : null,
        [isRatedContext, dashboardLatest, profile?.activeSpec?.name, recentScopedSummaries],
    );

    const latestDelta = dashboardLatest?.delta ?? null;
    const latestDeltaTone = resolveLatestDeltaTone(latestDelta);
    const verdictInsight = resolveVerdictInsight(dashboardLatest, latestDelta);

    const heroStyle = profile?.media?.banner
        ? {
              backgroundImage: `linear-gradient(135deg, rgba(8, 14, 24, 0.96), rgba(5, 10, 18, 0.9)), radial-gradient(circle at 0% 0%, rgba(58, 167, 255, 0.12), transparent 38%), url("${profile.media.banner}")`,
              backgroundSize: "auto, auto, cover",
              backgroundPosition: "0 0, 0 0, center",
          }
        : undefined;

    const showRatingMetric = isRatedContext && currentRating !== null && currentRating > 0;

    const metricFourLabel = showRatingMetric
        ? "Current Rating"
        : nonRatedAverageMetric?.label ?? "Active spec";

    const metricFourValue = showRatingMetric
        ? String(Math.round(currentRating))
        : nonRatedAverageMetric?.value ?? ownerSpec;

    const metricFourDetail = showRatingMetric
        ? dashboardLatest
            ? `${ownerName} in ${currentBracketLabel}`
            : "Rating attaches once match data is available"
        : nonRatedAverageMetric?.detail ?? `${ownerClass} in ${currentBracketLabel}`;

    const metricFourIcon = showRatingMetric ? (
        <LuSwords aria-hidden="true" />
    ) : (
        <LuShield aria-hidden="true" />
    );

    const resultBadgeClass =
        dashboardLatest?.result === "win"
            ? styles.resultGood
            : dashboardLatest?.result === "loss"
              ? styles.resultBad
              : styles.resultNeutral;

    const dashboardAutoScopeMessage = resolveDashboardAutoScopeMessage({
        autoScopeResolution,
        latestScopeId,
        dashboardLatest,
        latest,
        currentBracketLabel,
    });

    const scopeCardTitle = autoScopeResolution.isLimited
        ? "No entries in current scope"
        : dashboardLatest
          ? currentBracketLabel
          : latest
            ? "No entries in current scope"
            : "Waiting for first match";

    const scopeCardMetaPrimary = autoScopeResolution.isLimited
        ? autoScopeResolution.limitedReason
        : dashboardLatest?.mapName ?? "Auto scope becomes available after the first captured match.";

    const scopeCardMetaSecondary = autoScopeResolution.isLimited
        ? `Scoped bracket: ${latestScopeId !== null ? getModeLabel(latestScopeId) : "Unknown"}`
        : dashboardLatest?.timestampLabel ?? "No capture time";

    const showDashboardData = dashboardSummaries.length > 0;
    const openScopedMatch = (matchId: string) => {
        navigate("/data", {
            state: {
                scopedFilters: dashboardFilters
                    ? {
                          character: dashboardFilters.character,
                          mode: dashboardFilters.mode,
                          query: "",
                      }
                    : undefined,
                selectedMatchId: matchId,
                openDetails: true,
            },
        });
    };

    return (
        <RouteLayout
            title="Command Center"
            description="A sharper starting point for your desktop sessions, match review, and next actions."
            showHeader={false}
        >
            <div className={styles.dashboardSurface}>
                <section className={styles.hero} style={heroStyle}>
                    <div className={styles.heroCopy}>
                        <div className={styles.heroIdentity}>
                            <div className={styles.identityVisual}>
                                {profile?.media?.avatar ? (
                                    <img
                                        className={styles.identityAvatar}
                                        src={profile.media.avatar}
                                        alt={`${ownerName} avatar`}
                                    />
                                ) : (
                                    <div className={styles.identityFallback}>
                                        {ownerName.charAt(0)}
                                    </div>
                                )}

                                <div className={styles.identityText}>
                                    <div className={styles.identityPrimary}>{ownerName}</div>

                                    <div className={styles.identityMeta}>
                                        <span>{ownerSpec}</span>
                                        <span>{ownerClass}</span>
                                        <span>{ownerRealmLabel}</span>
                                        <span>
                                            {heroMatch?.timestampLabel ?? "Awaiting first session"}
                                        </span>
                                    </div>

                                    {ownerGuild ? (
                                        <div className={styles.identityGuild}>
                                            <LuBadgeCheck aria-hidden="true" />
                                            <span>{ownerGuild}</span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.heroRail}>
                        <DashboardScopedCard
                            showDashboardData={showDashboardData}
                            isLimited={autoScopeResolution.isLimited}
                            dashboardAutoScopeMessage={dashboardAutoScopeMessage}
                            dashboardFilters={dashboardFilters}
                            scopeCardTitle={scopeCardTitle}
                            scopeCardMetaPrimary={scopeCardMetaPrimary}
                            scopeCardMetaSecondary={scopeCardMetaSecondary}
                            navigate={navigate}
                        />
                    </div>
                </section>

                <DashboardDevWarning />

                {showDashboardData ? (
                    <section className={styles.metricsGrid}>
                        <DashboardMetricCard
                            icon={<LuRadar aria-hidden="true" />}
                            label="Matches tracked"
                            value={dashboardSummaries.length}
                            detail={
                                dashboardLatest
                                    ? `${ownerName} in ${currentBracketLabel}`
                                    : "Across current desktop history"
                            }
                        />

                        <DashboardMetricCard
                            icon={<LuTrendingUp aria-hidden="true" />}
                            label="Recent win rate"
                            value={recentWinRate === null ? "--" : `${recentWinRate}%`}
                            detail={
                                recentWindow.length > 0
                                    ? `${winCount}W - ${lossCount}L in last ${recentWindow.length}`
                                    : "Need resolved matches"
                            }
                        />

                        <DashboardMetricCard
                            icon={<LuClock3 aria-hidden="true" />}
                            label="Average duration"
                            value={formatDuration(averageDuration)}
                            detail={
                                recentDurationSamples.length > 0
                                    ? `From last ${recentDurationSamples.length} ${currentBracketLabel} captures`
                                    : "No duration samples"
                            }
                        />

                        <DashboardMetricCard
                            icon={metricFourIcon}
                            label={metricFourLabel}
                            value={metricFourValue}
                            detail={metricFourDetail}
                        />
                    </section>
                ) : null}

                {showDashboardData ? (
                    <section className={styles.contentGrid}>
                        <DashboardSpotlightPanel
                            dashboardLatest={dashboardLatest}
                            isRatedContext={isRatedContext}
                            ownerName={ownerName}
                            latestCombatStats={latestCombatStats}
                            resultBadgeClass={resultBadgeClass}
                            verdictInsight={verdictInsight}
                            latestDeltaTone={latestDeltaTone}
                        />

                        <DashboardMomentumCard
                            isRatedContext={isRatedContext}
                            ratedPoints={ratedMovementPoints}
                            recentMatches={recentMomentumMatches}
                            scopeLabel={currentBracketLabel}
                            onOpenMatch={openScopedMatch}
                        />
                    </section>
                ) : null}
            </div>
        </RouteLayout>
    );
}
