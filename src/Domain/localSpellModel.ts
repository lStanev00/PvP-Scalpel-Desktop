import { resolveIntentAttempts } from "../Components/DataActivity/spellCastResolver";
import type { MatchTimelineEntry } from "../Components/DataActivity/types";
import type {
    ComputedSpellOutcomeCounts,
    NormalizedLocalLossOfControlEntry,
    NormalizedLocalSpellAttempt,
    NormalizedLocalSpellEvent,
    NormalizedLocalSpellModel,
    SpellOutcomeResult,
} from "../Interfaces/local-spell-model";

const MODEL_SCHEMA_VERSION = 2;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const toFiniteNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return Number(value);
    }
    return null;
};

const toPositiveNumber = (value: unknown) => {
    const parsed = toFiniteNumber(value);
    return parsed !== null && parsed > 0 ? parsed : null;
};

const toInteger = (value: unknown) => {
    const parsed = toFiniteNumber(value);
    return parsed !== null ? Math.trunc(parsed) : null;
};

const toTrimmedString = (value: unknown) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
};

const toBoolean = (value: unknown) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return null;
        if (normalized === "true" || normalized === "yes" || normalized === "y") return true;
        if (normalized === "false" || normalized === "no" || normalized === "n") return false;
        if (normalized === "1") return true;
        if (normalized === "0") return false;
    }
    return null;
};

const normalizeToken = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

const toOrderedIndexedRows = (value: unknown) => {
    if (Array.isArray(value)) {
        return value.map((item, index) => ({ rawIndex: index, item }));
    }

    if (!isRecord(value)) return [];

    return Object.entries(value)
        .filter(([key]) => /^\d+$/.test(key))
        .map(([key, item]) => ({ rawIndex: Number(key), item }))
        .filter(({ rawIndex }) => Number.isFinite(rawIndex))
        .sort((a, b) => a.rawIndex - b.rawIndex);
};

const readIndexedValue = (row: Record<string, unknown>, index: number) => {
    if (String(index) in row) return row[String(index)];
    if (index in row) return row[index];
    return undefined;
};

const buildSchemaIndex = (schemaRow: unknown) => {
    const out: Record<string, number> = {};

    const setField = (name: unknown, index: unknown) => {
        const normalizedName = typeof name === "string" ? normalizeToken(name) : "";
        const normalizedIndex = toInteger(index);
        if (!normalizedName || normalizedIndex === null || normalizedIndex < 0) return;
        out[normalizedName] = normalizedIndex;
    };

    if (Array.isArray(schemaRow)) {
        schemaRow.forEach((entry, index) => {
            if (typeof entry === "string") {
                setField(entry, index);
                return;
            }

            if (Array.isArray(entry) && entry.length >= 2) {
                const [first, second] = entry;
                if (typeof first === "string") {
                    setField(first, second);
                    return;
                }
                if (typeof second === "string") {
                    setField(second, first);
                }
                return;
            }

            if (isRecord(entry)) {
                const name =
                    entry.name ?? entry.key ?? entry.field ?? entry.label ?? entry.id ?? entry.column;
                const schemaIndex =
                    entry.index ?? entry.idx ?? entry.slot ?? entry.position ?? entry.columnIndex;
                if (name !== undefined) {
                    setField(name, schemaIndex ?? index);
                }
            }
        });
    } else if (isRecord(schemaRow)) {
        Object.entries(schemaRow).forEach(([key, value]) => {
            if (/^\d+$/.test(key) && typeof value === "string") {
                setField(value, Number(key));
                return;
            }

            if (!/^\d+$/.test(key) && typeof value === "number") {
                setField(key, value);
                return;
            }

            if (isRecord(value)) {
                const name = value.name ?? value.key ?? value.field ?? key;
                const schemaIndex =
                    value.index ?? value.idx ?? value.slot ?? value.position ?? value.columnIndex;
                setField(name, schemaIndex);
            }
        });
    }

    return Object.keys(out).length > 0 ? out : null;
};

const readField = (
    row: unknown,
    schemaIndex: Record<string, number> | null,
    aliases: readonly string[]
): unknown => {
    const normalizedAliases = aliases.map((alias) => normalizeToken(alias));

    if (Array.isArray(row)) {
        if (!schemaIndex) return undefined;
        for (const alias of normalizedAliases) {
            const index = schemaIndex[alias];
            if (typeof index === "number" && index >= 0 && index < row.length) {
                return row[index];
            }
        }
        return undefined;
    }

    if (!isRecord(row)) return undefined;

    if (schemaIndex) {
        for (const alias of normalizedAliases) {
            const index = schemaIndex[alias];
            if (typeof index === "number") {
                const indexed = readIndexedValue(row, index);
                if (indexed !== undefined) return indexed;
            }
        }
    }

    const entries = Object.entries(row);
    for (const alias of normalizedAliases) {
        const direct = entries.find(([key]) => normalizeToken(key) === alias);
        if (direct) return direct[1];
    }

    return undefined;
};

const coerceStringArray = (value: unknown) => {
    if (Array.isArray(value)) {
        return value
            .map((entry) => toTrimmedString(entry))
            .filter((entry): entry is string => !!entry);
    }

    if (isRecord(value)) {
        return Object.entries(value)
            .filter(([, entry]) => entry === true || entry === 1 || entry === "1")
            .map(([key]) => key);
    }

    const single = toTrimmedString(value);
    return single ? [single] : [];
};

const coerceLinkedLoc = (value: unknown) => {
    if (Array.isArray(value)) {
        return value
            .map((entry) => toInteger(entry))
            .filter((entry): entry is number => entry !== null && entry >= 0);
    }

    if (isRecord(value)) {
        const direct =
            toInteger(value.id ?? value.index ?? value.entry ?? value.locIndex ?? value.linkedLoc);
        if (direct !== null && direct >= 0) {
            return [direct];
        }
        const indexed = toOrderedIndexedRows(value);
        if (indexed.length > 0) {
            return indexed
                .map(({ item }) => toInteger(item))
                .filter((entry): entry is number => entry !== null && entry >= 0);
        }
    }

    const single = toInteger(value);
    return single !== null && single >= 0 ? [single] : [];
};

const normalizeEventName = (value: unknown) => {
    const raw = toTrimmedString(value);
    if (!raw) return null;
    return raw.replace(/[\s-]+/g, "_").toUpperCase();
};

const normalizeOutcome = (value: unknown): SpellOutcomeResult | null => {
    const token = typeof value === "string" ? normalizeToken(value) : "";
    if (!token) return null;
    if (token.includes("succeed") || token === "success" || token === "ok") {
        return "succeeded";
    }
    if (token.includes("interrupt")) {
        return "interrupted";
    }
    if (
        token.includes("fail") ||
        token.includes("quiet") ||
        token.includes("cancel") ||
        token.includes("stop")
    ) {
        return "failed";
    }
    return null;
};

const castFieldAliases = {
    spellId: ["spellID", "spellId", "spell", "abilityId"],
    castGuid: ["castGUID", "castGuid", "castId"],
    time: ["t", "time", "timestamp", "at"],
    startTime: ["startTime", "firstObservedTime", "firstTime", "startedAt"],
    endTime: ["endTime", "lastTime", "completedAt", "resolvedAt"],
    duration: ["duration", "elapsed", "castDuration"],
    outcome: ["outcome", "result", "status", "resolvedOutcome"],
    firstEvent: ["firstEvent", "firstObservedEvent", "startEvent", "openEvent"],
    terminalEvent: ["terminalEvent", "outcomeEvent", "lastEvent", "endEvent"],
    interruptible: ["interruptible", "isInterruptible", "canBeInterrupted"],
    interruptedBy: ["interruptedBy", "interruptSource", "interruptSpell"],
    linkedLoc: ["linkedLoc", "locLink", "locIndex", "linkedLocIndex"],
    roundIndex: ["roundIndex", "round"],
    fakeCastStopReason: ["fakeCastStopReason", "stopReason", "fakeStopReason", "cancelReason"],
    targetInfo: ["targetInfo", "targetSnapshot", "target"],
    provenance: ["provenance", "provenanceFlags", "sourceFlags", "flags"],
} as const;

const locFieldAliases = {
    time: ["t", "time", "timestamp", "at", "startTime"],
    duration: ["duration", "elapsed"],
    roundIndex: ["roundIndex", "round"],
    locType: ["locType", "type"],
    displayText: ["displayText", "text", "label"],
    issuedByGuid: ["issuedByGuid", "sourceGuid"],
    auraInstanceId: ["auraInstanceId", "auraId"],
    school: ["school", "lockoutSchool", "schoolMask"],
} as const;

const normalizeLegacyLocalSpellModel = (rawMatch: unknown): NormalizedLocalSpellModel | null => {
    if (!isRecord(rawMatch)) return null;
    const timeline = Array.isArray(rawMatch.timeline)
        ? (rawMatch.timeline as MatchTimelineEntry[])
        : [];
    if (timeline.length === 0) return null;

    const resolved = resolveIntentAttempts(timeline);
    const attempts = resolved.attempts.map<NormalizedLocalSpellAttempt>((attempt) => ({
        id: attempt.id,
        spellId: attempt.spellId,
        castGUID: attempt.castGUID,
        startTime: attempt.startTime,
        endTime: attempt.endTime,
        windowMs: attempt.windowMs,
        grouping: attempt.grouping,
        events: attempt.events.map((event) => ({
            id: event.id,
            t: event.t,
            spellId: event.spellId,
            event: event.event,
            castGUID: event.castGUID,
            index: event.index,
        })),
        outcomes: Array.from(attempt.outcomes.values()),
        resolvedOutcome: attempt.resolvedOutcome,
    }));
    const events = resolved.rawEvents.map<NormalizedLocalSpellEvent>((event) => ({
        id: event.id,
        t: event.t,
        spellId: event.spellId,
        event: event.event,
        castGUID: event.castGUID,
        index: event.index,
    }));
    const durationSecondsHint =
        attempts.length > 0 ? Math.max(...attempts.map((attempt) => attempt.endTime)) : null;

    return {
        schemaVersion: MODEL_SCHEMA_VERSION,
        sourceFormat: "legacy-timeline",
        detailAvailable: true,
        attempts,
        events,
        locEntries: [],
        durationSecondsHint,
    };
};

const normalizeLocEntries = (rawMatch: Record<string, unknown>) => {
    const localLossOfControl = rawMatch.localLossOfControl;
    if (!localLossOfControl) return [] as NormalizedLocalLossOfControlEntry[];

    const root = isRecord(localLossOfControl) ? localLossOfControl : {};
    const rows = toOrderedIndexedRows(root.entries ?? localLossOfControl);
    if (rows.length === 0) return [] as NormalizedLocalLossOfControlEntry[];

    const schemaIndex = buildSchemaIndex(rows[0]?.item);
    const hasArrayRows = rows.some(({ item }) => Array.isArray(item));
    if (!schemaIndex && hasArrayRows) {
        return [] as NormalizedLocalLossOfControlEntry[];
    }
    const dataRows =
        schemaIndex && rows[0]?.rawIndex === 0 ? rows.slice(1) : rows;

    const entries = dataRows
        .map<NormalizedLocalLossOfControlEntry | null>(({ rawIndex, item }) => {
            const t =
                toFiniteNumber(readField(item, schemaIndex, locFieldAliases.time)) ??
                0;
            const duration = toFiniteNumber(readField(item, schemaIndex, locFieldAliases.duration));
            const roundIndex = toInteger(readField(item, schemaIndex, locFieldAliases.roundIndex));
            const issuedByGuid = toTrimmedString(
                readField(item, schemaIndex, locFieldAliases.issuedByGuid)
            );
            const auraInstanceId = toInteger(
                readField(item, schemaIndex, locFieldAliases.auraInstanceId)
            );
            const displayText = toTrimmedString(
                readField(item, schemaIndex, locFieldAliases.displayText)
            );
            const locType = toTrimmedString(readField(item, schemaIndex, locFieldAliases.locType));
            const schoolValue = readField(item, schemaIndex, locFieldAliases.school);
            const school = typeof schoolValue === "string" || typeof schoolValue === "number"
                ? schoolValue
                : null;

            return {
                id: rawIndex,
                t,
                duration,
                endTime: duration !== null ? t + duration : t,
                roundIndex,
                locType,
                displayText,
                issuedByGuid,
                auraInstanceId,
                school,
                raw: item,
            };
        })
        .filter((entry): entry is NormalizedLocalLossOfControlEntry => !!entry)
        .sort((a, b) => (a.t === b.t ? a.id - b.id : a.t - b.t));

    return entries;
};

const buildPseudoAttemptEvents = ({
    eventCursor,
    spellId,
    castGUID,
    startTime,
    endTime,
    firstEvent,
    terminalEvent,
    resolvedOutcome,
}: {
    eventCursor: { current: number };
    spellId: number;
    castGUID?: string;
    startTime: number;
    endTime: number;
    firstEvent: string | null;
    terminalEvent: string | null;
    resolvedOutcome?: SpellOutcomeResult;
}) => {
    const events: NormalizedLocalSpellEvent[] = [];
    const createEvent = (t: number, event: string) => {
        const id = eventCursor.current;
        eventCursor.current += 1;
        events.push({
            id,
            t,
            spellId,
            event,
            castGUID,
            index: id,
            pseudo: true,
        });
    };

    if (firstEvent) {
        createEvent(startTime, firstEvent);
    }

    const resolvedEvent =
        terminalEvent ??
        (resolvedOutcome === "succeeded"
            ? "SUCCEEDED"
            : resolvedOutcome === "interrupted"
              ? "INTERRUPTED"
              : resolvedOutcome === "failed"
                ? "FAILED"
                : null);

    if (resolvedEvent) {
        const shouldCreateResolved =
            events.length === 0 ||
            events[events.length - 1]?.event !== resolvedEvent ||
            events[events.length - 1]?.t !== endTime;
        if (shouldCreateResolved) {
            createEvent(endTime, resolvedEvent);
        }
    }

    return events;
};

const normalizeV4LocalSpellModel = (rawMatch: unknown): NormalizedLocalSpellModel | null => {
    if (!isRecord(rawMatch)) return null;
    const localSpellCapture = rawMatch.localSpellCapture;
    if (!localSpellCapture || (!Array.isArray(localSpellCapture) && !isRecord(localSpellCapture))) {
        return null;
    }

    const groups = Object.entries(localSpellCapture);

    const attempts: NormalizedLocalSpellAttempt[] = [];
    const events: NormalizedLocalSpellEvent[] = [];
    const locEntries = normalizeLocEntries(rawMatch);
    const eventCursor = { current: 0 };
    let unsupportedArrayGroup = false;

    groups.forEach(([groupKey, groupValue]) => {
        if (groupKey === "schema" || groupKey === "fields") return;

        const groupRecord = isRecord(groupValue) ? groupValue : {};
        const castsRows = toOrderedIndexedRows(groupRecord.casts ?? groupValue);
        if (castsRows.length === 0) return;

        const schemaIndex = buildSchemaIndex(castsRows[0]?.item);
        const hasArrayRows = castsRows.some(({ item }) => Array.isArray(item));
        if (!schemaIndex && hasArrayRows) {
            unsupportedArrayGroup = true;
            return;
        }

        const dataRows =
            schemaIndex && castsRows[0]?.rawIndex === 0 ? castsRows.slice(1) : castsRows;
        const groupSpellId =
            toInteger(groupRecord.spellID ?? groupRecord.spellId ?? groupKey) ?? null;

        dataRows.forEach(({ rawIndex, item }) => {
            const spellId =
                toInteger(readField(item, schemaIndex, castFieldAliases.spellId)) ??
                groupSpellId;
            if (spellId === null || spellId <= 0) return;

            const castGUID = toTrimmedString(readField(item, schemaIndex, castFieldAliases.castGuid)) ?? undefined;
            const explicitTime = toFiniteNumber(readField(item, schemaIndex, castFieldAliases.time));
            const explicitStart = toFiniteNumber(readField(item, schemaIndex, castFieldAliases.startTime));
            const explicitEnd = toFiniteNumber(readField(item, schemaIndex, castFieldAliases.endTime));
            const explicitDuration = toFiniteNumber(readField(item, schemaIndex, castFieldAliases.duration));
            const startTime = explicitStart ?? explicitTime ?? explicitEnd ?? 0;
            const endTime =
                explicitEnd ??
                (explicitDuration !== null ? startTime + explicitDuration : explicitTime ?? startTime);
            const clampedEndTime = endTime >= startTime ? endTime : startTime;
            const firstEvent = normalizeEventName(readField(item, schemaIndex, castFieldAliases.firstEvent));
            const terminalEvent = normalizeEventName(
                readField(item, schemaIndex, castFieldAliases.terminalEvent)
            );
            const outcome =
                normalizeOutcome(readField(item, schemaIndex, castFieldAliases.outcome)) ??
                normalizeOutcome(terminalEvent);
            const interruptible = toBoolean(
                readField(item, schemaIndex, castFieldAliases.interruptible)
            );
            const roundIndex = toInteger(readField(item, schemaIndex, castFieldAliases.roundIndex));
            const interruptedBy = readField(item, schemaIndex, castFieldAliases.interruptedBy);
            const linkedLoc = coerceLinkedLoc(readField(item, schemaIndex, castFieldAliases.linkedLoc));
            const fakeCastStopReason = toTrimmedString(
                readField(item, schemaIndex, castFieldAliases.fakeCastStopReason)
            );
            const targetInfo = readField(item, schemaIndex, castFieldAliases.targetInfo);
            const provenance = coerceStringArray(
                readField(item, schemaIndex, castFieldAliases.provenance)
            );
            const attemptEvents = buildPseudoAttemptEvents({
                eventCursor,
                spellId,
                castGUID,
                startTime,
                endTime: clampedEndTime,
                firstEvent,
                terminalEvent,
                resolvedOutcome: outcome ?? undefined,
            });
            events.push(...attemptEvents);

            attempts.push({
                id: castGUID ?? `v4:${spellId}:${rawIndex}:${attempts.length}`,
                spellId,
                castGUID,
                startTime,
                endTime: clampedEndTime,
                windowMs: Math.max(0, clampedEndTime - startTime),
                grouping: castGUID ? "castGUID" : "normalized",
                events: attemptEvents,
                outcomes: outcome ? [outcome] : [],
                resolvedOutcome: outcome ?? undefined,
                roundIndex,
                interruptible,
                interruptedBy,
                linkedLoc,
                fakeCastStopReason,
                targetInfo,
                provenance: provenance.length > 0 ? provenance : undefined,
            });
        });
    });

    const sortedAttempts = attempts.sort((a, b) =>
        a.startTime === b.startTime ? a.id.localeCompare(b.id) : a.startTime - b.startTime
    );
    const sortedEvents = events.sort((a, b) => (a.t === b.t ? a.index - b.index : a.t - b.t));
    const durationCandidates = [
        ...sortedAttempts.map((attempt) => attempt.endTime),
        ...locEntries.map((entry) => entry.endTime ?? entry.t),
    ].filter((value): value is number => Number.isFinite(value) && value > 0);
    const durationSecondsHint =
        durationCandidates.length > 0 ? Math.max(...durationCandidates) : null;

    return {
        schemaVersion: MODEL_SCHEMA_VERSION,
        sourceFormat: "v4-local-spell-capture",
        detailAvailable: sortedAttempts.length > 0 || locEntries.length > 0,
        failureReason:
            sortedAttempts.length === 0 && unsupportedArrayGroup
                ? "unsupported-v4-schema"
                : null,
        attempts: sortedAttempts,
        events: sortedEvents,
        locEntries,
        durationSecondsHint,
    };
};

const coercePersistedEvent = (value: unknown): NormalizedLocalSpellEvent | null => {
    if (!isRecord(value)) return null;
    const id = toInteger(value.id) ?? toInteger(value.index) ?? null;
    const t = toFiniteNumber(value.t) ?? 0;
    const spellId = toInteger(value.spellId) ?? null;
    const event = toTrimmedString(value.event);
    if (id === null || spellId === null || !event) return null;

    return {
        id,
        t,
        spellId,
        event,
        castGUID: toTrimmedString(value.castGUID ?? value.castGuid) ?? undefined,
        index: toInteger(value.index) ?? id,
        pseudo: toBoolean(value.pseudo) ?? undefined,
    };
};

const coercePersistedAttempt = (value: unknown): NormalizedLocalSpellAttempt | null => {
    if (!isRecord(value)) return null;
    const id = toTrimmedString(value.id);
    const spellId = toInteger(value.spellId) ?? null;
    if (!id || spellId === null || spellId <= 0) return null;

    const events = Array.isArray(value.events)
        ? value.events
              .map((entry) => coercePersistedEvent(entry))
              .filter((entry): entry is NormalizedLocalSpellEvent => !!entry)
        : [];
    const outcomes = Array.isArray(value.outcomes)
        ? value.outcomes
              .map((entry) => normalizeOutcome(entry))
              .filter((entry): entry is SpellOutcomeResult => !!entry)
        : [];
    const resolvedOutcome =
        normalizeOutcome(value.resolvedOutcome) ??
        (outcomes.length > 0 ? outcomes[0] : null);

    return {
        id,
        spellId,
        castGUID: toTrimmedString(value.castGUID ?? value.castGuid) ?? undefined,
        startTime: toFiniteNumber(value.startTime) ?? 0,
        endTime: toFiniteNumber(value.endTime) ?? 0,
        windowMs: toFiniteNumber(value.windowMs) ?? 0,
        grouping:
            value.grouping === "castGUID" || value.grouping === "fallback" || value.grouping === "normalized"
                ? value.grouping
                : "normalized",
        events,
        outcomes,
        resolvedOutcome: resolvedOutcome ?? undefined,
        roundIndex: toInteger(value.roundIndex),
        interruptible: toBoolean(value.interruptible),
        interruptedBy: value.interruptedBy,
        linkedLoc: coerceLinkedLoc(value.linkedLoc),
        fakeCastStopReason: toTrimmedString(value.fakeCastStopReason),
        targetInfo: value.targetInfo,
        provenance: coerceStringArray(value.provenance),
    };
};

const coercePersistedLocEntry = (value: unknown): NormalizedLocalLossOfControlEntry | null => {
    if (!isRecord(value)) return null;
    const id = toInteger(value.id);
    if (id === null || id < 0) return null;

    return {
        id,
        t: toFiniteNumber(value.t) ?? 0,
        duration: toFiniteNumber(value.duration),
        endTime: toFiniteNumber(value.endTime),
        roundIndex: toInteger(value.roundIndex),
        locType: toTrimmedString(value.locType),
        displayText: toTrimmedString(value.displayText),
        issuedByGuid: toTrimmedString(value.issuedByGuid),
        auraInstanceId: toInteger(value.auraInstanceId),
        school:
            typeof value.school === "string" || typeof value.school === "number"
                ? value.school
                : null,
        raw: value.raw,
    };
};

const readPersistedLocalSpellModel = (rawMatch: unknown): NormalizedLocalSpellModel | null => {
    if (!isRecord(rawMatch)) return null;
    const computed = isRecord(rawMatch.computed) ? rawMatch.computed : null;
    const model = computed && isRecord(computed.localSpellModel) ? computed.localSpellModel : null;
    if (!model) return null;

    const attempts = Array.isArray(model.attempts)
        ? model.attempts
              .map((entry) => coercePersistedAttempt(entry))
              .filter((entry): entry is NormalizedLocalSpellAttempt => !!entry)
        : [];
    const events = Array.isArray(model.events)
        ? model.events
              .map((entry) => coercePersistedEvent(entry))
              .filter((entry): entry is NormalizedLocalSpellEvent => !!entry)
        : [];
    const locEntries = Array.isArray(model.locEntries)
        ? model.locEntries
              .map((entry) => coercePersistedLocEntry(entry))
              .filter((entry): entry is NormalizedLocalLossOfControlEntry => !!entry)
        : [];
    const normalizedEvents =
        events.length > 0
            ? events
            : attempts
                  .flatMap((attempt) => attempt.events)
                  .sort((a, b) => (a.t === b.t ? a.index - b.index : a.t - b.t));
    const storedSourceFormat = toTrimmedString(model.sourceFormat);
    const sourceFormat =
        storedSourceFormat === "legacy-timeline" ||
        storedSourceFormat === "v4-local-spell-capture" ||
        storedSourceFormat === "persisted-normalized-v2"
            ? storedSourceFormat
            : "persisted-normalized-v2";

    return {
        schemaVersion: MODEL_SCHEMA_VERSION,
        sourceFormat,
        detailAvailable:
            (toBoolean(model.detailAvailable) ?? false) ||
            attempts.length > 0 ||
            locEntries.length > 0,
        failureReason: toTrimmedString(model.failureReason),
        attempts,
        events: normalizedEvents,
        locEntries,
        durationSecondsHint: toFiniteNumber(model.durationSecondsHint),
    };
};

export const resolveLocalSpellModel = (rawMatch: unknown): NormalizedLocalSpellModel | null => {
    const persisted = readPersistedLocalSpellModel(rawMatch);
    if (persisted) return persisted;

    const v4 = normalizeV4LocalSpellModel(rawMatch);
    if (v4) return v4;

    return normalizeLegacyLocalSpellModel(rawMatch);
};

export const buildSpellOutcomeCounts = (
    localSpellModel: NormalizedLocalSpellModel | null
): Record<string, ComputedSpellOutcomeCounts> => {
    if (!localSpellModel) return {};

    return localSpellModel.attempts.reduce<Record<string, ComputedSpellOutcomeCounts>>((out, attempt) => {
        if (!attempt.resolvedOutcome) return out;
        const key = String(attempt.spellId);
        const row = out[key] ?? {
            succeeded: 0,
            interrupted: 0,
            failed: 0,
        };
        row[attempt.resolvedOutcome] += 1;
        out[key] = row;
        return out;
    }, {});
};

export const deriveDurationSecondsFromLocalSpellModel = (
    localSpellModel: NormalizedLocalSpellModel | null
) => {
    if (!localSpellModel) return null;
    const hint = toPositiveNumber(localSpellModel.durationSecondsHint);
    if (hint !== null) return Math.round(hint);

    const durationCandidates = [
        ...localSpellModel.attempts.map((attempt) => attempt.endTime),
        ...localSpellModel.locEntries.map((entry) => entry.endTime ?? entry.t),
    ].filter((value) => Number.isFinite(value) && value > 0);

    return durationCandidates.length > 0 ? Math.round(Math.max(...durationCandidates)) : null;
};

export const resolveMatchDurationSeconds = (rawMatch: unknown) => {
    if (!isRecord(rawMatch)) return null;

    const directDuration = toPositiveNumber(rawMatch.durationSeconds);
    if (directDuration !== null) return Math.round(directDuration);

    const soloShuffle = isRecord(rawMatch.soloShuffle) ? rawMatch.soloShuffle : null;
    const soloDuration = soloShuffle ? toPositiveNumber(soloShuffle.duration) : null;
    if (soloDuration !== null) return Math.round(soloDuration);

    const matchDetails = isRecord(rawMatch.matchDetails) ? rawMatch.matchDetails : null;
    if (matchDetails) {
        const rawLength = matchDetails.matchLength ?? matchDetails.duration;
        const numericLength = toPositiveNumber(rawLength);
        if (numericLength !== null) return Math.round(numericLength);

        const textLength = toTrimmedString(rawLength);
        if (textLength && /^\d+:\d{2}$/.test(textLength)) {
            const [mins, secs] = textLength.split(":").map((part) => Number(part));
            if (Number.isFinite(mins) && Number.isFinite(secs)) {
                return Math.round(mins * 60 + secs);
            }
        }
    }

    const localSpellDuration = deriveDurationSecondsFromLocalSpellModel(resolveLocalSpellModel(rawMatch));
    if (localSpellDuration !== null) return localSpellDuration;

    if (Array.isArray(rawMatch.timeline) && rawMatch.timeline.length > 0) {
        const maxTime = rawMatch.timeline.reduce((max, entry) => {
            if (!isRecord(entry)) return max;
            const t = toFiniteNumber(entry.t);
            return t !== null && t > max ? t : max;
        }, 0);
        if (maxTime > 0) return Math.round(maxTime);
    }

    return null;
};
