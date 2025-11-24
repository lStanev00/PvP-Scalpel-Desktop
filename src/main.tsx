import { createRoot } from "react-dom/client";
import App from "./App";
import { UserProvider } from "./Context-Providers/main-contenxt";

createRoot(document.querySelector("body")!).render(
    <UserProvider>
        <App />
    </UserProvider>
);
