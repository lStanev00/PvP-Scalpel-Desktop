import useUserContext from "../../Hooks/useUserContext";
import { openUrl } from "../../Helpers/open";
import { getClassColor } from "../../Domain/CombatDomainContext";
import type { MatchPlayer } from "./types";
import styles from "./DataActivity.module.css";

interface TeamTableProps {
    title: string;
    players: MatchPlayer[];
    showRating?: boolean;
}

export default function TeamTable({ title, players, showRating = true }: TeamTableProps) {
    const { webUrl } = useUserContext();

    const formatClass = (c?: string) => (c ? c[0].toUpperCase() + c.slice(1).toLowerCase() : "-");

    const hasNonZero = (key: keyof MatchPlayer) =>
        players.some((p) => {
            const raw = p[key] as number | null | undefined;
            return typeof raw === "number" && !Number.isNaN(raw) && raw !== 0;
        });

    const showPreMMR = hasNonZero("prematchMMR");
    const showPostMMR = hasNonZero("postmatchMMR");
    const showMMRDelta = hasNonZero("ratingChange") || players.some((p) => {
        const pre = p.prematchMMR ?? 0;
        const post = p.postmatchMMR ?? 0;
        return typeof pre === "number" && typeof post === "number" && post - pre !== 0;
    });

    const columns: Array<{ label: string; width: string }> = [
        { label: "Player", width: "160px" },
        { label: "Spec(Class)", width: "200px" },
        { label: "Kills", width: "80px" },
        { label: "Deaths", width: "80px" },
        { label: "Damage", width: "120px" },
        { label: "Healing", width: "120px" },
    ];
    if (showPreMMR) columns.push({ label: "Pre-MMR", width: "90px" });
    if (showPostMMR) columns.push({ label: "Post-MMR", width: "90px" });
    if (showMMRDelta) columns.push({ label: "MMR", width: "80px" });
    if (showRating) columns.push({ label: "Rating", width: "90px" });

    const handleRowAction = (realm?: string, name?: string) => {
        if (!realm || !name) return;
        openUrl(`${webUrl}/check/eu/${realm}/${name}`);
    };

    return (
        <div className={styles.teamBox}>
            <h3 className={styles.teamTitle}>{title}</h3>
            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <colgroup>
                        {columns.map((column) => (
                            <col key={column.label} style={{ width: column.width }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            {columns.map((column) => (
                                <th key={column.label}>{column.label}</th>
                            ))}
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
                            const classColor = getClassColor(p.class);
                            const rating = p.rating ?? null;
                            const ratingChange = p.ratingChange ?? null;
                            const ratingText = rating === null ? "-" : String(rating);
                            const changeText =
                                ratingChange === null
                                    ? ""
                                    : ` (${ratingChange > 0 ? `+${ratingChange}` : ratingChange})`;

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
                                        className={`${styles.playerCell} ${
                                            p.isOwner ? styles.owner : ""
                                        }`}
                                        style={classColor ? { color: classColor } : undefined}
                                    >
                                        {p.name ?? "-"}
                                    </td>
                                    <td>
                                        {p.spec ?? "-"} ({formatClass(p.class)})
                                    </td>
                                    <td>{p.kills ?? "-"}</td>
                                    <td>{p.deaths ?? "-"}</td>
                                    <td>{p.damage?.toLocaleString?.() ?? "-"}</td>
                                    <td>{p.healing?.toLocaleString?.() ?? "-"}</td>
                                    {showPreMMR ? <td>{p.prematchMMR ?? "-"}</td> : null}
                                    {showPostMMR ? <td>{p.postmatchMMR ?? "-"}</td> : null}
                                    {showMMRDelta ? (
                                        <td className={`${styles.deltaCell} ${deltaStyle}`}>
                                            {delta > 0 ? `+${delta}` : delta}
                                        </td>
                                    ) : null}
                                    {showRating ? (
                                        <td>
                                            {ratingText}
                                            {changeText}
                                        </td>
                                    ) : null}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

