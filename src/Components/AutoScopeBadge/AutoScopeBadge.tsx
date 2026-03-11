import { useEffect, useRef, useState, type MouseEvent } from "react";
import { LuInfo, LuTriangleAlert } from "react-icons/lu";
import styles from "./AutoScopeBadge.module.css";

interface AutoScopeBadgeProps {
    message?: string | null;
    active?: boolean;
    limited?: boolean;
    onClick?: (() => void) | undefined;
    onContextMenu?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
    hint?: string;
    variant?: "default" | "dashboard";
}

export default function AutoScopeBadge({
    message,
    active = false,
    limited = false,
    onClick,
    onContextMenu,
    hint = "Right click for tune",
    variant = "default",
}: AutoScopeBadgeProps) {
    const [isAnimating, setIsAnimating] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const showLimitedWarningState = limited;

    useEffect(() => {
        if (!isAnimating) return;

        const timeout = window.setTimeout(() => setIsAnimating(false), 220);
        return () => window.clearTimeout(timeout);
    }, [isAnimating]);

    if (!message) return null;

    const handleClick = () => {
        if (!onClick) return;
        setIsAnimating(true);
        onClick();
    };

    const blurFocusWithin = () => {
        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement)) return;
        if (!rootRef.current?.contains(activeElement)) return;
        activeElement.blur();
    };

    return (
        <div
            ref={rootRef}
            className={`${styles.root} ${
                variant === "dashboard" ? styles.rootDashboard : ""
            }`}
            data-active={active ? "true" : "false"}
            onMouseLeave={blurFocusWithin}
        >
            <button
                type="button"
                className={[
                    styles.badge,
                    showLimitedWarningState
                        ? styles.badgeLimited
                        : active
                          ? styles.badgeActive
                          : styles.badgeInactive,
                    isAnimating ? styles.badgeAnimating : "",
                ]
                    .filter(Boolean)
                    .join(" ")}
                onClick={handleClick}
                onMouseUp={(event) => event.currentTarget.blur()}
                onContextMenu={onContextMenu}
                aria-label={message}
                aria-pressed={active}
            >
                {showLimitedWarningState ? (
                    <LuTriangleAlert className={styles.icon} aria-hidden="true" />
                ) : (
                    <LuInfo className={styles.icon} aria-hidden="true" />
                )}
                <span>Auto Scope</span>
            </button>
            <span
                className={[
                    styles.tooltip,
                    showLimitedWarningState ? styles.tooltipLimited : "",
                    variant === "dashboard" ? styles.tooltipDashboard : "",
                ]
                    .filter(Boolean)
                    .join(" ")}
            >
                <span>{message}</span>
                <span className={styles.hint}>{hint}</span>
            </span>
        </div>
    );
}
