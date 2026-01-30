import { useMemo, useState } from "react";
import type { MatchTimelineEntry } from "./types";
import { resolveIntentAttempts, type AttemptRecord, type NormalizedEvent } from "./spellCastResolver";
import styles from "./DataActivity.module.css";

interface DebugSpellInspectorProps {
    timeline: MatchTimelineEntry[];
}

type EventStatus = "outcome" | "collapsed" | "ignored" | "unresolved";

const formatTime = (value: number) => `${value.toFixed(2)}ms`;

const getAttemptExplanation = (attempt: AttemptRecord) => {
    const outcomes = Array.from(attempt.outcomes);
    if (!attempt.resolvedOutcome) {
        return "START/SENT with no outcome -> unresolved (timeout)";
    }
    const outcome = attempt.resolvedOutcome.toUpperCase();
    if (outcomes.length === 1) {
        const count = attempt.events.filter((event) => event.event === attempt.resolvedOutcome?.toUpperCase()).length;
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
    if (outcome === "succeeded" || outcome === "failed" || outcome === "failed_quiet" || outcome === "interrupted") {
        return "collapsed";
    }
    return "ignored";
};

export default function DebugSpellInspector({ timeline }: DebugSpellInspectorProps) {
    const { rawEvents, attempts, resolvedAttempts, eventToAttemptId } = useMemo(
        () => resolveIntentAttempts(timeline),
        [timeline]
    );

    const spellOptions = useMemo(() => {
        const ids = Array.from(new Set(rawEvents.map((event) => event.spellId)));
        return ids.sort((a, b) => a - b);
    }, [rawEvents]);

    const [selectedSpell, setSelectedSpell] = useState<number | null>(spellOptions[0] ?? null);
    const [hoveredAttempt, setHoveredAttempt] = useState<string | null>(null);
    const [hoveredEvent, setHoveredEvent] = useState<number | null>(null);

    const filteredEvents = useMemo(() => {
        if (selectedSpell === null) return [];
        return rawEvents.filter((event) => event.spellId === selectedSpell);
    }, [rawEvents, selectedSpell]);

    const filteredAttempts = useMemo(() => {
        if (selectedSpell === null) return [];
        return attempts.filter((attempt) => attempt.spellId === selectedSpell);
    }, [attempts, selectedSpell]);

    const resolvedAttemptsById = useMemo(() => {
        const map = new Map<string, AttemptRecord>();
        resolvedAttempts.forEach((attempt) => map.set(attempt.id, attempt));
        return map;
    }, [resolvedAttempts]);

    if (!spellOptions.length) {
        return null;
    }

    return (
        <section className={styles.debugInspector}>
            <div className={styles.debugHeader}>
                <div>
                    <div className={styles.debugTitle}>Debug Spell Inspector</div>
                    <div className={styles.debugSubtitle}>
                        Raw events vs intent attempts for a single spell.
                    </div>
                </div>
                <div className={styles.debugSelector}>
                    <label className={styles.debugLabel} htmlFor="debug-spell-select">
                        Spell ID
                    </label>
                    <select
                        id="debug-spell-select"
                        className={styles.debugSelect}
                        value={selectedSpell ?? ""}
                        onChange={(event) => setSelectedSpell(Number(event.target.value))}
                    >
                        {spellOptions.map((id) => (
                            <option key={id} value={id}>
                                {id}
                            </option>
                        ))}
                    </select>
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
                            const isHighlighted = hoveredAttempt && attemptId === hoveredAttempt;
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
                                    <span className={styles.debugTag}>
                                        {status === "unresolved" ? "Unresolved" : status === "ignored" ? "Ignored" : ""}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className={styles.debugPane}>
                    <div className={styles.debugPaneTitle}>Intent Attempts</div>
                    <div className={styles.debugList}>
                        {filteredAttempts.map((attempt) => {
                            const resolved = attempt.resolvedOutcome ?? "unresolved";
                            const isHovered = hoveredEvent !== null && eventToAttemptId.get(hoveredEvent) === attempt.id;
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
                                            {resolved === "unresolved"
                                                ? "Unresolved"
                                                : resolved.toUpperCase()}
                                        </span>
                                        <span className={styles.debugTime}>
                                            {formatTime(attempt.startTime)} - {formatTime(attempt.endTime)}
                                        </span>
                                    </div>
                                    <div className={styles.debugMeta}>
                                        <span>
                                            {attempt.grouping === "castGUID"
                                                ? `castGUID: ${attempt.castGUID ?? "-"}`
                                                : `fallback window (${attempt.windowMs}ms)`}
                                        </span>
                                        <span>{attempt.events.length} events</span>
                                    </div>
                                    <div className={styles.debugExplanation}>
                                        {getAttemptExplanation(attempt)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}
