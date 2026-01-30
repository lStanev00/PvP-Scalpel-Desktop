import type { MatchWithId } from "../../Interfaces/matches";
import type { MatchPlayer, MatchTimelineEntry } from "./types";

export type MatchResult = "win" | "loss" | "neutral";
export type MatchMode = "solo" | "skirmish" | "rated2" | "rated3" | "rbg" | "unknown";

export interface MatchFilters {
    mode: MatchMode | "all";
    character: string | "all";
    query: string;
}

export interface MatchSummary {
    id: string;
    result: MatchResult;
    mode: MatchMode;
    modeLabel: string;
    mapName: string;
    timestamp: string;
    timestampLabel: string;
    timestampMs: number;
    durationLabel: string;
    delta: number | null;
    deltaLabel: string;
    owner: {
        name: string;
        spec?: string;
        class?: string;
        isOwner: boolean;
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

const getMode = (format?: string): { key: MatchMode; label: string } => {
    const raw = (format ?? "").toLowerCase();
    if (raw.includes("solo shuffle")) return { key: "solo", label: "Solo Shuffle" };
    if (raw.includes("skirmish")) return { key: "skirmish", label: "Skirmish" };
    if (raw.includes("rbg") || raw.includes("rated battleground")) {
        return { key: "rbg", label: "RBG" };
    }
    if (raw.includes("3v3")) return { key: "rated3", label: "Rated 3v3" };
    if (raw.includes("2v2")) return { key: "rated2", label: "Rated 2v2" };
    if (format) return { key: "unknown", label: format };
    return { key: "unknown", label: "Unknown" };
};

const getOwner = (players: MatchPlayer[]) => {
    const owner = players.find((p) => p.isOwner);
    return owner ?? players[0] ?? null;
};

const getDurationSeconds = (match: MatchWithId) => {
    const anyMatch = match as MatchWithId & {
        soloShuffle?: { duration?: number };
        timeline?: MatchTimelineEntry[];
    };
    if (anyMatch.soloShuffle?.duration) return anyMatch.soloShuffle.duration;
    const timeline = anyMatch.timeline;
    if (timeline && timeline.length > 0) {
        const max = Math.max(...timeline.map((e) => e.t || 0));
        return max > 0 ? max : null;
    }
    return null;
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
    const { key, label } = getMode(match.matchDetails?.format);
    const delta = getDelta(match, owner);
    const result = getResult(delta, match);
    const duration = getDurationSeconds(match);

    return {
        id: match.id,
        result,
        mode: key,
        modeLabel: label,
        mapName: match.matchDetails?.mapName ?? "Unknown map",
        timestamp: match.matchDetails?.timestamp ?? "",
        timestampLabel: match.matchDetails?.timestamp
            ? formatTimestamp(match.matchDetails.timestamp)
            : "--",
        timestampMs: match.matchDetails?.timestamp
            ? getTimestampMs(match.matchDetails.timestamp)
            : 0,
        durationLabel: formatDuration(duration),
        delta,
        deltaLabel: delta === null ? "--" : `${delta > 0 ? "+" : ""}${delta}`,
        owner: {
            name: owner?.name ?? "Unknown",
            spec: owner?.spec ?? undefined,
            class: owner?.class ?? undefined,
            isOwner: !!owner?.isOwner,
        },
        raw: match,
    };
};

export const filterMatches = (matches: MatchSummary[], filters: MatchFilters) => {
    const query = filters.query.trim().toLowerCase();

    return matches.filter((match) => {
        if (filters.mode !== "all" && match.mode !== filters.mode) return false;
        if (filters.character !== "all" && match.owner.name !== filters.character) return false;
        if (query) {
            const haystack = [
                match.owner.name,
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

export const getDefaultSelectedId = (selectedId: string | null, matches: MatchSummary[]) => {
    if (!matches.length) return null;
    if (selectedId && matches.some((match) => match.id === selectedId)) {
        return selectedId;
    }
    return matches[0].id;
};
