import { useEffect, useMemo, useRef, useState } from "react";
import { LuHeart, LuSword } from "react-icons/lu";
import useUserContext from "../../Hooks/useUserContext";
import { openUrl } from "../../Helpers/open";
import { getClassColor, getClassMedia, getSpecMedia } from "../../Domain/CombatDomainContext";
import type { MatchPlayer } from "./types";
import { getPlayerIdentityKey } from "./playerIdentity";
import { resolveEffectivePostMatchMmr, resolveEffectivePostMatchRating } from "./utils";
import styles from "./DataActivity.module.css";

interface TeamTableProps {
    title: string;
    players: MatchPlayer[];
    showRating?: boolean;
    showTeams?: boolean;
    ownerTeamMmrDelta?: number | null;
    ownerTeamCurrentMmr?: number | null;
    extraStats?: {
        statNames: string[];
        valuesByPlayerKey: Record<string, Record<string, number>>;
    } | null;
    highlightedPlayerKey?: string | null;
    onHoverPlayerKey?: (playerKey: string | null) => void;
}

const fmt = (v?: number | null) => (v != null ? v.toLocaleString() : "-");
const fmtClass = (c?: string) => (c ? c[0].toUpperCase() + c.slice(1).toLowerCase() : "-");
const EXTRA_STAT_MIN_WIDTH = 112;
const CURRENT_MMR_MIN_WIDTH = 132;

const toFiniteNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) return numeric;
    }
    return null;
};

const formatSignedNumber = (value: number) => {
    const normalized = Math.trunc(value);
    if (normalized > 0) return `+${normalized.toLocaleString()}`;
    return normalized.toLocaleString();
};

const formatBracketedDelta = (value: number | null) => {
    if (value === null) return null;
    const normalized = Math.trunc(value);
    if (normalized === 0) return null;
    return `(${formatSignedNumber(normalized)})`;
};

function HeaderHint({
    label,
    tooltip,
    multiline = false,
}: {
    label: string;
    tooltip: string;
    multiline?: boolean;
}) {
    return (
        <span
            className={`${styles.ttColHint} ${multiline ? styles.ttColHintMultiline : ""}`}
            data-tooltip={tooltip}
            tabIndex={0}
            aria-label={tooltip}
        >
            {label}
        </span>
    );
}

const resolveMedia = (player: MatchPlayer) => {
    const raw = getSpecMedia(player.spec) ?? getClassMedia(player.class);
    if (!raw) return null;
    if (raw.startsWith("http") || raw.startsWith("/") || raw.includes(".")) return raw;
    return `https://render.worldofwarcraft.com/us/icons/56/${raw}.jpg`;
};

export default function TeamTable({
    title,
    players,
    showRating = true,
    showTeams = false,
    ownerTeamMmrDelta = null,
    ownerTeamCurrentMmr = null,
    extraStats = null,
    highlightedPlayerKey = null,
    onHoverPlayerKey,
}: TeamTableProps) {
    const { webUrl } = useUserContext();
    const boxRef = useRef<HTMLDivElement | null>(null);
    const bodyRef = useRef<HTMLDivElement | null>(null);
    const firstMergedColRef = useRef<HTMLSpanElement | null>(null);
    const lastMergedColRef = useRef<HTMLSpanElement | null>(null);
    const [mergedBounds, setMergedBounds] = useState<{ left: number; right: number } | null>(null);

    const maxOutput = useMemo(() => {
        const allValues = players.flatMap((player) => [player.damage ?? 0, player.healing ?? 0]);
        return Math.max(1, ...allValues);
    }, [players]);

    const hasNonZero = (key: keyof MatchPlayer) =>
        players.some((player) => {
            const raw = player[key] as number | null | undefined;
            return typeof raw === "number" && !Number.isNaN(raw) && raw !== 0;
        });

    const showCurrentMMR =
        hasNonZero("prematchMMR") ||
        hasNonZero("postmatchMMR") ||
        hasNonZero("ratingChange") ||
        players.some((player) => {
            const pre = player.prematchMMR ?? 0;
            const post = player.postmatchMMR ?? 0;
            return typeof pre === "number" && typeof post === "number" && post - pre !== 0;
        });

    const extraStatNames = extraStats?.statNames ?? [];
    const extraStatValuesByPlayerKey = extraStats?.valuesByPlayerKey ?? {};
    const columnTemplate = [
        "minmax(180px, 1.8fr)",
        "72px",
        "minmax(220px, 1fr)",
        ...extraStatNames.map(() => `minmax(${EXTRA_STAT_MIN_WIDTH}px, auto)`),
        ...(showCurrentMMR ? [`minmax(${CURRENT_MMR_MIN_WIDTH}px, auto)`] : []),
        ...(showRating ? ["minmax(84px, auto)"] : []),
    ].join(" ");

    useEffect(() => {
        if (extraStatNames.length === 0) {
            setMergedBounds(null);
            return;
        }

        const boxElement = boxRef.current;
        const bodyElement = bodyRef.current;
        const firstElement = firstMergedColRef.current;
        const lastElement = lastMergedColRef.current;
        if (!boxElement || !bodyElement || !firstElement || !lastElement || typeof ResizeObserver === "undefined") {
            return;
        }

        const updateBounds = () => {
            const boxRect = boxElement.getBoundingClientRect();
            const bodyRect = bodyElement.getBoundingClientRect();
            const firstRect = firstElement.getBoundingClientRect();
            const lastRect = lastElement.getBoundingClientRect();
            if (boxRect.width <= 0 || bodyRect.width <= 0 || firstRect.width <= 0 || lastRect.width <= 0) return;

            setMergedBounds({
                left: firstRect.left - boxRect.left,
                right: lastRect.right - boxRect.left,
            });
        };

        updateBounds();

        const observer = new ResizeObserver(() => updateBounds());
        observer.observe(boxElement);
        observer.observe(bodyElement);
        observer.observe(firstElement);
        observer.observe(lastElement);
        return () => observer.disconnect();
    }, [columnTemplate, extraStatNames.length]);

    const { sorted, teamMap } = useMemo(() => {
        if (!showTeams) return { sorted: players, teamMap: new Map<number, number>() };
        const factions = Array.from(
            new Set(players.map((player) => player.faction).filter((faction): faction is number => faction != null))
        );
        const map = new Map<number, number>();
        factions.sort((a, b) => a - b).forEach((faction, index) => map.set(faction, index + 1));
        const sortedPlayers = [...players].sort((a, b) => (a.faction ?? 99) - (b.faction ?? 99));
        return { sorted: sortedPlayers, teamMap: map };
    }, [players, showTeams]);
    const ownerFaction = useMemo(() => {
        const owner = players.find((player) => player.isOwner);
        return typeof owner?.faction === "number" ? owner.faction : null;
    }, [players]);

    const handleRowAction = (realm?: string, name?: string) => {
        if (!realm || !name) return;
        openUrl(`${webUrl}/check/eu/${realm}/${name}`);
    };

    let lastFaction: number | undefined;
    let rowIndex = 0;

    return (
        <div className={styles.ttBox} ref={boxRef}>
            {mergedBounds ? (
                <>
                    <span
                        className={styles.ttMergedDividerLeft}
                        style={{ left: `${mergedBounds.left}px` }}
                        aria-hidden="true"
                    />
                    <span
                        className={styles.ttMergedDividerRight}
                        style={{ left: `${mergedBounds.right}px` }}
                        aria-hidden="true"
                    />
                </>
            ) : null}

            <div className={styles.ttHeader}>
                <h3 className={styles.ttTitle}>{title}</h3>
                {mergedBounds && extraStatNames.length >= 2 ? (
                    <span
                        className={styles.ttHeaderMeta}
                        style={{
                            left: `${mergedBounds.left}px`,
                            width: `${Math.max(0, mergedBounds.right - mergedBounds.left)}px`,
                        }}
                    >
                        Map-Specific Stats
                    </span>
                ) : null}
            </div>

            <div className={styles.ttBody} ref={bodyRef}>
                <div className={styles.ttColLabels} style={{ gridTemplateColumns: columnTemplate }}>
                    <span className={styles.ttColPlayer}>Player</span>
                    <span className={styles.ttColStat}>
                        <HeaderHint label="K/D" tooltip="Kills / Deaths" />
                    </span>
                    <span className={styles.ttColBar}>
                        <HeaderHint label="Output" tooltip="Damage and healing output" />
                    </span>
                    {extraStatNames.map((stat, index) => (
                        <span
                            key={stat}
                            ref={
                                index === 0
                                    ? firstMergedColRef
                                    : index === extraStatNames.length - 1
                                      ? lastMergedColRef
                                      : undefined
                            }
                            className={[
                                styles.ttColStat,
                                styles.ttMergedCol,
                                index === 0 ? styles.ttMergedColStart : "",
                                index === extraStatNames.length - 1 ? styles.ttMergedColEnd : "",
                            ]
                                .filter(Boolean)
                                .join(" ")}
                        >
                            <HeaderHint label={stat} tooltip={stat} multiline />
                        </span>
                    ))}
                    {showCurrentMMR ? (
                        <span className={styles.ttColStat}>
                            <HeaderHint
                                label="Current MMR"
                                tooltip="Current MMR and match delta"
                                multiline
                            />
                        </span>
                    ) : null}
                    {showRating ? (
                        <span className={styles.ttColStat}>
                            <HeaderHint label="Rating" tooltip="Current rating and rating change" />
                        </span>
                    ) : null}
                </div>

                {sorted.map((player, index) => {
                    const showDivider = showTeams && player.faction !== lastFaction && player.faction != null;
                    lastFaction = player.faction;
                    const teamIdx = teamMap.get(player.faction ?? -1);
                    const animationIndex = rowIndex++;
                    const playerKey = getPlayerIdentityKey(player);
                    const isHighlighted =
                        !!playerKey && !!highlightedPlayerKey && playerKey === highlightedPlayerKey;

                    const classColor = getClassColor(player.class) ?? "rgba(230,234,240,0.7)";
                    const media = resolveMedia(player);
                    const preMatchMMR = toFiniteNumber(player.prematchMMR);
                    const postMatchMMR = toFiniteNumber(player.postmatchMMR);
                    const isOwnerTeamPlayer =
                        ownerFaction !== null &&
                        typeof player.faction === "number" &&
                        player.faction === ownerFaction;
                    const currentMMR =
                        resolveEffectivePostMatchMmr(player) ??
                        (isOwnerTeamPlayer ? ownerTeamCurrentMmr : null);
                    const derivedDelta =
                        preMatchMMR !== null && postMatchMMR !== null ? postMatchMMR - preMatchMMR : null;
                    const fallbackTeamDelta =
                        isOwnerTeamPlayer &&
                        ownerTeamMmrDelta !== null &&
                        ownerTeamMmrDelta !== 0
                            ? ownerTeamMmrDelta
                            : null;
                    const mmrDelta =
                        derivedDelta !== null && derivedDelta !== 0 ? derivedDelta : fallbackTeamDelta;
                    const deltaStyle =
                        mmrDelta !== null && mmrDelta > 0
                            ? styles.deltaPositive
                            : mmrDelta !== null && mmrDelta < 0
                              ? styles.deltaNegative
                              : styles.deltaNeutral;
                    const rating = resolveEffectivePostMatchRating(player);
                    const ratingChange = toFiniteNumber(player.ratingChange);
                    const mmrDeltaLabel = formatBracketedDelta(mmrDelta);
                    const ratingDeltaLabel = formatBracketedDelta(ratingChange);
                    const ratingDeltaStyle =
                        ratingChange !== null && ratingChange > 0
                            ? styles.deltaPositive
                            : ratingChange !== null && ratingChange < 0
                              ? styles.deltaNegative
                              : "";
                    const damagePct = maxOutput > 0 ? ((player.damage ?? 0) / maxOutput) * 100 : 0;
                    const healingPct = maxOutput > 0 ? ((player.healing ?? 0) / maxOutput) * 100 : 0;
                    const extraRowStats = playerKey ? extraStatValuesByPlayerKey[playerKey] ?? null : null;

                    return (
                        <div key={playerKey ? `${playerKey}:${index}` : index} style={{ display: "contents" }}>
                            {showDivider ? (
                                <div className={styles.ttTeamDivider}>
                                    <span>Team {teamIdx}</span>
                                </div>
                            ) : null}

                            <div
                                className={`${styles.ttRow} ${player.isOwner ? styles.ttRowOwner : ""} ${
                                    isHighlighted ? styles.ttRowHighlighted : ""
                                }`}
                                style={{ gridTemplateColumns: columnTemplate, animationDelay: `${animationIndex * 40}ms` }}
                                tabIndex={0}
                                role="link"
                                onClick={() => handleRowAction(player.realm, player.name)}
                                onMouseEnter={() => {
                                    if (!playerKey || !onHoverPlayerKey) return;
                                    onHoverPlayerKey(playerKey);
                                }}
                                onMouseLeave={() => {
                                    if (!onHoverPlayerKey) return;
                                    onHoverPlayerKey(null);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        handleRowAction(player.realm, player.name);
                                    }
                                }}
                            >
                                <div className={styles.ttPlayer}>
                                    <div className={styles.ttPlayerIcon} style={{ borderColor: `${classColor}44` }}>
                                        {media ? (
                                            <img src={media} alt="" loading="lazy" />
                                        ) : (
                                            <span style={{ color: classColor }}>
                                                {(player.class ?? "?").slice(0, 1).toUpperCase()}
                                            </span>
                                        )}
                                    </div>

                                    <div className={styles.ttPlayerInfo}>
                                        <span className={styles.ttPlayerName} style={{ color: classColor }}>
                                            {player.name ?? "-"}
                                        </span>
                                        <span className={styles.ttPlayerSpec}>
                                            {player.spec ?? "-"} {fmtClass(player.class)}
                                        </span>
                                    </div>
                                </div>

                                <span className={styles.ttStat}>
                                    <span className={styles.ttKDValue}>
                                        <span>{player.kills ?? "-"}</span>
                                        <span className={styles.ttKDSeparator}>/</span>
                                        <span>{player.deaths ?? "-"}</span>
                                    </span>
                                </span>

                                <div className={styles.ttOutputCell}>
                                    <div className={styles.ttOutputRow}>
                                        <LuSword size={11} className={styles.ttOutputIconDmg} />
                                        <div className={styles.ttBarTrack}>
                                            <div className={styles.ttBarFill} style={{ width: `${damagePct}%` }} />
                                        </div>
                                        <span className={styles.ttBarValue}>{fmt(player.damage)}</span>
                                    </div>

                                    <div className={styles.ttOutputRow}>
                                        <LuHeart size={11} className={styles.ttOutputIconHeal} />
                                        <div className={styles.ttBarTrack}>
                                            <div
                                                className={`${styles.ttBarFill} ${styles.ttBarFillHeal}`}
                                                style={{ width: `${healingPct}%` }}
                                            />
                                        </div>
                                        <span className={styles.ttBarValue}>{fmt(player.healing)}</span>
                                    </div>
                                </div>

                                {extraStatNames.map((stat, index) => (
                                    <span
                                        key={stat}
                                        className={[
                                            styles.ttStat,
                                            index === 0 ? styles.ttMergedCellStart : "",
                                            index === extraStatNames.length - 1 ? styles.ttMergedCellEnd : "",
                                        ]
                                            .filter(Boolean)
                                            .join(" ")}
                                    >
                                        {extraRowStats?.[stat] ?? 0}
                                    </span>
                                ))}

                                {showCurrentMMR ? (
                                    <span className={`${styles.ttStat} ${styles.ttMmrCell}`}>
                                        <span className={styles.ttMmrValue}>{fmt(currentMMR)}</span>
                                        {mmrDeltaLabel ? (
                                            <span className={`${styles.ttMmrDelta} ${deltaStyle}`}>
                                                {" "}
                                                {mmrDeltaLabel}
                                            </span>
                                        ) : null}
                                    </span>
                                ) : null}
                                {showRating ? (
                                    <span className={styles.ttStat}>
                                        {rating ?? "-"}
                                        {ratingDeltaLabel ? (
                                            <span className={ratingDeltaStyle}>
                                                {" "}
                                                {ratingDeltaLabel}
                                            </span>
                                        ) : null}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
