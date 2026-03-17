import {
    BRACKET_ARENA_SKIRMISH,
    BRACKET_BATTLEGROUND_BLITZ,
    BRACKET_BRAWL,
    BRACKET_RANDOM_BATTLEGROUND_GROUP,
    BRACKET_RATED_ARENA,
    BRACKET_RATED_ARENA_2V2,
    BRACKET_RATED_ARENA_3V3,
    BRACKET_RATED_BATTLEGROUND,
    BRACKET_SOLO_SHUFFLE,
    BRACKET_UNKNOWN,
    buildVisibleBracketScopeIds,
    collapseBracketId,
    getBracketLabel,
    getBracketLabelForFormat,
    isBattlegroundBracket,
    isRatedBracket,
    matchesBracketScope,
    parseBracketScopeId,
    parseBracketId,
    resolveBracketIdFromFormat,
    type BracketId,
    type BracketScopeId,
} from "../../Domain/matchBrackets";
import type { MatchWithId } from "../../Interfaces/matches";
import { buildCharacterKey, formatRealmLabel } from "./playerIdentity";
import type { MatchPlayer } from "./types";
import { resolveMatchDurationSeconds } from "../../Domain/localSpellModel";

export type MatchResult = "win" | "loss" | "neutral";
export type MatchMode = BracketId;
export type MatchScopeMode = BracketScopeId;

export {
    BRACKET_ARENA_SKIRMISH,
    BRACKET_BATTLEGROUND_BLITZ,
    BRACKET_BRAWL,
    BRACKET_RANDOM_BATTLEGROUND_GROUP,
    BRACKET_RATED_ARENA,
    BRACKET_RATED_ARENA_2V2,
    BRACKET_RATED_ARENA_3V3,
    BRACKET_RATED_BATTLEGROUND,
    BRACKET_SOLO_SHUFFLE,
    BRACKET_UNKNOWN,
    collapseBracketId,
    getBracketLabel as getModeLabel,
    isBattlegroundBracket,
    isRatedBracket,
    matchesBracketScope,
    parseBracketScopeId,
    parseBracketId,
    resolveBracketIdFromFormat,
};

export interface MatchFilters {
    mode: MatchScopeMode | "all";
    character: string | "all";
    query: string;
}

export interface CharacterOption {
    value: string | "all" | "auto";
    label: string;
    name?: string;
    realm?: string | null;
    avatarUrl?: string | null;
    isOwner?: boolean;
}

export interface MatchSummary {
    id: string;
    result: MatchResult;
    mode: MatchMode;
    bracketId: MatchMode;
    modeLabel: string;
    bracketLabel: string;
    mapName: string;
    timestamp: string;
    timestampLabel: string;
    timestampMs: number;
    durationLabel: string;
    durationSeconds: number | null;
    delta: number | null;
    deltaLabel: string;
    owner: {
        key: string;
        name: string;
        realm?: string;
        spec?: string;
        class?: string;
        isOwner: boolean;
        rating: number | null;
    };
    raw: MatchWithId;
}

const formatTimestamp = (value: string) => {
    const normalized = value.replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(parsed);
};

const getTimestampMs = (value: string) => {
    if (!value) return 0;
    const normalized = value.replace(" ", "T");
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const formatDuration = (seconds?: number | null) => {
    if (!seconds || Number.isNaN(seconds)) return "--";
    const total = Math.max(0, Math.round(seconds));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0) {
        return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${mins}:${String(secs).padStart(2, "0")}`;
};

export const buildCharacterLabel = (name?: string | null, realm?: string | null) => {
    const trimmedName = (name ?? "").trim();
    if (!trimmedName) return "Unknown";
    const realmLabel = formatRealmLabel(realm);
    return realmLabel ? `${trimmedName} - ${realmLabel}` : trimmedName;
};

const resolveMatchBracket = (match: MatchWithId) => {
    const stored = parseBracketId((match as MatchWithId & { bracketId?: unknown }).bracketId);
    const bracketId = stored ?? resolveBracketIdFromFormat(match.matchDetails?.format);
    const label = getBracketLabelForFormat(match.matchDetails?.format, stored);
    return { bracketId, label };
};

const getOwner = (players: MatchPlayer[]) => {
    const owner = players.find((p) => p.isOwner);
    return owner ?? players[0] ?? null;
};

const getDurationSeconds = (match: MatchWithId) => {
    return resolveMatchDurationSeconds(match);
};

const getDelta = (match: MatchWithId, owner: MatchPlayer | null) => {
    if (owner) {
        const prematch = owner.prematchMMR ?? null;
        const postmatch = owner.postmatchMMR ?? null;
        if (prematch !== null && postmatch !== null) {
            return postmatch - prematch;
        }
        if (owner.ratingChange !== undefined && owner.ratingChange !== null) {
            return owner.ratingChange;
        }
    }

    const anyMatch = match as MatchWithId & {
        soloShuffle?: { matchSummary?: { ratingChange?: number } };
    };
    if (anyMatch.soloShuffle?.matchSummary?.ratingChange !== undefined) {
        return anyMatch.soloShuffle.matchSummary.ratingChange ?? null;
    }

    return null;
};

const getResultFromWinner = (winner?: string | null): MatchResult | null => {
    if (!winner) return null;
    const normalized = winner.toLowerCase();
    if (normalized === "victory") return "win";
    if (normalized === "defeat") return "loss";
    if (normalized === "draw") return "neutral";
    return null;
};

const getResult = (delta: number | null, match: MatchWithId) => {
    const winner = (match as MatchWithId & { winner?: string }).winner;
    const winnerResult = getResultFromWinner(winner);
    if (winnerResult) return winnerResult;

    if (delta !== null) {
        if (delta > 0) return "win";
        if (delta < 0) return "loss";
    }
    const anyMatch = match as MatchWithId & {
        soloShuffle?: { outcome?: { result?: string } };
    };
    const outcome = anyMatch.soloShuffle?.outcome?.result?.toLowerCase();
    if (outcome?.includes("win")) return "win";
    if (outcome?.includes("loss")) return "loss";
    return "neutral";
};

export const buildMatchSummary = (match: MatchWithId): MatchSummary => {
    const players = (match.players ?? []) as MatchPlayer[];
    const owner = getOwner(players);
    const { bracketId, label } = resolveMatchBracket(match);
    const delta = getDelta(match, owner);
    const result = getResult(delta, match);
    const duration = getDurationSeconds(match);
    const ownerName = owner?.name ?? "Unknown";
    const ownerRealm = owner?.realm ?? undefined;
    const ownerKey = buildCharacterKey(ownerName, ownerRealm) ?? `char::${ownerName.toLowerCase()}`;

    return {
        id: match.id,
        result,
        mode: bracketId,
        bracketId,
        modeLabel: label,
        bracketLabel: label,
        mapName: match.matchDetails?.mapName ?? "Unknown map",
        timestamp: match.matchDetails?.timestamp ?? "",
        timestampLabel: match.matchDetails?.timestamp
            ? formatTimestamp(match.matchDetails.timestamp)
            : "--",
        timestampMs: match.matchDetails?.timestamp
            ? getTimestampMs(match.matchDetails.timestamp)
            : 0,
        durationLabel: formatDuration(duration),
        durationSeconds: duration,
        delta,
        deltaLabel: delta === null ? "--" : `${delta > 0 ? "+" : ""}${delta}`,
        owner: {
            key: ownerKey,
            name: ownerName,
            realm: ownerRealm,
            spec: owner?.spec ?? undefined,
            class: owner?.class ?? undefined,
            isOwner: !!owner?.isOwner,
            rating: owner?.postmatchMMR ?? owner?.prematchMMR ?? null,
        },
        raw: match,
    };
};

export const filterMatches = (
    matches: MatchSummary[],
    filters: MatchFilters,
    collapseRandomBattlegrounds: boolean,
) => {
    const query = filters.query.trim().toLowerCase();

    return matches.filter((match) => {
        if (
            filters.mode !== "all" &&
            !matchesBracketScope(match.bracketId, filters.mode, collapseRandomBattlegrounds)
        ) {
            return false;
        }
        if (filters.character !== "all" && match.owner.key !== filters.character) return false;
        if (query) {
            const haystack = [
                match.owner.name,
                buildCharacterLabel(match.owner.name, match.owner.realm),
                match.mapName,
                match.modeLabel,
                match.timestamp,
            ]
                .join(" ")
                .toLowerCase();
            if (!haystack.includes(query)) return false;
        }
        return true;
    });
};

export const buildScopeOptions = (
    summaries: MatchSummary[],
    collapseRandomBattlegrounds: boolean,
) => {
    const visible = buildVisibleBracketScopeIds(
        summaries.map((summary) => summary.bracketId),
        collapseRandomBattlegrounds,
    );

    return visible.map((bracketId) => ({
        label: getBracketLabel(bracketId),
        value: bracketId,
    }));
};

export const resolveSummaryScopeId = (
    summary: MatchSummary,
    collapseRandomBattlegrounds: boolean,
) => collapseBracketId(summary.bracketId, collapseRandomBattlegrounds);

export const isSummaryRated = (summary: MatchSummary) => isRatedBracket(summary.bracketId);

export const isSummaryBattleground = (summary: MatchSummary) =>
    isBattlegroundBracket(summary.bracketId);

export const isSummarySoloShuffle = (summary: MatchSummary) =>
    summary.bracketId === BRACKET_SOLO_SHUFFLE;

export const buildCharacterOptions = (summaries: MatchSummary[]): CharacterOption[] => {
    const ownerKey = summaries.find((summary) => summary.owner.isOwner)?.owner.key;
    const deduped = new Map<string, CharacterOption>();

    summaries.forEach((summary) => {
        if (deduped.has(summary.owner.key)) return;
        deduped.set(summary.owner.key, {
            value: summary.owner.key,
            label: buildCharacterLabel(summary.owner.name, summary.owner.realm),
            name: summary.owner.name,
            realm: summary.owner.realm ?? null,
            isOwner: summary.owner.isOwner,
        });
    });

    const options = Array.from(deduped.values()).sort((a, b) => {
        if (a.value === ownerKey) return -1;
        if (b.value === ownerKey) return 1;
        const byName = (a.name ?? "").localeCompare(b.name ?? "");
        if (byName !== 0) return byName;
        return (a.realm ?? "").localeCompare(b.realm ?? "");
    });

    return options;
};

export const resolveStoredCharacterValue = (
    storedValue: string | "auto" | "all",
    options: CharacterOption[],
): string | "auto" | "all" => {
    if (storedValue === "auto" || storedValue === "all") return storedValue;
    if (options.length === 0) return storedValue;
    if (options.some((option) => option.value === storedValue)) return storedValue;

    const exactNameMatches = options.filter((option) => option.name === storedValue);
    if (exactNameMatches.length === 1) {
        return exactNameMatches[0].value;
    }

    return storedValue === "all" ? "all" : "auto";
};

export const getDefaultSelectedId = (selectedId: string | null, matches: MatchSummary[]) => {
    if (!matches.length) return null;
    if (selectedId && matches.some((match) => match.id === selectedId)) {
        return selectedId;
    }
    return matches[0].id;
};
