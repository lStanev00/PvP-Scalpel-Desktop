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
import type { KickTelemetrySnapshot } from "./kickTelemetry";
import type {
    ComputedOwnerKickSummary,
    NormalizedLocalSpellAttempt,
    NormalizedLocalSpellEvent,
    NormalizedLocalSpellModel,
} from "../../Interfaces/local-spell-model";
import styles from "./DataActivity.module.css";

interface DebugSpellInspectorProps {
    localSpellModel?: NormalizedLocalSpellModel | null;
    gameVersion?: string | null;
    kickSpellIds?: number[];
    baseKickTelemetrySnapshot?: KickTelemetrySnapshot | null;
    kickTelemetrySnapshot?: KickTelemetrySnapshot | null;
    computedOwnerKicks?: ComputedOwnerKickSummary | null;
}

type EventStatus = "outcome" | "collapsed" | "ignored" | "unresolved";
const KICK_FILTER_VALUE = "__kick_catalog__";
const DEFAULT_COLLAPSE_WINDOW_SECONDS = 0.08;
const KICK_COLLAPSE_WINDOW_SECONDS = 0.35;

type CollapsedAttemptRecord = NormalizedLocalSpellAttempt & {
    sourceAttemptIds: string[];
};

const OUTCOME_PRIORITY: Record<NonNullable<NormalizedLocalSpellAttempt["resolvedOutcome"]>, number> = {
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
    incoming: NormalizedLocalSpellAttempt,
    sourceId: string
): CollapsedAttemptRecord => {
    const mergedOutcomes = Array.from(new Set([...target.outcomes, ...incoming.outcomes]));

    const mergedEvents = [...target.events, ...incoming.events].sort((a, b) =>
        a.t === b.t ? a.index - b.index : a.t - b.t
    );

    const outcomeCandidates = [target.resolvedOutcome, incoming.resolvedOutcome].filter(
        (outcome): outcome is NonNullable<NormalizedLocalSpellAttempt["resolvedOutcome"]> => !!outcome
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

const collapseAttempts = (input: NormalizedLocalSpellAttempt[], aggressive: boolean) => {
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

const formatTime = (value: number) => `${value.toFixed(2)}s`;
const coerceCount = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;

const getAttemptExplanation = (attempt: NormalizedLocalSpellAttempt) => {
    const outcomes = attempt.outcomes;
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

const getEventStatus = (event: NormalizedLocalSpellEvent, attempt?: NormalizedLocalSpellAttempt): EventStatus => {
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

function DefinitionSection({
    title,
    rows,
    tone = "default",
}: {
    title: string;
    rows: Array<{ label: string; value: string }>;
    tone?: "default" | "good" | "warning";
}) {
    return (
        <section
            className={`${styles.debugSummarySection} ${
                tone === "good"
                    ? styles.debugSummarySectionGood
                    : tone === "warning"
                      ? styles.debugSummarySectionWarning
                      : ""
            }`}
        >
            <div className={styles.debugSummaryTitle}>{title}</div>
            <div className={styles.debugSummaryRows}>
                {rows.map((row) => (
                    <div key={row.label} className={styles.debugSummaryRow}>
                        <span>{row.label}</span>
                        <span>{row.value}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

export default function DebugSpellInspector({
    localSpellModel = null,
    gameVersion,
    kickSpellIds,
    baseKickTelemetrySnapshot = null,
    kickTelemetrySnapshot,
    computedOwnerKicks = null,
}: DebugSpellInspectorProps) {
    const { httpFetch } = useUserContext();
    const gameKey = useMemo(() => normalizeGameVersionKey(gameVersion), [gameVersion]);
    const [spellCache, setSpellCache] = useState<SpellMetaCache>(() => loadSpellMetaCache());
    const [isFetching, setIsFetching] = useState(false);
    const inFlight = useRef<Set<string>>(new Set());

    const rawEvents = useMemo(() => localSpellModel?.events ?? [], [localSpellModel]);
    const attempts = useMemo(() => localSpellModel?.attempts ?? [], [localSpellModel]);
    const eventToAttemptId = useMemo(() => {
        const map = new Map<number, string>();
        attempts.forEach((attempt) => {
            attempt.events.forEach((event) => {
                map.set(event.id, attempt.id);
            });
        });
        return map;
    }, [attempts]);

    const spellOptions = useMemo(() => {
        const ids = new Set<number>();
        rawEvents.forEach((event) => ids.add(event.spellId));
        attempts.forEach((attempt) => ids.add(attempt.spellId));
        const values = Array.from(ids);
        if (import.meta.env.DEV) {
            console.log("[debug-spell-inspector] spell option sources", {
                eventSpellIds: Array.from(new Set(rawEvents.map((event) => event.spellId))),
                attemptSpellIds: Array.from(new Set(attempts.map((attempt) => attempt.spellId))),
                resolvedSpellOptions: values,
            });
        }
        return values.sort((a, b) => a - b);
    }, [rawEvents, attempts]);

    const [selectedFilter, setSelectedFilter] = useState<string>("");
    const [hoveredAttempt, setHoveredAttempt] = useState<string | null>(null);
    const [hoveredEvent, setHoveredEvent] = useState<number | null>(null);
    const [isJsonExpanded, setIsJsonExpanded] = useState(false);

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
            displayAttempts: collapsed.collapsed as (NormalizedLocalSpellAttempt | CollapsedAttemptRecord)[],
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

        const rawSnapshot = baseKickTelemetrySnapshot;
        const displayedSnapshot = kickTelemetrySnapshot;
        const storedTotal =
            coerceCount(computedOwnerKicks?.total) ?? coerceCount(computedOwnerKicks?.intentAttempts);
        const storedConfirmed =
            coerceCount(computedOwnerKicks?.confirmedInterrupts) ??
            coerceCount(computedOwnerKicks?.succeeded);
        const storedMissed =
            coerceCount(computedOwnerKicks?.missed) ?? coerceCount(computedOwnerKicks?.failed);

        const rawTotal = rawSnapshot?.totalKickAttempts ?? 0;
        const rawConfirmed = rawSnapshot?.confirmedInterrupts ?? rawSnapshot?.succeeded ?? null;
        const rawMissed =
            rawSnapshot?.missedKicks ?? rawSnapshot?.failed ?? (rawConfirmed !== null ? rawTotal - rawConfirmed : null);
        const displayedTotal = displayedSnapshot?.totalKickAttempts ?? 0;
        const displayedConfirmed =
            displayedSnapshot?.confirmedInterrupts ?? displayedSnapshot?.succeeded ?? null;
        const displayedMissed =
            displayedSnapshot?.missedKicks ??
            displayedSnapshot?.failed ??
            (displayedConfirmed !== null ? displayedTotal - displayedConfirmed : null);

        const mismatchChecks = [
            storedTotal !== null && storedTotal !== rawTotal ? "stored total differs from raw-derived total" : null,
            storedConfirmed !== null && storedConfirmed !== rawConfirmed
                ? "stored confirmed interrupts differ from raw-derived confirmation"
                : null,
            storedMissed !== null && storedMissed !== rawMissed
                ? "stored missed kicks differ from raw-derived missed count"
                : null,
        ].filter((value): value is string => !!value);

        return {
            rawEvents: filteredEvents.length,
            displayAttempts: displayAttempts.length,
            rawTotal,
            rawConfirmed,
            rawMissed,
            rawCastEvents: rawSnapshot?.castEvents ?? 0,
            rawEventIntentAttempts: rawSnapshot?.eventIntentAttempts ?? 0,
            outcomeOnlyAttempts: rawSnapshot?.outcomeOnlyAttempts ?? 0,
            landedAttempts: rawSnapshot?.landedAttempts ?? 0,
            interruptedAttempts: rawSnapshot?.interruptedAttempts ?? 0,
            failedAttempts: rawSnapshot?.failedAttempts ?? 0,
            unresolvedAttempts: rawSnapshot?.unresolvedAttempts ?? 0,
            issued: rawSnapshot?.issued ?? null,
            succeeded: rawSnapshot?.succeeded ?? null,
            perSourceConfirmedInterrupts: rawSnapshot?.perSourceConfirmedInterrupts ?? null,
            confirmationSource: rawSnapshot?.confirmationSource ?? "unavailable",
            displayedTotal,
            displayedConfirmed,
            displayedMissed,
            storedTotal,
            storedConfirmed,
            storedMissed,
            hasMismatch: mismatchChecks.length > 0,
            mismatchChecks,
        };
    }, [
        isKickFilter,
        filteredEvents.length,
        displayAttempts.length,
        baseKickTelemetrySnapshot,
        kickTelemetrySnapshot,
        computedOwnerKicks,
    ]);

    const selectedSummary = useMemo(() => {
        const resolvedAttempts = displayAttempts.filter(
            (attempt) => !!attempt.resolvedOutcome
        ).length;
        return {
            rawEvents: filteredEvents.length,
            displayAttempts: displayAttempts.length,
            resolvedAttempts,
            unresolvedAttempts: Math.max(0, displayAttempts.length - resolvedAttempts),
        };
    }, [filteredEvents.length, displayAttempts]);

    const debugJsonPayload = useMemo(() => {
        if (!import.meta.env.DEV || !isJsonExpanded) return null;

        return JSON.stringify(
            {
                filter: {
                    selectedFilter,
                    isKickFilter,
                    selectedSpell,
                    selectedSpellName,
                },
                localSpellModel: localSpellModel
                    ? {
                          schemaVersion: localSpellModel.schemaVersion,
                          sourceFormat: localSpellModel.sourceFormat,
                          detailAvailable: localSpellModel.detailAvailable,
                          failureReason: localSpellModel.failureReason ?? null,
                          durationSecondsHint: localSpellModel.durationSecondsHint ?? null,
                          attempts: localSpellModel.attempts,
                          events: localSpellModel.events,
                          locEntries: localSpellModel.locEntries,
                      }
                    : null,
                filtered: {
                    rawEvents: filteredEvents,
                    attempts: filteredAttempts,
                    displayAttempts,
                    eventToAttemptId: Array.from(eventToAttemptId.entries()),
                    eventToDisplayAttemptId: Array.from(eventToDisplayAttemptId.entries()),
                },
                kickValidation,
                baseKickTelemetrySnapshot,
                kickTelemetrySnapshot,
                computedOwnerKicks,
            },
            null,
            2
        );
    }, [
        isJsonExpanded,
        selectedFilter,
        isKickFilter,
        selectedSpell,
        selectedSpellName,
        localSpellModel,
        filteredEvents,
        filteredAttempts,
        displayAttempts,
        eventToAttemptId,
        eventToDisplayAttemptId,
        kickValidation,
        baseKickTelemetrySnapshot,
        kickTelemetrySnapshot,
        computedOwnerKicks,
    ]);

    if (!spellOptions.length) {
        if (import.meta.env.DEV) {
            console.warn("[debug-spell-inspector] hidden because no spell options were normalized", {
                localSpellModel: localSpellModel
                    ? {
                          sourceFormat: localSpellModel.sourceFormat,
                          detailAvailable: localSpellModel.detailAvailable,
                          failureReason: localSpellModel.failureReason ?? null,
                          attempts: localSpellModel.attempts.length,
                          events: localSpellModel.events.length,
                          locEntries: localSpellModel.locEntries.length,
                      }
                    : null,
                kickTelemetrySnapshot,
            });
        }
        return null;
    }

    return (
        <section className={styles.debugInspector}>
            <div className={styles.debugHeader}>
                <div>
                    <div className={styles.debugTitle}>Debug Spell Inspector</div>
                    <div className={styles.debugSubtitle}>
                        Normalized local spell events vs attempts for a spell filter.
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

            <div className={styles.debugSummaryGrid}>
                <DefinitionSection
                    title={isKickFilter ? "Kick Summary" : "Selected Spell Summary"}
                    rows={
                        isKickFilter && kickValidation
                            ? [
                                  {
                                      label: "Observed denominator",
                                      value: `${kickValidation.displayedConfirmed ?? 0}/${kickValidation.displayedTotal}`,
                                  },
                                  {
                                      label: "Raw-derived total",
                                      value: String(kickValidation.rawTotal),
                                  },
                                  {
                                      label: "Displayed missed",
                                      value:
                                          kickValidation.displayedMissed === null
                                              ? "--"
                                              : String(kickValidation.displayedMissed),
                                  },
                                  {
                                      label: "Confirmation source",
                                      value: kickValidation.confirmationSource,
                                  },
                              ]
                            : [
                                  { label: "Raw events", value: String(selectedSummary.rawEvents) },
                                  {
                                      label: "Display attempts",
                                      value: String(selectedSummary.displayAttempts),
                                  },
                                  {
                                      label: "Resolved",
                                      value: String(selectedSummary.resolvedAttempts),
                                  },
                                  {
                                      label: "Unresolved",
                                      value: String(selectedSummary.unresolvedAttempts),
                                  },
                              ]
                    }
                    tone={isKickFilter && kickValidation?.displayedTotal ? "good" : "default"}
                />

                {isKickFilter && kickValidation ? (
                    <>
                        <DefinitionSection
                            title="Raw Kick Evidence"
                            rows={[
                                {
                                    label: "Grouped intent events",
                                    value: String(kickValidation.rawEventIntentAttempts),
                                },
                                {
                                    label: "Raw START/SENT events",
                                    value: String(kickValidation.rawCastEvents),
                                },
                                {
                                    label: "Outcome-only groups",
                                    value: String(kickValidation.outcomeOnlyAttempts),
                                },
                                {
                                    label: "Landed / interrupted",
                                    value: `${kickValidation.landedAttempts} / ${kickValidation.interruptedAttempts}`,
                                },
                            ]}
                        />
                        <DefinitionSection
                            title="Fallback Sources"
                            rows={[
                                {
                                    label: "Scoreboard issued",
                                    value:
                                        kickValidation.issued === null
                                            ? "--"
                                            : String(kickValidation.issued),
                                },
                                {
                                    label: "Scoreboard succeeded",
                                    value:
                                        kickValidation.succeeded === null
                                            ? "--"
                                            : String(kickValidation.succeeded),
                                },
                                {
                                    label: "Per-source confirmed",
                                    value:
                                        kickValidation.perSourceConfirmedInterrupts === null
                                            ? "--"
                                            : String(kickValidation.perSourceConfirmedInterrupts),
                                },
                                {
                                    label: "Unresolved attempts",
                                    value: String(kickValidation.unresolvedAttempts),
                                },
                            ]}
                        />
                        <DefinitionSection
                            title="Stored Computed Result"
                            rows={[
                                {
                                    label: "Stored total",
                                    value:
                                        kickValidation.storedTotal === null
                                            ? "--"
                                            : String(kickValidation.storedTotal),
                                },
                                {
                                    label: "Stored confirmed",
                                    value:
                                        kickValidation.storedConfirmed === null
                                            ? "--"
                                            : String(kickValidation.storedConfirmed),
                                },
                                {
                                    label: "Stored missed",
                                    value:
                                        kickValidation.storedMissed === null
                                            ? "--"
                                            : String(kickValidation.storedMissed),
                                },
                                {
                                    label: "Mismatch",
                                    value: kickValidation.hasMismatch ? "Yes" : "No",
                                },
                            ]}
                            tone={kickValidation.hasMismatch ? "warning" : "good"}
                        />
                    </>
                ) : null}
            </div>

            {isKickFilter && kickValidation?.hasMismatch ? (
                <div className={styles.debugNotice}>
                    {kickValidation.mismatchChecks.join(" · ")}
                </div>
            ) : null}

            <div className={styles.debugGrid}>
                <div className={styles.debugPane}>
                    <div className={styles.debugPaneTitle}>Event Trace</div>
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
                    <div className={styles.debugPaneTitle}>Attempt Resolution</div>
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
                                                : `normalized window (${attempt.windowMs.toFixed(2)}s)`}
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

            <details
                className={styles.debugJsonSection}
                open={isJsonExpanded}
                onToggle={(event) =>
                    setIsJsonExpanded((event.currentTarget as HTMLDetailsElement).open)
                }
            >
                <summary className={styles.debugJsonSummary}>Expandable JSON Render</summary>
                {isJsonExpanded && debugJsonPayload ? (
                    <pre className={styles.debugJsonPre}>{debugJsonPayload}</pre>
                ) : null}
            </details>
        </section>
    );
}
