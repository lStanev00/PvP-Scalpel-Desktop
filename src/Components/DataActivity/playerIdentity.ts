import type { MatchPlayer } from "./types";

const normalize = (value?: string | null) => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
};

export const buildCharacterKey = (name?: string | null, realm?: string | null) => {
    const normalizedName = normalize(name);
    if (!normalizedName) return null;
    const normalizedRealm = normalize(realm);
    return `char:${normalizedRealm ?? ""}:${normalizedName}`;
};

export const formatRealmLabel = (realm?: string | null) => {
    const normalizedRealm = normalize(realm);
    if (!normalizedRealm) return null;
    return normalizedRealm
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
};

export const getPlayerIdentityKey = (player: MatchPlayer): string | null => {
    const guid = normalize((player as { guid?: string | null }).guid);
    if (guid) return `guid:${guid}`;

    const realm = normalize((player as { realm?: string | null }).realm);
    const name = normalize((player as { name?: string | null }).name);
    if (!name) return null;

    return `name:${realm ?? ""}:${name}`;
};
