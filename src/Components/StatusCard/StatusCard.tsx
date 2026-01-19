import styles from "./StatusCard.module.css";

type StatusTone = "info" | "good" | "warn" | "bad";

interface StatusCardProps {
    title: string;
    value: string;
    detail?: string;
    tone?: StatusTone;
}

export default function StatusCard({ title, value, detail, tone = "info" }: StatusCardProps) {
    return (
        <div className={`${styles.card} ${styles[tone]}`}>
            <div className={styles.top}>
                <span className={styles.title}>{title}</span>
                <span className={styles.badge}>
                    <span className={styles.dot} />
                    <span className={styles.badgeText}>{tone.toUpperCase()}</span>
                </span>
            </div>
            <div className={styles.row}>
                <span className={styles.value}>{value}</span>
                {detail ? <span className={styles.detail}>{detail}</span> : null}
            </div>
        </div>
    );
}
