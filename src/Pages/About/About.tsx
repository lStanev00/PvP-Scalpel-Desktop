import RouteLayout from "../../Components/RouteLayout/RouteLayout";
import styles from "./About.module.css";

export default function About() {
    return (
        <RouteLayout
            title="About PvP Scalpel"
            description="PvP match intelligence that tells you why games are won or lost."
        >
            <div className={styles.panel}>
                {/* <div className={styles.brandRow}>
                    <img className={styles.logo} src="/logo/logo.png" alt="" aria-hidden="true" />
                    <div>
                        <div className={styles.name}>PvP Scalpel Desktop</div>
                    </div>
                </div> */}
                <div className={styles.kvList}>
                    <div className={styles.meta}>What PvP Scalpel Does</div>
                    <p className={styles.copy}>- Analyzes rated PvP matches automatically.</p>
                    <p className={styles.copy}>- Identifies the primary causes behind wins and losses.</p>
                    <p className={styles.copy}>- Surfaces patterns that directly impact MMR.</p>
                </div>
                <div className={styles.kvList}>
                    <div className={styles.meta}>What PvP Scalpel Does Not Do</div>
                    <p className={styles.copy}>- Does not guess or inflate statistics.</p>
                    <p className={styles.copy}>- Does not provide mechanical coaching or automation.</p>
                    <p className={styles.copy}>- Does not speculate beyond recorded match data.</p>
                </div>
                <p className={styles.copy}>
                    <strong>PvP Scalpel exists to remove excuses from PvP outcomes.</strong>
                </p>
                <div className={styles.kvList}>
                    <div className={styles.kv}>
                        <span className={styles.k}>Version</span>
                        <span className={styles.v}>0.1.0</span>
                    </div>
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
