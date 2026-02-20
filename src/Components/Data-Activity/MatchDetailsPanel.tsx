import { useMemo } from "react";
import { LuInfo } from "react-icons/lu";
import TeamTable from "./TeamTable";
import MSSStatsSection from "./MSSStatsSection";
import SpellCastGraph from "./SpellCastGraph";
import DebugSpellInspector from "./DebugSpellInspector";
import MatchSummaryHeader from "./MatchSummaryHeader";
import {
    computeKickTelemetrySnapshot,
    resolveTelemetryVersion,
    type KickTelemetrySnapshot,
} from "./kickTelemetry";
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
type MatchDetailsContent = {
    players: MatchPlayer[];
    timeline: MatchTimelineEntry[];
    isSoloShuffle: boolean;
    alliance: MatchPlayer[];
    horde: MatchPlayer[];
    showFactions: boolean;
    playersTitle: string;
    showRating: boolean;
    gameVersion: string | null;
    spellTotals: SpellTotalsMap | null;
    spellTotalsBySource: Record<string, unknown> | null;
    interruptSpellsBySource: Record<string, unknown> | null;
    interruptSpellIds: number[];
    ownerInterruptsIssued: number | null;
    ownerInterruptsSucceeded: number | null;
    kickTelemetrySnapshot: KickTelemetrySnapshot;
};

export default function MatchDetailsPanel({ match, isLoading, onBack }: MatchDetailsPanelProps) {
    const debugEnabled = import.meta.env.DEV;

    const content = useMemo<MatchDetailsContent | null>(() => {
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
        const spellTotalsBySource = (
            match.raw as unknown as {
                spellTotalsBySource?: unknown;
                perSourceSpellTotals?: unknown;
                playerSpellTotals?: unknown;
            }
        ).spellTotalsBySource;
        const interruptSpellsBySource = (
            match.raw as unknown as { interruptSpellsBySource?: unknown }
        ).interruptSpellsBySource;
        const interruptSpellIds = (
            match.raw as unknown as { interruptSpellIds?: unknown }
        ).interruptSpellIds;
        const ownerPlayer = players.find((player) => player.isOwner) ?? null;
        const ownerInterruptTuple = Array.isArray((ownerPlayer as { interrupts?: unknown } | null)?.interrupts)
            ? ((ownerPlayer as { interrupts?: unknown }).interrupts as unknown[])
            : null;
        const ownerInterruptsIssued =
            ownerInterruptTuple && ownerInterruptTuple.length > 0
                ? Number(ownerInterruptTuple[0])
                : null;
        const ownerInterruptsSucceeded =
            ownerInterruptTuple && ownerInterruptTuple.length > 1
                ? Number(ownerInterruptTuple[1])
                : null;
        const normalizedInterruptSpellIds = Array.isArray(interruptSpellIds)
            ? interruptSpellIds
                  .map((value) => (typeof value === "number" ? value : Number(value)))
                  .filter((value): value is number => Number.isFinite(value) && value > 0)
            : [];
        const telemetryVersion = resolveTelemetryVersion(match.raw);
        const kickTelemetrySnapshot = computeKickTelemetrySnapshot({
            matchId: match.id,
            timeline,
            kickSpellIds: normalizedInterruptSpellIds,
            owner: ownerPlayer,
            telemetryVersion,
            includeDiagnostics: debugEnabled,
        });

        if (import.meta.env.DEV) {
            console.log("[SpellMetrics] payload aggregate keys", {
                matchId: match.id,
                telemetryVersion: (match.raw as unknown as { telemetryVersion?: unknown }).telemetryVersion,
                hasSpellTotals: !!spellTotals,
                hasSpellTotalsBySource: !!spellTotalsBySource,
                hasInterruptSpellsBySource: !!interruptSpellsBySource,
                keys: Object.keys(((match.raw ?? {}) as unknown) as Record<string, unknown>),
            });
        }

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
            spellTotalsBySource: (
                spellTotalsBySource ??
                (match.raw as unknown as { perSourceSpellTotals?: unknown }).perSourceSpellTotals ??
                (match.raw as unknown as { playerSpellTotals?: unknown }).playerSpellTotals ??
                null
            ) as Record<string, unknown> | null,
            interruptSpellsBySource: (interruptSpellsBySource ?? null) as Record<string, unknown> | null,
            interruptSpellIds: normalizedInterruptSpellIds,
            ownerInterruptsIssued:
                ownerInterruptsIssued !== null && Number.isFinite(ownerInterruptsIssued)
                    ? Math.max(0, Math.trunc(ownerInterruptsIssued))
                    : null,
            ownerInterruptsSucceeded:
                ownerInterruptsSucceeded !== null && Number.isFinite(ownerInterruptsSucceeded)
                    ? Math.max(0, Math.trunc(ownerInterruptsSucceeded))
                    : null,
            kickTelemetrySnapshot,
        };
    }, [match, debugEnabled]);

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

    return (
        <section className={styles.detailsCard}>
            <MatchSummaryHeader
                match={match}
                players={content.players}
                kickTelemetrySnapshot={content.kickTelemetrySnapshot}
                onBack={onBack}
            />
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
                    players={content.players}
                    gameVersion={content.gameVersion}
                    spellTotals={content.spellTotals}
                    spellTotalsBySource={content.spellTotalsBySource}
                    interruptSpellsBySource={content.interruptSpellsBySource}
                />

                {debugEnabled ? (
                    <div className={styles.spellNote}>
                        <LuInfo className={styles.spellNoteIcon} aria-hidden="true" />
                        <span>
                            Temporary development tool used to validate spell-cast logic. This module will be replaced
                            with user-facing insights in future updates.
                        </span>
                    </div>
                ) : null}
                {debugEnabled ? (
                    <DebugSpellInspector
                        timeline={content.timeline}
                        gameVersion={content.gameVersion}
                        kickSpellIds={content.interruptSpellIds}
                        ownerInterruptsIssued={content.ownerInterruptsIssued}
                        ownerInterruptsSucceeded={content.ownerInterruptsSucceeded}
                        kickTelemetrySnapshot={content.kickTelemetrySnapshot}
                    />
                ) : null}
            </div>
        </section>
    );
}
