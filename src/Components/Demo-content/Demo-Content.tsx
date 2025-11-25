import { useState } from "react";
import useMatches from "../../Hooks/useMatches";
import { MatchWithId, Player } from "../../Interfaces/matches";

export default function DemoContent() {
    const matches = useMatches();
    const last: MatchWithId | undefined = matches.at(-1);

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
                <h1>Last Match</h1>
            </header>

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
        </div>
    );
}

function TeamTable({ title, players }: { title: string; players: Player[] }) {
    const [hovered, setHovered] = useState<number | null>(null);

    const rowStyle = (i: number): React.CSSProperties => ({
        ...styles.tr,
        background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
    });

    return (
        <div style={styles.teamBox}>
            <h3 style={styles.teamTitle}>{title}</h3>

            <table style={styles.table}>
                <thead>
                    <tr>
                        <th>Player</th>
                        <th>Class</th>
                        <th>Spec</th>
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
                                onMouseEnter={() => setHovered(i)}
                                onMouseLeave={() => setHovered(null)}>
                                <td
                                    style={{
                                        color: p.isOwner ? "gold" : "white",
                                        fontWeight: p.isOwner ? 700 : 400,
                                    }}>
                                    {p.name}
                                </td>

                                <td style={{ color: classColor(p.class) }}>{p.class}</td>
                                <td>{p.spec ?? "-"}</td>

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
        color: "white",
        padding: "40px",
        fontFamily: "Segoe UI, sans-serif",
        background: "linear-gradient(180deg, #0b0f17 0%, #111827 100%)",
        minHeight: "100vh",
    },
    header: {
        display: "flex",
        alignItems: "center",
        gap: "16px",
        marginBottom: "32px",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        paddingBottom: "12px",
    },
    noData: {
        padding: "60px",
        fontSize: "22px",
        color: "white",
        fontFamily: "Segoe UI, sans-serif",
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
        background: "rgba(255,255,255,0.06)",
        borderRadius: "8px",
        border: "1px solid rgba(255,255,255,0.1)",
    },

    metaLabel: {
        fontSize: "13px",
        opacity: 0.6,
        marginBottom: "4px",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
    },

    metaValue: {
        fontSize: "18px",
        fontWeight: 600,
    },

    metaMMR: {
        boxShadow: "0 0 12px rgba(0,255,0,0.15)",
    },

    teams: {
        display: "flex",
        gap: "28px",
        flexDirection: "column",
    },
    teamBox: {
        flex: 1,
        background: "rgba(255,255,255,0.04)",
        padding: "22px",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.08)",
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
        borderBottom: "2px solid rgba(255,255,255,0.18)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        fontWeight: 600,
        fontSize: "14px",
        background: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(4px)",
    },
    tr: {
        transition: "background 0.18s ease",
    },
    td: {
        padding: "10px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(0,0,0,0.22)",
    },
};
