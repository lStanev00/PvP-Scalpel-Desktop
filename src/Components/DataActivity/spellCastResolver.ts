import type { MatchTimelineEntry } from "./types";

export type Outcome = "succeeded" | "failed" | "interrupted";

export type NormalizedEvent = {
    id: number;
    t: number;
    spellId: number;
    event: string;
    castGUID?: string;
    index: number;
};

export type AttemptRecord = {
    id: string;
    spellId: number;
    castGUID?: string;
    startTime: number;
    endTime: number;
    windowMs: number;
    grouping: "castGUID" | "fallback";
    events: NormalizedEvent[];
    outcomes: Set<Outcome>;
    resolvedOutcome?: Outcome;
};

export type IntentResolution = {
    rawEvents: NormalizedEvent[];
    attempts: AttemptRecord[];
    resolvedAttempts: AttemptRecord[];
    unresolvedAttempts: AttemptRecord[];
    eventToAttemptId: Map<number, string>;
};

const GUID_WINDOW_MS = 800;
const FALLBACK_WINDOW_MS = 250;
const START_TIMEOUT_MS = 1500;

const OUTCOME_PRIORITY: Record<Outcome, number> = {
    succeeded: 3,
    interrupted: 2,
    failed: 1,
};

const normalizeEvent = (entry: MatchTimelineEntry, index: number): NormalizedEvent | null => {
    const spellId = entry.spellID;
    if (typeof spellId !== "number") return null;
    const event = typeof entry.event === "string" ? entry.event.toUpperCase() : "";
    if (!event) return null;
    const t = typeof entry.t === "number" ? entry.t : null;
    if (t === null || Number.isNaN(t)) return null;
    const castGUID = typeof entry.castGUID === "string" ? entry.castGUID : undefined;
    return { id: index, t, spellId, event, castGUID, index };
};

const classifyOutcome = (event: string): Outcome | null => {
    switch (event) {
        case "SUCCEEDED":
            return "succeeded";
        case "FAILED":
        case "FAILED_QUIET":
            return "failed";
        case "INTERRUPTED":
            return "interrupted";
        default:
            return null;
    }
};

const isIntentEvent = (event: string) => {
    return (
        event === "SENT" ||
        event === "START" ||
        event === "SUCCEEDED" ||
        event === "FAILED" ||
        event === "FAILED_QUIET" ||
        event === "INTERRUPTED"
    );
};

export const resolveIntentAttempts = (timeline: MatchTimelineEntry[]): IntentResolution => {
    const rawEvents = timeline
        .map((entry, index) => normalizeEvent(entry, index))
        .filter((entry): entry is NormalizedEvent => !!entry)
        .filter((entry) => isIntentEvent(entry.event))
        .sort((a, b) => (a.t === b.t ? a.index - b.index : a.t - b.t));

    const attempts: AttemptRecord[] = [];
    const openByGuid = new Map<string, AttemptRecord>();
    const openBySpell = new Map<number, AttemptRecord>();
    const eventToAttemptId = new Map<number, string>();

    rawEvents.forEach((evt, idx) => {
        const hasGuid = !!evt.castGUID;
        const windowMs = hasGuid ? GUID_WINDOW_MS : FALLBACK_WINDOW_MS;
        let attempt: AttemptRecord | undefined;

        if (hasGuid && evt.castGUID) {
            const existing = openByGuid.get(evt.castGUID);
            if (existing && evt.t - existing.startTime <= existing.windowMs) {
                attempt = existing;
            }
        } else {
            const existing = openBySpell.get(evt.spellId);
            if (existing && evt.t - existing.startTime <= existing.windowMs) {
                attempt = existing;
            }
        }

        if (!attempt) {
            attempt = {
                id: `${evt.castGUID ?? "spell"}-${evt.spellId}-${evt.t}-${idx}`,
                spellId: evt.spellId,
                castGUID: evt.castGUID,
                startTime: evt.t,
                endTime: evt.t,
                windowMs,
                grouping: hasGuid ? "castGUID" : "fallback",
                events: [],
                outcomes: new Set<Outcome>(),
            };
            attempts.push(attempt);
            if (evt.castGUID) {
                openByGuid.set(evt.castGUID, attempt);
            } else {
                openBySpell.set(evt.spellId, attempt);
            }
        }

        attempt.events.push(evt);
        attempt.endTime = Math.max(attempt.endTime, evt.t);
        eventToAttemptId.set(evt.id, attempt.id);

        const outcome = classifyOutcome(evt.event);
        if (outcome) {
            attempt.outcomes.add(outcome);
            if (
                !attempt.resolvedOutcome ||
                OUTCOME_PRIORITY[outcome] > OUTCOME_PRIORITY[attempt.resolvedOutcome]
            ) {
                attempt.resolvedOutcome = outcome;
            }
        }
    });

    attempts.forEach((attempt) => {
        if (!attempt.resolvedOutcome) {
            attempt.endTime = Math.max(attempt.endTime, attempt.startTime + START_TIMEOUT_MS);
        }
    });

    const resolvedAttempts = attempts.filter((attempt) => attempt.resolvedOutcome);
    const unresolvedAttempts = attempts.filter((attempt) => !attempt.resolvedOutcome);

    return { rawEvents, attempts, resolvedAttempts, unresolvedAttempts, eventToAttemptId };
};
