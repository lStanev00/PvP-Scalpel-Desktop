import type { ReactNode } from "react";
import styles from "./DataActivity.module.css";

interface AnalysisDrilldownPaneProps {
    eyebrow: string;
    title: string;
    subtitle?: string | null;
    children: ReactNode;
}

export default function AnalysisDrilldownPane({
    eyebrow,
    title,
    subtitle = null,
    children,
}: AnalysisDrilldownPaneProps) {
    return (
        <aside className={styles.debriefDrilldown}>
            <header className={styles.debriefDrilldownHeader}>
                <div className={styles.debriefDrilldownEyebrow}>{eyebrow}</div>
                <h4 className={styles.debriefDrilldownTitle}>{title}</h4>
                {subtitle ? <div className={styles.debriefDrilldownSubtitle}>{subtitle}</div> : null}
            </header>
            <div className={styles.debriefDrilldownBody}>{children}</div>
        </aside>
    );
}
