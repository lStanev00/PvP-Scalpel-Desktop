import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import useUserContext from "../../Hooks/useUserContext";
import {
    usePreferences,
    type AutoScopeRatedPreference,
    type AutoScopeStrategy,
} from "../../Context-Providers/preferences-context";
import useMatches from "../../Hooks/useMatches";
import RouteLayout from "../../Components/RouteLayout/RouteLayout";
import {
    buildMatchSummary,
    getModeLabel,
    type MatchMode,
} from "../../Components/Data-Activity/utils";
import styles from "./Settings.module.css";

const AUTO_SCOPE_STRATEGY_OPTIONS: Array<{
    value: AutoScopeStrategy;
    label: string;
    description: string;
}> = [
    {
        value: "latest_character_latest_bracket",
        label: "Adaptive",
        description: "Tracks the latest character and bracket.",
    },
    {
        value: "selected_character_latest_bracket",
        label: "Character Focus",
        description: "Pins a character and keeps bracket adaptive.",
    },
    {
        value: "selected_character_selected_bracket",
        label: "Full Lock",
        description: "Pins both character and bracket.",
    },
];

const AUTO_SCOPE_RATED_PREFERENCE_OPTIONS: Array<{
    value: AutoScopeRatedPreference;
    label: string;
}> = [
    { value: "no_preference", label: "No preference" },
    { value: "prefer_rated", label: "Prefer rated" },
    { value: "prefer_non_rated", label: "Prefer non-rated" },
];

type SettingsLocationState = {
    highlightAutoScope?: boolean;
};

export default function Settings() {
    const location = useLocation();
    const { user } = useUserContext();
    const matches = useMatches();
    const {
        minimizeToTray,
        setMinimizeToTray,
        autoScopeStrategy,
        setAutoScopeStrategy,
        autoScopeCharacter,
        setAutoScopeCharacter,
        autoScopeBracket,
        setAutoScopeBracket,
        autoScopeRatedPreference,
        setAutoScopeRatedPreference,
    } = usePreferences();
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [highlightAutoScope, setHighlightAutoScope] = useState(false);
    const autoScopePanelRef = useRef<HTMLDivElement | null>(null);

    const summaries = useMemo(
        () =>
            matches
                .map(buildMatchSummary)
                .sort((a, b) => b.timestampMs - a.timestampMs),
        [matches]
    );

    const characterOptions = useMemo(() => {
        return Array.from(new Set(summaries.map((summary) => summary.owner.name))).sort((a, b) =>
            a.localeCompare(b)
        );
    }, [summaries]);

    const bracketOptions = useMemo(() => {
        const order: MatchMode[] = [
            "randombg",
            "skirmish",
            "solo",
            "rated2",
            "rated3",
            "rbg",
            "unknown",
        ];
        const present = new Set(summaries.map((summary) => summary.mode));
        return order.filter((mode) => present.has(mode));
    }, [summaries]);

    const showCharacterFocus = autoScopeStrategy !== "latest_character_latest_bracket";
    const showBracketFocus = autoScopeStrategy === "selected_character_selected_bracket";

    const ratedPreferenceDescriptions: Record<AutoScopeRatedPreference, string> = {
        no_preference: "Use the latest match without favoring rated or casual queues.",
        prefer_rated: "Favor rated matches first when the bracket is chosen automatically.",
        prefer_non_rated:
            "Favor non-rated matches first when the bracket is chosen automatically.",
    };

    useEffect(() => {
        const state = location.state as SettingsLocationState | null;
        if (!state || state.highlightAutoScope !== true) return;

        setHighlightAutoScope(true);
        autoScopePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

        const timeout = window.setTimeout(() => setHighlightAutoScope(false), 3000);
        return () => window.clearTimeout(timeout);
    }, [location.state]);

    return (
        <RouteLayout
            title="Settings"
            description="Tune your desktop preferences and update behavior."
        >
            <div className={styles.grid}>
                <div className={styles.panel}>
                    <div className={styles.panelTitle}>Account</div>
                    <div className={styles.kv}>
                        <span className={styles.k}>Signed in as</span>
                        <span className={styles.v}>{user?.email ?? "Unknown"}</span>
                    </div>
                    <div className={styles.kv}>
                        <span className={styles.k}>Session ID</span>
                        <span className={styles.v}>{user?._id ?? "Not available"}</span>
                    </div>
                </div>

                <div className={styles.panel}>
                    <div className={styles.panelTitle}>Preferences</div>
                    <label className={styles.toggle}>
                        <input
                            className={styles.toggleInput}
                            type="checkbox"
                            checked={minimizeToTray}
                            onChange={(event) => setMinimizeToTray(event.target.checked)}
                        />
                        <span className={styles.toggleTrack} />
                        <span className={styles.toggleText}>
                            Minimize to tray on close {minimizeToTray ? "enabled" : "disabled"}
                        </span>
                    </label>
                    <label className={styles.toggle}>
                        <input
                            className={styles.toggleInput}
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(event) => setAutoRefresh(event.target.checked)}
                        />
                        <span className={styles.toggleTrack} />
                        <span className={styles.toggleText}>
                            Auto-refresh activity {autoRefresh ? "enabled" : "disabled"}
                        </span>
                    </label>
                </div>

                <div
                    ref={autoScopePanelRef}
                    className={`${styles.panel} ${styles.panelWide} ${styles.autoScopePanel} ${
                        highlightAutoScope ? styles.autoScopePanelHighlighted : ""
                    }`}
                >
                    <div className={styles.panelHeader}>
                        <div className={styles.panelTitle}>Auto Scope Tune</div>
                        <p className={styles.panelBody}>
                            Control how Auto Scope locks onto the right character and bracket.
                        </p>
                    </div>

                    <section className={styles.autoScopeHero} aria-labelledby="auto-scope-strategy">
                        <div className={styles.heroHeader}>
                            <div className={styles.sectionLabel} id="auto-scope-strategy">
                                Scope Strategy
                            </div>
                        </div>

                        <div className={styles.strategySelector} aria-labelledby="auto-scope-strategy">
                            {AUTO_SCOPE_STRATEGY_OPTIONS.map((option) => {
                                const isActive = autoScopeStrategy === option.value;

                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        aria-pressed={isActive}
                                        className={`${styles.strategyOption} ${
                                            isActive ? styles.strategyOptionActive : ""
                                        }`}
                                        onClick={() => setAutoScopeStrategy(option.value)}
                                    >
                                        <span className={styles.strategyOptionLabel}>
                                            {option.label}
                                        </span>
                                        <span className={styles.strategyOptionDescription}>
                                            {option.description}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {(showCharacterFocus || showBracketFocus) && (
                            <div className={styles.focusRules}>
                                <div className={styles.sectionLabel}>Focus Rules</div>
                                <div className={styles.secondaryControls}>
                                    {showCharacterFocus && (
                                        <div className={styles.controlGroup}>
                                            <label
                                                className={styles.controlLabel}
                                                htmlFor="auto-scope-character"
                                            >
                                                Character Focus
                                            </label>
                                            <div className={styles.selectShell}>
                                                <select
                                                    id="auto-scope-character"
                                                    className={styles.select}
                                                    value={autoScopeCharacter}
                                                    onChange={(event) =>
                                                        setAutoScopeCharacter(
                                                            event.target.value || "auto"
                                                        )
                                                    }
                                                >
                                                    <option value="auto">
                                                        Follow latest character
                                                    </option>
                                                    {characterOptions.map((character) => (
                                                        <option key={character} value={character}>
                                                            {character}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {showBracketFocus && (
                                        <div className={styles.controlGroup}>
                                            <label
                                                className={styles.controlLabel}
                                                htmlFor="auto-scope-bracket"
                                            >
                                                Bracket Focus
                                            </label>
                                            <div className={styles.selectShell}>
                                                <select
                                                    id="auto-scope-bracket"
                                                    className={styles.select}
                                                    value={autoScopeBracket}
                                                    onChange={(event) =>
                                                        setAutoScopeBracket(
                                                            (event.target.value as MatchMode | "auto") ||
                                                                "auto"
                                                        )
                                                    }
                                                >
                                                    <option value="auto">
                                                        Follow latest bracket
                                                    </option>
                                                    {bracketOptions.map((mode) => (
                                                        <option key={mode} value={mode}>
                                                            {getModeLabel(mode)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>

                    <div className={styles.sectionDivider} />

                    <section className={styles.preferenceSection} aria-labelledby="match-preference">
                        <div className={styles.preferenceMeta}>
                            <div className={styles.sectionLabel} id="match-preference">
                                Rated Preference
                            </div>
                            <p className={styles.preferenceHint}>
                                {ratedPreferenceDescriptions[autoScopeRatedPreference]}
                            </p>
                        </div>

                        <div
                            className={styles.preferenceSegments}
                            aria-labelledby="match-preference"
                        >
                            {AUTO_SCOPE_RATED_PREFERENCE_OPTIONS.map((option) => {
                                const isActive = autoScopeRatedPreference === option.value;

                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        aria-pressed={isActive}
                                        className={`${styles.preferenceSegment} ${
                                            isActive ? styles.preferenceSegmentActive : ""
                                        }`}
                                        onClick={() => setAutoScopeRatedPreference(option.value)}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                </div>
            </div>
        </RouteLayout>
    );
}
