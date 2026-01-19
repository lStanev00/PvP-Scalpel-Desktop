import { useEffect, useMemo, useState } from "react";
import useMatches from "../../Hooks/useMatches";
import { Player } from "../../Interfaces/matches";
import useUserContext from "../../Hooks/useUserContext";
import updatePersence from "../../Helpers/updatePresence";
import { openUrl } from "../../Helpers/open";
import TimelineSection from "./Timeline-Section";
import RouteLayout from "../RouteLayout/RouteLayout";
import EmptyState from "../EmptyState/EmptyState";
import styles from "./DemoContent.module.css";

export default function DemoContent() {
    const matches = useMatches();
    const [page, setPage] = useState(1);
    const [rpcUpdate, setRpcUpdate] = useState("");

    useEffect(() => {
        if (matches.length > 0) {
            setPage(matches.length);
        }
    }, [matches.length]);

    const last = matches[page - 1] ?? null;
    const totalPages = matches.length;
    const owner = last?.players.find((p) => p.isOwner);
    const ownerName = owner?.name ?? "";
    const delta = owner ? (owner.postmatchMMR ?? 0) - (owner.prematchMMR ?? 0) : 0;

    useEffect(() => {
        updatePersence(rpcUpdate === "" ? "" : `Match lookup: ${ownerName}`);
    }, [rpcUpdate, ownerName]);

    useEffect(() => {
        if (owner?.name && owner.name !== rpcUpdate) {
            setRpcUpdate(owner.name);
        }
    }, [owner?.name, rpcUpdate]);

    const alliance = last ? last.players.filter((p) => p.faction === 0) : [];
    const horde = last ? last.players.filter((p) => p.faction === 1) : [];
    const deltaClass =
        delta > 0 ? styles.deltaPositive : delta < 0 ? styles.deltaNegative : styles.deltaNeutral;

    const headerActions = useMemo(
        () => (
            <div className={styles.headerActions}>
                <button className={styles.ghostButton} onClick={() => openUrl("https://www.pvpscalpel.com")}>
                    Open web portal
                </button>
                <button
                    className={styles.ghostButton}
                    onClick={() => setPage(totalPages)}
                    disabled={totalPages === 0}
                >
                    Jump to latest
                </button>
            </div>
        ),
        [totalPages]
    );

    if (!last) {
        return (
            <RouteLayout
                title="Data & Activity"
                description="Match history, timeline, and player summaries from your latest sessions."
                actions={headerActions}
            >
                <EmptyState
                    title="No PvP Scalpel data yet"
                    description="Launch your first match and activity will populate here automatically."
                />
            </RouteLayout>
        );
    }

    return (
        <RouteLayout
            title="Data & Activity"
            description="Match history, timeline, and player summaries from your latest sessions."
            actions={headerActions}
        >
            <div className={styles.pagination}>
                <button
                    className={styles.navButton}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                >
                    Prev
                </button>
                <span className={styles.pageStatus}>
                    Page {page} / {totalPages}
                </span>
                <button
                    className={styles.navButton}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                >
                    Next
                </button>
            </div>

            <section className={styles.metaGrid}>
                <div className={styles.metaCard}>
                    <span className={styles.metaLabel}>Map</span>
                    <span className={styles.metaValue}>{last.matchDetails.mapName}</span>
                </div>
                <div className={styles.metaCard}>
                    <span className={styles.metaLabel}>Format</span>
                    <span className={styles.metaValue}>{last.matchDetails.format}</span>
                </div>
                <div className={styles.metaCard}>
                    <span className={styles.metaLabel}>Time</span>
                    <span className={styles.metaValue}>{last.matchDetails.timestamp}</span>
                </div>
                {owner ? (
                    <div className={`${styles.metaCard} ${styles.metaAccent}`}>
                        <span className={styles.metaLabel}>MMR Delta</span>
                        <span className={`${styles.metaValue} ${deltaClass}`}>
                            {delta >= 0 ? `+${delta}` : delta}
                        </span>
                    </div>
                ) : null}
                <div className={styles.metaCard}>
                    <span className={styles.metaLabel}>Match ID</span>
                    <span className={styles.metaValue}>{last.id}</span>
                </div>
            </section>

            <section className={styles.tables}>
                <TeamTable title="Alliance" players={alliance} />
                <TeamTable title="Horde" players={horde} />
            </section>

            <MSSStatsSection players={last.players} />
            <TimelineSection timeline={last.timeline ?? []} />
        </RouteLayout>
    );
}

function TeamTable({ title, players }: { title: string; players: Player[] }) {
    const { webUrl } = useUserContext();

    const formatClass = (c?: string) =>
        c ? c[0].toUpperCase() + c.slice(1).toLowerCase() : "-";

    const handleRowAction = (realm?: string, name?: string) => {
        if (!realm || !name) return;
        openUrl(`${webUrl}/check/eu/${realm}/${name}`);
    };

    return (
        <div className={styles.teamBox}>
            <h3 className={styles.teamTitle}>{title}</h3>
            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Player</th>
                            <th>Spec(Class)</th>
                            <th>Kills</th>
                            <th>Deaths</th>
                            <th>Damage</th>
                            <th>Healing</th>
                            <th>Pre-MMR</th>
                            <th>Post-MMR</th>
                            <th>MMR</th>
                            <th>Rating</th>
                        </tr>
                    </thead>
                    <tbody>
                        {players.map((p, i) => {
                            const delta = (p.postmatchMMR ?? 0) - (p.prematchMMR ?? 0);
                            const deltaStyle =
                                delta > 0
                                    ? styles.deltaPositive
                                    : delta < 0
                                      ? styles.deltaNegative
                                      : styles.deltaNeutral;
                            const classStyle = classColor(p.class);

                            return (
                                <tr
                                    key={i}
                                    className={`${styles.tableRow} ${styles.tableRowClickable}`}
                                    tabIndex={0}
                                    role="link"
                                    onClick={() => handleRowAction(p.realm, p.name)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            handleRowAction(p.realm, p.name);
                                        }
                                    }}
                                >
                                    <td
                                        className={`${styles.playerCell} ${styles[classStyle]} ${
                                            p.isOwner ? styles.owner : ""
                                        }`}
                                    >
                                        {p.isOwner ? "★ " : null}
                                        {p.name}
                                    </td>
                                    <td>
                                        {p.spec ?? "-"} ({formatClass(p.class)})
                                    </td>
                                    <td>{p.kills ?? "-"}</td>
                                    <td>{p.deaths ?? "-"}</td>
                                    <td>{p.damage?.toLocaleString() ?? "-"}</td>
                                    <td>{p.healing?.toLocaleString() ?? "-"}</td>
                                    <td>{p.prematchMMR ?? "-"}</td>
                                    <td>{p.postmatchMMR ?? "-"}</td>
                                    <td className={`${styles.deltaCell} ${deltaStyle}`}>
                                        {delta > 0 ? `+${delta}` : delta}
                                    </td>
                                    <td>
                                        {p.rating} (
                                        {p.ratingChange !== null && p.ratingChange > 0
                                            ? `+${p.ratingChange}`
                                            : p.ratingChange}
                                        )
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function MSSStatsSection({ players }: { players: Player[] }) {
    const statSet = new Set<string>();

    players.forEach((p) => {
        if (p.MSS) {
            for (const [statName] of p.MSS) {
                statSet.add(statName);
            }
        }
    });

    const statNames = Array.from(statSet);

    if (statNames.length === 0) return null;

    const grouped = players.map((p) => {
        const statsRecord: Record<string, number> = {};
        statNames.forEach((s) => (statsRecord[s] = 0));

        if (p.MSS) {
            for (const [statName, statValue] of p.MSS) {
                statsRecord[statName] = statValue;
            }
        }

        return {
            player: p.name,
            isOwner: p.isOwner ?? false,
            stats: statsRecord,
        };
    });

    const filteredRows = grouped.filter((row) => Object.values(row.stats).some((v) => v > 0));

    if (filteredRows.length === 0) return null;

    return (
        <div className={styles.mssBox}>
            <h3 className={styles.teamTitle}>Map-Specific Stats</h3>
            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Player</th>
                            {statNames.map((stat) => (
                                <th key={stat}>{stat}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.map((row, i) => (
                            <tr key={i} className={styles.tableRow}>
                                <td
                                    className={`${styles.playerCell} ${
                                        row.isOwner ? styles.owner : ""
                                    }`}
                                >
                                    {row.player}
                                </td>
                                {statNames.map((stat) => (
                                    <td key={stat}>{row.stats[stat]}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function classColor(cls: string | undefined): string {
    switch (cls) {
        case "WARRIOR":
            return "classWarrior";
        case "PALADIN":
            return "classPaladin";
        case "HUNTER":
            return "classHunter";
        case "ROGUE":
            return "classRogue";
        case "PRIEST":
            return "classPriest";
        case "DEATHKNIGHT":
            return "classDeathKnight";
        case "SHAMAN":
            return "classShaman";
        case "MAGE":
            return "classMage";
        case "WARLOCK":
            return "classWarlock";
        case "MONK":
            return "classMonk";
        case "DRUID":
            return "classDruid";
        case "DEMONHUNTER":
            return "classDemonHunter";
        case "EVOKER":
            return "classEvoker";
        default:
            return "classDefault";
    }
}
