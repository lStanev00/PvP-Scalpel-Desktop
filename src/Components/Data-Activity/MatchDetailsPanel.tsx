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

type SpellTotalEntry = {
    damage: number;
    healing: number;
    overheal?: number;
    absorbed?: number;
    hits?: number;
    crits?: number;
    targets?: Record<string, number>;
    interrupts?: number;
    dispels?: number;
};

type SpellTotalsMap = Record<string, SpellTotalEntry> | Record<number, SpellTotalEntry>;

export default function MatchDetailsPanel({ match, isLoading, onBack }: MatchDetailsPanelProps) {
    const content = useMemo(() => {
        if (!match) return null;
        const players = (match.raw.players ?? []) as MatchPlayer[];
        const timeline = (match.raw.timeline ?? []) as MatchTimelineEntry[];
        const isSoloShuffle = (match.raw.matchDetails?.format ?? "")
            .toLowerCase()
            .includes("solo shuffle");
        const showRating =
            match.mode === "solo" ||
            match.mode === "rated2" ||
            match.mode === "rated3" ||
            match.mode === "rbg";
        // Blizzard faction index in PvP scoreboards: 0 = Horde, 1 = Alliance.
        const horde = players.filter((p) => p.faction === 0);
        const alliance = players.filter((p) => p.faction === 1);
        const showFactions = !isSoloShuffle && alliance.length > 0 && horde.length > 0;
        const playersTitle = isSoloShuffle ? "Solo Shuffle Lobby" : "Players";

        const anyMatch = match.raw as unknown as {
            matchDetails?: { build?: { versionString?: unknown; version?: unknown } };
        };
        const build = anyMatch.matchDetails?.build;
        const gameVersion =
            typeof build?.versionString === "string"
                ? build.versionString
                : typeof build?.version === "string"
                  ? build.version
                  : null;

        const spellTotals = (match.raw as unknown as { spellTotals?: unknown }).spellTotals;

        return {
            players,
            timeline,
            isSoloShuffle,
            alliance,
            horde,
            showFactions,
            playersTitle,
            showRating,
            gameVersion,
            spellTotals: (spellTotals ?? null) as SpellTotalsMap | null,
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
                        <TeamTable title="Alliance" players={content.alliance} showRating={content.showRating} />
                        <TeamTable title="Horde" players={content.horde} showRating={content.showRating} />
                    </div>
                ) : (
                    <TeamTable title={content.playersTitle} players={content.players} showRating={content.showRating} />
                )}

                <MSSStatsSection players={content.players} />
                <div className={styles.spellNote}>
                    <LuInfo className={styles.spellNoteIcon} aria-hidden="true" />
                    <span>
                        Spell activity overview. This section shows how abilities were used during the match. Advanced
                        insights and guidance are still evolving in this module.
                    </span>
                </div>
                <SpellCastGraph
                    timeline={content.timeline}
                    gameVersion={content.gameVersion}
                    spellTotals={content.spellTotals}
                />

                {showDebug ? (
                    <div className={styles.spellNote}>
                        <LuInfo className={styles.spellNoteIcon} aria-hidden="true" />
                        <span>
                            Temporary development tool used to validate spell-cast logic. This module will be replaced
                            with user-facing insights in future updates.
                        </span>
                    </div>
                ) : null}
                {showDebug ? (
                    <DebugSpellInspector timeline={content.timeline} gameVersion={content.gameVersion} />
                ) : null}
            </div>
        </section>
    );
}
