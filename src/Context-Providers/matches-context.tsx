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
                        const fileContent = await invoke<string>("read_saved_variables", {
                            path: payload.path,
                        });

                        if (!fileContent) return;

                        const table = extractLuaTable(fileContent, "PvP_Scalpel_DB");
                        if (!table) {
                            logSchemaMismatch("PvP_Scalpel_DB not found or malformed");
                            return;
                        }

                        let parsedArray: unknown;
                        try {
                            parsedArray = luaJson.parse("return " + table);
                        } catch {
                            return;
                        }

                        if (!Array.isArray(parsedArray)) {
                            return;
                        }

                        const results: MatchWithId[] = [];

                        for (const parsedMatch of parsedArray) {
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
                                });
                            } catch {
                                // Skip matches that fail to parse.
                            }
                        }

                        setMatches(results);
                        if (lastLoggedCount.current !== results.length) {
                            lastLoggedCount.current = results.length;
                            invoke("push_log", {
                                message: `Match data updated (${results.length} matches)`,
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
