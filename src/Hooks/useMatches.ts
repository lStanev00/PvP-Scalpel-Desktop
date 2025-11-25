import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import luaJson from "lua-json";
import { Match } from "../Interfaces/matches";

export default function useMatches() {
  const [matches, setMatches] = useState<Match[]>([]);
  let timeout: ReturnType<typeof setTimeout> | null = null;

  useEffect(() => {

    const unlistenPromise = listen<{
      account: string;
      path: string;
    }>("savedvars-updated", async ({ payload }) => {
      console.log("📩 FS change detected:", payload);

      if (timeout) clearTimeout(timeout); // debounce on write the wow api writes mutiple times so w need a timeout to prevent costy calcs multiple times
      timeout = setTimeout(async () => {
        try {
          const raw = await invoke<string>("read_saved_variables", {
            path: payload.path,
          });

          if (!raw) return;

          const match = raw.match(/PvP_Scalpel_DB\s*=\s*(\{[\s\S]*\})/);
          if (!match) return console.warn("DB not found in file");

          const luaTable = "return " + match[1];

          let parsed;
          try {
            parsed = luaJson.parse(luaTable);
          } catch {
            console.warn("File likely mid-write — skipping");
            return;
          }

          if (!Array.isArray(parsed)) {
            console.warn("Parsed data is not an array:", parsed);
            return;
          }

          console.log("Updated matches:", parsed);
          setMatches(parsed as Match[]);
        } catch (err) {
          console.error(">!!!! Fatal SavedVariables read error:", err);
        }
      }, 350); // !!!IMPORTANT wait 350ms — reliable for WoW write cycle
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  return matches;
}
