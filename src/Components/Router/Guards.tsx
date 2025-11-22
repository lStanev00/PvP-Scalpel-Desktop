import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useUserContext } from "../../Hooks/useUserContext";

export const UserRoute = () => {
    const { user } = useUserContext();
    const isAuthenticated = Boolean(user?._id);
    const location = useLocation().pathname;

    return isAuthenticated ? <Outlet /> : <Navigate to={`/login?target=${location}`} />;
};

export const GuestRoute = () => {
    const { user } = useUserContext();
    const isAuthenticated = Boolean(user?._id);

    return !isAuthenticated ? <Outlet /> : <Navigate to="/" />;
};
