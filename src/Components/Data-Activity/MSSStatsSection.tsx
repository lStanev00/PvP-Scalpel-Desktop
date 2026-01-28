import type { MatchPlayer } from "./types";
import styles from "./DataActivity.module.css";

interface MSSStatsSectionProps {
    players: MatchPlayer[];
}

export default function MSSStatsSection({ players }: MSSStatsSectionProps) {
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
            player: p.name ?? "-",
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
