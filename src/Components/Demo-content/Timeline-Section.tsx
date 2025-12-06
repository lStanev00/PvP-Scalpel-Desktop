import { TimelineEntry } from "../../Interfaces/matches";

interface Props {
    timeline: TimelineEntry[];
}

const GRAPH_WIDTH = 600;
const GRAPH_HEIGHT = 160;

export default function TimelineSection({ timeline }: Props) {
    if (!timeline || timeline.length === 0) {
        return (
            <div style={styles.empty}>
                <p>No timeline events recorded for this match.</p>
            </div>
        );
    }

    function norm(v: number | null | undefined): number | null {
        if (v === null || v === undefined || isNaN(v)) return null;
        return Math.min(1, Math.max(0, v)); // clamp between 0–1
    }

    const sorted = [...timeline].sort((a, b) => a.t - b.t);
    const maxT = sorted[sorted.length - 1].t || 1;

    const hpPoints = sorted
        .map((e) => {
            const hp = norm(e.hp);
            if (hp === null) return null;

            const x = (e.t / maxT) * GRAPH_WIDTH;
            const y = GRAPH_HEIGHT - hp * GRAPH_HEIGHT;
            return `${x},${y}`;
        })
        .filter(Boolean)
        .join(" ");

    const powerPoints = sorted
        .map((e) => {
            const p = norm(e.power);
            if (p === null) return null;

            const x = (e.t / maxT) * GRAPH_WIDTH;
            const y = GRAPH_HEIGHT - e.power! * GRAPH_HEIGHT;
            return `${x},${y}`;
        })
        .filter(Boolean)
        .join(" ");

    return (
        <div style={styles.box}>
            <h3 style={styles.title}>Match Timeline</h3>

            {/* GRAPH */}
            <div style={styles.graphWrapper}>
                <svg
                    viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                    style={styles.svg}
                    preserveAspectRatio="none">
                    {/* background */}
                    <rect
                        x={0}
                        y={0}
                        width={GRAPH_WIDTH}
                        height={GRAPH_HEIGHT}
                        fill="rgba(0,0,0,0.35)"
                    />

                    {/* horizontal grid lines */}
                    {[0.25, 0.5, 0.75, 1].map((p) => {
                        const y = GRAPH_HEIGHT - GRAPH_HEIGHT * p;
                        return (
                            <line
                                key={p}
                                x1={0}
                                x2={GRAPH_WIDTH}
                                y1={y}
                                y2={y}
                                stroke="rgba(255,255,255,0.06)"
                                strokeWidth={1}
                            />
                        );
                    })}

                    {/* HP line */}
                    {hpPoints && (
                        <polyline points={hpPoints} fill="none" stroke="#00ff7f" strokeWidth={2} />
                    )}

                    {/* Power line */}
                    {powerPoints && (
                        <polyline
                            points={powerPoints}
                            fill="none"
                            stroke="#00bfff"
                            strokeWidth={2}
                        />
                    )}
                </svg>

                <div style={styles.legend}>
                    <span style={{ color: "#00ff7f", fontSize: 12 }}>HP%</span>
                    <span style={{ color: "#00bfff", fontSize: 12 }}>Power%</span>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>Duration: {maxT.toFixed(1)}s</span>
                </div>
            </div>

            {/* TABLE */}
            <div style={styles.tableWrapper}>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Time (s)</th>
                            <th style={styles.th}>Event</th>
                            <th style={styles.th}>Spell ID</th>
                            <th style={styles.th}>HP%</th>
                            <th style={styles.th}>Power%</th>
                            <th style={styles.th}>GUID</th>
                        </tr>
                    </thead>

                    <tbody>
                        {sorted.map((e, i) => {
                            if (e.t > 0)
                                return (
                                    <tr key={i} style={styles.row}>
                                        <td style={styles.td}>{e.t.toFixed(2)}</td>
                                        <td style={{ ...styles.td, color: colorEvent(e.event) }}>
                                            {e.event}
                                        </td>
                                        <td style={styles.td}>{e.spellID}</td>
                                        <td style={styles.td}>
                                            {e.hp !== null ? `${(e.hp * 100).toFixed(0)}%` : "-"}
                                        </td>
                                        <td style={styles.td}>
                                            {e.power !== null
                                                ? `${(e.power * 100).toFixed(0)}%`
                                                : "-"}
                                        </td>
                                        <td style={styles.tdSmall}>{e.castGUID}</td>
                                    </tr>
                                );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const colorEvent = (event: string) => {
    switch (event) {
        case "SUCCEEDED":
            return "lime";
        case "FAILED":
            return "red";
        case "INTERRUPTED":
            return "#ff4444";
        case "START":
            return "#55aaff";
        case "STOP":
            return "#aaaaaa";
        case "CHANNEL_START":
            return "#ffa500";
        case "CHANNEL_STOP":
            return "#ffbb33";
        default:
            return "white";
    }
};

const styles: Record<string, React.CSSProperties> = {
    box: {
        background: "var(--bg-table)",
        marginTop: "32px",
        padding: "22px",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border-color)",
        boxShadow: "0 0 12px rgba(0,0,0,0.25)",
    },
    title: {
        marginBottom: "16px",
        fontSize: "20px",
        fontWeight: 700,
        textAlign: "center",
        letterSpacing: "0.5px",
        textTransform: "uppercase",
    },
    graphWrapper: {
        marginBottom: "18px",
    },
    svg: {
        width: "100%",
        height: "180px",
        borderRadius: "8px",
        overflow: "hidden",
    },
    legend: {
        display: "flex",
        justifyContent: "space-between",
        marginTop: "6px",
        paddingInline: "4px",
    },
    tableWrapper: {
        maxHeight: "450px",
        overflowY: "auto",
        marginTop: "8px",
    },
    table: {
        width: "100%",
        borderCollapse: "collapse",
        minWidth: "900px",
    },
    th: {
        padding: "10px",
        textAlign: "left",
        borderBottom: "2px solid var(--divider-color)",
        background: "var(--bg-row-alt)",
        fontSize: "14px",
    },
    row: {
        borderBottom: "1px solid var(--divider-color)",
        transition: "background 0.15s",
    },
    td: {
        padding: "8px 10px",
        color: "var(--color-text)",
        fontSize: "13px",
    },
    tdSmall: {
        padding: "8px 10px",
        fontSize: "10px",
        opacity: 0.6,
        color: "var(--color-text)",
        wordBreak: "break-all",
        maxWidth: "320px",
    },
    empty: {
        padding: "20px",
        textAlign: "center",
        opacity: 0.7,
    },
};
