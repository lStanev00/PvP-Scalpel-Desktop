import type { MatchPlayer } from "./types";

const normalize = (value?: string | null) => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
};

export const getPlayerIdentityKey = (player: MatchPlayer): string | null => {
    const guid = normalize((player as { guid?: string | null }).guid);
    if (guid) return `guid:${guid}`;

    const realm = normalize((player as { realm?: string | null }).realm);
    const name = normalize((player as { name?: string | null }).name);
    if (!name) return null;

    return `name:${realm ?? ""}:${name}`;
};
