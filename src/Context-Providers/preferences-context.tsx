import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import {
    BRACKET_RANDOM_BATTLEGROUND_GROUP,
    parseBracketScopeId,
    type MatchScopeMode,
} from "../Components/DataActivity/utils";

interface PreferencesContextValue {
    minimizeToTray: boolean;
    setMinimizeToTray: (value: boolean) => void;
    navAlwaysCollapsed: boolean;
    setNavAlwaysCollapsed: (value: boolean) => void;
    autoScopeStrategy: AutoScopeStrategy;
    setAutoScopeStrategy: (value: AutoScopeStrategy) => void;
    autoScopeCharacter: string | "auto";
    setAutoScopeCharacter: (value: string | "auto") => void;
    autoScopeBracket: MatchScopeMode | "auto";
    setAutoScopeBracket: (value: MatchScopeMode | "auto") => void;
    autoScopeRatedPreference: AutoScopeRatedPreference;
    setAutoScopeRatedPreference: (value: AutoScopeRatedPreference) => void;
    collapseRandomBattlegrounds: boolean;
    setCollapseRandomBattlegrounds: (value: boolean) => void;
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

const loadStoredAutoScopeBracket = (key: string, fallback: MatchScopeMode | "auto") => {
    try {
        const stored = localStorage.getItem(key);
        if (!stored) return fallback;
        if (stored === "auto") return "auto";
        return parseBracketScopeId(stored) ?? fallback;
    } catch {
        return fallback;
    }
};

export const PreferencesProvider = ({ children }: { children: ReactNode }) => {
    const [minimizeToTray, setMinimizeToTray] = useState(() =>
        loadStoredBoolean("minimizeToTray", true)
    );
    const [navAlwaysCollapsed, setNavAlwaysCollapsed] = useState(() =>
        loadStoredBoolean("navAlwaysCollapsed", false)
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
    const [autoScopeBracket, setAutoScopeBracket] = useState<MatchScopeMode | "auto">(() =>
        loadStoredAutoScopeBracket("autoScopeBracket", "auto")
    );
    const [autoScopeRatedPreference, setAutoScopeRatedPreference] =
        useState<AutoScopeRatedPreference>(() =>
            loadStoredString<AutoScopeRatedPreference>(
                "autoScopeRatedPreference",
                "no_preference"
            )
        );
    const [collapseRandomBattlegrounds, setCollapseRandomBattlegrounds] = useState(() =>
        loadStoredBoolean("collapseRandomBattlegrounds", true)
    );

    useEffect(() => {
        localStorage.setItem("minimizeToTray", String(minimizeToTray));
    }, [minimizeToTray]);

    useEffect(() => {
        localStorage.setItem("navAlwaysCollapsed", String(navAlwaysCollapsed));
    }, [navAlwaysCollapsed]);

    useEffect(() => {
        localStorage.setItem("autoScopeStrategy", autoScopeStrategy);
    }, [autoScopeStrategy]);

    useEffect(() => {
        localStorage.setItem("autoScopeCharacter", autoScopeCharacter);
    }, [autoScopeCharacter]);

    useEffect(() => {
        localStorage.setItem("autoScopeBracket", String(autoScopeBracket));
    }, [autoScopeBracket]);

    useEffect(() => {
        localStorage.setItem("autoScopeRatedPreference", autoScopeRatedPreference);
    }, [autoScopeRatedPreference]);

    useEffect(() => {
        localStorage.setItem(
            "collapseRandomBattlegrounds",
            String(collapseRandomBattlegrounds)
        );
    }, [collapseRandomBattlegrounds]);

    useEffect(() => {
        if (collapseRandomBattlegrounds || autoScopeBracket !== BRACKET_RANDOM_BATTLEGROUND_GROUP) {
            return;
        }
        setAutoScopeBracket("auto");
    }, [collapseRandomBattlegrounds, autoScopeBracket]);

    useEffect(() => {
        localStorage.removeItem("navCollapsed");
    }, []);

    return (
        <PreferencesContext.Provider
            value={{
                minimizeToTray,
                setMinimizeToTray,
                navAlwaysCollapsed,
                setNavAlwaysCollapsed,
                autoScopeStrategy,
                setAutoScopeStrategy,
                autoScopeCharacter,
                setAutoScopeCharacter,
                autoScopeBracket,
                setAutoScopeBracket,
                autoScopeRatedPreference,
                setAutoScopeRatedPreference,
                collapseRandomBattlegrounds,
                setCollapseRandomBattlegrounds,
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
