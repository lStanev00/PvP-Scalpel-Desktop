import { createContext, ReactNode, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import luaJson from "lua-json";
import { extractLuaRootTable } from "../Domain/luaSavedVariables";
import { SpellDataBucket } from "../Interfaces/spell-data";

export const SpellDataContext = createContext<SpellDataBucket | null>(null);

const logSchemaMismatch = (message: string, details?: unknown) => {
    if (import.meta.env.DEV) {
        console.warn(`[spell-data] ${message}`, details ?? "");
    }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const isSpellEntry = (value: unknown): value is Record<string, unknown> => {
    if (!isPlainObject(value)) return false;
    return (
        "name" in value ||
        "description" in value ||
        "subtext" in value ||
        "type" in value ||
        "icon" in value ||
        "texture" in value ||
        "iconId" in value ||
        "textureId" in value
    );
};

const validateSpellDataSchema = (value: unknown) => {
    if (!isPlainObject(value)) {
        logSchemaMismatch("Root is not an object");
        return false;
    }

    for (const [bucketKey, bucketValue] of Object.entries(value)) {
        if (isSpellEntry(bucketValue)) {
            const type = (bucketValue as { type?: unknown }).type;
            if (
                type !== undefined &&
                type !== "harmfull" &&
                type !== "helpful" &&
                type !== "passive"
            ) {
                logSchemaMismatch(`Entry '${bucketKey}' has invalid type`, type);
            }
            continue;
        }

        if (!isPlainObject(bucketValue)) {
            logSchemaMismatch(`Bucket '${bucketKey}' is not an object`, bucketValue);
            continue;
        }

        for (const [spellKey, entry] of Object.entries(bucketValue)) {
            if (isSpellEntry(entry)) {
                const type = (entry as { type?: unknown }).type;
                if (
                    type !== undefined &&
                    type !== "harmfull" &&
                    type !== "helpful" &&
                    type !== "passive"
                ) {
                    logSchemaMismatch(`Entry '${bucketKey}.${spellKey}' has invalid type`, type);
                }
                continue;
            }

            if (!isPlainObject(entry)) {
                logSchemaMismatch(`Entry '${bucketKey}.${spellKey}' is not an object`, entry);
                continue;
            }

            for (const [versionKey, versionEntry] of Object.entries(entry)) {
                if (!isPlainObject(versionEntry)) {
                    logSchemaMismatch(
                        `Entry '${bucketKey}.${spellKey}.${versionKey}' is not an object`,
                        versionEntry
                    );
                    continue;
                }

                const type = (versionEntry as { type?: unknown }).type;
                if (
                    type !== undefined &&
                    type !== "harmfull" &&
                    type !== "helpful" &&
                    type !== "passive"
                ) {
                    logSchemaMismatch(
                        `Entry '${bucketKey}.${spellKey}.${versionKey}' has invalid type`,
                        type
                    );
                }
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

                        const luaTableResult = extractLuaRootTable(fileContent, "PvP_Scalpel_Spell_Data");
                        if (luaTableResult.status !== "ok") return;

                        let parsed: unknown;
                        try {
                            parsed = luaJson.parse("return " + luaTableResult.table);
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
