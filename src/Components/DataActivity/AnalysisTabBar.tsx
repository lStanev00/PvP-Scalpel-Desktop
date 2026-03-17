import styles from "./DataActivity.module.css";

type TabItem<T extends string> = {
    id: T;
    label: string;
    badge?: string | number | null;
};

interface AnalysisTabBarProps<T extends string> {
    tabs: TabItem<T>[];
    activeTab: T;
    onSelect: (tab: T) => void;
    ariaLabel: string;
    prominence?: "primary" | "secondary";
}

export default function AnalysisTabBar<T extends string>({
    tabs,
    activeTab,
    onSelect,
    ariaLabel,
    prominence = "primary",
}: AnalysisTabBarProps<T>) {
    const rootClass =
        prominence === "primary" ? styles.analysisTabBarPrimary : styles.analysisTabBarSecondary;
    const buttonClass =
        prominence === "primary"
            ? styles.analysisTabButtonPrimary
            : styles.analysisTabButtonSecondary;
    const activeClass =
        prominence === "primary"
            ? styles.analysisTabButtonPrimaryActive
            : styles.analysisTabButtonSecondaryActive;

    return (
        <div className={`${styles.analysisTabBar} ${rootClass}`} role="tablist" aria-label={ariaLabel}>
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    className={`${styles.analysisTabButton} ${buttonClass} ${
                        activeTab === tab.id ? activeClass : ""
                    }`}
                    onClick={() => onSelect(tab.id)}
                >
                    <span>{tab.label}</span>
                    {tab.badge !== null && tab.badge !== undefined ? (
                        <span className={styles.analysisTabBadge}>{tab.badge}</span>
                    ) : null}
                </button>
            ))}
        </div>
    );
}
