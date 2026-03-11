import { useRef, type ReactElement } from "react";
import { NavLink } from "react-router-dom";
import {
    LuActivity,
    LuFileText,
    LuInfo,
    LuLayoutGrid,
    LuSettings,
    LuSwords,
} from "react-icons/lu";
import { usePreferences } from "../../Context-Providers/preferences-context";
import styles from "./NavigationMenu.module.css";

const navItems = [
    { label: "Dashboard", to: "/dashboard", icon: <LuLayoutGrid /> },
    { label: "Match History", to: "/data", icon: <LuSwords /> },
    { label: "Analytics", icon: <LuActivity />, disabled: true, status: "Soon" },
    { label: "Logs", to: "/logs", icon: <LuFileText /> },
    { label: "Settings", to: "/settings", icon: <LuSettings /> },
    { label: "About", to: "/about", icon: <LuInfo /> },
];

const mainNavItems = navItems.filter((item) => item.label !== "About");
const aboutNavItem = navItems.find(
    (item): item is { label: string; to: string; icon: ReactElement } => item.to === "/about"
);

export default function NavigationMenu() {
    const { navAlwaysCollapsed } = usePreferences();
    const navRef = useRef<HTMLElement | null>(null);

    const blurNavFocus = () => {
        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement)) return;
        if (!navRef.current?.contains(activeElement)) return;
        activeElement.blur();
    };

    return (
        <nav
            ref={navRef}
            className={`${styles.nav} ${
                navAlwaysCollapsed ? styles.navAlwaysCollapsed : styles.navExpandable
            }`}
            aria-label="Primary"
            onMouseLeave={blurNavFocus}
        >
            <div className={styles.list}>
                {mainNavItems.map((item) =>
                    item.disabled ? (
                        <div
                            key={item.label}
                            className={`${styles.link} ${styles.disabledLink}`}
                            aria-label={`${item.label} ${item.status ?? ""}`.trim()}
                            aria-disabled="true"
                        >
                            <span className={styles.icon}>{item.icon}</span>
                            <span className={styles.label}>{item.label}</span>
                            {item.status ? (
                                <span className={styles.statusPill}>{item.status}</span>
                            ) : null}
                            <span className={styles.tooltip}>{`${item.label}${item.status ? ` - ${item.status}` : ""}`}</span>
                        </div>
                    ) : (
                        <NavLink
                            key={item.to}
                            to={item.to!}
                            className={({ isActive }) =>
                                `${styles.link} ${isActive ? styles.active : ""}`
                            }
                            aria-label={item.label}
                            onMouseUp={(event) => event.currentTarget.blur()}
                            onClick={() => {
                                if (item.to === "/data") {
                                    window.dispatchEvent(new CustomEvent("match-history-reset"));
                                }
                            }}
                        >
                            <span className={styles.icon}>{item.icon}</span>
                            <span className={styles.label}>{item.label}</span>
                            <span className={styles.tooltip}>{item.label}</span>
                        </NavLink>
                    )
                )}
            </div>
            {aboutNavItem ? (
                <div className={styles.bottomList}>
                    <NavLink
                        key={aboutNavItem.to}
                        to={aboutNavItem.to}
                        className={({ isActive }) =>
                            `${styles.link} ${isActive ? styles.active : ""}`
                        }
                        aria-label={aboutNavItem.label}
                        onMouseUp={(event) => event.currentTarget.blur()}
                    >
                        <span className={styles.icon}>{aboutNavItem.icon}</span>
                        <span className={styles.label}>{aboutNavItem.label}</span>
                        <span className={styles.tooltip}>{aboutNavItem.label}</span>
                    </NavLink>
                </div>
            ) : null}
        </nav>
    );
}
