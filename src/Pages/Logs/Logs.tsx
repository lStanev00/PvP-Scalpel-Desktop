import RouteLayout from "../../Components/RouteLayout/RouteLayout";
import EmptyState from "../../Components/EmptyState/EmptyState";
import styles from "./Logs.module.css";

const sampleLogs = [
    "No diagnostic logs have been captured yet.",
    "When a session is active, you will see live match parsing events here.",
];

export default function Logs() {
    return (
        <RouteLayout
            title="Diagnostics"
            description="Session logs and integrity checks for troubleshooting and support."
        >
            <div className={styles.panel}>
                <div className={styles.panelTitle}>Live feed</div>
                <div className={styles.logBody}>
                    {sampleLogs.map((line, index) => (
                        <div key={index} className={styles.logLine}>
                            {line}
                        </div>
                    ))}
                </div>
            </div>

            <EmptyState
                title="No active diagnostics"
                description="Start a match session to stream live diagnostics into this panel."
            />
        </RouteLayout>
    );
}
