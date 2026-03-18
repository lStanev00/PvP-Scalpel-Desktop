import styles from "./DataActivity.module.css";

export type AnalysisMode = "summary" | "spells" | "control" | "kicks";

type ModeItem = {
    id: AnalysisMode;
    label: string;
    hint: string;
};

interface AnalysisModeSwitchProps {
    activeMode: AnalysisMode;
    onSelect: (mode: AnalysisMode) => void;
}

const items: ModeItem[] = [
    { id: "summary", label: "Summary", hint: "What mattered" },
    { id: "spells", label: "Spells", hint: "Cast profile" },
    { id: "control", label: "Control", hint: "Loss of agency" },
    { id: "kicks", label: "Kicks", hint: "Interrupt precision" },
];

export default function AnalysisModeSwitch({
    activeMode,
    onSelect,
}: AnalysisModeSwitchProps) {
    return (
        <div className={styles.debriefModeSwitch} role="tablist" aria-label="Analysis modes">
            {items.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={activeMode === item.id}
                    className={`${styles.debriefModeButton} ${
                        activeMode === item.id ? styles.debriefModeButtonActive : ""
                    }`}
                    onClick={() => onSelect(item.id)}
                >
                    <span className={styles.debriefModeLabel}>{item.label}</span>
                    <span className={styles.debriefModeHint}>{item.hint}</span>
                </button>
            ))}
        </div>
    );
}
