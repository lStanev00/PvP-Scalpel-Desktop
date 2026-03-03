import { NavLink } from "react-router-dom";
import {
    LuLayoutGrid,
    LuDatabase,
    LuFileText,
    LuSettings,
    LuInfo,
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

export default function NavigationMenu() {
    return (
        <nav className={styles.nav} aria-label="Primary">
            <div className={styles.list}>
                {mainNavItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `${styles.link} ${isActive ? styles.active : ""}`
                        }
                        aria-label={item.label}
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
                        aria-label={aboutNavItem.label}
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
