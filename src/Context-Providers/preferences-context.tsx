import { createContext, ReactNode, useContext, useEffect, useState } from "react";

interface PreferencesContextValue {
    minimizeToTray: boolean;
    setMinimizeToTray: (value: boolean) => void;
    navCollapsed: boolean;
    setNavCollapsed: (value: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const loadStoredBoolean = (key: string, fallback: boolean) => {
    try {
        const stored = localStorage.getItem(key);
        return stored ? stored === "true" : fallback;
    } catch {
        return fallback;
    }
};

export const PreferencesProvider = ({ children }: { children: ReactNode }) => {
    const [minimizeToTray, setMinimizeToTray] = useState(() =>
        loadStoredBoolean("minimizeToTray", true)
    );
    const [navCollapsed, setNavCollapsed] = useState(() =>
        loadStoredBoolean("navCollapsed", false)
    );

    useEffect(() => {
        localStorage.setItem("minimizeToTray", String(minimizeToTray));
    }, [minimizeToTray]);

    useEffect(() => {
        localStorage.setItem("navCollapsed", String(navCollapsed));
    }, [navCollapsed]);

    return (
        <PreferencesContext.Provider
            value={{ minimizeToTray, setMinimizeToTray, navCollapsed, setNavCollapsed }}
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
