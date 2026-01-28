import { createContext, ReactNode, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import luaJson from "lua-json";
import { SpellDataBucket } from "../Interfaces/spell-data";

export const SpellDataContext = createContext<SpellDataBucket | null>(null);

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

const logSchemaMismatch = (message: string, details?: unknown) => {
    if (import.meta.env.DEV) {
        console.warn(`[spell-data] ${message}`, details ?? "");
    }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const validateSpellDataSchema = (value: unknown) => {
    if (!isPlainObject(value)) {
        logSchemaMismatch("Root is not an object");
        return false;
    }

    for (const [bucketKey, bucketValue] of Object.entries(value)) {
        if (!isPlainObject(bucketValue)) {
            logSchemaMismatch(`Bucket '${bucketKey}' is not an object`, bucketValue);
            continue;
        }

        for (const [spellKey, entry] of Object.entries(bucketValue)) {
            if (!isPlainObject(entry)) {
                logSchemaMismatch(`Entry '${bucketKey}.${spellKey}' is not an object`, entry);
                continue;
            }

            const type = entry.type;
            if (
                type !== undefined &&
                type !== "harmfull" &&
                type !== "helpful" &&
                type !== "passive"
            ) {
                logSchemaMismatch(`Entry '${bucketKey}.${spellKey}' has invalid type`, type);
            }
        }
    }

    return true;
};

export const SpellDataProvider = ({ children }: { children: ReactNode }) => {
    const [spellData, setSpellData] = useState<SpellDataBucket>({});
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

                        const luaTable = extractLuaTable(fileContent, "PvP_Scalpel_Spell_Data");
                        if (!luaTable) return;

                        let parsed: unknown;
                        try {
                            parsed = luaJson.parse("return " + luaTable);
                        } catch {
                            return;
                        }

                        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                            return;
                        }

                        validateSpellDataSchema(parsed);
                        setSpellData(parsed as SpellDataBucket);
                        hasParseError.current = false;
                    } catch (err) {
                        if (import.meta.env.DEV) {
                            console.error("Spell data read error:", err);
                        }
                        if (!hasParseError.current) {
                            hasParseError.current = true;
                            invoke("push_log", {
                                message: "Spell data update failed",
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

    return <SpellDataContext.Provider value={spellData}>{children}</SpellDataContext.Provider>;
};
