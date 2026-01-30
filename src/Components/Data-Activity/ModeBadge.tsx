import styles from "./DataActivity.module.css";

interface ModeBadgeProps {
    label: string;
}

export default function ModeBadge({ label }: ModeBadgeProps) {
    return <span className={styles.modeBadge}>{label}</span>;
}
