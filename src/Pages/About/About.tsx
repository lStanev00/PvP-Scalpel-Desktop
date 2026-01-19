import RouteLayout from "../../Components/RouteLayout/RouteLayout";
import styles from "./About.module.css";

export default function About() {
    return (
        <RouteLayout
            title="About PvP Scalpel"
            description="Desktop companion for match intelligence, analysis, and integrity tooling."
        >
            <div className={styles.panel}>
                <div className={styles.brandRow}>
                    <div className={styles.logo} aria-hidden="true" />
                    <div>
                        <div className={styles.name}>PvP Scalpel Desktop</div>
                        <div className={styles.meta}>Version 0.1.0</div>
                    </div>
                </div>
                <p className={styles.copy}>
                    PvP Scalpel keeps your arena and battleground history organized with clean, high-signal
                    insights. This desktop experience mirrors the launcher’s premium UI and stays focused on
                    clarity, speed, and decision-ready data.
                </p>
                <div className={styles.kvList}>
                    <div className={styles.kv}>
                        <span className={styles.k}>Build channel</span>
                        <span className={styles.v}>Stable</span>
                    </div>
                    <div className={styles.kv}>
                        <span className={styles.k}>Support</span>
                        <span className={styles.v}>support@pvpscalpel.com</span>
                    </div>
                </div>
            </div>
        </RouteLayout>
    );
}
