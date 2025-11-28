import { useEffect, useState } from "react";
import useMatches from "../../Hooks/useMatches";
import { Player } from "../../Interfaces/matches";
import { open } from "@tauri-apps/plugin-shell";
import useUserContext from "../../Hooks/useUserContext";

export default function DemoContent() {
    const matches = useMatches();

    const [page, setPage] = useState(1);

    useEffect(() => {
        if (matches.length > 0) {
            setPage(matches.length); // jump to newest match
        }
    }, [matches.length]);

    const totalPages = matches.length;

    // Correct: page 1 -> matches[0], last page -> matches[matches.length-1]
    const last = matches[page - 1] ?? null;
    if (!last) {
        return (
            <div style={styles.noData}>
                <img height={60} src="logo/logo.png" alt="logo" />
                <p>No PvP Scalpel data yet…</p>
            </div>
        );
    }

    const owner = last.players.find((p) => p.isOwner);
    const delta = owner ? (owner.postmatchMMR ?? 0) - (owner.prematchMMR ?? 0) : 0;

    const alliance = last.players.filter((p) => p.faction === 0);
    const horde = last.players.filter((p) => p.faction === 1);

    return (
        <div style={styles.wrapper}>
            <header style={styles.header}>
                <img height={60} src="logo/logo.png" alt="PvP Scalpel" />
                <h1>Match history</h1>
            </header>

            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: "16px",
                    marginBottom: "24px",
                }}>
                <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={{
                        padding: "8px 14px",
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "6px",
                        cursor: page === 1 ? "not-allowed" : "pointer",
                        opacity: page === 1 ? 0.4 : 1,
                    }}>
                    Prev
                </button>

                <span style={{ padding: "8px", color: "var(--color-text)" }}>
                    Page {page} / {totalPages}
                </span>

                <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    style={{
                        padding: "8px 14px",
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "6px",
                        cursor: page === totalPages ? "not-allowed" : "pointer",
                        opacity: page === totalPages ? 0.4 : 1,
                    }}>
                    Next
                </button>
            </div>

            <section style={styles.metaContainer}>
                <div style={styles.metaItem}>
                    <span style={styles.metaLabel}>Map</span>
                    <span style={styles.metaValue}>{last.matchDetails.mapName}</span>
                </div>

                <div style={styles.metaItem}>
                    <span style={styles.metaLabel}>Format</span>
                    <span style={styles.metaValue}>{last.matchDetails.format}</span>
                </div>

                <div style={styles.metaItem}>
                    <span style={styles.metaLabel}>Time</span>
                    <span style={styles.metaValue}>{last.matchDetails.timestamp}</span>
                </div>

                {owner && (
                    <div
                        style={{
                            ...styles.metaItem,
                            ...styles.metaMMR,
                            color: delta >= 0 ? "lime" : "red",
                        }}>
                        <span style={styles.metaLabel}>MMR Δ</span>
                        <span style={styles.metaValue}>{delta >= 0 ? `+${delta}` : delta}</span>
                    </div>
                )}

                <div style={styles.metaItem}>
                    <span style={styles.metaLabel}>Match ID</span>
                    <span style={styles.metaValue}>{last.id}</span>
                </div>
            </section>

            <section style={styles.teams}>
                <TeamTable title="Alliance" players={alliance} />
                <TeamTable title="Horde" players={horde} />
            </section>

            <MSSStatsSection players={last.players} />
        </div>
    );
}

function TeamTable({ title, players }: { title: string; players: Player[] }) {
    const [hovered, setHovered] = useState<number | null>(null);
    const { webUrl } = useUserContext();

    const rowStyle = (i: number): React.CSSProperties => ({
        ...styles.tr,
        background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
    });

const formatClass = (c?: string) =>
    c ? c[0].toUpperCase() + c.slice(1).toLowerCase() : "-";

    return (
        <div style={styles.teamBox}>
            <h3 style={styles.teamTitle}>{title}</h3>

            <table style={styles.table}>
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
                        <th>Δ MMR</th>
                        <th>Rating</th>
                    </tr>
                </thead>

                <tbody>
                    {players.map((p, i) => {
                        const delta = (p.postmatchMMR ?? 0) - (p.prematchMMR ?? 0);

                        return (
                            <tr
                                key={i}
                                style={{
                                    ...rowStyle(i),
                                    background:
                                        hovered === i
                                            ? "rgba(0,128,255,0.25)"
                                            : rowStyle(i).background,
                                    cursor: "pointer",
                                }}
                                onClick={() => open(`${webUrl}/check/eu/${p.realm}/${p.name}`)}
                                onMouseEnter={() => setHovered(i)}
                                onMouseLeave={() => setHovered(null)}>
                                <td
                                    style={{
                                        fontWeight: p.isOwner ? 700 : 400,
                                        color: classColor(p.class) 
                                    }}>
                                    {p.isOwner ? "• " : null}{p.name}
                                </td>

                                <td>{p.spec ?? "-"} ({formatClass(p.class)})</td>

                                <td>{p.kills ?? "-"}</td>
                                <td>{p.deaths ?? "-"}</td>

                                <td>{p.damage?.toLocaleString() ?? "-"}</td>
                                <td>{p.healing?.toLocaleString() ?? "-"}</td>

                                <td>{p.prematchMMR ?? "-"}</td>
                                <td>{p.postmatchMMR ?? "-"}</td>

                                <td
                                    style={{
                                        color: delta > 0 ? "lime" : delta < 0 ? "red" : "gray",
                                        fontWeight: 600,
                                    }}>
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
    );
}

function MSSStatsSection({ players }: { players: Player[] }) {
    // Collect ALL unique stat names from all players
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

    // Build grouped rows with ALL stats per player
    const grouped = players.map((p) => {
        const statsRecord: Record<string, number> = {};

        // Initialize all stats to 0
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

    // ❗ FILTER OUT PLAYERS WHERE ALL STAT VALUES = 0
    const filteredRows = grouped.filter((row) =>
        Object.values(row.stats).some((v) => v > 0)
    );

    if (filteredRows.length === 0) return null;

    return (
        <div style={styles.MSSBox}>
            <h3 style={styles.teamTitle}>Map-Specific Stats</h3>

            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Player</th>
                        {statNames.map((stat) => (
                            <th key={stat} style={styles.th}>
                                {stat}
                            </th>
                        ))}
                    </tr>
                </thead>

                <tbody>
                    {filteredRows.map((row, i) => (
                        <tr key={i} style={styles.tr}>
                            <td
                                style={{
                                    ...styles.td,
                                    color: row.isOwner ? "gold" : "white",
                                    fontWeight: row.isOwner ? 700 : 400,
                                }}>
                                {row.player}
                            </td>

                            {statNames.map((stat) => (
                                <td key={stat} style={styles.td}>
                                    {row.stats[stat]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}


function classColor(cls: string): string {
    const colors: Record<string, string> = {
        WARRIOR: "#C79C6E",
        PALADIN: "#F58CBA",
        HUNTER: "#ABD473",
        ROGUE: "#FFF569",
        PRIEST: "#FFFFFF",
        DEATHKNIGHT: "#C41F3B",
        SHAMAN: "#0070DE",
        MAGE: "#69CCF0",
        WARLOCK: "#9482C9",
        MONK: "#00FF96",
        DRUID: "#FF7D0A",
        DEMONHUNTER: "#A330C9",
        EVOKER: "#33937F",
    };
    return colors[cls] ?? "white";
}

const styles: Record<string, React.CSSProperties> = {
    wrapper: {
        color: "var(--color-text)",
        padding: "40px",
        fontFamily: "var(--font-base)",
        background: "var(--bg-main-card-char-details)",
        minHeight: "100vh",
        width: "100%",
    },

    header: {
        display: "flex",
        alignItems: "center",
        gap: "16px",
        marginBottom: "32px",
        borderBottom: `1px solid var(--divider-color)`,
        paddingBottom: "12px",
        background: "var(--bg-header)",
    },

    noData: {
        padding: "60px",
        fontSize: "22px",
        color: "var(--color-text)",
        fontFamily: "var(--font-base)",
        textAlign: "center",
        opacity: 0.85,
    },

    metaContainer: {
        display: "flex",
        flexWrap: "wrap",
        gap: "16px",
        marginBottom: "32px",
    },

    metaItem: {
        display: "flex",
        flexDirection: "column",
        padding: "14px 18px",
        minWidth: "160px",
        background: "var(--bg-row)",
        borderRadius: "var(--radius)",
        border: `1px solid var(--border-color)`,
    },

    metaLabel: {
        fontSize: "13px",
        color: "var(--color-muted)",
        marginBottom: "4px",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
    },

    metaValue: {
        fontSize: "18px",
        fontWeight: 600,
        color: "var(--color-text)",
    },

    metaMMR: {
        boxShadow: "0 0 12px rgba(0, 245, 212, 0.25)",
    },

    teams: {
        display: "flex",
        gap: "28px",
        flexDirection: "column",
    },

    teamBox: {
        flex: 1,
        background: "var(--bg-table)",
        padding: "22px",
        borderRadius: "var(--radius)",
        border: `1px solid var(--border-color)`,
        boxShadow: "0 0 12px rgba(0,0,0,0.25)",
        overflowX: "auto",
    },

    teamTitle: {
        textAlign: "center",
        marginBottom: "18px",
        fontSize: "22px",
        fontWeight: 700,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        color: "var(--color-header-accent)",
    },

    table: {
        width: "100%",
        borderCollapse: "separate",
        borderSpacing: "0",
        minWidth: "900px",
    },

    th: {
        textAlign: "left",
        padding: "10px 12px",
        borderBottom: `2px solid var(--divider-color)`,
        borderRight: `1px solid var(--border-color)`,
        fontWeight: 600,
        fontSize: "14px",
        background: "var(--bg-row-alt)",
        backdropFilter: "blur(4px)",
        color: "var(--color-text)",
    },

    tr: {
        transition: "background 0.18s ease",
    },

    td: {
        padding: "10px 12px",
        borderBottom: `1px solid var(--divider-color)`,
        borderRight: `1px solid var(--border-color)`,
        background: "var(--bg-row)",
        color: "var(--color-text)",
    },

    // MSS SECTION
    MSSBox: {
        marginTop: "32px",
        background: "var(--bg-table)",
        padding: "22px",
        borderRadius: "var(--radius)",
        border: `1px solid var(--border-color)`,
        boxShadow: "0 0 12px rgba(0,0,0,0.25)",
        overflowX: "auto",
    },
};
