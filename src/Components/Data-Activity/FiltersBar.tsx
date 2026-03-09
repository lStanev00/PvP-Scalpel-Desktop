import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { LuInfo, LuTriangleAlert } from "react-icons/lu";
import styles from "./DataActivity.module.css";
import type { MatchFilters, MatchMode } from "./utils";

interface FiltersBarProps {
    filters: MatchFilters;
    onChange: (next: MatchFilters) => void;
    modeOptions: Array<{ label: string; value: MatchMode | "all" }>;
    characterOptions: Array<{ label: string; value: string | "all" }>;
    filteredCount: number;
    infoMessage?: string | null;
    autoScopeActive?: boolean;
    autoScopeLimited?: boolean;
    onApplyAutoScope?: (() => void) | undefined;
    onOpenAutoScopeSettings?: (() => void) | undefined;
}

export default function FiltersBar({
    filters,
    onChange,
    modeOptions,
    characterOptions,
    filteredCount,
    infoMessage = null,
    autoScopeActive = false,
    autoScopeLimited = false,
    onApplyAutoScope,
    onOpenAutoScopeSettings,
}: FiltersBarProps) {
    const [isAutoScopeAnimating, setIsAutoScopeAnimating] = useState(false);
    const showLimitedWarningState = autoScopeLimited && autoScopeActive;
    const autoScopeInfoRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isAutoScopeAnimating) return;

        const timeout = window.setTimeout(() => setIsAutoScopeAnimating(false), 220);
        return () => window.clearTimeout(timeout);
    }, [isAutoScopeAnimating]);

    const handleMode = (event: ChangeEvent<HTMLSelectElement>) => {
        onChange({ ...filters, mode: event.target.value as MatchFilters["mode"] });
    };

    const handleCharacter = (event: ChangeEvent<HTMLSelectElement>) => {
        onChange({ ...filters, character: event.target.value as MatchFilters["character"] });
    };

    const handleQuery = (event: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...filters, query: event.target.value });
    };

    const isAutoScopeInteractive = !!onApplyAutoScope;

    const handleAutoScopeClick = () => {
        if (!isAutoScopeInteractive || !onApplyAutoScope) return;
        setIsAutoScopeAnimating(true);
        onApplyAutoScope();
    };

    const handleAutoScopeContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
        if (!onOpenAutoScopeSettings) return;
        event.preventDefault();
        onOpenAutoScopeSettings();
    };

    const blurAutoScopeFocus = () => {
        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement)) return;
        if (!autoScopeInfoRef.current?.contains(activeElement)) return;
        activeElement.blur();
    };

    return (
        <div className={styles.filtersBar}>
            <div className={styles.filtersLeft}>
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel} htmlFor="match-mode">
                        Mode
                    </label>
                    <div className={styles.selectControl}>
                        <select
                            id="match-mode"
                            className={styles.filterSelect}
                            value={filters.mode}
                            onChange={handleMode}
                        >
                            {modeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel} htmlFor="match-character">
                        Character
                    </label>
                    <div className={styles.selectControl}>
                        <select
                            id="match-character"
                            className={styles.filterSelect}
                            value={filters.character}
                            onChange={handleCharacter}
                        >
                            {characterOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel} htmlFor="match-search">
                        Search
                    </label>
                    <input
                        id="match-search"
                        className={styles.filterInput}
                        type="search"
                        placeholder="Character, map, or mode"
                        value={filters.query}
                        onChange={handleQuery}
                    />
                </div>
            </div>
            <div className={styles.filtersAside}>
                <div className={styles.filtersCount}>
                    {filteredCount} RECORD{filteredCount === 1 ? "" : "S"}
                </div>
                {infoMessage ? (
                    <div
                        ref={autoScopeInfoRef}
                        className={styles.filtersInfo}
                        data-active={autoScopeActive ? "true" : "false"}
                        onMouseLeave={blurAutoScopeFocus}
                    >
                        <button
                            type="button"
                            className={[
                                styles.filtersInfoBadge,
                                showLimitedWarningState
                                    ? styles.filtersInfoBadgeLimited
                                    : autoScopeActive
                                      ? styles.filtersInfoBadgeActive
                                      : styles.filtersInfoBadgeInactive,
                                isAutoScopeAnimating ? styles.filtersInfoBadgeAnimating : "",
                            ].filter(Boolean).join(" ")}
                            onClick={handleAutoScopeClick}
                            onMouseUp={(event) => event.currentTarget.blur()}
                            onContextMenu={handleAutoScopeContextMenu}
                            aria-label={infoMessage}
                            aria-pressed={autoScopeActive}
                        >
                            {showLimitedWarningState ? (
                                <LuTriangleAlert
                                    className={styles.filtersInfoIcon}
                                    aria-hidden="true"
                                />
                            ) : (
                                <LuInfo className={styles.filtersInfoIcon} aria-hidden="true" />
                            )}
                            <span>Auto Scope</span>
                        </button>
                        <span
                            className={[
                                styles.filtersInfoText,
                                showLimitedWarningState ? styles.filtersInfoTextLimited : "",
                            ].filter(Boolean).join(" ")}
                        >
                            <span>{infoMessage}</span>
                            <span className={styles.filtersInfoHint}>Right click for tune</span>
                        </span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
