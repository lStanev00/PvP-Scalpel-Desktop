import { type ChangeEvent } from "react";
import AutoScopeBadge from "../AutoScopeBadge/AutoScopeBadge";
import CharacterPicker from "../CharacterPicker/CharacterPicker";
import styles from "./DataActivity.module.css";
import {
    parseBracketScopeId,
    type CharacterOption,
    type MatchFilters,
    type MatchScopeMode,
} from "./utils";

interface FiltersBarProps {
    filters: MatchFilters;
    onChange: (next: MatchFilters) => void;
    modeOptions: Array<{ label: string; value: MatchScopeMode | "all" }>;
    characterOptions: CharacterOption[];
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
    const handleMode = (event: ChangeEvent<HTMLSelectElement>) => {
        const nextValue = event.target.value;
        onChange({
            ...filters,
            mode: nextValue === "all" ? "all" : (parseBracketScopeId(nextValue) ?? "all"),
        });
    };

    const handleCharacter = (value: string) => {
        onChange({ ...filters, character: value as MatchFilters["character"] });
    };

    const handleQuery = (event: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...filters, query: event.target.value });
    };

    const isAutoScopeInteractive = !!onApplyAutoScope;

    return (
        <div className={styles.filtersBar}>
            <div className={styles.filtersLeft}>
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel} id="match-character-label">
                        Character
                    </label>
                    <CharacterPicker
                        id="match-character"
                        value={filters.character}
                        options={characterOptions}
                        onChange={handleCharacter}
                        size="compact"
                        ariaLabelledBy="match-character-label"
                    />
                </div>

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
                    <AutoScopeBadge
                        message={infoMessage}
                        active={autoScopeActive}
                        limited={autoScopeLimited}
                        onClick={isAutoScopeInteractive ? onApplyAutoScope : undefined}
                        onContextMenu={
                            onOpenAutoScopeSettings
                                ? (event) => {
                                      event.preventDefault();
                                      onOpenAutoScopeSettings();
                                  }
                                : undefined
                        }
                    />
                ) : null}
            </div>
        </div>
    );
}
