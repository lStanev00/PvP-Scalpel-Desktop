import { startTransition, useEffect, useState } from "react";
import {
    BRACKET_BATTLEGROUND_BLITZ,
    BRACKET_RATED_ARENA_2V2,
    BRACKET_RATED_ARENA_3V3,
    BRACKET_RATED_BATTLEGROUND,
    BRACKET_SOLO_SHUFFLE,
    type MatchSummary,
} from "../Components/DataActivity/utils";
import useUserContext from "./useUserContext";
import type { UserContextType } from "../Context-Providers/main-contenxt";

const PROFILE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const PROFILE_CACHE_PREFIX = "character_profile:v1:";

type RatingStats = {
    played?: number;
    won?: number;
    lost?: number;
};

type RatingSeason = {
    rating?: number;
    seasonMatchStatistics?: RatingStats;
};

type RatingBucket = {
    currentSeason?: RatingSeason;
};

export interface CharacterProfile {
    name?: string;
    server?: string;
    guildName?: string;
    faction?: string;
    checkedCount?: number;
    updatedAt?: string;
    playerRealm?: {
        name?: string;
        slug?: string;
    };
    class?: {
        name?: string;
        media?: string;
    };
    activeSpec?: {
        name?: string;
        media?: string;
    };
    media?: {
        avatar?: string;
        banner?: string;
        charImg?: string;
    };
    rating?: Record<string, RatingBucket>;
}

export type CharacterProfiles = CharacterProfile[];
export type CharacterProfileState = {
    profiles: CharacterProfiles;
    isLoading: boolean;
    hasCachedData: boolean;
};

type StoredProfile = {
    expiresAt: number;
    data: CharacterProfiles;
};

type ProfileArgs = {
    server: string | null;
    realm: string | null;
    name: string | null;
};

type ResolvedProfileArgs = {
    server: string;
    realm: string;
    name: string;
};

const memoryCache = new Map<string, StoredProfile>();
const inflight = new Map<string, Promise<CharacterProfiles>>();

const slugifyToken = (value?: string | null) =>
    (value ?? "")
        .trim()
        .toLowerCase()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

const makeCacheKey = ({ server, realm, name }: ProfileArgs) =>
    `${PROFILE_CACHE_PREFIX}${slugifyToken(server)}:${slugifyToken(realm)}:${slugifyToken(name)}`;

const resolveProfileArgs = ({ server, realm, name }: ProfileArgs): ResolvedProfileArgs | null => {
    if (!server || !realm || !name) return null;
    return { server, realm, name };
};

const readStoredProfile = (key: string): StoredProfile | null => {
    const fromMemory = memoryCache.get(key);
    if (fromMemory && fromMemory.expiresAt > Date.now()) {
        return fromMemory;
    }

    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredProfile;
        if (!parsed || typeof parsed.expiresAt !== "number") return null;
        if (parsed.expiresAt <= Date.now()) {
            window.localStorage.removeItem(key);
            return null;
        }
        memoryCache.set(key, parsed);
        return parsed;
    } catch {
        return null;
    }
};

const writeStoredProfile = (key: string, data: CharacterProfiles) => {
    const payload: StoredProfile = {
        expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
        data,
    };
    memoryCache.set(key, payload);
    try {
        window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
        // Ignore storage quota / availability issues.
    }
};

type HttpFetch = UserContextType["httpFetch"];

const normalizeProfiles = (value: unknown): CharacterProfiles => {
    if (Array.isArray(value)) {
        return value.filter(
            (entry): entry is CharacterProfile =>
                !!entry && typeof entry === "object" && !Array.isArray(entry)
        );
    }

    if (value && typeof value === "object") {
        return [value as CharacterProfile];
    }

    return [];
};

const fetchCharacterProfile = async (
    { server, realm, name }: ResolvedProfileArgs,
    httpFetch: HttpFetch,
): Promise<CharacterProfiles> => {
    const key = makeCacheKey({ server, realm, name });
    const cached = readStoredProfile(key);
    if (cached) return cached.data;

    const existing = inflight.get(key);
    if (existing) return existing;

    const request = httpFetch(
        `/checkCharacter/${encodeURIComponent(server)}/${encodeURIComponent(realm)}/${encodeURIComponent(name)}`
    )
        .then((response) => {
            if (!response.ok || !response.data) {
                throw new Error(
                    response.error || `Character profile request failed: ${response.status}`,
                );
            }
            const data = normalizeProfiles(response.data);
            writeStoredProfile(key, data);
            return data;
        })
        .catch(() => {
            const fallback = readStoredProfile(key);
            return fallback?.data ?? [];
        })
        .finally(() => {
            inflight.delete(key);
        });

    inflight.set(key, request);
    return request;
};

export const isCharacterProfileCacheFresh = ({ server, realm, name }: ProfileArgs) => {
    const resolved = resolveProfileArgs({ server, realm, name });
    if (!resolved) return false;
    const key = makeCacheKey(resolved);
    return !!readStoredProfile(key);
};

export const prefetchCharacterProfile = (
    { server, realm, name }: ProfileArgs,
    httpFetch: HttpFetch,
): Promise<CharacterProfiles> => {
    const resolved = resolveProfileArgs({ server, realm, name });
    if (!resolved) return Promise.resolve([]);
    return fetchCharacterProfile(resolved, httpFetch);
};

type ProfileMatchArgs = {
    name?: string | null;
    realm?: string | null;
    server?: string | null;
};

export const resolveCharacterProfile = (
    profiles: CharacterProfiles,
    { name, realm, server }: ProfileMatchArgs
): CharacterProfile | null => {
    if (!profiles.length) return null;

    const normalizedName = slugifyToken(name);
    const normalizedRealm = slugifyToken(realm);
    const normalizedServer = slugifyToken(server);

    const exact = profiles.find((profile) => {
        const profileName = slugifyToken(profile.name);
        const profileRealm = slugifyToken(profile.playerRealm?.slug ?? profile.playerRealm?.name);
        const profileServer = slugifyToken(profile.server);

        if (normalizedName && profileName && profileName !== normalizedName) return false;
        if (normalizedRealm && profileRealm && profileRealm !== normalizedRealm) return false;
        if (normalizedServer && profileServer && profileServer !== normalizedServer) return false;
        return true;
    });

    return exact ?? profiles[0] ?? null;
};

export const getCachedCharacterProfiles = ({
    server,
    realm,
    name,
}: ProfileArgs): CharacterProfiles => {
    if (!server || !realm || !name) return [];
    const key = makeCacheKey({ server, realm, name });
    return readStoredProfile(key)?.data ?? [];
};

export const resolveCachedCharacterProfile = ({
    server,
    realm,
    name,
}: ProfileArgs): CharacterProfile | null => {
    const profiles = getCachedCharacterProfiles({ server, realm, name });
    return resolveCharacterProfile(profiles, { server, realm, name });
};

const resolveSpecBracketKey = (
    prefix: string,
    match: MatchSummary,
    profile: CharacterProfile | null,
) => {
    const spec = slugifyToken(profile?.activeSpec?.name ?? match.owner.spec);
    const className = slugifyToken(profile?.class?.name ?? match.owner.class);
    if (!spec || !className) return null;
    return `${prefix}-${className}-${spec}`;
};

export const resolveCharacterBracketSnapshot = (
    profiles: CharacterProfiles,
    match: MatchSummary | null,
): RatingSeason | null => {
    const profile = resolveCharacterProfile(profiles, {
        name: match?.owner.name ?? null,
        realm:
            (match?.raw.players?.find((player) => player.isOwner) ?? match?.raw.players?.[0])?.realm ?? null,
        server: null,
    });
    if (!profile?.rating || !match) return null;

    const ratingEntries = profile.rating;
    const exactKeys: string[] = [];

    if (match.bracketId === BRACKET_SOLO_SHUFFLE) {
        const key = resolveSpecBracketKey("shuffle", match, profile);
        if (key) exactKeys.push(key);
        exactKeys.push("shuffle");
    } else if (match.bracketId === BRACKET_RATED_ARENA_2V2) {
        exactKeys.push("2v2");
    } else if (match.bracketId === BRACKET_RATED_ARENA_3V3) {
        exactKeys.push("3v3");
    } else if (match.bracketId === BRACKET_RATED_BATTLEGROUND) {
        exactKeys.push("rbg");
    } else if (match.bracketId === BRACKET_BATTLEGROUND_BLITZ) {
        const key = resolveSpecBracketKey("blitz", match, profile);
        if (key) exactKeys.push(key);
        exactKeys.push("blitz");
    }

    for (const key of exactKeys) {
        const bucket = ratingEntries[key];
        if (bucket?.currentSeason) {
            return bucket.currentSeason;
        }
    }

    return null;
};

export const useCharacterProfileState = ({ server, realm, name }: ProfileArgs): CharacterProfileState => {
    const [profiles, setProfiles] = useState<CharacterProfiles>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasCachedData, setHasCachedData] = useState(false);
    const { httpFetch } = useUserContext();

    useEffect(() => {
        const resolved = resolveProfileArgs({ server, realm, name });
        if (!resolved) {
            setProfiles([]);
            setIsLoading(false);
            setHasCachedData(false);
            return;
        }

        const key = makeCacheKey(resolved);
        const cached = readStoredProfile(key);
        setHasCachedData(!!cached);
        if (cached) {
            setProfiles(cached.data);
        } else {
            setProfiles([]);
        }

        let active = true;
        setIsLoading(true);
        fetchCharacterProfile(resolved, httpFetch).then((result) => {
            if (!active) return;
            startTransition(() => {
                setProfiles(result);
            });
            setIsLoading(false);
        });

        return () => {
            active = false;
        };
    }, [httpFetch, server, realm, name]);

    return { profiles, isLoading, hasCachedData };
};

export default function useCharacterProfile({ server, realm, name }: ProfileArgs) {
    return useCharacterProfileState({ server, realm, name }).profiles;
}
