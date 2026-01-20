import { useRef, useState } from "react";
import { LuClipboardCopy, LuCheck } from "react-icons/lu";
import RouteLayout from "../../Components/RouteLayout/RouteLayout";
import EmptyState from "../../Components/EmptyState/EmptyState";
import { useLogs } from "../../Context-Providers/logs-context";
import styles from "./Logs.module.css";

export default function Logs() {
    const { logs } = useLogs();
    const [copied, setCopied] = useState(false);
    const resetTimer = useRef<number | null>(null);
    const hasLogs = logs.length > 0;
    const visibleLogs = hasLogs
        ? logs
        : [
              "No diagnostic logs have been captured yet.",
              "When a session is active, you will see live match parsing events here.",
          ];

    const handleCopy = async () => {
        const text = visibleLogs.join("\n");
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.setAttribute("readonly", "true");
            textarea.style.position = "absolute";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
        }
        setCopied(true);
        if (resetTimer.current) {
            window.clearTimeout(resetTimer.current);
        }
        resetTimer.current = window.setTimeout(() => {
            setCopied(false);
        }, 1400);
    };

    return (
        <RouteLayout
            title="Diagnostics"
            description="Session logs and integrity checks for troubleshooting and support."
        >
            <div className={styles.panel}>
                <div className={styles.panelHeader}>
                    <div className={styles.panelTitle}>Live feed</div>
                    <button className={styles.copyBtn} type="button" onClick={handleCopy}>
                        {copied ? (
                            <LuCheck className={styles.copyIcon} aria-hidden="true" />
                        ) : (
                            <LuClipboardCopy className={styles.copyIcon} aria-hidden="true" />
                        )}
                        <span className={styles.copyLabel}>{copied ? "Copied" : "Copy logs"}</span>
                    </button>
                </div>
                <div className={styles.logBody}>
                    {visibleLogs.map((line, index) => (
                        <div key={`${index}-${line}`} className={styles.logLine}>
                            {line}
                        </div>
                    ))}
                </div>
            </div>

            {!hasLogs ? (
                <EmptyState
                    title="No active diagnostics"
                    description="Start a match session to stream live diagnostics into this panel."
                />
            ) : null}
        </RouteLayout>
    );
}
