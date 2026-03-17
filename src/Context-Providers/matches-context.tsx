import { createContext, ReactNode, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import luaJson from "lua-json";
import { Match, MatchV2, MatchV4, MatchWithId } from "../Interfaces/matches";
import { buildMatchComputed, extractMatchKey, toStoredComputedMatch } from "../Domain/computedMatch";
import { extractLuaRootTable } from "../Domain/luaSavedVariables";
import { resolveMatchDurationSeconds } from "../Domain/localSpellModel";

const logSchemaMismatch = (message: string, details?: unknown) => {
    if (import.meta.env.DEV) {
        console.warn(`[matches] ${message}`, details ?? "");
    }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const MATCH_UPDATE_DEBOUNCE_MS = 750;
const MATCH_RETRY_DELAYS_MS = [250, 500, 1000, 1500] as const;

const debugMatches = (message: string, details?: unknown) => {
    if (!import.meta.env.DEV) return;
    if (details === undefined) {
        console.log(`[matches] ${message}`);
        return;
    }
    console.log(`[matches] ${message}`, details);
};

const coerceMatchesArray = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (!isPlainObject(value)) return [];

    const numericEntries = Object.entries(value)
        .filter(([key]) => /^\d+$/.test(key))
        .map(([key, item]) => ({ idx: Number(key), item }))
        .filter(({ idx }) => Number.isFinite(idx))
        .sort((a, b) => a.idx - b.idx);

    return numericEntries.map(({ item }) => item);
};

const coerceNumericIdArray = (value: unknown): number[] => {
    const source = Array.isArray(value) ? value : coerceMatchesArray(value);
    if (!source.length) return [];

    const deduped = new Set<number>();
    source.forEach((item) => {
        const raw =
            typeof item === "number"
                ? item
                : typeof item === "string"
                  ? Number(item)
                  : typeof item === "object" &&
                      item !== null &&
                      "value" in item &&
                      typeof (item as { value?: unknown }).value === "number"
                    ? (item as { value: number }).value
                    : NaN;
        if (Number.isFinite(raw) && raw > 0) {
            deduped.add(Math.trunc(raw));
        }
    });

    return Array.from(deduped).sort((a, b) => a - b);
};

const toPendingMatchKeys = (value: unknown) => {
    const pending = new Set<string>();
    if (!isPlainObject(value)) return pending;

    Object.entries(value).forEach(([rawKey, rawState]) => {
        const key = rawKey.trim();
        const state = typeof rawState === "string" ? rawState.trim().toLowerCase() : "";
        if (key && state === "pending") {
            pending.add(key);
        }
    });

    return pending;
};

const mergeMatchesByKey = (primary: unknown[], overlay: unknown[]) => {
    const byMatchKey = new Map<string, unknown>();
    const unkeyed: unknown[] = [];

    primary.forEach((entry) => {
        const key = extractMatchKey(entry);
        if (!key) {
            unkeyed.push(entry);
            return;
        }
        byMatchKey.set(key, entry);
    });

    overlay.forEach((entry) => {
        const key = extractMatchKey(entry);
        if (!key) {
            unkeyed.push(entry);
            return;
        }
        byMatchKey.set(key, entry);
    });

    return [...unkeyed, ...Array.from(byMatchKey.values())];
};

const deriveDurationSeconds = (value: unknown) => {
    return resolveMatchDurationSeconds(value);
};

const readTelemetryVersion = (value: unknown) => {
    if (!isPlainObject(value)) return Number.NaN;
    const telemetryVersion = value.telemetryVersion;
    return typeof telemetryVersion === "number" ? telemetryVersion : Number(telemetryVersion);
};

<<<<<<< HEAD
const buildMatchWithId = async (
    parsedMatch: unknown,
    interruptSpellIds: number[]
): Promise<MatchWithId> => {
    const derivedDuration = deriveDurationSeconds(parsedMatch);
    const normalizedParsedMatch =
        derivedDuration !== null && isPlainObject(parsedMatch)
            ? ({
                  ...parsedMatch,
                  durationSeconds: derivedDuration,
              } as unknown)
            : parsedMatch;

    const id = await invoke<string>("identify_match", {
        obj: normalizedParsedMatch,
    });

    const telemetryVersion =
        typeof (normalizedParsedMatch as { telemetryVersion?: unknown }).telemetryVersion ===
        "number"
            ? ((normalizedParsedMatch as { telemetryVersion?: number }).telemetryVersion as number)
            : Number.NaN;
    const isTelemetryV2Plus =
        typeof normalizedParsedMatch === "object" &&
        normalizedParsedMatch !== null &&
        Number.isFinite(telemetryVersion) &&
        telemetryVersion >= 2;

    if (isTelemetryV2Plus) {
        validateMatchV2Plus(normalizedParsedMatch);
    } else {
        validateMatchV1(normalizedParsedMatch);
    }

    return {
        id,
        ...(isTelemetryV2Plus
            ? ((telemetryVersion >= 4
                  ? (normalizedParsedMatch as MatchV4)
                  : (normalizedParsedMatch as MatchV2)) as MatchV2 | MatchV4)
            : (normalizedParsedMatch as Match)),
        interruptSpellIds,
    };
};

const getLoadedMatchIdentity = (match: MatchWithId) => {
    const matchKey = extractMatchKey(match);
    if (matchKey) return `match:${matchKey}`;
    return `id:${match.id}`;
};

const mergeLoadedMatchCorpus = (base: MatchWithId[], overlay: MatchWithId[]) => {
    const merged = new Map<string, MatchWithId>();

    base.forEach((match) => {
        merged.set(getLoadedMatchIdentity(match), match);
    });

    overlay.forEach((match) => {
        merged.set(getLoadedMatchIdentity(match), match);
    });

    return Array.from(merged.values());
};

=======
>>>>>>> 4445079 (consumption of the new addon version)
const splitTopLevelLuaEntries = (table: string) => {
    const trimmed = table.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [];
    const body = trimmed.slice(1, -1);
    const entries: string[] = [];

    let start = 0;
    let depthBrace = 0;
    let depthBracket = 0;
    let depthParen = 0;
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let inLineComment = false;

    for (let i = 0; i < body.length; i += 1) {
        const ch = body[i];
        const next = body[i + 1];

        if (inLineComment) {
            if (ch === "\n") inLineComment = false;
            continue;
        }

        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                escaped = true;
                continue;
            }
            if (ch === stringChar) {
                inString = false;
                stringChar = "";
            }
            continue;
        }

        if (ch === "-" && next === "-" && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
            inLineComment = true;
            i += 1;
            continue;
        }

        if (ch === "\"" || ch === "'") {
            inString = true;
            stringChar = ch;
            continue;
        }

        if (ch === "{") depthBrace += 1;
        else if (ch === "}") depthBrace = Math.max(0, depthBrace - 1);
        else if (ch === "[") depthBracket += 1;
        else if (ch === "]") depthBracket = Math.max(0, depthBracket - 1);
        else if (ch === "(") depthParen += 1;
        else if (ch === ")") depthParen = Math.max(0, depthParen - 1);
        else if (ch === "," && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
            const entry = body.slice(start, i).trim();
            if (entry) entries.push(entry);
            start = i + 1;
        }
    }

    const tail = body.slice(start).trim();
    if (tail) entries.push(tail);
    return entries;
};

const findTopLevelAssign = (entry: string) => {
    let depthBrace = 0;
    let depthBracket = 0;
    let depthParen = 0;
    let inString = false;
    let stringChar = "";
    let escaped = false;

    for (let i = 0; i < entry.length; i += 1) {
        const ch = entry[i];

        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                escaped = true;
                continue;
            }
            if (ch === stringChar) {
                inString = false;
                stringChar = "";
            }
            continue;
        }

        if (ch === "\"" || ch === "'") {
            inString = true;
            stringChar = ch;
            continue;
        }

        if (ch === "{") depthBrace += 1;
        else if (ch === "}") depthBrace = Math.max(0, depthBrace - 1);
        else if (ch === "[") depthBracket += 1;
        else if (ch === "]") depthBracket = Math.max(0, depthBracket - 1);
        else if (ch === "(") depthParen += 1;
        else if (ch === ")") depthParen = Math.max(0, depthParen - 1);
        else if (ch === "=" && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
            return i;
        }
    }

    return -1;
};

const parseMatchesFallback = (table: string) => {
    const entries = splitTopLevelLuaEntries(table);
    const recovered: unknown[] = [];

    entries.forEach((entry) => {
        const assignIdx = findTopLevelAssign(entry);
        const value = (assignIdx >= 0 ? entry.slice(assignIdx + 1) : entry).trim();
        if (!value || value === "nil") return;
        try {
            recovered.push(luaJson.parse("return " + value));
        } catch {
            // ignore malformed single entries
        }
    });

    return recovered;
};

const validateMatchV1 = (value: unknown) => {
    if (!isPlainObject(value)) {
        logSchemaMismatch("Match is not an object", value);
        return;
    }
    if (!isPlainObject(value.matchDetails)) {
        logSchemaMismatch("MatchDetails missing or invalid", value.matchDetails);
    }
    if (!Array.isArray(value.players)) {
        logSchemaMismatch("Players missing or invalid", value.players);
    }
};

const validateMatchV2Plus = (value: unknown) => {
    if (!isPlainObject(value)) {
        logSchemaMismatch("Match v2+ is not an object", value);
        return;
    }
    const telemetryVersion =
        typeof value.telemetryVersion === "number" ? value.telemetryVersion : Number.NaN;
    if (!Number.isFinite(telemetryVersion) || telemetryVersion < 2) {
        logSchemaMismatch("Match v2+ telemetryVersion is invalid", value.telemetryVersion);
    }
    if (!isPlainObject(value.matchDetails)) {
        logSchemaMismatch("Match v2+ matchDetails missing or invalid", value.matchDetails);
    }
    if (!Array.isArray(value.players)) {
        logSchemaMismatch("Match v2+ players missing or invalid", value.players);
    }

    if (telemetryVersion >= 4) {
        const hasRawV4Payload =
            isPlainObject(value.localSpellCapture) ||
            Array.isArray(value.localSpellCapture) ||
            isPlainObject(value.localLossOfControl);
        const hasPersistedLocalSpellModel =
            isPlainObject(value.computed) &&
            isPlainObject((value.computed as Record<string, unknown>).localSpellModel);
        if (!hasRawV4Payload && !hasPersistedLocalSpellModel) {
            logSchemaMismatch("Match v4 has no local spell payload or persisted normalized model", value);
        }
    }
};

type MatchReadSuccess = {
    status: "ok";
    fileContent: string;
    parsedMatches: unknown[];
    interruptSpellIds: number[];
    gcPendingKeys: Set<string>;
    recoveredFallbackCount: number;
};

type MatchReadFailure = {
    status: "retryable" | "terminal";
    reason:
        | "empty_content"
        | "db_incomplete"
        | "db_missing"
        | "db_parse_error"
        | "db_extract_error";
};

const waitFor = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

const parseNumericIdTable = (content: string, key: string) => {
    const tableResult = extractLuaRootTable(content, key);
    if (tableResult.status !== "ok") return [];

    try {
        return coerceNumericIdArray(luaJson.parse("return " + tableResult.table));
    } catch {
        return [];
    }
};

const parsePendingGcTable = (content: string) => {
    const tableResult = extractLuaRootTable(content, "PvP_Scalpel_GC");
    if (tableResult.status !== "ok") return new Set<string>();

    try {
        return toPendingMatchKeys(luaJson.parse("return " + tableResult.table));
    } catch {
        return new Set<string>();
    }
};

const readSavedVariablesSnapshot = async (path: string): Promise<MatchReadSuccess | MatchReadFailure> => {
    const fileContent = await invoke<string>("read_saved_variables", {
        path,
    });

    debugMatches("read_saved_variables completed", {
        path,
        contentLength: typeof fileContent === "string" ? fileContent.length : 0,
    });

    if (!fileContent) {
        return {
            status: "terminal",
            reason: "empty_content",
        };
    }

    const dbTableResult = extractLuaRootTable(fileContent, "PvP_Scalpel_DB");
    if (dbTableResult.status !== "ok") {
        debugMatches("root table extraction failed", {
            path,
            status: dbTableResult.status,
        });
        if (dbTableResult.status === "missing") {
            return {
                status: "retryable",
                reason: "db_missing",
            };
        }

        if (dbTableResult.status === "incomplete") {
            return {
                status: "retryable",
                reason: "db_incomplete",
            };
        }

        return {
            status: "terminal",
            reason: "db_extract_error",
        };
    }

    let parsedArray: unknown;
    let recoveredFallbackCount = 0;
    try {
        parsedArray = luaJson.parse("return " + dbTableResult.table);
    } catch (parseErr) {
        const recoveredMatches = parseMatchesFallback(dbTableResult.table);
        if (recoveredMatches.length > 0) {
            parsedArray = recoveredMatches;
            recoveredFallbackCount = recoveredMatches.length;
            if (import.meta.env.DEV) {
                console.warn("[matches] full table parse failed; fallback recovered entries", {
                    recovered: recoveredMatches.length,
                    parseErr,
                });
            }
        } else {
            if (import.meta.env.DEV) {
                console.error("[matches] lua-json parse failed", parseErr);
            }
            return {
                status: "retryable",
                reason: "db_parse_error",
            };
        }
    }

    return {
        status: "ok",
        fileContent,
        parsedMatches: coerceMatchesArray(parsedArray),
        interruptSpellIds: parseNumericIdTable(fileContent, "PvP_Scalpel_InteruptSpells"),
        gcPendingKeys: parsePendingGcTable(fileContent),
        recoveredFallbackCount,
    };
};

export const MatchesContext = createContext<MatchWithId[] | null>(null);

export const MatchesProvider = ({ children }: { children: ReactNode }) => {
    const [matches, setMatches] = useState<MatchWithId[]>([]);
    const matchesRef = useRef<MatchWithId[]>([]);
    const lastLoggedCount = useRef<number | null>(null);
    const lastParseErrorMessage = useRef<string | null>(null);

    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout> | null = null;
        let activeRunId = 0;
<<<<<<< HEAD
        const commitMatches = (nextMatches: MatchWithId[]) => {
            matchesRef.current = nextMatches;
            setMatches(nextMatches);
        };
=======
>>>>>>> 4445079 (consumption of the new addon version)
        const hydrateFromComputedStore = async () => {
            const persistedComputedMatches = await invoke<unknown[]>("load_all_computed_matches").catch(
                () => []
            );
            const computedForMerge = Array.isArray(persistedComputedMatches)
                ? persistedComputedMatches
                : [];
            if (!computedForMerge.length) return;

            const results: MatchWithId[] = [];
            let failedCount = 0;

            for (const parsedMatch of computedForMerge) {
                try {
<<<<<<< HEAD
                    results.push(await buildMatchWithId(parsedMatch, []));
=======
                    const derivedDuration = deriveDurationSeconds(parsedMatch);
                    const normalizedParsedMatch =
                        derivedDuration !== null && isPlainObject(parsedMatch)
                            ? ({
                                  ...parsedMatch,
                                  durationSeconds: derivedDuration,
                              } as unknown)
                            : parsedMatch;

                    const id = await invoke<string>("identify_match", {
                        obj: normalizedParsedMatch,
                    });

                    const telemetryVersion =
                        typeof (normalizedParsedMatch as { telemetryVersion?: unknown })
                            .telemetryVersion === "number"
                            ? ((normalizedParsedMatch as { telemetryVersion?: number }).telemetryVersion as number)
                            : Number.NaN;
                    const isTelemetryV2Plus =
                        typeof normalizedParsedMatch === "object" &&
                        normalizedParsedMatch !== null &&
                        Number.isFinite(telemetryVersion) &&
                        telemetryVersion >= 2;

                    if (isTelemetryV2Plus) {
                        validateMatchV2Plus(normalizedParsedMatch);
                    } else {
                        validateMatchV1(normalizedParsedMatch);
                    }

                    results.push({
                        id,
                        ...(isTelemetryV2Plus
                            ? ((telemetryVersion >= 4
                                  ? (normalizedParsedMatch as MatchV4)
                                  : (normalizedParsedMatch as MatchV2)) as MatchV2 | MatchV4)
                            : (normalizedParsedMatch as Match)),
                        interruptSpellIds: [],
                    });
>>>>>>> 4445079 (consumption of the new addon version)
                } catch {
                    failedCount += 1;
                }
            }

            if (!results.length) return;
            const mergedResults = mergeLoadedMatchCorpus(results, matchesRef.current);
            commitMatches(mergedResults);
            invoke("push_log", {
                message:
                    failedCount > 0
                        ? `Computed store bootstrap (${mergedResults.length} loaded, ${failedCount} failed)`
                        : `Computed store bootstrap (${mergedResults.length} matches)`,
            }).catch(() => undefined);
        };

        const isStaleRun = (runId: number) => runId !== activeRunId;

        const logStaleRun = (runId: number, stage: string) => {
            if (!isStaleRun(runId)) return false;
            debugMatches("run invalidated", {
                runId,
                activeRunId,
                stage,
            });
            return true;
        };

        const pushTerminalParseMessage = (message: string, details?: unknown) => {
            if (details !== undefined) {
                logSchemaMismatch(message, details);
            } else {
                logSchemaMismatch(message);
            }
            if (lastParseErrorMessage.current === message) return;
            lastParseErrorMessage.current = message;
            invoke("push_log", {
                message,
            }).catch(() => undefined);
        };

        const runSavedVariablesUpdate = async (
            payload: { account: string; path: string; gameState?: string },
            runId: number
        ) => {
            try {
                invoke("push_log", {
                    message: `SavedVariables event received (${payload.account || "unknown"})`,
                }).catch(() => undefined);
                debugMatches("run started", {
                    runId,
                    account: payload.account || "unknown",
                    gameState: payload.gameState ?? "unknown",
                    path: payload.path,
                });

                let snapshot: MatchReadSuccess | null = null;

                for (let attempt = 0; attempt <= MATCH_RETRY_DELAYS_MS.length; attempt += 1) {
                    if (logStaleRun(runId, `before-read-attempt-${attempt}`)) return;

                    const readResult = await readSavedVariablesSnapshot(payload.path);
                    if (logStaleRun(runId, `after-read-attempt-${attempt}`)) return;

                    debugMatches("snapshot attempt result", {
                        runId,
                        attempt,
                        status: readResult.status,
                        reason: readResult.status === "ok" ? null : readResult.reason,
                    });

                    if (readResult.status === "ok") {
                        snapshot = readResult;
                        debugMatches("snapshot ready", {
                            runId,
                            parsedMatches: readResult.parsedMatches.length,
                            interruptSpellIds: readResult.interruptSpellIds.length,
                            gcPendingKeys: readResult.gcPendingKeys.size,
                            recoveredFallbackCount: readResult.recoveredFallbackCount,
                        });
                        break;
                    }

                    const isLastAttempt = attempt === MATCH_RETRY_DELAYS_MS.length;
                    if (!isLastAttempt && readResult.status === "retryable") {
                        if (
                            readResult.reason === "db_incomplete" ||
                            readResult.reason === "db_parse_error"
                        ) {
                            debugMatches("retrying transient snapshot failure", {
                                runId,
                                attempt,
                                reason: readResult.reason,
                                nextDelayMs: MATCH_RETRY_DELAYS_MS[attempt],
                            });
                            invoke("push_log", {
                                message: "SavedVariables write in progress, retrying",
                            }).catch(() => undefined);
                        }
                        await waitFor(MATCH_RETRY_DELAYS_MS[attempt]);
                        continue;
                    }

                    if (readResult.reason === "db_incomplete") {
                        pushTerminalParseMessage("PvP_Scalpel_DB incomplete after retries");
                        return;
                    }

                    if (readResult.reason === "db_missing") {
                        pushTerminalParseMessage("PvP_Scalpel_DB missing after retries");
                        return;
                    }

                    if (readResult.reason === "db_parse_error") {
                        pushTerminalParseMessage("Match parse failed after retries");
                        return;
                    }

                    if (readResult.reason === "db_extract_error") {
                        pushTerminalParseMessage("PvP_Scalpel_DB malformed after retries");
                        return;
                    }

                    pushTerminalParseMessage("SavedVariables read returned empty content");
                    return;
                }

                if (!snapshot) {
                    debugMatches("run finished without snapshot", { runId });
                    return;
                }
                if (logStaleRun(runId, "after-snapshot")) return;

                const { parsedMatches, interruptSpellIds, gcPendingKeys, recoveredFallbackCount } =
                    snapshot;

                if (recoveredFallbackCount > 0) {
                    invoke("push_log", {
                        message: `Match parse fallback recovered ${recoveredFallbackCount} entries`,
                    }).catch(() => undefined);
                }

                invoke("push_log", {
                    message: `Parsed ${parsedMatches.length} raw match entries`,
                }).catch(() => undefined);

                const shouldFinalizeComputed =
                    payload.gameState === "not_running" || payload.gameState === "just_closed";
                const accountKey = payload.account?.trim() || "unknown";

                if (import.meta.env.DEV) {
                    console.log("[matches] computed finalize gate", {
                        gameState: payload.gameState ?? "unknown",
                        shouldFinalizeComputed,
                        pendingCount: gcPendingKeys.size,
                        parsedMatches: parsedMatches.length,
                    });
                }

                if (shouldFinalizeComputed && gcPendingKeys.size > 0) {
                    const computedEntries = parsedMatches
                        .filter((entry) => {
                            const matchKey = extractMatchKey(entry);
                            return !!matchKey && gcPendingKeys.has(matchKey);
                        })
                        .map((entry) => {
                            const computed = buildMatchComputed(entry, interruptSpellIds);
                            if (!computed) return null;
                            return toStoredComputedMatch(entry, computed);
                        })
                        .filter((entry): entry is Record<string, unknown> => !!entry);

                    if (import.meta.env.DEV) {
                        console.log("[matches] computed finalize candidates", {
                            pendingCount: gcPendingKeys.size,
                            matchedCount: computedEntries.length,
                        });
                    }
                    debugMatches("computed finalize prepared", {
                        runId,
                        pendingCount: gcPendingKeys.size,
                        matchedCount: computedEntries.length,
                    });

                    if (computedEntries.length > 0 && !isStaleRun(runId)) {
                        const persisted = await invoke("upsert_computed_matches", {
                            account: accountKey,
                            matches: computedEntries,
                        })
                            .then(() => true)
                            .catch(() => false);

                        debugMatches("computed finalize persisted result", {
                            runId,
                            persisted,
                            count: computedEntries.length,
                        });
                        if (logStaleRun(runId, "after-upsert-computed-matches")) return;

                        if (persisted) {
                            const syncedKeys = computedEntries
                                .map((entry) =>
                                    typeof entry.matchKey === "string" ? entry.matchKey.trim() : ""
                                )
                                .filter((value): value is string => !!value);

                            if (syncedKeys.length > 0) {
                                const syncedCount = await invoke<number>("mark_gc_matches_synced", {
                                    path: payload.path,
                                    keys: syncedKeys,
                                }).catch(() => 0);

                                debugMatches("gc sync completed", {
                                    runId,
                                    syncedCount,
                                    keys: syncedKeys,
                                });
                                if (logStaleRun(runId, "after-mark-gc-matches-synced")) return;

                                invoke("push_log", {
                                    message: `GC state updated to synced (${syncedCount})`,
                                }).catch(() => undefined);
                            }

                            invoke("push_log", {
                                message: `Computed matches persisted (${computedEntries.length})`,
                            }).catch(() => undefined);
                        }
                    }
                }

                const persistedComputedMatches = await invoke<unknown[]>("load_computed_matches", {
                    account: accountKey,
                }).catch(() => []);

                debugMatches("loaded persisted computed matches", {
                    runId,
                    account: accountKey,
                    count: Array.isArray(persistedComputedMatches) ? persistedComputedMatches.length : 0,
                });
                if (logStaleRun(runId, "after-load-computed-matches")) return;

                const rawByMatchKey = new Map<string, unknown>();
                parsedMatches.forEach((entry) => {
                    const key = extractMatchKey(entry);
                    if (!key) return;
                    rawByMatchKey.set(key, entry);
                });

                const computedForMerge = Array.isArray(persistedComputedMatches)
                    ? persistedComputedMatches
                    : [];
                const computedDurationByKey = new Map<string, number>();
                const computedBackfill: Record<string, unknown>[] = [];

                const normalizedComputedForMerge = computedForMerge.map((entry) => {
                    if (!isPlainObject(entry)) return entry;
                    const key = extractMatchKey(entry);
                    if (!key) return entry;

                    const existingDuration = deriveDurationSeconds(entry);
                    if (existingDuration !== null) {
                        computedDurationByKey.set(key, existingDuration);
                    }

                    const rawSource = rawByMatchKey.get(key);
                    let patched: Record<string, unknown> | null = null;

                    const hasDuration =
                        typeof entry.durationSeconds === "number" &&
                        Number.isFinite(entry.durationSeconds) &&
                        entry.durationSeconds > 0;
                    const derivedDuration = deriveDurationSeconds(rawSource);
                    if (!hasDuration && derivedDuration !== null) {
                        patched = {
                            ...(patched ?? entry),
                            durationSeconds: derivedDuration,
                        };
                        computedDurationByKey.set(key, derivedDuration);
                    }

                    const telemetryVersion = readTelemetryVersion(rawSource);
                    if (rawSource && Number.isFinite(telemetryVersion) && telemetryVersion >= 3) {
                        const recomputed = buildMatchComputed(rawSource, interruptSpellIds);
                        if (recomputed) {
                            const currentComputed = isPlainObject((patched ?? entry).computed)
                                ? (patched ?? entry).computed
                                : null;
                            const nextComputed = recomputed as unknown as Record<string, unknown>;
                            if (JSON.stringify(currentComputed) !== JSON.stringify(nextComputed)) {
                                patched = {
                                    ...(patched ?? entry),
                                    computed: recomputed as unknown,
                                };
                            }
                        }
                    }

                    if (!patched) return entry;
                    computedBackfill.push(patched);
                    return patched;
                });

                if (computedBackfill.length > 0 && !isStaleRun(runId)) {
                    await invoke("upsert_computed_matches", {
                        account: accountKey,
                        matches: computedBackfill,
                    }).catch(() => undefined);

                    debugMatches("computed backfill persisted", {
                        runId,
                        count: computedBackfill.length,
                    });
                    if (logStaleRun(runId, "after-upsert-computed-backfill")) return;

                    invoke("push_log", {
                        message: `Computed matches backfilled (${computedBackfill.length})`,
                    }).catch(() => undefined);
                }

                const mergedParsedMatches = mergeMatchesByKey(parsedMatches, normalizedComputedForMerge);
                debugMatches("merged raw and computed matches", {
                    runId,
                    rawCount: parsedMatches.length,
                    computedCount: normalizedComputedForMerge.length,
                    mergedCount: mergedParsedMatches.length,
                });

                if (!mergedParsedMatches.length) {
                    debugMatches("merged matches empty", {
                        runId,
                        rawCount: parsedMatches.length,
                        computedCount: normalizedComputedForMerge.length,
                    });
<<<<<<< HEAD
=======
                    setMatches([]);
                    if (lastLoggedCount.current !== 0) {
                        lastLoggedCount.current = 0;
                        invoke("push_log", {
                            message: "Match data updated (0 matches)",
                        }).catch(() => undefined);
                    }
>>>>>>> 4445079 (consumption of the new addon version)
                    lastParseErrorMessage.current = null;
                    return;
                }

                const results: MatchWithId[] = [];
                let failedCount = 0;

                for (const parsedMatch of mergedParsedMatches) {
                    try {
                        const matchKey = extractMatchKey(parsedMatch);
                        const fallbackDuration = matchKey ? computedDurationByKey.get(matchKey) : undefined;
                        const parsedDuration = deriveDurationSeconds(parsedMatch);
                        const effectiveDuration =
                            parsedDuration !== null
                                ? parsedDuration
                                : typeof fallbackDuration === "number" &&
                                    Number.isFinite(fallbackDuration) &&
                                    fallbackDuration > 0
                                  ? fallbackDuration
                                  : null;
                        const normalizedParsedMatch =
                            effectiveDuration !== null && isPlainObject(parsedMatch)
                                ? ({
                                      ...parsedMatch,
                                      durationSeconds: effectiveDuration,
                                  } as unknown)
                                : parsedMatch;
<<<<<<< HEAD
                        const builtMatch = await buildMatchWithId(
                            normalizedParsedMatch,
                            interruptSpellIds
                        );

                        if (logStaleRun(runId, `after-identify-${matchKey ?? "unknown"}`)) return;
                        results.push(builtMatch);
=======
                        const id = await invoke<string>("identify_match", {
                            obj: normalizedParsedMatch,
                        });

                        if (logStaleRun(runId, `after-identify-${matchKey ?? "unknown"}`)) return;

                        const telemetryVersion =
                            typeof (normalizedParsedMatch as { telemetryVersion?: unknown })
                                .telemetryVersion === "number"
                                ? ((normalizedParsedMatch as { telemetryVersion?: number })
                                      .telemetryVersion as number)
                                : Number.NaN;
                        const isTelemetryV2Plus =
                            typeof normalizedParsedMatch === "object" &&
                            normalizedParsedMatch !== null &&
                            Number.isFinite(telemetryVersion) &&
                            telemetryVersion >= 2;

                        if (isTelemetryV2Plus) {
                            validateMatchV2Plus(normalizedParsedMatch);
                        } else {
                            validateMatchV1(normalizedParsedMatch);
                        }

                        results.push({
                            id,
                            ...(isTelemetryV2Plus
                                ? ((telemetryVersion >= 4
                                      ? (normalizedParsedMatch as MatchV4)
                                      : (normalizedParsedMatch as MatchV2)) as MatchV2 | MatchV4)
                                : (normalizedParsedMatch as Match)),
                            interruptSpellIds,
                        });
>>>>>>> 4445079 (consumption of the new addon version)
                    } catch (matchErr) {
                        failedCount += 1;
                        if (import.meta.env.DEV) {
                            console.error("[matches] identify/normalize failed for one match", matchErr);
                        }
                    }
                }

                debugMatches("results built", {
                    runId,
                    results: results.length,
                    failedCount,
                    ids: results.slice(0, 8).map((match) => match.id),
                });
                if (logStaleRun(runId, "before-set-matches")) return;

<<<<<<< HEAD
                if (!results.length) {
                    lastParseErrorMessage.current = null;
                    return;
                }

                const nextMatches = mergeLoadedMatchCorpus(matchesRef.current, results);
                commitMatches(nextMatches);
                debugMatches("setMatches committed", {
                    runId,
                    results: nextMatches.length,
                    refreshed: results.length,
                });
                if (lastLoggedCount.current !== nextMatches.length || failedCount > 0) {
                    lastLoggedCount.current = nextMatches.length;
                    invoke("push_log", {
                        message:
                            failedCount > 0
                                ? `Match data updated (${nextMatches.length} loaded, ${failedCount} failed)`
                                : `Match data updated (${nextMatches.length} matches)`,
=======
                setMatches(results);
                debugMatches("setMatches committed", {
                    runId,
                    results: results.length,
                });
                if (lastLoggedCount.current !== results.length || failedCount > 0) {
                    lastLoggedCount.current = results.length;
                    invoke("push_log", {
                        message:
                            failedCount > 0
                                ? `Match data updated (${results.length} loaded, ${failedCount} failed)`
                                : `Match data updated (${results.length} matches)`,
>>>>>>> 4445079 (consumption of the new addon version)
                    }).catch(() => undefined);
                }
                lastParseErrorMessage.current = null;
            } catch (err) {
                if (import.meta.env.DEV) {
                    console.error("SavedVariables read error:", err);
                }
                pushTerminalParseMessage("Match data update failed", err);
            }
        };

        const unlistenPromise = listen<{ account: string; path: string; gameState?: string }>(
            "savedvars-updated",
            async ({ payload }) => {
                if (timeout) clearTimeout(timeout);

                activeRunId += 1;
                const runId = activeRunId;
                debugMatches("savedvars event queued", {
                    runId,
                    account: payload.account || "unknown",
                    gameState: payload.gameState ?? "unknown",
                    debounceMs: MATCH_UPDATE_DEBOUNCE_MS,
                });

                timeout = setTimeout(() => {
                    void runSavedVariablesUpdate(payload, runId);
                }, MATCH_UPDATE_DEBOUNCE_MS);
            }
        );

        hydrateFromComputedStore().catch(() => undefined);

        unlistenPromise
            .then(() => invoke("scan_saved_vars"))
            .catch(() => {
                // Ignore scan failures; watcher will still deliver updates.
            });

        return () => {
            activeRunId += 1;
            unlistenPromise.then((unlisten) => unlisten());
            if (timeout) clearTimeout(timeout);
        };
    }, []);

    return <MatchesContext.Provider value={matches}>{children}</MatchesContext.Provider>;
};
