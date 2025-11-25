import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import luaJson from "lua-json";
import { Match, MatchWithId } from "../Interfaces/matches";

export default function useMatches() {
  const [matches, setMatches] = useState<MatchWithId[]>([]);
  let timeout: ReturnType<typeof setTimeout> | null = null;

  useEffect(() => {
    const unlistenPromise = listen<{
      account: string;
      path: string;
    }>("savedvars-updated", async ({ payload }) => {

      if (timeout) clearTimeout(timeout);

      timeout = setTimeout(async () => {
        try {
          const fileContent = await invoke<string>("read_saved_variables", {
            path: payload.path,
          });

          if (!fileContent) return;

          const match = fileContent.match(/PvP_Scalpel_DB\s*=\s*(\{[\s\S]*\})/);
          if (!match) return console.warn("DB not found in file");

          const luaTable = "return " + match[1];

          let parsedArray: any;
          try {
            parsedArray = luaJson.parse(luaTable);
          } catch {
            console.warn("File mid-write, skipping read");
            return;
          }

          if (!Array.isArray(parsedArray)) {
            console.warn("Parsed result is not an array:", parsedArray);
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
            } catch (err) {
              console.warn("Failed processing match:", err);
            }
          }

          console.log("Updated matches:", results);
          setMatches(results);

        } catch (err) {
          console.error("Fatal SavedVariables read error:", err);
        }
      }, 350); // debounce for WoW write cycle
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  return matches;
}
