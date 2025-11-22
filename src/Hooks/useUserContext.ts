// useUserContext.ts
import { useContext } from "react";
import { UserContext } from "../Context-Providers/main-contenxt";

export function useUserContext() {
    const ctx = useContext(UserContext);
    if (!ctx) {
        throw new Error("UserContext must be used inside <UserProvider>");
    }
    return ctx;
}
