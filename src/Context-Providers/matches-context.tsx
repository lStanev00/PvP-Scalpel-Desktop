import { createContext, ReactNode, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import luaJson from "lua-json";
import { Match, MatchWithId } from "../Interfaces/matches";

export const MatchesContext = createContext<MatchWithId[] | null>(null);

export const MatchesProvider = ({ children }: { children: ReactNode }) => {
    const [matches, setMatches] = useState<MatchWithId[]>([]);

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

                        const match = fileContent.match(/PvP_Scalpel_DB\s*=\s*(\{[\s\S]*\})/);
                        if (!match) return;

                        const luaTable = "return " + match[1];

                        let parsedArray: unknown;
                        try {
                            parsedArray = luaJson.parse(luaTable);
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

                                results.push({
                                    id,
                                    ...(parsedMatch as Match),
                                });
                            } catch {
                                // Skip matches that fail to parse.
                            }
                        }

                        setMatches(results);
                    } catch (err) {
                        if (import.meta.env.DEV) {
                            console.error("SavedVariables read error:", err);
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
