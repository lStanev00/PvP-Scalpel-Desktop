import { useMemo } from "react";
import TeamTable from "./TeamTable";
import MSSStatsSection from "./MSSStatsSection";
import SpellCastGraph from "./SpellCastGraph";
import DebugSpellInspector from "./DebugSpellInspector";
import type { MatchSummary } from "./utils";
import type { MatchPlayer, MatchTimelineEntry } from "./types";
import styles from "./DataActivity.module.css";

interface MatchDetailsPanelProps {
    match: MatchSummary | null;
    isLoading: boolean;
    onBack?: () => void;
}

export default function MatchDetailsPanel({
    match,
    isLoading,
    onBack,
}: MatchDetailsPanelProps) {
    const content = useMemo(() => {
        if (!match) return null;
        const players = (match.raw.players ?? []) as MatchPlayer[];
        const timeline = (match.raw.timeline ?? []) as MatchTimelineEntry[];
        const isSoloShuffle = (match.raw.matchDetails?.format ?? "")
            .toLowerCase()
            .includes("solo shuffle");
        const alliance = players.filter((p) => p.faction === 0);
        const horde = players.filter((p) => p.faction === 1);
        const showFactions = !isSoloShuffle && alliance.length > 0 && horde.length > 0;
        const playersTitle = isSoloShuffle ? "Solo Shuffle Lobby" : "Players";

        return {
            players,
            timeline,
            isSoloShuffle,
            alliance,
            horde,
            showFactions,
            playersTitle,
        };
    }, [match]);

    if (isLoading && !match) {
        return (
            <section className={styles.detailsCard}>
                <div className={styles.detailsSkeleton} />
            </section>
        );
    }

    if (!match || !content) {
        return (
            <section className={styles.detailsCard}>
                <div className={styles.detailsEmpty}>
                    <h3>No match selected</h3>
                    <p>Pick a match from the history to see details.</p>
                </div>
            </section>
        );
    }

    const deltaClass =
        match.delta === null
            ? styles.deltaNeutral
            : match.delta > 0
              ? styles.deltaPositive
              : match.delta < 0
                ? styles.deltaNegative
                : styles.deltaNeutral;

    const showDebug = import.meta.env.DEV;

    return (
        <section className={styles.detailsCard}>
            {onBack ? (
                <button type="button" className={styles.backButton} onClick={onBack}>
                    Back to history
                </button>
            ) : null}
            <div className={styles.detailsHeader}>
                <div>
                    <h3 className={styles.detailsTitle}>{match.mapName}</h3>
                    <p className={styles.detailsMeta}>
                        {match.timestampLabel} - {match.durationLabel}
                    </p>
                </div>
                <div className={styles.detailsStats}>
                    <div className={styles.detailStat}>
                        <span className={styles.detailLabel}>MMR Delta</span>
                        <span className={`${styles.detailValue} ${deltaClass}`}>
                            {match.deltaLabel}
                        </span>
                    </div>
                    <div className={styles.detailStat}>
                        <span className={styles.detailLabel}>Match ID</span>
                        <span className={styles.detailMono}>{match.id}</span>
                    </div>
                </div>
            </div>

            <div className={styles.detailsBody}>
                {content.showFactions ? (
                    <div className={styles.teamGrid}>
                        <TeamTable title="Alliance" players={content.alliance} />
                        <TeamTable title="Horde" players={content.horde} />
                    </div>
                ) : (
                    <TeamTable title={content.playersTitle} players={content.players} />
                )}

                <MSSStatsSection players={content.players} />
                <SpellCastGraph timeline={content.timeline} />
                {showDebug ? <DebugSpellInspector timeline={content.timeline} /> : null}
            </div>
        </section>
    );
}
