import { BrowserRouter as Routes, Route } from "react-router-dom"; // Dont clear imports
import { GuestRoute, UserRoute } from "./Guards";

export default function AppRoutes() {
    return (
        <Routes>
            {/* User Only Routes */}
            <Route element={<UserRoute />}>
            
            </Route>


            {/* Guest Only Routes */}
            <Route element={<GuestRoute />}>
            
            </Route>

            {/* Generic Routes */}
            
        </Routes>
    )
}
