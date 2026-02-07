import { MouseEvent } from "react";
import { NavLink } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LuMinus, LuSquare, LuX } from "react-icons/lu";
import useUserContext from "../../Hooks/useUserContext";
import styles from "./TopBar.module.css";

interface TopBarProps {
    onMinimize: () => void;
    onMaximize: () => void;
    onClose: () => void;
}

export default function TopBar({ onMinimize, onMaximize, onClose }: TopBarProps) {
    const { user } = useUserContext();
    const identity =
        user?.username ??
        (user?.email ? user.email.split("@")[0] : null) ??
        "Session active";

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
                <img className={styles.logo} src="/logo/logo.png" alt="" aria-hidden="true" />
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
                        <LuMinus className={styles.winIcon} aria-hidden="true" />
                    </button>
                    <button className={styles.winBtn} type="button" onClick={onMaximize}>
                        <LuSquare className={styles.winIcon} aria-hidden="true" />
                    </button>
                    <button className={`${styles.winBtn} ${styles.winClose}`} type="button" onClick={onClose}>
                        <LuX className={styles.winIcon} aria-hidden="true" />
                    </button>
                </div>
            </div>
        </header>
    );
}
