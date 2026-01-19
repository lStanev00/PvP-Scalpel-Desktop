import styles from "./EmptyState.module.css";

interface EmptyStateProps {
    title: string;
    description?: string;
}

export default function EmptyState({ title, description }: EmptyStateProps) {
    return (
        <div className={styles.empty}>
            <div className={styles.logo} aria-hidden="true" />
            <div className={styles.title}>{title}</div>
            {description ? <div className={styles.description}>{description}</div> : null}
        </div>
    );
}
