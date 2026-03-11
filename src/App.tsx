import useUserContext from "./Hooks/useUserContext";
import AppRoutes from "./Components/Router/Router";
import { useEffect } from "react";
import CharacterProfilePrefetch from "./Components/CharacterProfilePrefetch";

export default function App() {
    const { httpFetch } = useUserContext();

    useEffect(() => {
        httpFetch("/verify/me").then(console.info).catch(console.error);
    }, [httpFetch]);

    return (
        <>
            <CharacterProfilePrefetch />
            <AppRoutes />
        </>
    );
}
