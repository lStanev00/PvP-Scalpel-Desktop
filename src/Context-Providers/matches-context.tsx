import { createContext, ReactNode, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import luaJson from "lua-json";
import { Match, MatchV2, MatchWithId } from "../Interfaces/matches";

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

const validateMatchV2 = (value: unknown) => {
    if (!isPlainObject(value)) {
        logSchemaMismatch("Match v2 is not an object", value);
        return;
    }
    if (value.telemetryVersion !== 2) {
        logSchemaMismatch("Match v2 telemetryVersion is not 2", value.telemetryVersion);
    }
    if (!isPlainObject(value.matchDetails)) {
        logSchemaMismatch("Match v2 matchDetails missing or invalid", value.matchDetails);
    }
    if (!Array.isArray(value.players)) {
        logSchemaMismatch("Match v2 players missing or invalid", value.players);
    }
};

export const MatchesContext = createContext<MatchWithId[] | null>(null);

export const MatchesProvider = ({ children }: { children: ReactNode }) => {
    const [matches, setMatches] = useState<MatchWithId[]>([]);
    const lastLoggedCount = useRef<number | null>(null);
    const hasParseError = useRef(false);

    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout> | null = null;

        const unlistenPromise = listen<{ account: string; path: string }>(
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
                            invoke("push_log", {
                                message: "Match data found, but entries are empty",
                            }).catch(() => undefined);
                            return;
                        }

                        invoke("push_log", {
                            message: `Parsed ${parsedMatches.length} raw match entries`,
                        }).catch(() => undefined);

                        const results: MatchWithId[] = [];
                        let failedCount = 0;

                        for (const parsedMatch of parsedMatches) {
                            try {
                                const id = await invoke<string>("identify_match", {
                                    obj: parsedMatch,
                                });

                                const isTelemetryV2 =
                                    typeof parsedMatch === "object" &&
                                    parsedMatch !== null &&
                                    "telemetryVersion" in parsedMatch &&
                                    (parsedMatch as { telemetryVersion?: unknown }).telemetryVersion === 2;

                                if (isTelemetryV2) {
                                    validateMatchV2(parsedMatch);
                                } else {
                                    validateMatchV1(parsedMatch);
                                }

                                results.push({
                                    id,
                                    ...(isTelemetryV2 ? (parsedMatch as MatchV2) : (parsedMatch as Match)),
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
