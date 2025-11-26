import useUserContext from "./Hooks/useUserContext";
import AppRoutes from "./Components/Router/Router";

export default function App() {
    const { httpFetch } = useUserContext();
    httpFetch("/verify/me").then(console.info).catch(console.error)

    return <AppRoutes />;
}
