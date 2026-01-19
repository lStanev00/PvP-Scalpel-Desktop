import { MouseEvent } from "react";
import { NavLink } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import useUserContext from "../../Hooks/useUserContext";
import styles from "./TopBar.module.css";

interface TopBarProps {
    onMinimize: () => void;
    onMaximize: () => void;
    onClose: () => void;
}

export default function TopBar({ onMinimize, onMaximize, onClose }: TopBarProps) {
    const { user } = useUserContext();
    const identity = user?.email ?? "Session active";

    const handleHeaderDrag = async (event: MouseEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement | null;
        if (!target) return;
        if (target.closest("button, a, input, textarea, select, [data-no-drag]")) return;
        try {
            const win = getCurrentWindow();
            await win.startDragging();
        } catch {
            // No window context.
        }
    };

    return (
        <header className={styles.header} onMouseDown={handleHeaderDrag} data-tauri-drag-region>
            <div className={styles.brand}>
                <div className={styles.logo} aria-hidden="true" />
                <div>
                    <div className={styles.name}>PvP Scalpel</div>
                    <div className={styles.sub}>Desktop Analytics Suite</div>
                </div>
            </div>

            <div className={styles.right}>
                <div className={styles.actions}>
                    <NavLink className={styles.actionBtn} to="/logs" data-no-drag>
                        Logs
                    </NavLink>
                    <NavLink className={styles.actionBtn} to="/settings" data-no-drag>
                        Settings
                    </NavLink>
                </div>

                <div className={styles.status} data-no-drag>
                    <span className={styles.statusDot} aria-hidden="true" />
                    <span className={styles.statusText}>{identity}</span>
                </div>

                <div className={styles.windowControls} data-no-drag>
                    <button className={styles.winBtn} type="button" onClick={onMinimize}>
                        <svg className={styles.winIcon} viewBox="0 0 12 12" aria-hidden="true">
                            <line x1="2" y1="9" x2="10" y2="9" />
                        </svg>
                    </button>
                    <button className={styles.winBtn} type="button" onClick={onMaximize}>
                        <svg className={styles.winIcon} viewBox="0 0 12 12" aria-hidden="true">
                            <rect x="2.2" y="2.2" width="7.6" height="7.6" />
                        </svg>
                    </button>
                    <button className={`${styles.winBtn} ${styles.winClose}`} type="button" onClick={onClose}>
                        <svg className={styles.winIcon} viewBox="0 0 12 12" aria-hidden="true">
                            <line x1="3" y1="3" x2="9" y2="9" />
                            <line x1="9" y1="3" x2="3" y2="9" />
                        </svg>
                    </button>
                </div>
            </div>
        </header>
    );
}
