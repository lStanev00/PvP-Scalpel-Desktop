import { createContext, ReactNode, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import luaJson from "lua-json";
import { Match, MatchV2, MatchWithId } from "../Interfaces/matches";
import { buildMatchComputed, extractMatchKey, toStoredComputedMatch } from "../Domain/computedMatch";

const logSchemaMismatch = (message: string, details?: unknown) => {
    if (import.meta.env.DEV) {
        console.warn(`[matches] ${message}`, details ?? "");
    }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

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
    if (!isPlainObject(value)) return null;

    const direct = value.durationSeconds;
    if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) {
        return Math.max(0, Math.round(direct));
    }

    const soloShuffle = value.soloShuffle;
    if (isPlainObject(soloShuffle)) {
        const duration = soloShuffle.duration;
        if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
            return Math.max(0, Math.round(duration));
        }
    }

    const matchDetails = value.matchDetails;
    if (isPlainObject(matchDetails)) {
        const rawLength = matchDetails.matchLength ?? matchDetails.duration;
        if (typeof rawLength === "number" && Number.isFinite(rawLength) && rawLength > 0) {
            return Math.max(0, Math.round(rawLength));
        }
        if (typeof rawLength === "string") {
            const trimmed = rawLength.trim();
            if (/^\d+:\d{2}$/.test(trimmed)) {
                const [mins, secs] = trimmed.split(":").map((part) => Number(part));
                if (Number.isFinite(mins) && Number.isFinite(secs)) {
                    return Math.max(0, Math.round(mins * 60 + secs));
                }
            }
            const numeric = Number(trimmed);
            if (Number.isFinite(numeric) && numeric > 0) {
                return Math.max(0, Math.round(numeric));
            }
        }
    }

    const timeline = value.timeline;
    if (Array.isArray(timeline) && timeline.length > 0) {
        const maxTime = timeline.reduce((max, row) => {
            if (!isPlainObject(row)) return max;
            const t = row.t;
            if (typeof t !== "number" || !Number.isFinite(t)) return max;
            return t > max ? t : max;
        }, 0);
        if (maxTime > 0) {
            return Math.max(0, Math.round(maxTime));
        }
    }

    return null;
};

const readTelemetryVersion = (value: unknown) => {
    if (!isPlainObject(value)) return Number.NaN;
    const telemetryVersion = value.telemetryVersion;
    return typeof telemetryVersion === "number" ? telemetryVersion : Number(telemetryVersion);
};

const extractLuaTable = (content: string, key: string) => {
    const idx = content.indexOf(key);
    if (idx === -1) return null;

    const startEq = content.indexOf("=", idx);
    if (startEq === -1) return null;

    let i = startEq + 1;
    while (i < content.length && /\s/.test(content[i])) i += 1;
    if (content[i] !== "{") return null;

    let depth = 0;
    let inString = false;
    let stringChar = "";
    let escaped = false;
    const tableStart = i;

    for (; i < content.length; i += 1) {
        const ch = content[i];
        const next = content[i + 1];

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

        if (ch === "-" && next === "-") {
            while (i < content.length && content[i] !== "\n") i += 1;
            continue;
        }

        if (ch === "{") {
            depth += 1;
        } else if (ch === "}") {
            depth -= 1;
            if (depth === 0) {
                return content.slice(tableStart, i + 1);
            }
        }
    }

    return null;
};

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
};

export const MatchesContext = createContext<MatchWithId[] | null>(null);

export const MatchesProvider = ({ children }: { children: ReactNode }) => {
    const [matches, setMatches] = useState<MatchWithId[]>([]);
    const lastLoggedCount = useRef<number | null>(null);
    const hasParseError = useRef(false);

    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout> | null = null;
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
                            ? (normalizedParsedMatch as MatchV2)
                            : (normalizedParsedMatch as Match)),
                        interruptSpellIds: [],
                    });
                } catch {
                    failedCount += 1;
                }
            }

            if (!results.length) return;
            setMatches((prev) => (prev.length > 0 ? prev : results));
            invoke("push_log", {
                message:
                    failedCount > 0
                        ? `Computed store bootstrap (${results.length} loaded, ${failedCount} failed)`
                        : `Computed store bootstrap (${results.length} matches)`,
            }).catch(() => undefined);
        };

        const unlistenPromise = listen<{ account: string; path: string; gameState?: string }>(
            "savedvars-updated",
            async ({ payload }) => {
                if (timeout) clearTimeout(timeout);

                timeout = setTimeout(async () => {
                    try {
                        invoke("push_log", {
                            message: `SavedVariables event received (${payload.account || "unknown"})`,
                        }).catch(() => undefined);

                        const fileContent = await invoke<string>("read_saved_variables", {
                            path: payload.path,
                        });

                        if (!fileContent) {
                            invoke("push_log", {
                                message: "SavedVariables read returned empty content",
                            }).catch(() => undefined);
                            return;
                        }

                        const table = extractLuaTable(fileContent, "PvP_Scalpel_DB");
                        if (!table) {
                            logSchemaMismatch("PvP_Scalpel_DB not found or malformed");
                            invoke("push_log", {
                                message: "PvP_Scalpel_DB not found or malformed",
                            }).catch(() => undefined);
                            return;
                        }

                        const interruptSpellIds = coerceNumericIdArray(
                            (() => {
                                const kickTable = extractLuaTable(fileContent, "PvP_Scalpel_InteruptSpells");
                                if (!kickTable) return [];
                                try {
                                    return luaJson.parse("return " + kickTable);
                                } catch {
                                    return [];
                                }
                            })()
                        );

                        let parsedArray: unknown;
                        try {
                            parsedArray = luaJson.parse("return " + table);
                        } catch (parseErr) {
                            const recoveredMatches = parseMatchesFallback(table);
                            if (recoveredMatches.length > 0) {
                                parsedArray = recoveredMatches;
                                if (import.meta.env.DEV) {
                                    console.warn(
                                        "[matches] full table parse failed; fallback recovered entries",
                                        { recovered: recoveredMatches.length, parseErr }
                                    );
                                }
                                invoke("push_log", {
                                    message: `Match parse fallback recovered ${recoveredMatches.length} entries`,
                                }).catch(() => undefined);
                            } else {
                            if (import.meta.env.DEV) {
                                console.error("[matches] lua-json parse failed", parseErr);
                            }
                            invoke("push_log", {
                                message: "Match parse failed (lua-json)",
                            }).catch(() => undefined);
                            return;
                            }
                        }

                        const parsedMatches = coerceMatchesArray(parsedArray);
                        if (!parsedMatches.length) {
                            if (import.meta.env.DEV) {
                                console.warn("[matches] PvP_Scalpel_DB parsed but has no iterable match entries", {
                                    parsedType: typeof parsedArray,
                                    isArray: Array.isArray(parsedArray),
                                    keys: isPlainObject(parsedArray) ? Object.keys(parsedArray).slice(0, 12) : [],
                                });
                            }
                        }

                        invoke("push_log", {
                            message: `Parsed ${parsedMatches.length} raw match entries`,
                        }).catch(() => undefined);

                        const gcPendingKeys = toPendingMatchKeys(
                            (() => {
                                const gcTable = extractLuaTable(fileContent, "PvP_Scalpel_GC");
                                if (!gcTable) return {};
                                try {
                                    return luaJson.parse("return " + gcTable);
                                } catch {
                                    return {};
                                }
                            })()
                        );
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

                            if (computedEntries.length > 0) {
                                const persisted = await invoke("upsert_computed_matches", {
                                    account: accountKey,
                                    matches: computedEntries,
                                })
                                    .then(() => true)
                                    .catch(() => false);

                                if (persisted) {
                                    const syncedKeys = computedEntries
                                        .map((entry) =>
                                            typeof entry.matchKey === "string"
                                                ? entry.matchKey.trim()
                                                : ""
                                        )
                                        .filter((value): value is string => !!value);

                                    if (syncedKeys.length > 0) {
                                        const syncedCount = await invoke<number>("mark_gc_matches_synced", {
                                            path: payload.path,
                                            keys: syncedKeys,
                                        }).catch(() => 0);

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
                            if (
                                rawSource &&
                                Number.isFinite(telemetryVersion) &&
                                telemetryVersion >= 3
                            ) {
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

                        if (computedBackfill.length > 0) {
                            await invoke("upsert_computed_matches", {
                                account: accountKey,
                                matches: computedBackfill,
                            }).catch(() => undefined);
                            invoke("push_log", {
                                message: `Computed matches backfilled (${computedBackfill.length})`,
                            }).catch(() => undefined);
                        }

                        const mergedParsedMatches = mergeMatchesByKey(
                            parsedMatches,
                            normalizedComputedForMerge
                        );

                        if (!mergedParsedMatches.length) {
                            invoke("push_log", {
                                message: "Match data found, but entries are empty",
                            }).catch(() => undefined);
                            return;
                        }

                        const results: MatchWithId[] = [];
                        let failedCount = 0;

                        for (const parsedMatch of mergedParsedMatches) {
                            try {
                                const matchKey = extractMatchKey(parsedMatch);
                                const fallbackDuration =
                                    matchKey ? computedDurationByKey.get(matchKey) : undefined;
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
                                const id = await invoke<string>("identify_match", {
                                    obj: normalizedParsedMatch,
                                });

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
                                        ? (normalizedParsedMatch as MatchV2)
                                        : (normalizedParsedMatch as Match)),
                                    interruptSpellIds,
                                });
                            } catch (matchErr) {
                                failedCount += 1;
                                if (import.meta.env.DEV) {
                                    console.error("[matches] identify/normalize failed for one match", matchErr);
                                }
                            }
                        }

                        setMatches(results);
                        if (lastLoggedCount.current !== results.length || failedCount > 0) {
                            lastLoggedCount.current = results.length;
                            invoke("push_log", {
                                message:
                                    failedCount > 0
                                        ? `Match data updated (${results.length} loaded, ${failedCount} failed)`
                                        : `Match data updated (${results.length} matches)`,
                            }).catch(() => undefined);
                        }
                        hasParseError.current = false;
                    } catch (err) {
                        if (import.meta.env.DEV) {
                            console.error("SavedVariables read error:", err);
                        }
                        if (!hasParseError.current) {
                            hasParseError.current = true;
                            invoke("push_log", {
                                message: "Match data update failed",
                            }).catch(() => undefined);
                        }
                    }
                }, 350);
            }
        );

        hydrateFromComputedStore().catch(() => undefined);

        unlistenPromise
            .then(() => invoke("scan_saved_vars"))
            .catch(() => {
                // Ignore scan failures; watcher will still deliver updates.
            });

        return () => {
            unlistenPromise.then((unlisten) => unlisten());
            if (timeout) clearTimeout(timeout);
        };
    }, []);

    return <MatchesContext.Provider value={matches}>{children}</MatchesContext.Provider>;
};
