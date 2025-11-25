import { createRoot } from "react-dom/client";
import App from "./App";
import { UserProvider } from "./Context-Providers/main-contenxt";
import "./main.css";

createRoot(document.querySelector("body")!).render(
    <UserProvider>
        <App />
    </UserProvider>
);
