import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GuestRoute, UserRoute } from "./Guards";
import DemoContent from "../Demo-content/Demo-Content";
import Login from "../Login/Login";


export default function AppRoutes() {
    return (
        <BrowserRouter>
            <Routes>

                {/* User Only */}
                <Route element={<UserRoute />}>
                    <Route path="/" element={<DemoContent />} />
                </Route>

                {/* Guest Only */}
                <Route element={<GuestRoute />}>
                    <Route path="/login" element={<Login />} />
                </Route>

                {/* Public */}
                
            </Routes>
        </BrowserRouter>
    );
}
