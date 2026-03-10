import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import type { MatchMode } from "../Components/DataActivity/utils";

interface PreferencesContextValue {
    minimizeToTray: boolean;
    setMinimizeToTray: (value: boolean) => void;
    autoScopeStrategy: AutoScopeStrategy;
    setAutoScopeStrategy: (value: AutoScopeStrategy) => void;
    autoScopeCharacter: string | "auto";
    setAutoScopeCharacter: (value: string | "auto") => void;
    autoScopeBracket: MatchMode | "auto";
    setAutoScopeBracket: (value: MatchMode | "auto") => void;
    autoScopeRatedPreference: AutoScopeRatedPreference;
    setAutoScopeRatedPreference: (value: AutoScopeRatedPreference) => void;
}

export type AutoScopeStrategy =
    | "latest_character_latest_bracket"
    | "selected_character_latest_bracket"
    | "selected_character_selected_bracket";

export type AutoScopeRatedPreference =
    | "no_preference"
    | "prefer_rated"
    | "prefer_non_rated";

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const loadStoredBoolean = (key: string, fallback: boolean) => {
    try {
        const stored = localStorage.getItem(key);
        return stored ? stored === "true" : fallback;
    } catch {
        return fallback;
    }
};

const loadStoredString = <T extends string>(key: string, fallback: T) => {
    try {
        const stored = localStorage.getItem(key);
        return (stored as T | null) ?? fallback;
    } catch {
        return fallback;
    }
};

export const PreferencesProvider = ({ children }: { children: ReactNode }) => {
    const [minimizeToTray, setMinimizeToTray] = useState(() =>
        loadStoredBoolean("minimizeToTray", true)
    );
    const [autoScopeStrategy, setAutoScopeStrategy] = useState<AutoScopeStrategy>(() =>
        loadStoredString<AutoScopeStrategy>(
            "autoScopeStrategy",
            "latest_character_latest_bracket"
        )
    );
    const [autoScopeCharacter, setAutoScopeCharacter] = useState<string | "auto">(() =>
        loadStoredString<string | "auto">("autoScopeCharacter", "auto")
    );
    const [autoScopeBracket, setAutoScopeBracket] = useState<MatchMode | "auto">(() =>
        loadStoredString<MatchMode | "auto">("autoScopeBracket", "auto")
    );
    const [autoScopeRatedPreference, setAutoScopeRatedPreference] =
        useState<AutoScopeRatedPreference>(() =>
            loadStoredString<AutoScopeRatedPreference>(
                "autoScopeRatedPreference",
                "no_preference"
            )
        );

    useEffect(() => {
        localStorage.setItem("minimizeToTray", String(minimizeToTray));
    }, [minimizeToTray]);

    useEffect(() => {
        localStorage.setItem("autoScopeStrategy", autoScopeStrategy);
    }, [autoScopeStrategy]);

    useEffect(() => {
        localStorage.setItem("autoScopeCharacter", autoScopeCharacter);
    }, [autoScopeCharacter]);

    useEffect(() => {
        localStorage.setItem("autoScopeBracket", autoScopeBracket);
    }, [autoScopeBracket]);

    useEffect(() => {
        localStorage.setItem("autoScopeRatedPreference", autoScopeRatedPreference);
    }, [autoScopeRatedPreference]);

    useEffect(() => {
        localStorage.removeItem("navCollapsed");
    }, []);

    return (
        <PreferencesContext.Provider
            value={{
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
            }}
        >
            {children}
        </PreferencesContext.Provider>
    );
};

export const usePreferences = () => {
    const ctx = useContext(PreferencesContext);
    if (!ctx) {
        throw new Error("PreferencesContext must be used inside <PreferencesProvider>");
    }
    return ctx;
};
