import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface LogsContextValue {
    logs: string[];
}

const LogsContext = createContext<LogsContextValue | null>(null);
const MAX_LOGS = 100;

export const LogsProvider = ({ children }: { children: ReactNode }) => {
    const [logs, setLogs] = useState<string[]>([]);

    useEffect(() => {
        let active = true;
        let unlisten: (() => void) | null = null;
        let poll: number | null = null;

        const refreshLogs = () => {
            invoke<string[]>("get_logs")
                .then((stored) => {
                    if (active && Array.isArray(stored)) {
                        setLogs(stored.slice(-MAX_LOGS));
                    }
                })
                .catch(() => {
                    // Ignore log fetch failures.
                });
        };

        refreshLogs();

        listen<string>("app-log", ({ payload }) => {
            if (!active) return;
            setLogs((prev) => {
                const next = [...prev, payload];
                return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
            });
        })
            .then((stop) => {
                if (active) {
                    unlisten = stop;
                } else {
                    stop();
                }
            })
            .catch(() => {
                // Ignore log listener failures.
            });

        poll = window.setInterval(refreshLogs, 5000);

        return () => {
            active = false;
            if (unlisten) unlisten();
            if (poll !== null) {
                window.clearInterval(poll);
            }
        };
    }, []);

    return <LogsContext.Provider value={{ logs }}>{children}</LogsContext.Provider>;
};

export const useLogs = () => {
    const ctx = useContext(LogsContext);
    if (!ctx) {
        throw new Error("LogsContext must be used inside <LogsProvider>");
    }
    return ctx;
};
