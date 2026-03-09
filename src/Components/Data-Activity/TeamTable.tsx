import { useEffect, useMemo, useRef, useState } from "react";
import { LuHeart, LuSword } from "react-icons/lu";
import useUserContext from "../../Hooks/useUserContext";
import { openUrl } from "../../Helpers/open";
import { getClassColor, getClassMedia, getSpecMedia } from "../../Domain/CombatDomainContext";
import type { MatchPlayer } from "./types";
import { getPlayerIdentityKey } from "./playerIdentity";
import styles from "./DataActivity.module.css";

interface TeamTableProps {
    title: string;
    players: MatchPlayer[];
    showRating?: boolean;
    showTeams?: boolean;
    extraStats?: {
        statNames: string[];
        valuesByPlayerKey: Record<string, Record<string, number>>;
    } | null;
    highlightedPlayerKey?: string | null;
    onHoverPlayerKey?: (playerKey: string | null) => void;
}

const fmt = (v?: number | null) => (v != null ? v.toLocaleString() : "-");
const fmtClass = (c?: string) => (c ? c[0].toUpperCase() + c.slice(1).toLowerCase() : "-");

function HeaderHint({ label, tooltip }: { label: string; tooltip: string }) {
    return (
        <span className={styles.ttColHint} data-tooltip={tooltip} tabIndex={0} aria-label={tooltip}>
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

    const showPreMMR = hasNonZero("prematchMMR");
    const showPostMMR = hasNonZero("postmatchMMR");
    const showMMRDelta =
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
        ...extraStatNames.map(() => "minmax(92px, auto)"),
        ...(showPreMMR ? ["minmax(64px, auto)"] : []),
        ...(showPostMMR ? ["minmax(64px, auto)"] : []),
        ...(showMMRDelta ? ["minmax(64px, auto)"] : []),
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
                                index === 0 ? styles.ttMergedColStart : "",
                                index === extraStatNames.length - 1 ? styles.ttMergedColEnd : "",
                            ]
                                .filter(Boolean)
                                .join(" ")}
                        >
                            <HeaderHint label={stat} tooltip={stat} />
                        </span>
                    ))}
                    {showPreMMR ? (
                        <span className={styles.ttColStat}>
                            <HeaderHint label="Pre" tooltip="Pre-match MMR" />
                        </span>
                    ) : null}
                    {showPostMMR ? (
                        <span className={styles.ttColStat}>
                            <HeaderHint label="Post" tooltip="Post-match MMR" />
                        </span>
                    ) : null}
                    {showMMRDelta ? (
                        <span className={styles.ttColStat}>
                            <HeaderHint label="Δ" tooltip="MMR change" />
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
                    const delta = (player.postmatchMMR ?? 0) - (player.prematchMMR ?? 0);
                    const deltaStyle =
                        delta > 0 ? styles.deltaPositive : delta < 0 ? styles.deltaNegative : styles.deltaNeutral;
                    const rating = player.rating ?? null;
                    const ratingChange = player.ratingChange ?? null;
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

                                {showPreMMR ? <span className={styles.ttStat}>{player.prematchMMR ?? "-"}</span> : null}
                                {showPostMMR ? <span className={styles.ttStat}>{player.postmatchMMR ?? "-"}</span> : null}
                                {showMMRDelta ? (
                                    <span className={`${styles.ttStat} ${deltaStyle}`}>{delta > 0 ? `+${delta}` : delta}</span>
                                ) : null}
                                {showRating ? (
                                    <span className={styles.ttStat}>
                                        {rating ?? "-"}
                                        {ratingChange != null ? (
                                            <span
                                                className={
                                                    ratingChange > 0
                                                        ? styles.deltaPositive
                                                        : ratingChange < 0
                                                          ? styles.deltaNegative
                                                          : ""
                                                }
                                            >
                                                {" "}
                                                {ratingChange > 0 ? `+${ratingChange}` : ratingChange}
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
