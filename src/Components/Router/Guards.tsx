import { Navigate, Outlet } from "react-router-dom";
import useUserContext from "../../Hooks/useUserContext.ts";

export const UserRoute = () => {
    const { user } = useUserContext();
    const isAuthenticated = Boolean(user?._id);
    // const location = useLocation().pathname;

    // return isAuthenticated ? <Outlet /> : <Navigate to={`/login?target=${location}`} />;
    return isAuthenticated ? <Outlet /> : <Navigate to={`/login`} />;
};

export const GuestRoute = () => {
    const { user } = useUserContext();
    const isAuthenticated = Boolean(user?._id);

    return !isAuthenticated ? <Outlet /> : <Navigate to="/" />;
};
