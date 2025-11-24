import { useEffect } from "react";
import useUserContext from "./Hooks/useUserContext";

export default function App() {
    const { httpFetch, user } = useUserContext();
    useEffect(() => {
        const veryfyMe = async () => {
            const req = await httpFetch("/verify/me");
            console.info(req)
        }
        veryfyMe();
    }, []);
    return (
        <>
            <div>
                <img src="logo/logo.png" alt="image" />
            </div>
        </>
    );
}
