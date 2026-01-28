import type { MatchTimelineEntry } from "./types";
import styles from "./TimelineSection.module.css";

interface Props {
    timeline: MatchTimelineEntry[];
}

const GRAPH_WIDTH = 600;
const GRAPH_HEIGHT = 160;

export default function TimelineSection({ timeline }: Props) {
    if (!timeline || timeline.length === 0) {
        return (
            <div className={styles.empty}>
                <p>No timeline events recorded for this match.</p>
            </div>
        );
    }

    function norm(v: number | null | undefined): number | null {
        if (v === null || v === undefined || isNaN(v)) return null;
        return Math.min(1, Math.max(0, v));
    }

    const sorted = [...timeline].sort((a, b) => a.t - b.t);
    const maxT = sorted[sorted.length - 1].t || 1;

    const hasHpData = sorted.some((e) => norm(e.hp) !== null);
    const hasPowerData = sorted.some((e) => norm(e.power) !== null);

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
            const y = GRAPH_HEIGHT - p * GRAPH_HEIGHT;
            return `${x},${y}`;
        })
        .filter(Boolean)
        .join(" ");

    return (
        <div className={styles.box}>
            <h3 className={styles.title}>Match Timeline</h3>

            {hasHpData || hasPowerData ? (
                <div className={styles.graphWrapper}>
                    <svg
                        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                        className={styles.svg}
                        preserveAspectRatio="none"
                    >
                        <rect
                            className={styles.graphBg}
                            x={0}
                            y={0}
                            width={GRAPH_WIDTH}
                            height={GRAPH_HEIGHT}
                        />

                        {[0.25, 0.5, 0.75, 1].map((p) => {
                            const y = GRAPH_HEIGHT - GRAPH_HEIGHT * p;
                            return (
                                <line
                                    key={p}
                                    className={styles.gridLine}
                                    x1={0}
                                    x2={GRAPH_WIDTH}
                                    y1={y}
                                    y2={y}
                                />
                            );
                        })}

                        {hasHpData && hpPoints ? (
                            <polyline points={hpPoints} className={styles.hpLine} />
                        ) : null}

                        {hasPowerData && powerPoints ? (
                            <polyline points={powerPoints} className={styles.powerLine} />
                        ) : null}
                    </svg>

                    <div className={styles.legend}>
                        {hasHpData ? <span className={styles.legendHp}>HP%</span> : null}
                        {hasPowerData ? <span className={styles.legendPower}>Power%</span> : null}
                        <span className={styles.legendDuration}>
                            Duration: {maxT.toFixed(1)}s
                        </span>
                    </div>
                </div>
            ) : null}

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Time (s)</th>
                            <th>Event</th>
                            <th>Spell ID</th>
                            {hasHpData ? <th>HP%</th> : null}
                            {hasPowerData ? <th>Power%</th> : null}
                            <th>GUID</th>
                        </tr>
                    </thead>

                    <tbody>
                        {sorted.map((e, i) => {
                            if (e.t > 0) {
                                const hp = e.hp ?? null;
                                const power = e.power ?? null;
                                return (
                                    <tr key={i}>
                                        <td>{e.t.toFixed(2)}</td>
                                        <td className={eventClass(e.event, styles)}>{e.event}</td>
                                        <td>{e.spellID ?? "-"}</td>
                                        {hasHpData ? (
                                            <td>
                                                {hp !== null ? `${(hp * 100).toFixed(0)}%` : "-"}
                                            </td>
                                        ) : null}
                                        {hasPowerData ? (
                                            <td>
                                                {power !== null
                                                    ? `${(power * 100).toFixed(0)}%`
                                                    : "-"}
                                            </td>
                                        ) : null}
                                        <td className={styles.guid}>{e.castGUID ?? "-"}</td>
                                    </tr>
                                );
                            }
                            return null;
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function eventClass(event: string, css: Record<string, string>) {
    switch (event) {
        case "SUCCEEDED":
            return `${css.event} ${css.eventSuccess}`;
        case "FAILED":
            return `${css.event} ${css.eventFail}`;
        case "INTERRUPTED":
            return `${css.event} ${css.eventInterrupt}`;
        case "START":
            return `${css.event} ${css.eventStart}`;
        case "STOP":
            return `${css.event} ${css.eventStop}`;
        case "CHANNEL_START":
            return `${css.event} ${css.eventChannelStart}`;
        case "CHANNEL_STOP":
            return `${css.event} ${css.eventChannelStop}`;
        default:
            return css.event;
    }
}
