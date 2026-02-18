import { useEffect, useMemo, useRef, useState } from "react";
import useUserContext from "../../Hooks/useUserContext";
import {
    extractSpellPayload,
    getGameSpellMap,
    isRenderableSpellMeta,
    loadSpellMetaCache,
    normalizeGameVersionKey,
    saveSpellMetaCache,
    upsertGameSpells,
    type SpellMetaCache,
} from "../../Domain/spellMetaCache";
import type { MatchTimelineEntry } from "./types";
import { resolveIntentAttempts, type AttemptRecord, type NormalizedEvent } from "./spellCastResolver";
import styles from "./DataActivity.module.css";

interface DebugSpellInspectorProps {
    timeline: MatchTimelineEntry[];
    gameVersion?: string | null;
    kickSpellIds?: number[];
    ownerInterruptsIssued?: number | null;
    ownerInterruptsSucceeded?: number | null;
}

type EventStatus = "outcome" | "collapsed" | "ignored" | "unresolved";
const KICK_FILTER_VALUE = "__kick_catalog__";
const isIntentSignalEvent = (event: string) => event === "SENT" || event === "START";
const DEFAULT_COLLAPSE_WINDOW_SECONDS = 0.08;
const KICK_COLLAPSE_WINDOW_SECONDS = 0.35;

type CollapsedAttemptRecord = AttemptRecord & {
    sourceAttemptIds: string[];
};

const OUTCOME_PRIORITY: Record<NonNullable<AttemptRecord["resolvedOutcome"]>, number> = {
    succeeded: 3,
    interrupted: 2,
    failed: 1,
};

const getCastGuidCollapseKey = (castGUID?: string) => {
    if (!castGUID) return null;
    const match = castGUID.match(/^(.*-)([0-9a-fA-F]{10})$/);
    if (!match) return castGUID;
    const [, prefix, tail] = match;
    return `${prefix}${tail.slice(0, 4)}${tail.slice(5)}`;
};

const mergeAttemptRecords = (
    target: CollapsedAttemptRecord,
    incoming: AttemptRecord,
    sourceId: string
): CollapsedAttemptRecord => {
    const mergedOutcomes = new Set(target.outcomes);
    incoming.outcomes.forEach((outcome) => mergedOutcomes.add(outcome));

    const mergedEvents = [...target.events, ...incoming.events].sort((a, b) =>
        a.t === b.t ? a.index - b.index : a.t - b.t
    );

    const outcomeCandidates = [target.resolvedOutcome, incoming.resolvedOutcome].filter(
        (outcome): outcome is NonNullable<AttemptRecord["resolvedOutcome"]> => !!outcome
    );
    const resolvedOutcome = outcomeCandidates.sort(
        (a, b) => OUTCOME_PRIORITY[b] - OUTCOME_PRIORITY[a]
    )[0];

    return {
        ...target,
        endTime: Math.max(target.endTime, incoming.endTime),
        startTime: Math.min(target.startTime, incoming.startTime),
        windowMs: Math.max(target.windowMs, incoming.windowMs),
        events: mergedEvents,
        outcomes: mergedOutcomes,
        resolvedOutcome,
        sourceAttemptIds: [...target.sourceAttemptIds, sourceId],
    };
};

const collapseAttempts = (input: AttemptRecord[], aggressive: boolean) => {
    const sorted = [...input].sort((a, b) =>
        a.startTime === b.startTime ? a.id.localeCompare(b.id) : a.startTime - b.startTime
    );
    const collapsed: CollapsedAttemptRecord[] = [];
    const sourceToCollapsed = new Map<string, string>();
    let active: CollapsedAttemptRecord | null = null;

    sorted.forEach((attempt, index) => {
        if (!active) {
            active = { ...attempt, sourceAttemptIds: [attempt.id] };
            return;
        }

        const sameSpell = active.spellId === attempt.spellId;
        const timeDelta = Math.abs(attempt.startTime - active.endTime);
        const activeGuidKey = getCastGuidCollapseKey(active.castGUID);
        const incomingGuidKey = getCastGuidCollapseKey(attempt.castGUID);
        const similarGuid =
            !!activeGuidKey && !!incomingGuidKey && activeGuidKey === incomingGuidKey;
        const collapseWindow = aggressive ? KICK_COLLAPSE_WINDOW_SECONDS : DEFAULT_COLLAPSE_WINDOW_SECONDS;
        const withinWindow = timeDelta <= collapseWindow;

        if (sameSpell && (similarGuid || (aggressive && withinWindow))) {
            active = mergeAttemptRecords(active, attempt, attempt.id);
            return;
        }

        const collapsedId = `attempt:${active.spellId}:${index}:${active.sourceAttemptIds.join("|")}`;
        const completed = { ...active, id: collapsedId };
        collapsed.push(completed);
        completed.sourceAttemptIds.forEach((sourceId) => sourceToCollapsed.set(sourceId, collapsedId));
        active = { ...attempt, sourceAttemptIds: [attempt.id] };
    });

    if (active) {
        const finalActive = active as CollapsedAttemptRecord;
        const collapsedId = `attempt:${finalActive.spellId}:final:${finalActive.sourceAttemptIds.join("|")}`;
        const completed = { ...finalActive, id: collapsedId };
        collapsed.push(completed);
        completed.sourceAttemptIds.forEach((sourceId: string) =>
            sourceToCollapsed.set(sourceId, collapsedId)
        );
    }

    const sortedCollapsed = collapsed.sort((a, b) =>
        a.startTime === b.startTime ? a.id.localeCompare(b.id) : a.startTime - b.startTime
    );

    return { collapsed: sortedCollapsed, sourceToCollapsed };
};

const formatTime = (value: number) => `${value.toFixed(2)}ms`;

const getAttemptExplanation = (attempt: AttemptRecord) => {
    const outcomes = Array.from(attempt.outcomes);
    if (!attempt.resolvedOutcome) {
        return "START/SENT with no outcome -> unresolved (timeout)";
    }
    const outcome = attempt.resolvedOutcome.toUpperCase();
    if (outcomes.length === 1) {
        const count = attempt.events.filter(
            (event) => event.event === attempt.resolvedOutcome?.toUpperCase()
        ).length;
        if (count > 1) {
            return `${count} ${outcome} events collapsed -> 1 ${outcome} attempt`;
        }
        return `Resolved as ${outcome}`;
    }
    if (outcomes.includes("failed") && outcomes.includes("succeeded")) {
        return "FAILED -> SUCCEEDED within window -> resolved as SUCCEEDED";
    }
    if (outcomes.includes("interrupted") && outcomes.includes("succeeded")) {
        return "INTERRUPTED -> SUCCEEDED within window -> resolved as SUCCEEDED";
    }
    if (outcomes.includes("failed") && outcomes.includes("interrupted")) {
        return "FAILED + INTERRUPTED -> resolved as INTERRUPTED";
    }
    return `Resolved as ${outcome}`;
};

const getEventStatus = (event: NormalizedEvent, attempt?: AttemptRecord): EventStatus => {
    if (!attempt || !attempt.resolvedOutcome) return "unresolved";
    const outcome = event.event.toLowerCase();
    if (outcome === attempt.resolvedOutcome) return "outcome";
    if (
        outcome === "succeeded" ||
        outcome === "failed" ||
        outcome === "failed_quiet" ||
        outcome === "interrupted"
    ) {
        return "collapsed";
    }
    return "ignored";
};

export default function DebugSpellInspector({
    timeline,
    gameVersion,
    kickSpellIds,
    ownerInterruptsIssued,
    ownerInterruptsSucceeded,
}: DebugSpellInspectorProps) {
    const { httpFetch } = useUserContext();
    const gameKey = useMemo(() => normalizeGameVersionKey(gameVersion), [gameVersion]);
    const [spellCache, setSpellCache] = useState<SpellMetaCache>(() => loadSpellMetaCache());
    const [isFetching, setIsFetching] = useState(false);
    const inFlight = useRef<Set<string>>(new Set());

    const { rawEvents, attempts, eventToAttemptId } = useMemo(
        () => resolveIntentAttempts(timeline),
        [timeline]
    );

    const spellOptions = useMemo(() => {
        const ids = Array.from(new Set(rawEvents.map((event) => event.spellId)));
        return ids.sort((a, b) => a - b);
    }, [rawEvents]);

    const [selectedFilter, setSelectedFilter] = useState<string>("");
    const [hoveredAttempt, setHoveredAttempt] = useState<string | null>(null);
    const [hoveredEvent, setHoveredEvent] = useState<number | null>(null);

    const kickSpellSet = useMemo(() => {
        const set = new Set<number>();
        (kickSpellIds ?? []).forEach((value) => {
            const parsed = typeof value === "number" ? value : Number(value);
            if (Number.isFinite(parsed) && parsed > 0) {
                set.add(Math.trunc(parsed));
            }
        });
        return set;
    }, [kickSpellIds]);

    const kickSpellOptions = useMemo(
        () => spellOptions.filter((id) => kickSpellSet.has(id)),
        [spellOptions, kickSpellSet]
    );

    const isKickFilter = selectedFilter === KICK_FILTER_VALUE;
    const selectedSpell = useMemo(() => {
        if (isKickFilter) return null;
        const parsed = Number(selectedFilter);
        return Number.isFinite(parsed) ? parsed : null;
    }, [isKickFilter, selectedFilter]);

    useEffect(() => {
        if (!spellOptions.length) {
            if (selectedFilter !== "") setSelectedFilter("");
            return;
        }

        const fallback = String(spellOptions[0]);
        if (!selectedFilter) {
            setSelectedFilter(fallback);
            return;
        }

        if (selectedFilter === KICK_FILTER_VALUE) {
            if (!kickSpellOptions.length) {
                setSelectedFilter(fallback);
            }
            return;
        }

        if (!spellOptions.includes(Number(selectedFilter))) {
            setSelectedFilter(fallback);
        }
    }, [spellOptions, selectedFilter, kickSpellOptions]);

    useEffect(() => {
        if (selectedSpell === null) return;
        const gameMap = getGameSpellMap(spellCache, gameKey);
        const key = `${gameKey}:${selectedSpell}`;
        if (String(selectedSpell) in gameMap || inFlight.current.has(key)) return;

        inFlight.current.add(key);
        setIsFetching(true);
        let cancelled = false;

        const fetchSelectedSpell = async () => {
            try {
                const res = await httpFetch("/game/spells", {
                    method: "POST",
                    body: JSON.stringify({ ids: [selectedSpell] }),
                });

                if (!res.ok || !res.data || cancelled) return;

                const payload = extractSpellPayload(res.data);
                setSpellCache((prev) => {
                    const next = upsertGameSpells(prev, gameKey, payload, [selectedSpell]);
                    saveSpellMetaCache(next);
                    return next;
                });
            } finally {
                inFlight.current.delete(key);
                if (!cancelled) setIsFetching(false);
            }
        };

        void fetchSelectedSpell();

        return () => {
            cancelled = true;
        };
    }, [selectedSpell, spellCache, gameKey, httpFetch]);

    const selectedSpellMeta = useMemo(() => {
        if (selectedSpell === null) return null;
        const gameMap = getGameSpellMap(spellCache, gameKey);
        return gameMap[String(selectedSpell)] ?? null;
    }, [selectedSpell, spellCache, gameKey]);

    const selectedSpellName = useMemo(() => {
        if (isKickFilter) {
            return kickSpellOptions.length
                ? `Kick catalog filter (${kickSpellOptions.length} spell IDs in this match)`
                : "Kick catalog filter";
        }
        if (selectedSpell === null) return null;
        if (selectedSpellMeta && isRenderableSpellMeta(selectedSpellMeta)) {
            return selectedSpellMeta.name ?? null;
        }
        return null;
    }, [selectedSpell, selectedSpellMeta, isKickFilter, kickSpellOptions]);

    const filteredEvents = useMemo(() => {
        if (isKickFilter) {
            return rawEvents.filter((event) => kickSpellSet.has(event.spellId));
        }
        if (selectedSpell === null) return [];
        return rawEvents.filter((event) => event.spellId === selectedSpell);
    }, [rawEvents, selectedSpell, isKickFilter, kickSpellSet]);

    const filteredAttempts = useMemo(() => {
        if (isKickFilter) {
            return attempts.filter((attempt) => kickSpellSet.has(attempt.spellId));
        }
        if (selectedSpell === null) return [];
        return attempts.filter((attempt) => attempt.spellId === selectedSpell);
    }, [attempts, selectedSpell, isKickFilter, kickSpellSet]);

    const { displayAttempts, sourceAttemptToDisplayAttempt } = useMemo(() => {
        const collapsed = collapseAttempts(filteredAttempts, isKickFilter);
        return {
            displayAttempts: collapsed.collapsed as (AttemptRecord | CollapsedAttemptRecord)[],
            sourceAttemptToDisplayAttempt: collapsed.sourceToCollapsed,
        };
    }, [isKickFilter, filteredAttempts]);

    const eventToDisplayAttemptId = useMemo(() => {
        const mapped = new Map<number, string>();
        filteredEvents.forEach((event) => {
            const sourceAttemptId = eventToAttemptId.get(event.id);
            if (!sourceAttemptId) return;
            const displayAttemptId = sourceAttemptToDisplayAttempt.get(sourceAttemptId) ?? sourceAttemptId;
            mapped.set(event.id, displayAttemptId);
        });
        return mapped;
    }, [filteredEvents, eventToAttemptId, sourceAttemptToDisplayAttempt]);

    const kickValidation = useMemo(() => {
        if (!isKickFilter) return null;

        const castEvents = filteredEvents.filter((event) => isIntentSignalEvent(event.event)).length;
        const attemptsWithIntent = displayAttempts.filter((attempt) =>
            attempt.events.some((event) => isIntentSignalEvent(event.event))
        );
        const attemptCount = attemptsWithIntent.length;
        const outcomeOnlyAttempts = displayAttempts.length - attemptCount;
        const succeededAttempts = attemptsWithIntent.filter(
            (attempt) => attempt.resolvedOutcome === "succeeded"
        ).length;
        const interruptedAttempts = attemptsWithIntent.filter(
            (attempt) => attempt.resolvedOutcome === "interrupted"
        ).length;
        const executedInterruptOutcomes = attemptsWithIntent.filter(
            (attempt) =>
                (attempt.resolvedOutcome === "succeeded" || attempt.resolvedOutcome === "interrupted")
        ).length;
        const failedAttempts = attemptsWithIntent.filter(
            (attempt) => attempt.resolvedOutcome === "failed"
        ).length;
        const unresolvedAttempts = attemptsWithIntent.filter(
            (attempt) => !attempt.resolvedOutcome
        ).length;

        const issued =
            typeof ownerInterruptsIssued === "number" && Number.isFinite(ownerInterruptsIssued)
                ? Math.max(0, Math.trunc(ownerInterruptsIssued))
                : null;
        const succeeded =
            typeof ownerInterruptsSucceeded === "number" && Number.isFinite(ownerInterruptsSucceeded)
                ? Math.max(0, Math.trunc(ownerInterruptsSucceeded))
                : null;

        const attemptsVsIssued = issued === null ? null : attemptCount - issued;
        const intentVsSucceeded = succeeded === null ? null : attemptCount - succeeded;
        const castsVsIssued = issued === null ? null : castEvents - issued;
        const executedVsIssued = issued === null ? null : executedInterruptOutcomes - issued;
        const successVsSucceeded = succeeded === null ? null : succeededAttempts - succeeded;
        const suggestedMissedKicks = Math.max(0, castEvents - succeededAttempts);
        const estimatedBadKicks = Math.max(0, attemptCount - succeededAttempts);

        return {
            castEvents,
            rawEvents: filteredEvents.length,
            attemptCount,
            outcomeOnlyAttempts,
            succeededAttempts,
            interruptedAttempts,
            executedInterruptOutcomes,
            failedAttempts,
            unresolvedAttempts,
            issued,
            succeeded,
            attemptsVsIssued,
            intentVsSucceeded,
            castsVsIssued,
            executedVsIssued,
            successVsSucceeded,
            suggestedMissedKicks,
            estimatedBadKicks,
        };
    }, [isKickFilter, filteredEvents, displayAttempts, ownerInterruptsIssued, ownerInterruptsSucceeded]);

    if (!spellOptions.length) {
        return null;
    }

    return (
        <section className={styles.debugInspector}>
            <div className={styles.debugHeader}>
                <div>
                    <div className={styles.debugTitle}>Debug Spell Inspector</div>
                    <div className={styles.debugSubtitle}>
                        Raw events vs intent attempts for a spell filter.
                    </div>
                </div>
                <div className={styles.debugSelector}>
                    <label className={styles.debugLabel} htmlFor="debug-spell-select">
                        Filter
                    </label>
                    <select
                        id="debug-spell-select"
                        className={styles.debugSelect}
                        value={selectedFilter}
                        onChange={(event) => setSelectedFilter(event.target.value)}
                    >
                        {kickSpellOptions.length ? (
                            <option value={KICK_FILTER_VALUE}>Kick IDs (catalog)</option>
                        ) : null}
                        {spellOptions.map((id) => (
                            <option key={id} value={String(id)}>
                                {id}
                            </option>
                        ))}
                    </select>
                    {selectedSpellName ? (
                        <div className={styles.debugSpellName}>{selectedSpellName}</div>
                    ) : isFetching ? (
                        <div className={styles.debugSpellName}>Retrieving spell data...</div>
                    ) : selectedSpell !== null ? (
                        <div className={styles.debugSpellName}>{`Spell ${selectedSpell}`}</div>
                    ) : null}
                </div>
            </div>

            <div className={styles.debugGrid}>
                <div className={styles.debugPane}>
                    <div className={styles.debugPaneTitle}>Raw Events</div>
                    <div className={styles.debugList}>
                        {filteredEvents.map((event) => {
                            const attemptId = eventToAttemptId.get(event.id) ?? null;
                            const attempt = attemptId ? attempts.find((a) => a.id === attemptId) : undefined;
                            const status = getEventStatus(event, attempt);
                            const displayAttemptId = eventToDisplayAttemptId.get(event.id) ?? attemptId;
                            const isHighlighted = hoveredAttempt && displayAttemptId === hoveredAttempt;
                            const statusTag =
                                status === "unresolved" ? "Unresolved" : status === "ignored" ? "Ignored" : "";
                            const tagText = isKickFilter
                                ? statusTag
                                    ? `Spell ${event.spellId} - ${statusTag}`
                                    : `Spell ${event.spellId}`
                                : statusTag;
                            return (
                                <div
                                    key={`${event.id}-${event.t}`}
                                    className={`${styles.debugRow} ${styles[`debugRow_${status}`]} ${
                                        isHighlighted ? styles.debugRowActive : ""
                                    }`}
                                    onMouseEnter={() => setHoveredEvent(event.id)}
                                    onMouseLeave={() => setHoveredEvent(null)}
                                >
                                    <span className={styles.debugTime}>{formatTime(event.t)}</span>
                                    <span className={styles.debugEvent}>{event.event}</span>
                                    <span className={styles.debugGuid}>{event.castGUID ?? "-"}</span>
                                    <span className={styles.debugTag}>{tagText}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className={styles.debugPane}>
                    <div className={styles.debugPaneTitle}>Intent Attempts</div>
                    <div className={styles.debugList}>
                        {displayAttempts.map((attempt) => {
                            const resolved = attempt.resolvedOutcome ?? "unresolved";
                            const isHovered =
                                hoveredEvent !== null && eventToDisplayAttemptId.get(hoveredEvent) === attempt.id;
                            return (
                                <div
                                    key={attempt.id}
                                    className={`${styles.debugRow} ${styles[`debugRow_${resolved}`]} ${
                                        isHovered ? styles.debugRowActive : ""
                                    }`}
                                    onMouseEnter={() => setHoveredAttempt(attempt.id)}
                                    onMouseLeave={() => setHoveredAttempt(null)}
                                >
                                    <div className={styles.debugAttemptHeader}>
                                        <span className={styles.debugOutcome}>
                                            {resolved === "unresolved" ? "Unresolved" : resolved.toUpperCase()}
                                        </span>
                                        <span className={styles.debugTime}>
                                            {formatTime(attempt.startTime)} - {formatTime(attempt.endTime)}
                                        </span>
                                    </div>
                                    <div className={styles.debugMeta}>
                                        <span>
                                            {isKickFilter ? `Spell ${attempt.spellId} - ` : ""}
                                            {attempt.grouping === "castGUID"
                                                ? `castGUID: ${attempt.castGUID ?? "-"}`
                                                : `fallback window (${attempt.windowMs}ms)`}
                                        </span>
                                        <span>{attempt.events.length} events</span>
                                    </div>
                                    {"sourceAttemptIds" in attempt &&
                                    Array.isArray(attempt.sourceAttemptIds) &&
                                    attempt.sourceAttemptIds.length > 1 ? (
                                        <div className={styles.debugTag}>
                                            Collapsed {attempt.sourceAttemptIds.length} near-identical attempts
                                        </div>
                                    ) : null}
                                    <div className={styles.debugExplanation}>{getAttemptExplanation(attempt)}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {kickValidation ? (
                <div className={styles.debugValidation}>
                    <div className={styles.debugValidationTitle}>Kick Validation (Owner Timeline)</div>
                    <div className={styles.debugValidationRow}>
                        <span>Timeline cast events (SENT + START for kick IDs)</span>
                        <span>{kickValidation.castEvents}</span>
                    </div>
                    <div className={styles.debugValidationRow}>
                        <span>Intent attempts (resolver, has SENT/START)</span>
                        <span>{kickValidation.attemptCount}</span>
                    </div>
                    <div className={styles.debugValidationRow}>
                        <span>Outcome-only groups (no SENT/START)</span>
                        <span>{kickValidation.outcomeOnlyAttempts}</span>
                    </div>
                    <div className={styles.debugValidationRow}>
                        <span>Scoreboard interrupts[0] (issued)</span>
                        <span>{kickValidation.issued ?? "--"}</span>
                    </div>
                    <div className={styles.debugValidationRow}>
                        <span>Scoreboard interrupts[1] (succeeded)</span>
                        <span>{kickValidation.succeeded ?? "--"}</span>
                    </div>
                    <div className={styles.debugValidationRow}>
                        <span>Estimated bad kicks (intent attempts - succeeded attempts)</span>
                        <span>{kickValidation.estimatedBadKicks}</span>
                    </div>
                    <div className={styles.debugValidationRow}>
                        <span>Attempts - interrupts[0]</span>
                        <span>
                            {kickValidation.attemptsVsIssued === null
                                ? "--"
                                : `${kickValidation.attemptsVsIssued > 0 ? "+" : ""}${kickValidation.attemptsVsIssued}`}
                        </span>
                    </div>
                    <div className={styles.debugValidationRow}>
                        <span>Executed outcomes (SUCCEEDED/INTERRUPTED) - interrupts[0]</span>
                        <span>
                            {kickValidation.executedVsIssued === null
                                ? "--"
                                : `${kickValidation.executedVsIssued > 0 ? "+" : ""}${kickValidation.executedVsIssued}`}
                        </span>
                    </div>
                    <div className={styles.debugValidationRow}>
                        <span>Cast events - interrupts[0]</span>
                        <span>
                            {kickValidation.castsVsIssued === null
                                ? "--"
                                : `${kickValidation.castsVsIssued > 0 ? "+" : ""}${kickValidation.castsVsIssued}`}
                        </span>
                    </div>
                    <div className={styles.debugValidationRow}>
                        <span>Succeeded attempts - interrupts[1]</span>
                        <span>
                            {kickValidation.successVsSucceeded === null
                                ? "--"
                                : `${kickValidation.successVsSucceeded > 0 ? "+" : ""}${kickValidation.successVsSucceeded}`}
                        </span>
                    </div>
                    <div className={styles.debugValidationRow}>
                        <span>Scoreboard alignment (intent attempts - interrupts[1])</span>
                        <span>
                            {kickValidation.intentVsSucceeded === null
                                ? "--"
                                : `${kickValidation.intentVsSucceeded > 0 ? "+" : ""}${kickValidation.intentVsSucceeded}`}
                        </span>
                    </div>
                    <div className={styles.debugValidationRow}>
                        <span>Suggested missed kicks (cast events - succeeded)</span>
                        <span>{kickValidation.suggestedMissedKicks}</span>
                    </div>
                    <div className={styles.debugValidationRow}>
                        <span>Attempt outcomes (success / interrupted / failed / unresolved)</span>
                        <span>
                            {kickValidation.succeededAttempts} / {kickValidation.interruptedAttempts} /{" "}
                            {kickValidation.failedAttempts} / {kickValidation.unresolvedAttempts}
                        </span>
                    </div>
                    <div className={styles.debugValidationHint}>
                        Calculation uses the owner-local timeline stream and only kick spell IDs from
                        `PvP_Scalpel_InteruptSpells`.
                    </div>
                </div>
            ) : null}
        </section>
    );
}
