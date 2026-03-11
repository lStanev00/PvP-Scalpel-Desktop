import { FaDiscord } from "react-icons/fa6";
import styles from "./DemoOverlay.module.css";
import { openUrl } from "../../Helpers/open";

const DEMO_DISCORD_URL = "https://discord.com/invite/2h45zpyJdb";

export default function DemoOverlay() {

    if (import.meta.env.DEV) return null;

    return (
        <div className={styles.dashboardCross}>
            <span className={`${styles.dashboardCrossBand} ${styles.dashboardCrossBandA}`} />
            <span className={`${styles.dashboardCrossBand} ${styles.dashboardCrossBandB}`} />
            <div className={styles.demoOverlayCopy}>
                <span className={`${styles.demoNote} ${styles.demoNoteTop}`}>Demo content</span>
                <span className={`${styles.demoNote} ${styles.demoNoteLeft}`}>Demo content</span>
                <span className={`${styles.demoNote} ${styles.demoNoteRight}`}>Demo content</span>
                <div className={styles.demoCallout}>
                    <span className={styles.demoCalloutText}>Have ideas? Give them there</span>
                    <button
                        className={styles.demoCalloutBtn}
                        type="button"
                        onClick={() => openUrl(DEMO_DISCORD_URL)}>
                        <FaDiscord aria-hidden="true" />
                        <span>Join Discord</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
