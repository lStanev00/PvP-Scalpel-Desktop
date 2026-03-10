import { getClassColor, getRoleByClassAndSpec } from "../../Domain/CombatDomainContext";
import RoleIcon from "./RoleIcon";
import styles from "./DataActivity.module.css";
import type { MatchSummary } from "./utils";

interface MatchHistoryRowProps {
    summary: MatchSummary;
    selected: boolean;
    onSelect: (match: MatchSummary) => void;
}

export default function MatchHistoryRow({
    summary,
    selected,
    onSelect,
}: MatchHistoryRowProps) {
    const deltaClass =
        summary.delta === null
            ? styles.deltaNeutral
            : summary.delta > 0
              ? styles.deltaPositive
              : summary.delta < 0
                ? styles.deltaNegative
                : styles.deltaNeutral;
    const role = getRoleByClassAndSpec(summary.owner.class, summary.owner.spec);
    const classColor = getClassColor(summary.owner.class);
    const iconStyle = classColor ? { color: classColor, opacity: 0.8 } : undefined;

    return (
        <button
            type="button"
            className={`${styles.historyRow} ${
                selected ? styles.historyRowSelected : ""
            }`}
            data-result={summary.result}
            onClick={() => onSelect(summary)}
            aria-pressed={selected}
        >
            <span className={styles.resultIndicator} aria-hidden="true" />
            <span className={styles.rowTime}>{summary.timestampLabel}</span>
            <div className={styles.ownerBlock}>
                <RoleIcon role={role} style={iconStyle} />
                <span
                    className={styles.ownerName}
                    style={classColor ? { color: classColor } : undefined}
                >
                    {summary.owner.name}
                </span>
            </div>
            <span className={styles.modeText}>{summary.modeLabel}</span>
            <span className={styles.mapName}>{summary.mapName}</span>
            <span className={styles.duration}>{summary.durationLabel}</span>
            <span className={`${styles.deltaValue} ${deltaClass}`}>
                {summary.deltaLabel}
            </span>
        </button>
    );
}
