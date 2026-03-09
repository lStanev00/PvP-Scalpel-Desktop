import { startTransition, useEffect, useState } from "react";
import type { MatchSummary } from "../Components/Data-Activity/utils";
import useUserContext from "./useUserContext";
import type { UserContextType } from "../Context-Providers/main-contenxt";

const PROFILE_CACHE_TTL_MS = 30 * 60 * 1000;
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

    if (match.mode === "solo") {
        const key = resolveSpecBracketKey("shuffle", match, profile);
        if (key) exactKeys.push(key);
        exactKeys.push("shuffle");
    } else if (match.mode === "rated2") {
        exactKeys.push("2v2");
    } else if (match.mode === "rated3") {
        exactKeys.push("3v3");
    } else if (match.mode === "rbg") {
        exactKeys.push("rbg");
    } else if (match.modeLabel.toLowerCase().includes("blitz")) {
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

export default function useCharacterProfile({ server, realm, name }: ProfileArgs) {
    const [profile, setProfile] = useState<CharacterProfiles>([]);
    const { httpFetch } = useUserContext();

    useEffect(() => {
        if (!server || !realm || !name) {
            setProfile([]);
            return;
        }

        const key = makeCacheKey({ server, realm, name });
        const cached = readStoredProfile(key);
        if (cached) {
            setProfile(cached.data);
        }

        let active = true;
        fetchCharacterProfile({ server, realm, name }, httpFetch).then((result) => {
            if (!active) return;
            startTransition(() => {
                setProfile(result);
            });
        });

        return () => {
            active = false;
        };
    }, [httpFetch, server, realm, name]);

    return profile;
}
