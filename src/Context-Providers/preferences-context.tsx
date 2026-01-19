import { createContext, ReactNode, useContext, useEffect, useState } from "react";

interface PreferencesContextValue {
    minimizeToTray: boolean;
    setMinimizeToTray: (value: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export const PreferencesProvider = ({ children }: { children: ReactNode }) => {
    const [minimizeToTray, setMinimizeToTray] = useState(() => {
        const stored = localStorage.getItem("minimizeToTray");
        return stored ? stored === "true" : true;
    });

    useEffect(() => {
        localStorage.setItem("minimizeToTray", String(minimizeToTray));
    }, [minimizeToTray]);

    return (
        <PreferencesContext.Provider value={{ minimizeToTray, setMinimizeToTray }}>
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
