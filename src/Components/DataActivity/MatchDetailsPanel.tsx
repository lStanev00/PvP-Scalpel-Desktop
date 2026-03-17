import { useEffect, useMemo, useRef, useState } from "react";
import { LuInfo } from "react-icons/lu";
import TeamTable from "./TeamTable";
import MSSStatsSection, { collectMSSStats } from "./MSSStatsSection";
import DebugSpellInspector from "./DebugSpellInspector";
import MatchSummaryHeader from "./MatchSummaryHeader";
import MatchAnalysisWorkspace from "./MatchAnalysisWorkspace";
import {
    computeKickTelemetrySnapshot,
    resolveTelemetryVersion,
    type KickTelemetrySnapshot,
} from "./kickTelemetry";
import {
    buildSpellOutcomeCounts,
    resolveLocalSpellModel,
} from "../../Domain/localSpellModel";
import {
    BRACKET_SOLO_SHUFFLE,
    isRatedBracket,
    type MatchSummary,
} from "./utils";
import type { MatchPlayer } from "./types";
import type {
    ComputedAnalyticsV2,
    ComputedOwnerKickSummary,
    NormalizedLocalSpellModel,
} from "../../Interfaces/local-spell-model";
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
    localSpellModel: NormalizedLocalSpellModel | null;
    isSoloShuffle: boolean;
    alliance: MatchPlayer[];
    horde: MatchPlayer[];
    showFactions: boolean;
    playersTitle: string;
    showRating: boolean;
    gameVersion: string | null;
    telemetryVersion: number | null;
    matchFormat: string;
    spellTotals: SpellTotalsMap | null;
    spellTotalsBySource: Record<string, unknown> | null;
    interruptSpellsBySource: Record<string, unknown> | null;
    interruptSpellIds: number[];
    ownerInterruptsIssued: number | null;
    ownerInterruptsSucceeded: number | null;
    kickTelemetrySnapshot: KickTelemetrySnapshot;
    computedSpellOutcomes: Record<string, { succeeded: number; interrupted: number; failed: number }> | null;
};

const PLAYER_COL_WIDTH = 180;
const KD_COL_WIDTH = 72;
const OUTPUT_COL_WIDTH = 220;
const EXTRA_STAT_MIN_WIDTH = 112;
const PRE_POST_COL_WIDTH = 64;
const RATING_COL_WIDTH = 84;
const TABLE_FRAME_WIDTH = 68;

const getRequiredMergedTableWidth = ({
    extraStatNames,
    showRating,
    players,
}: {
    extraStatNames: string[];
    showRating: boolean;
    players: MatchPlayer[];
}) => {
    const hasPreMMR = players.some((player) => {
        const value = player.prematchMMR;
        return typeof value === "number" && Number.isFinite(value) && value !== 0;
    });
    const hasPostMMR = players.some((player) => {
        const value = player.postmatchMMR;
        return typeof value === "number" && Number.isFinite(value) && value !== 0;
    });
    const hasMMRDelta =
        players.some((player) => {
            const value = player.ratingChange;
            return typeof value === "number" && Number.isFinite(value) && value !== 0;
        }) ||
        players.some((player) => {
            const pre = player.prematchMMR ?? 0;
            const post = player.postmatchMMR ?? 0;
            return typeof pre === "number" && typeof post === "number" && post - pre !== 0;
        });

    const extraStatsWidth = extraStatNames.reduce((sum, stat) => {
        const labelWidth = stat.length * 7 + 28;
        return sum + Math.max(EXTRA_STAT_MIN_WIDTH, Math.min(136, labelWidth));
    }, 0);

    return (
        TABLE_FRAME_WIDTH +
        PLAYER_COL_WIDTH +
        KD_COL_WIDTH +
        OUTPUT_COL_WIDTH +
        extraStatsWidth +
        (hasPreMMR ? PRE_POST_COL_WIDTH : 0) +
        (hasPostMMR ? PRE_POST_COL_WIDTH : 0) +
        (hasMMRDelta ? PRE_POST_COL_WIDTH : 0) +
        (showRating ? RATING_COL_WIDTH : 0)
    );
};

export default function MatchDetailsPanel({ match, isLoading, onBack }: MatchDetailsPanelProps) {
    const debugEnabled = import.meta.env.DEV;
    const [highlightedPlayerKey, setHighlightedPlayerKey] = useState<string | null>(null);
    const detailsBodyRef = useRef<HTMLDivElement | null>(null);
    const [detailsBodyWidth, setDetailsBodyWidth] = useState(0);

    useEffect(() => {
        setHighlightedPlayerKey(null);
    }, [match?.id]);

    useEffect(() => {
        const element = detailsBodyRef.current;
        if (!element || typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver((entries) => {
            const nextWidth = entries[0]?.contentRect.width;
            if (!nextWidth) return;
            setDetailsBodyWidth(nextWidth);
        });

        setDetailsBodyWidth(element.getBoundingClientRect().width);
        observer.observe(element);
        return () => observer.disconnect();
    }, [match?.id]);

    const content = useMemo<MatchDetailsContent | null>(() => {
        if (!match) return null;
        const players = (match.raw.players ?? []) as MatchPlayer[];
        const localSpellModel = resolveLocalSpellModel(match.raw);
        const isSoloShuffle = match.bracketId === BRACKET_SOLO_SHUFFLE;
        const showRating = isRatedBracket(match.bracketId);
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
        const matchFormat =
            typeof match.raw.matchDetails?.format === "string" ? match.raw.matchDetails.format : "";

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
        const computed = (match.raw as unknown as { computed?: ComputedAnalyticsV2 }).computed;
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
        const baseKickTelemetrySnapshot = computeKickTelemetrySnapshot({
            matchId: match.id,
            localSpellModel,
            kickSpellIds: normalizedInterruptSpellIds,
            owner: ownerPlayer,
            telemetryVersion,
            interruptSpellsBySource,
            includeDiagnostics: debugEnabled,
        });
        const computedOwnerKicks = computed?.ownerKicks as ComputedOwnerKickSummary | undefined;
        const computedTotal =
            typeof computedOwnerKicks?.total === "number" && Number.isFinite(computedOwnerKicks.total)
                ? Math.max(0, Math.trunc(computedOwnerKicks.total))
                : typeof computedOwnerKicks?.intentAttempts === "number" &&
                    Number.isFinite(computedOwnerKicks.intentAttempts)
                  ? Math.max(0, Math.trunc(computedOwnerKicks.intentAttempts))
                  : null;
        const computedIntentAttempts =
            typeof computedOwnerKicks?.intentAttempts === "number" &&
            Number.isFinite(computedOwnerKicks.intentAttempts)
                ? Math.max(0, Math.trunc(computedOwnerKicks.intentAttempts))
                : null;
        const computedLanded =
            typeof computedOwnerKicks?.landed === "number" && Number.isFinite(computedOwnerKicks.landed)
                ? Math.max(0, Math.trunc(computedOwnerKicks.landed))
                : null;
        const computedConfirmedInterrupts =
            typeof computedOwnerKicks?.confirmedInterrupts === "number" &&
            Number.isFinite(computedOwnerKicks.confirmedInterrupts)
                ? Math.max(0, Math.trunc(computedOwnerKicks.confirmedInterrupts))
                : typeof computedOwnerKicks?.succeeded === "number" &&
                    Number.isFinite(computedOwnerKicks.succeeded)
                  ? Math.max(0, Math.trunc(computedOwnerKicks.succeeded))
                  : null;
        const computedMissed =
            typeof computedOwnerKicks?.missed === "number" && Number.isFinite(computedOwnerKicks.missed)
                ? Math.max(0, Math.trunc(computedOwnerKicks.missed))
                : typeof computedOwnerKicks?.failed === "number" && Number.isFinite(computedOwnerKicks.failed)
                  ? Math.max(0, Math.trunc(computedOwnerKicks.failed))
                  : null;
        const resolvedTotalKickAttempts =
            computedTotal !== null ? computedTotal : baseKickTelemetrySnapshot.totalKickAttempts;
        const resolvedIntentAttempts =
            computedIntentAttempts !== null && computedIntentAttempts > 0
                ? computedIntentAttempts
                : resolvedTotalKickAttempts;
        const resolvedLanded =
            computedLanded !== null ? computedLanded : baseKickTelemetrySnapshot.landedAttempts;
        const resolvedConfirmedInterrupts =
            computedConfirmedInterrupts !== null
                ? computedConfirmedInterrupts
                : baseKickTelemetrySnapshot.confirmedInterrupts;
        const resolvedMissed =
            computedMissed !== null ? computedMissed : baseKickTelemetrySnapshot.missedKicks;
        const kickTelemetrySnapshot: KickTelemetrySnapshot =
            computedOwnerKicks &&
            typeof computedOwnerKicks === "object" &&
            computedOwnerKicks !== null &&
            baseKickTelemetrySnapshot.isSupported
                ? {
                      ...baseKickTelemetrySnapshot,
                      totalKickAttempts: resolvedTotalKickAttempts,
                      intentAttempts: resolvedIntentAttempts,
                      landedAttempts: resolvedLanded,
                      succeededAttempts: resolvedLanded,
                      confirmedInterrupts: resolvedConfirmedInterrupts,
                      missedKicks: resolvedMissed,
                      succeeded: resolvedConfirmedInterrupts,
                  }
                : baseKickTelemetrySnapshot;
        const computedSpellOutcomesFromStore =
            computed?.spellOutcomesBySpellId && typeof computed.spellOutcomesBySpellId === "object"
                ? Object.fromEntries(
                      Object.entries(computed.spellOutcomesBySpellId)
                          .map(([spellId, value]) => {
                              if (!value || typeof value !== "object") return null;
                              const row = value as {
                                  succeeded?: unknown;
                                  interrupted?: unknown;
                                  failed?: unknown;
                              };
                              const succeeded =
                                  typeof row.succeeded === "number" && Number.isFinite(row.succeeded)
                                      ? Math.max(0, Math.trunc(row.succeeded))
                                      : 0;
                              const interrupted =
                                  typeof row.interrupted === "number" && Number.isFinite(row.interrupted)
                                      ? Math.max(0, Math.trunc(row.interrupted))
                                      : 0;
                              const failed =
                                  typeof row.failed === "number" && Number.isFinite(row.failed)
                                      ? Math.max(0, Math.trunc(row.failed))
                                      : 0;
                              return [spellId, { succeeded, interrupted, failed }] as const;
                          })
                          .filter(
                              (
                                  item
                              ): item is readonly [
                                  string,
                                  { succeeded: number; interrupted: number; failed: number },
                              ] => !!item
                          )
                  )
                : null;
        const computedSpellOutcomes =
            computedSpellOutcomesFromStore ??
            (() => {
                const derived = buildSpellOutcomeCounts(localSpellModel);
                return Object.keys(derived).length > 0 ? derived : null;
            })();

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
            localSpellModel,
            isSoloShuffle,
            alliance,
            horde,
            showFactions,
            playersTitle,
            showRating,
            gameVersion,
            telemetryVersion,
            matchFormat,
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
            computedSpellOutcomes,
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

    const mssData = collectMSSStats(content.players);
    const shouldMergeMSS =
        mssData.statNames.length > 0 &&
        detailsBodyWidth >=
            getRequiredMergedTableWidth({
                extraStatNames: mssData.statNames,
                showRating: content.showRating,
                players: content.players,
            });

    return (
        <section className={styles.detailsCard}>
            <MatchSummaryHeader
                match={match}
                players={content.players}
                kickTelemetrySnapshot={content.kickTelemetrySnapshot}
                onBack={onBack}
            />
            <div className={styles.detailsBody} ref={detailsBodyRef}>
                <TeamTable
                    title={content.playersTitle}
                    players={content.players}
                    showRating={content.showRating}
                    showTeams={content.showFactions}
                    extraStats={
                        shouldMergeMSS
                            ? {
                                  statNames: mssData.statNames,
                                  valuesByPlayerKey: mssData.valuesByPlayerKey,
                              }
                            : null
                    }
                    highlightedPlayerKey={highlightedPlayerKey}
                    onHoverPlayerKey={setHighlightedPlayerKey}
                />

                {shouldMergeMSS ? null : (
                    <MSSStatsSection
                        players={content.players}
                        highlightedPlayerKey={highlightedPlayerKey}
                        onHoverPlayerKey={setHighlightedPlayerKey}
                    />
                )}
<<<<<<< HEAD
                <MatchAnalysisWorkspace
                    match={match}
=======
                <div className={styles.spellNote}>
                    <LuInfo className={styles.spellNoteIcon} aria-hidden="true" />
                    <span>
                        Spell activity overview. This section shows how abilities were used during the match. Advanced
                        insights and guidance are still evolving in this module.
                    </span>
                </div>
                <SpellCastGraph
                    localSpellModel={content.localSpellModel}
>>>>>>> 4445079 (consumption of the new addon version)
                    players={content.players}
                    localSpellModel={content.localSpellModel}
                    gameVersion={content.gameVersion}
                    telemetryVersion={content.telemetryVersion}
                    spellTotals={content.spellTotals}
                    spellTotalsBySource={content.spellTotalsBySource}
                    interruptSpellsBySource={content.interruptSpellsBySource}
                    computedSpellOutcomes={content.computedSpellOutcomes}
                    kickTelemetrySnapshot={content.kickTelemetrySnapshot}
                    kickSpellIds={content.interruptSpellIds}
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
                        localSpellModel={content.localSpellModel}
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
