import { NavLink } from "react-router-dom";
import styles from "./NavigationMenu.module.css";

const DashboardIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h7v7H4V4zm9 0h7v4h-7V4zM4 13h7v7H4v-7zm9 6v-8h7v8h-7z" />
    </svg>
);

const DataIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2zm0 4c0 1.1 3.6 2 8 2s8-.9 8-2v4c0 1.1-3.6 2-8 2s-8-.9-8-2v-4zm0 8c0 1.1 3.6 2 8 2s8-.9 8-2v-2c0 1.1-3.6 2-8 2s-8-.9-8-2v2z" />
    </svg>
);

const LogsIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm8 1v4h4" />
        <path d="M7 12h10M7 16h10" />
    </svg>
);

const SettingsIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm8.9 4.5-1.7.3a7.3 7.3 0 0 1-.7 1.7l1 1.4-1.6 1.6-1.4-1a7.3 7.3 0 0 1-1.7.7l-.3 1.7h-2.2l-.3-1.7a7.3 7.3 0 0 1-1.7-.7l-1.4 1-1.6-1.6 1-1.4a7.3 7.3 0 0 1-.7-1.7l-1.7-.3v-2.2l1.7-.3a7.3 7.3 0 0 1 .7-1.7l-1-1.4 1.6-1.6 1.4 1a7.3 7.3 0 0 1 1.7-.7l.3-1.7h2.2l.3 1.7a7.3 7.3 0 0 1 1.7.7l1.4-1 1.6 1.6-1 1.4c.3.5.5 1.1.7 1.7l1.7.3v2.2z" />
    </svg>
);

const AboutIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a1.2 1.2 0 1 1 0 2.4A1.2 1.2 0 0 1 12 6zm-1.2 4.8h2.4V18h-2.4v-7.2z" />
    </svg>
);

const navItems = [
    { label: "Dashboard", to: "/dashboard", icon: <DashboardIcon /> },
    { label: "Data & Activity", to: "/data", icon: <DataIcon /> },
    { label: "Logs", to: "/logs", icon: <LogsIcon /> },
    { label: "Settings", to: "/settings", icon: <SettingsIcon /> },
    { label: "About", to: "/about", icon: <AboutIcon /> },
];

export default function NavigationMenu() {
    return (
        <nav className={styles.nav} aria-label="Primary">
            <div className={styles.sectionLabel}>Navigation</div>
            <div className={styles.list}>
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `${styles.link} ${isActive ? styles.active : ""}`
                        }
                    >
                        <span className={styles.icon}>{item.icon}</span>
                        <span className={styles.label}>{item.label}</span>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
}
