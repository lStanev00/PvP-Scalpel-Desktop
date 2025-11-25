// import { useEffect } from "react";
// import useUserContext from "./Hooks/useUserContext";
import useMatches from "./Hooks/useMatches";
import { MatchWithId, Player } from "./Interfaces/matches";

export default function App() {
    // const { httpFetch } = useUserContext();
    const matches = useMatches();
    const last: MatchWithId | undefined = matches.at(-1);

    // useEffect(() => {
    //     httpFetch("/verify/me").then(console.info).catch(console.error);
    // }, [httpFetch]);

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

            <section style={styles.meta}>
                <p>
                    <b>Map:</b> {last.matchDetails.mapName}
                </p>
                <p>
                    <b>Format:</b> {last.matchDetails.format}
                </p>
                <p>
                    <b>Time:</b> {last.matchDetails.timestamp}
                </p>

                {owner && (
                    <p
                        style={{
                            ...styles.mmr,
                            color: delta >= 0 ? "lime" : "red",
                        }}>
                        MMR Change: {delta >= 0 ? `+${delta}` : delta}
                    </p>
                )}
                <p>ID: {last.id}</p>
            </section>

            <section style={styles.teams}>
                <TeamTable title="Alliance" players={alliance} />
                <TeamTable title="Horde" players={horde} />
            </section>
        </div>
    );
}

function TeamTable({ title, players }: { title: string; players: Player[] }) {
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
                            <tr key={i}>
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
        padding: "30px",
        fontFamily: "Segoe UI, sans-serif",
    },
    header: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        marginBottom: "20px",
    },
    noData: {
        padding: "40px",
        fontSize: "20px",
        color: "white",
        fontFamily: "Segoe UI, sans-serif",
    },
    meta: {
        fontSize: "18px",
        lineHeight: "1.6",
        marginBottom: "30px",
    },
    mmr: {
        fontSize: "22px",
        fontWeight: 700,
        marginTop: "10px",
    },
    teams: {
        display: "flex",
        gap: "25px",
        flexDirection: "column",
    },
    teamBox: {
        flex: 1,
        background: "rgba(255,255,255,0.07)",
        padding: "18px",
        borderRadius: "10px",
    },
    teamTitle: {
        textAlign: "center",
        marginBottom: "12px",
        fontSize: "20px",
        fontWeight: 600,
    },
    table: {
        width: "100%",
        borderCollapse: "collapse",
    },
    th: {
        textAlign: "left",
        paddingBottom: "6px",
        borderBottom: "1px solid rgba(255,255,255,0.2)",
    },
    tr: {
        height: "30px",
    },
    td: {
        padding: "6px 0",
    },
};
