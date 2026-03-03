import { LuTrophy } from "react-icons/lu";
import styles from "./CompetitiveProfileCard.module.css";

type TrendTone = "up" | "down" | "flat";

interface CompetitiveProfileCardProps {
    peakMmr: number | null;
    peakMmrPlayer: string | null;
    peakMmrBracket: string | null;
    peakRating: number | null;
    peakRatingPlayer: string | null;
    peakRatingBracket: string | null;
    ratedWinRate: number | null;
    ratedRecord: string | null;
    trendLabel: string | null;
    trendTone: TrendTone;
}

const getRankLabel = (value: number | null) => {
    if (value === null) return "Unranked";
    if (value >= 2400) return "Elite";
    if (value >= 2100) return "Duelist";
    if (value >= 1800) return "Rival";
    if (value >= 1600) return "Challenger";
    if (value >= 1400) return "Combatant";
    return "Unranked";
};

export default function CompetitiveProfileCard({
    peakMmr,
    peakMmrPlayer,
    peakMmrBracket,
    peakRating,
    peakRatingPlayer,
    peakRatingBracket,
    ratedWinRate,
    ratedRecord,
    trendLabel,
    trendTone,
}: CompetitiveProfileCardProps) {
    const hasData = peakMmr !== null || peakRating !== null;

    if (!hasData) {
        return (
            <article className={`${styles.card} ${styles.empty}`}>
                <div className={styles.title}>Competitive Profile</div>
                <div className={styles.emptyBody}>
                    <LuTrophy className={styles.emptyIcon} aria-hidden="true" />
                    <div className={styles.emptyTitle}>No rated matches recorded yet</div>
                    <div className={styles.emptyText}>Play your first rated match.</div>
                </div>
            </article>
        );
    }

    const primaryValue = peakMmr ?? peakRating;
    const primaryRank = getRankLabel(primaryValue);
    const primaryBracket = peakMmrBracket ?? peakRatingBracket ?? "Rated PvP";

    return (
        <article className={styles.card}>
            <div className={styles.titleRow}>
                <div className={styles.title}>Competitive Profile</div>
                <span className={styles.rankBadge}>{primaryRank}</span>
            </div>

            <div className={styles.primaryValue}>
                {primaryValue?.toLocaleString()} <span>MMR</span>
            </div>
            <div className={styles.primaryMeta}>{primaryBracket}</div>

            <div className={styles.metricGrid}>
                <div className={styles.metric}>
                    <div className={styles.metricLabel}>Peak Rating</div>
                    <div className={styles.metricValue}>
                        {peakRating === null ? "--" : peakRating.toLocaleString()}
                    </div>
                    <div className={styles.metricDetail}>
                        {peakRatingPlayer ?? "Unknown"}{peakRatingBracket ? ` • ${peakRatingBracket}` : ""}
                    </div>
                </div>
                <div className={styles.metric}>
                    <div className={styles.metricLabel}>Lifetime Best MMR</div>
                    <div className={styles.metricValue}>
                        {peakMmr === null ? "--" : peakMmr.toLocaleString()}
                    </div>
                    <div className={styles.metricDetail}>
                        {peakMmrPlayer ?? "Unknown"}{peakMmrBracket ? ` • ${peakMmrBracket}` : ""}
                    </div>
                </div>
            </div>

            <div className={styles.footer}>
                <span>
                    Winrate:{" "}
                    {ratedWinRate === null
                        ? "--"
                        : `${ratedWinRate}%${ratedRecord ? ` (${ratedRecord})` : ""}`}
                </span>
                <span
                    className={`${styles.trend} ${
                        trendTone === "up"
                            ? styles.trendUp
                            : trendTone === "down"
                              ? styles.trendDown
                              : styles.trendFlat
                    }`}
                >
                    {trendLabel ?? "--"}
                </span>
            </div>
        </article>
    );
}
