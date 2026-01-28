import EmptyState from "../EmptyState/EmptyState";
import MatchHistoryRow from "./MatchHistoryRow";
import styles from "./DataActivity.module.css";
import type { MatchSummary } from "./utils";

interface MatchHistoryListProps {
    matches: MatchSummary[];
    selectedId: string | null;
    isLoading: boolean;
    errorMessage?: string | null;
    onSelect: (match: MatchSummary) => void;
}

export default function MatchHistoryList({
    matches,
    selectedId,
    isLoading,
    errorMessage,
    onSelect,
}: MatchHistoryListProps) {
    if (errorMessage) {
        return <div className={styles.inlineError}>{errorMessage}</div>;
    }

    if (isLoading) {
        return (
            <div className={styles.skeletonList}>
                {Array.from({ length: 6 }).map((_, idx) => (
                    <div key={idx} className={styles.skeletonRow} />
                ))}
            </div>
        );
    }

    if (matches.length === 0) {
        return (
            <EmptyState
                title="No matches recorded yet"
                description="Play a match and your history will populate automatically."
            />
        );
    }

    return (
        <div className={styles.historyList}>
            {matches.map((match) => (
                <MatchHistoryRow
                    key={match.id}
                    summary={match}
                    selected={match.id === selectedId}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
}
