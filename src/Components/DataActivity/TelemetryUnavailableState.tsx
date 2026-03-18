import { LuRadar, LuTriangleAlert } from "react-icons/lu";
import styles from "./DataActivity.module.css";

interface TelemetryUnavailableStateProps {
    title?: string;
    message: string;
    detail?: string | null;
}

export default function TelemetryUnavailableState({
    title = "Detailed telemetry unavailable",
    message,
    detail = null,
}: TelemetryUnavailableStateProps) {
    return (
        <div className={styles.telemetryFallback} role="status">
            <div className={styles.telemetryFallbackIconWrap}>
                <LuRadar className={styles.telemetryFallbackIcon} aria-hidden="true" />
                <LuTriangleAlert className={styles.telemetryFallbackIconBadge} aria-hidden="true" />
            </div>
            <div className={styles.telemetryFallbackBody}>
                <div className={styles.telemetryFallbackTitle}>{title}</div>
                <p className={styles.telemetryFallbackCopy}>{message}</p>
                {detail ? <div className={styles.telemetryFallbackDetail}>{detail}</div> : null}
            </div>
        </div>
    );
}
