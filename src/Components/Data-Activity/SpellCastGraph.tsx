import { useMemo } from "react";
import useSpellData from "../../Hooks/useSpellData";
import { getSpellContext } from "../../Domain/CombatDomainContext";
import type { MatchTimelineEntry } from "./types";
import { resolveIntentAttempts } from "./spellCastResolver";
import styles from "./DataActivity.module.css";

interface SpellCastGraphProps {
    timeline: MatchTimelineEntry[];
}

type CastCounts = {
    spellId: number;
    succeeded: number;
    failed: number;
    interrupted: number;
};

export default function SpellCastGraph({ timeline }: SpellCastGraphProps) {
    const spellData = useSpellData();

    const rows = useMemo(() => {
        const { resolvedAttempts } = resolveIntentAttempts(timeline);
        const map = new Map<number, CastCounts>();

        resolvedAttempts.forEach((attempt) => {
            const outcome = attempt.resolvedOutcome;
            if (!outcome) return;
            const existing = map.get(attempt.spellId) ?? {
                spellId: attempt.spellId,
                succeeded: 0,
                failed: 0,
                interrupted: 0,
            };
            existing[outcome] += 1;
            map.set(attempt.spellId, existing);
        });

        const items = Array.from(map.values())
            .map((row) => {
                const total = row.succeeded + row.failed + row.interrupted;
                const context = getSpellContext(row.spellId, spellData);
                return {
                    ...row,
                    total,
                    name: context.name ?? `Spell ${row.spellId}`,
                    icon: context.icon,
                    type: context.type ?? "unknown",
                };
            })
            .filter((row) => row.total > 0)
            .sort((a, b) => b.total - a.total);

        return items;
    }, [timeline, spellData]);

    if (rows.length === 0) return null;

    const maxTotal = rows[0]?.total ?? 1;

    const resolveIconUrl = (icon?: string) => {
        if (!icon) return null;
        if (icon.startsWith("http") || icon.startsWith("/") || icon.includes(".")) {
            return icon;
        }
        if (/^\d+$/.test(icon)) {
            return `https://render.worldofwarcraft.com/us/icons/56/${icon}.jpg`;
        }
        return `https://render.worldofwarcraft.com/us/icons/56/${icon}.jpg`;
    };

    return (
        <div className={styles.spellGraphShell}>
            <div className={styles.spellGraph}>
                {rows.map((row) => {
                    const barWidth = `${(row.total / maxTotal) * 100}%`;
                    const total = row.total || 1;
                    const successWidth = `${(row.succeeded / total) * 100}%`;
                    const failWidth = `${(row.failed / total) * 100}%`;
                    const interruptWidth = `${(row.interrupted / total) * 100}%`;
                    const iconUrl = resolveIconUrl(row.icon);

                    return (
                        <div key={row.spellId} className={styles.spellRow} tabIndex={0}>
                            <div className={styles.spellInfo}>
                                {iconUrl ? (
                                    <img
                                        className={styles.spellIcon}
                                        src={iconUrl}
                                        alt=""
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className={styles.spellIconFallback}>
                                        {row.name.slice(0, 1).toUpperCase()}
                                    </div>
                                )}
                                <span className={styles.spellName}>{row.name}</span>
                            </div>

                            <div className={styles.spellBarTrack}>
                                <div className={styles.spellBarFill} style={{ width: barWidth }}>
                                    {row.succeeded > 0 ? (
                                        <span
                                            className={`${styles.spellSeg} ${styles.spellSegSuccess}`}
                                            style={{ width: successWidth }}
                                        />
                                    ) : null}
                                    {row.failed > 0 ? (
                                        <span
                                            className={`${styles.spellSeg} ${styles.spellSegFail}`}
                                            style={{ width: failWidth }}
                                        />
                                    ) : null}
                                    {row.interrupted > 0 ? (
                                        <span
                                            className={`${styles.spellSeg} ${styles.spellSegInterrupt}`}
                                            style={{ width: interruptWidth }}
                                        />
                                    ) : null}
                                </div>
                            </div>

                            <span className={styles.spellCount}>{row.total}</span>

                            <div className={styles.spellTooltip} role="tooltip">
                                <div className={styles.spellTooltipTitle}>
                                    {iconUrl ? (
                                        <img
                                            className={styles.spellTooltipIcon}
                                            src={iconUrl}
                                            alt=""
                                            loading="lazy"
                                        />
                                    ) : null}
                                    <span>{row.name}</span>
                                </div>
                                <div className={styles.spellTooltipRow}>
                                    <span>Succeeded</span>
                                    <span>{row.succeeded}</span>
                                </div>
                                <div className={styles.spellTooltipRow}>
                                    <span>Failed</span>
                                    <span>{row.failed}</span>
                                </div>
                                <div className={styles.spellTooltipRow}>
                                    <span>Interrupted</span>
                                    <span>{row.interrupted}</span>
                                </div>
                                <div className={styles.spellTooltipRow}>
                                    <span>Total</span>
                                    <span>{row.total}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
