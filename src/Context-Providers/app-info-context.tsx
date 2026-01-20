import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AppInfoContextValue {
    desktopVersion: string | null;
    addonVersion: string | null;
}

type LocalVersions = {
    desktopVersion?: string | null;
    addonVersion?: string | null;
};

const AppInfoContext = createContext<AppInfoContextValue | null>(null);

export const AppInfoProvider = ({ children }: { children: ReactNode }) => {
    const [desktopVersion, setDesktopVersion] = useState<string | null>(null);
    const [addonVersion, setAddonVersion] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        // Fetch and cache local versions once per app run.
        invoke<LocalVersions>("get_local_versions")
            .then((versions) => {
                if (active) {
                    setDesktopVersion(versions?.desktopVersion ?? null);
                    setAddonVersion(versions?.addonVersion ?? null);
                }
            })
            .catch(() => {
                if (active) {
                    setDesktopVersion(null);
                    setAddonVersion(null);
                }
            });

        return () => {
            active = false;
        };
    }, []);

    return (
        <AppInfoContext.Provider value={{ desktopVersion, addonVersion }}>
            {children}
        </AppInfoContext.Provider>
    );
};

export const useAppInfo = () => {
    const ctx = useContext(AppInfoContext);
    if (!ctx) {
        throw new Error("AppInfoContext must be used inside <AppInfoProvider>");
    }
    return ctx;
};
