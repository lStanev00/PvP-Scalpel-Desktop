import type { ChangeEvent } from "react";
import styles from "./DataActivity.module.css";
import type { MatchFilters, MatchMode } from "./utils";

interface FiltersBarProps {
    filters: MatchFilters;
    onChange: (next: MatchFilters) => void;
    modeOptions: Array<{ label: string; value: MatchMode | "all" }>;
    characterOptions: Array<{ label: string; value: string | "all" }>;
}

export default function FiltersBar({
    filters,
    onChange,
    modeOptions,
    characterOptions,
}: FiltersBarProps) {
    const handleMode = (event: ChangeEvent<HTMLSelectElement>) => {
        onChange({ ...filters, mode: event.target.value as MatchFilters["mode"] });
    };

    const handleCharacter = (event: ChangeEvent<HTMLSelectElement>) => {
        onChange({ ...filters, character: event.target.value as MatchFilters["character"] });
    };

    const handleQuery = (event: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...filters, query: event.target.value });
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

        </div>
    );
}
