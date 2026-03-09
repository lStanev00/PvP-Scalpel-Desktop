import { useMemo } from "react";
import { getClassColor } from "../../Domain/CombatDomainContext";
import type { MatchPlayer } from "./types";
import { getPlayerIdentityKey } from "./playerIdentity";
import styles from "./DataActivity.module.css";

interface MSSStatsSectionProps {
    players: MatchPlayer[];
    highlightedPlayerKey?: string | null;
    onHoverPlayerKey?: (playerKey: string | null) => void;
}

type MSSRow = {
    name: string;
    playerKey: string | null;
    isOwner: boolean;
    faction?: number;
    classColor?: string;
    stats: Record<string, number>;
};

export type MSSStatsData = {
    statNames: string[];
    rows: MSSRow[];
    distinctFactions: number[];
    valuesByPlayerKey: Record<string, Record<string, number>>;
};

export function collectMSSStats(players: MatchPlayer[]): MSSStatsData {
    const statSet = new Set<string>();
    players.forEach((player) => {
        if (!player.MSS) return;
        for (const [statName] of player.MSS) {
            statSet.add(statName);
        }
    });

    const statNames = Array.from(statSet);
    if (statNames.length === 0) {
        return {
            statNames,
            rows: [],
            distinctFactions: [],
            valuesByPlayerKey: {},
        };
    }

    const rows = players
        .map((player) => {
            const statsRecord: Record<string, number> = {};
            statNames.forEach((stat) => {
                statsRecord[stat] = 0;
            });

            if (player.MSS) {
                for (const [statName, statValue] of player.MSS) {
                    statsRecord[statName] = statValue;
                }
            }

            return {
                name: player.name ?? "-",
                playerKey: getPlayerIdentityKey(player),
                isOwner: !!player.isOwner,
                faction: player.faction,
                classColor: getClassColor(player.class),
                stats: statsRecord,
            };
        })
        .filter((row) => Object.values(row.stats).some((value) => value > 0));

    const distinctFactions = Array.from(
        new Set(rows.map((row) => row.faction).filter((faction): faction is number => faction != null))
    ).sort((a, b) => a - b);

    const valuesByPlayerKey = rows.reduce<Record<string, Record<string, number>>>((acc, row) => {
        if (!row.playerKey) return acc;
        acc[row.playerKey] = row.stats;
        return acc;
    }, {});

    return {
        statNames,
        rows,
        distinctFactions,
        valuesByPlayerKey,
    };
}

export default function MSSStatsSection({
    players,
    highlightedPlayerKey = null,
    onHoverPlayerKey,
}: MSSStatsSectionProps) {
    const mssData = useMemo(() => collectMSSStats(players), [players]);
    const { statNames, rows, distinctFactions } = mssData;

    const showFactions = distinctFactions.length > 1;

    const teamMap = useMemo(() => {
        const map = new Map<number, number>();
        distinctFactions.forEach((faction, index) => {
            map.set(faction, index + 1);
        });
        return map;
    }, [distinctFactions]);

    const sorted = useMemo(
        () =>
            showFactions
                ? [...rows].sort((a, b) => {
                      const factionDelta = (a.faction ?? 99) - (b.faction ?? 99);
                      if (factionDelta !== 0) return factionDelta;
                      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
                      return a.name.localeCompare(b.name);
                  })
                : rows,
        [rows, showFactions]
    );

    const ownerTeamIndex = useMemo(() => {
        const ownerRow = rows.find((row) => row.isOwner);
        if (!ownerRow || ownerRow.faction == null) return null;
        return teamMap.get(ownerRow.faction) ?? null;
    }, [rows, teamMap]);

    const colTemplate = `${showFactions ? "44px " : ""}minmax(180px, 1.4fr) ${statNames
        .map(() => "minmax(72px, auto)")
        .join(" ")}`;

    if (statNames.length === 0 || rows.length === 0) return null;

    return (
        <div className={styles.ttBox}>
            <div className={styles.ttHeader}>
                <h3 className={styles.ttTitle}>Map-Specific Stats</h3>
                <span className={styles.ttCount}>{rows.length} players</span>
            </div>
            <div className={styles.ttBody}>
                <div className={styles.mssGrid} style={{ gridTemplateColumns: colTemplate }}>
                    {showFactions ? <span className={styles.mssColLabel}>T</span> : null}
                    <span className={styles.mssColLabel}>Player</span>
                    {statNames.map((stat) => (
                        <span key={stat} className={styles.mssColLabel}>
                            {stat}
                        </span>
                    ))}

                    {sorted.map((row, index) => {
                        const teamIdx = teamMap.get(row.faction ?? -1);
                        const isHighlighted =
                            !!row.playerKey && !!highlightedPlayerKey && row.playerKey === highlightedPlayerKey;
                        const sharedRowClass = `${styles.mssRowCell} ${isHighlighted ? styles.mssRowCellHighlighted : ""}`;

                        return (
                            <div key={row.playerKey ? `${row.playerKey}:${index}` : index} style={{ display: "contents" }}>
                                {showFactions ? (
                                    <span
                                        className={`${styles.mssTeamIdx} ${sharedRowClass}`}
                                        onMouseEnter={() => {
                                            if (!row.playerKey || !onHoverPlayerKey) return;
                                            onHoverPlayerKey(row.playerKey);
                                        }}
                                        onMouseLeave={() => {
                                            if (!onHoverPlayerKey) return;
                                            onHoverPlayerKey(null);
                                        }}
                                    >
                                        <span
                                            className={`${styles.mssTeamBadge} ${
                                                ownerTeamIndex !== null && teamIdx === ownerTeamIndex
                                                    ? styles.mssTeamBadgeFriendly
                                                    : styles.mssTeamBadgeEnemy
                                            }`}
                                        >
                                            {teamIdx != null ? `T${teamIdx}` : "-"}
                                        </span>
                                    </span>
                                ) : null}
                                <span
                                    className={`${styles.mssPlayerName} ${styles.mssRowCell} ${
                                        isHighlighted ? styles.mssRowCellHighlighted : ""
                                    } ${row.isOwner ? styles.mssOwner : ""}`}
                                    style={row.classColor ? { color: row.classColor } : undefined}
                                    onMouseEnter={() => {
                                        if (!row.playerKey || !onHoverPlayerKey) return;
                                        onHoverPlayerKey(row.playerKey);
                                    }}
                                    onMouseLeave={() => {
                                        if (!onHoverPlayerKey) return;
                                        onHoverPlayerKey(null);
                                    }}
                                >
                                    {row.name}
                                </span>
                                {statNames.map((stat) => (
                                    <span
                                        key={stat}
                                        className={`${styles.mssStat} ${sharedRowClass}`}
                                        onMouseEnter={() => {
                                            if (!row.playerKey || !onHoverPlayerKey) return;
                                            onHoverPlayerKey(row.playerKey);
                                        }}
                                        onMouseLeave={() => {
                                            if (!onHoverPlayerKey) return;
                                            onHoverPlayerKey(null);
                                        }}
                                    >
                                        {row.stats[stat]}
                                    </span>
                                ))}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
