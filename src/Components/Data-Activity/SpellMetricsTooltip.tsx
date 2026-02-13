import { createPortal } from "react-dom";
import type { RefObject } from "react";
import styles from "./DataActivity.module.css";
import type { SpellMetricRow } from "./spellMetrics.utils";

export type TooltipPosition = {
    top: number;
    left: number;
};

type SpellTooltipPayload = {
    kind: "spell";
    title: string;
    iconUrl?: string | null;
    impactValue: string;
    impactLabel: string;
    castsValue: string;
    avgValue: string;
    shareValue: string;
    successful: number;
    interrupted: number;
    failed: number;
    description?: string | null;
};

type PlayerTooltipPayload = {
    kind: "player";
    title: string;
    subtitle: string;
    totalValue: string;
    rows: Array<{
        spellId: number;
        name: string;
        iconUrl?: string | null;
        value: string;
        widthPct: number;
    }>;
    emptyLabel: string;
};

export type SpellMetricsTooltipPayload = SpellTooltipPayload | PlayerTooltipPayload;

interface SpellMetricsTooltipProps {
    payload: SpellMetricsTooltipPayload | null;
    position: TooltipPosition | null;
    tooltipRef?: RefObject<HTMLDivElement | null>;
}

const formatBarWidth = (widthPct: number) => `${Math.max(0, Math.min(100, widthPct))}%`;

export const toPlayerTooltipRows = (
    rows: SpellMetricRow[],
    resolveIconUrl: (icon?: string) => string | null
) => {
    const maxValue = rows[0]?.value ?? 1;
    return rows.slice(0, 6).map((row) => ({
        spellId: row.spellId,
        name: row.name,
        iconUrl: resolveIconUrl(row.icon),
        value: row.value.toLocaleString(),
        widthPct: maxValue > 0 ? (row.value / maxValue) * 100 : 0,
    }));
};

export default function SpellMetricsTooltip({ payload, position, tooltipRef }: SpellMetricsTooltipProps) {
    if (!payload) return null;

    const node =
        payload.kind === "spell" ? (
            <div
                ref={tooltipRef}
                className={`${styles["spell-tooltip"]} ${styles.spellTooltipPortal}`}
                role="tooltip"
                style={{
                    top: position?.top ?? 0,
                    left: position?.left ?? 0,
                    visibility: position ? "visible" : "hidden",
                }}
            >
                <header className={styles["spell-tooltip__header"]}>
                    {payload.iconUrl ? (
                        <img
                            className={styles["spell-tooltip__icon"]}
                            src={payload.iconUrl}
                            alt=""
                            loading="lazy"
                        />
                    ) : null}
                    <h3 className={styles["spell-tooltip__title"]}>{payload.title}</h3>
                </header>

                <section className={styles["spell-tooltip__impact"]}>
                    <span className={styles["spell-tooltip__impact-value"]}>{payload.impactValue}</span>
                    <span className={styles["spell-tooltip__impact-label"]}>{payload.impactLabel}</span>
                </section>

                <section className={styles["spell-tooltip__context"]}>
                    <div className={styles.metric}>
                        <span className={styles["metric__value"]}>{payload.castsValue}</span>
                        <span className={styles["metric__label"]}>Casts</span>
                    </div>
                    <div className={styles.metric}>
                        <span className={styles["metric__value"]}>{payload.avgValue}</span>
                        <span className={styles["metric__label"]}>Avg</span>
                    </div>
                    <div className={styles.metric}>
                        <span className={styles["metric__value"]}>{payload.shareValue}</span>
                        <span className={styles["metric__label"]}>Share</span>
                    </div>
                </section>

                <section className={styles["spell-tooltip__execution"]}>
                    <h4 className={styles["section-title"]}>Usage</h4>
                    <ul className={styles["spell-tooltip__list"]}>
                        <li>Successful: {payload.successful}</li>
                        <li>Interrupted: {payload.interrupted}</li>
                        <li>Failed: {payload.failed}</li>
                    </ul>
                </section>

                {payload.description ? (
                    <section className={styles["spell-tooltip__ability"]}>
                        <h4 className={styles["section-title"]}>Ability</h4>
                        <p className={styles["spell-tooltip__desc"]}>{payload.description}</p>
                    </section>
                ) : null}
            </div>
        ) : (
            <div
                ref={tooltipRef}
                className={`${styles["spell-tooltip"]} ${styles.spellTooltipPortal}`}
                role="tooltip"
                style={{
                    top: position?.top ?? 0,
                    left: position?.left ?? 0,
                    visibility: position ? "visible" : "hidden",
                }}
            >
                <header className={styles["spell-tooltip__header"]}>
                    <h3 className={styles["spell-tooltip__title"]}>{payload.title}</h3>
                </header>

                <section className={styles["spell-tooltip__impact"]}>
                    <span className={styles["spell-tooltip__impact-value"]}>{payload.totalValue}</span>
                    <span className={styles["spell-tooltip__impact-label"]}>{payload.subtitle}</span>
                </section>

                {payload.rows.length > 0 ? (
                    <section className={styles.playerTooltipRows}>
                        {payload.rows.map((row) => (
                            <div key={row.spellId} className={styles.playerTooltipRow}>
                                <div className={styles.playerTooltipName}>
                                    {row.iconUrl ? (
                                        <img
                                            className={styles["spell-tooltip__icon"]}
                                            src={row.iconUrl}
                                            alt=""
                                            loading="lazy"
                                        />
                                    ) : (
                                        <span className={styles.playerTooltipFallback}>
                                            {row.name.slice(0, 1).toUpperCase()}
                                        </span>
                                    )}
                                    <span>{row.name}</span>
                                </div>
                                <div className={styles.playerTooltipBar}>
                                    <span
                                        className={styles.playerTooltipFill}
                                        style={{ width: formatBarWidth(row.widthPct) }}
                                    />
                                </div>
                                <span className={styles.playerTooltipValue}>{row.value}</span>
                            </div>
                        ))}
                    </section>
                ) : (
                    <section className={styles["spell-tooltip__ability"]}>
                        <p className={styles["spell-tooltip__desc"]}>{payload.emptyLabel}</p>
                    </section>
                )}
            </div>
        );

    return createPortal(node, document.body);
}
