import styles from "./PrimaryActionButton.module.css";

type ButtonTone = "accent" | "danger" | "warning" | "muted";

interface PrimaryActionButtonProps {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    tone?: ButtonTone;
    type?: "button" | "submit";
}

export default function PrimaryActionButton({
    label,
    onClick,
    disabled = false,
    tone = "accent",
    type = "button",
}: PrimaryActionButtonProps) {
    return (
        <button
            className={`${styles.btn} ${styles[tone]} ${disabled ? styles.disabled : ""}`}
            onClick={onClick}
            disabled={disabled}
            type={type}
        >
            <span className={styles.inner}>{label}</span>
        </button>
    );
}
