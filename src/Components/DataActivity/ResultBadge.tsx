import type { MatchResult } from "./utils";
import styles from "./DataActivity.module.css";

interface ResultBadgeProps {
    result: MatchResult;
    compact?: boolean;
}

const labels: Record<MatchResult, string> = {
    win: "Win",
    loss: "Loss",
    neutral: "Neutral",
};

export default function ResultBadge({ result, compact = false }: ResultBadgeProps) {
    return (
        <span
            className={`${styles.resultBadge} ${styles[`resultBadge_${result}`]} ${
                compact ? styles.resultBadgeCompact : ""
            }`}
        >
            {labels[result]}
        </span>
    );
}
