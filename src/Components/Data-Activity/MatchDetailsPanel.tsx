import { useMemo } from "react";
import { LuArrowLeft, LuInfo } from "react-icons/lu";
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

export default function MatchDetailsPanel({ match, isLoading, onBack }: MatchDetailsPanelProps) {
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

    const showDebug = import.meta.env.DEV;

    return (
        <section className={styles.detailsCard}>
            {onBack ? (
                <button type="button" className={styles.backButton} onClick={onBack}>
                    <LuArrowLeft aria-hidden="true" className={styles.backIcon} />
                    Match History
                </button>
            ) : null}
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
                <div className={styles.spellNote}>
                    <LuInfo className={styles.spellNoteIcon} aria-hidden="true" />
                    <span>
                        Spell activity overview. This section shows how abilities were used during
                        the match. Advanced insights and guidance are still evolving in this module.
                    </span>
                </div>
                <SpellCastGraph timeline={content.timeline} />
                <div className={styles.spellNote}>
                    <LuInfo className={styles.spellNoteIcon} aria-hidden="true" />
                    <span>
                        Temporary development tool used to validate spell-cast logic. This module
                        will be replaced with user-facing insights in future updates.
                    </span>
                </div>
                {showDebug ? <DebugSpellInspector timeline={content.timeline} /> : null}
            </div>
        </section>
    );
}
