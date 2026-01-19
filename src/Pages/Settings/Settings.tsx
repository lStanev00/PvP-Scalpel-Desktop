import { useState } from "react";
import useUserContext from "../../Hooks/useUserContext";
import { usePreferences } from "../../Context-Providers/preferences-context";
import RouteLayout from "../../Components/RouteLayout/RouteLayout";
import styles from "./Settings.module.css";

export default function Settings() {
    const { user } = useUserContext();
    const { minimizeToTray, setMinimizeToTray } = usePreferences();
    const [autoRefresh, setAutoRefresh] = useState(true);

    return (
        <RouteLayout
            title="Settings"
            description="Tune your desktop preferences and update behavior."
        >
            <div className={styles.grid}>
                <div className={styles.panel}>
                    <div className={styles.panelTitle}>Account</div>
                    <div className={styles.kv}>
                        <span className={styles.k}>Signed in as</span>
                        <span className={styles.v}>{user?.email ?? "Unknown"}</span>
                    </div>
                    <div className={styles.kv}>
                        <span className={styles.k}>Session ID</span>
                        <span className={styles.v}>{user?._id ?? "Not available"}</span>
                    </div>
                </div>

                <div className={styles.panel}>
                    <div className={styles.panelTitle}>Preferences</div>
                    <label className={styles.toggle}>
                        <input
                            className={styles.toggleInput}
                            type="checkbox"
                            checked={minimizeToTray}
                            onChange={(event) => setMinimizeToTray(event.target.checked)}
                        />
                        <span className={styles.toggleTrack} />
                        <span className={styles.toggleText}>
                            Minimize to tray on close {minimizeToTray ? "enabled" : "disabled"}
                        </span>
                    </label>
                    <label className={styles.toggle}>
                        <input
                            className={styles.toggleInput}
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(event) => setAutoRefresh(event.target.checked)}
                        />
                        <span className={styles.toggleTrack} />
                        <span className={styles.toggleText}>
                            Auto-refresh activity {autoRefresh ? "enabled" : "disabled"}
                        </span>
                    </label>
                </div>
            </div>
        </RouteLayout>
    );
}
