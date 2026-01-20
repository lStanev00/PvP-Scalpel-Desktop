import { createRoot } from "react-dom/client";
import App from "./App";
import { UserProvider } from "./Context-Providers/main-contenxt";
import { MatchesProvider } from "./Context-Providers/matches-context";
import { PreferencesProvider } from "./Context-Providers/preferences-context";
import { AppInfoProvider } from "./Context-Providers/app-info-context";
import "./main.css";

const root = document.getElementById("root");

if (root) {
    createRoot(root).render(
        <UserProvider>
            <PreferencesProvider>
                <AppInfoProvider>
                    <MatchesProvider>
                        <App />
                    </MatchesProvider>
                </AppInfoProvider>
            </PreferencesProvider>
        </UserProvider>
    );
}
