import { NavLink } from "react-router-dom";
import {
    LuLayoutGrid,
    LuDatabase,
    LuFileText,
    LuSettings,
    LuInfo,
    LuChevronLeft,
    LuChevronRight,
} from "react-icons/lu";
import styles from "./NavigationMenu.module.css";

const navItems = [
    { label: "Dashboard", to: "/dashboard", icon: <LuLayoutGrid /> },
    { label: "Match History", to: "/data", icon: <LuDatabase /> },
    { label: "Logs", to: "/logs", icon: <LuFileText /> },
    { label: "Settings", to: "/settings", icon: <LuSettings /> },
    { label: "About", to: "/about", icon: <LuInfo /> },
];
const mainNavItems = navItems.filter((item) => item.to !== "/about");
const aboutNavItem = navItems.find((item) => item.to === "/about");

interface NavigationMenuProps {
    collapsed: boolean;
    onToggle: () => void;
}

export default function NavigationMenu({ collapsed, onToggle }: NavigationMenuProps) {
    return (
        <nav className={`${styles.nav} ${collapsed ? styles.collapsed : ""}`} aria-label="Primary">
            <div className={styles.sectionHeader}>
                <div className={styles.sectionLabel}>Navigation</div>
                <button
                    className={styles.toggle}
                    type="button"
                    onClick={onToggle}
                    aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
                    title={collapsed ? "Expand navigation" : "Collapse navigation"}
                >
                    {collapsed ? (
                        <LuChevronRight className={styles.toggleIcon} />
                    ) : (
                        <LuChevronLeft className={styles.toggleIcon} />
                    )}
                </button>
            </div>
            <div className={styles.list}>
                {mainNavItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `${styles.link} ${isActive ? styles.active : ""}`
                        }
                        aria-label={collapsed ? item.label : undefined}
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
                ))}
            </div>
            {aboutNavItem ? (
                <div className={styles.bottomList}>
                    <NavLink
                        key={aboutNavItem.to}
                        to={aboutNavItem.to}
                        className={({ isActive }) =>
                            `${styles.link} ${isActive ? styles.active : ""}`
                        }
                        aria-label={collapsed ? aboutNavItem.label : undefined}
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
