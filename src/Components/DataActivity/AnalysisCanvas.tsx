import type { ReactNode } from "react";
import styles from "./DataActivity.module.css";

interface AnalysisCanvasProps {
    eyebrow: string;
    title: string;
    subtitle?: string | null;
    toolbar?: ReactNode;
    aside?: ReactNode | null;
    children: ReactNode;
}

export default function AnalysisCanvas({
    eyebrow,
    title,
    subtitle = null,
    toolbar = null,
    aside = null,
    children,
}: AnalysisCanvasProps) {
    return (
        <section className={styles.debriefCanvas}>
            <header className={styles.debriefCanvasHeader}>
                <div className={styles.debriefCanvasHeading}>
                    <div className={styles.debriefCanvasEyebrow}>{eyebrow}</div>
                    <h3 className={styles.debriefCanvasTitle}>{title}</h3>
                    {subtitle ? <p className={styles.debriefCanvasSubtitle}>{subtitle}</p> : null}
                </div>
                {toolbar ? <div className={styles.debriefCanvasToolbar}>{toolbar}</div> : null}
            </header>

            <div
                className={`${styles.debriefCanvasBody} ${
                    aside ? styles.debriefCanvasBodyWithAside : ""
                }`}
            >
                <div className={styles.debriefCanvasMain}>{children}</div>
                {aside ? <div className={styles.debriefCanvasAside}>{aside}</div> : null}
            </div>
        </section>
    );
}
