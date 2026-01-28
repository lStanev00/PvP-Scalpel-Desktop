import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GuestRoute, UserRoute } from "./Guards";
import AppShell from "../AppShell/AppShell";
import DataActivity from "../Data-Activity/DataActivity";
import Login from "../Login/Login";
import Dashboard from "../../Pages/Dashboard/Dashboard";
import Logs from "../../Pages/Logs/Logs";
import Settings from "../../Pages/Settings/Settings";
import About from "../../Pages/About/About";

export default function AppRoutes() {
    return (
        <BrowserRouter>
            <Routes>
                {/* User Only */}
                <Route element={<UserRoute />}>
                    <Route element={<AppShell />}>
                        <Route index element={<Navigate to="/dashboard" replace />} />
                        <Route path="dashboard" element={<Dashboard />} />
                        <Route path="data" element={<DataActivity />} />
                        <Route path="logs" element={<Logs />} />
                        <Route path="settings" element={<Settings />} />
                        <Route path="about" element={<About />} />
                    </Route>
                </Route>

                {/* Guest Only */}
                <Route element={<GuestRoute />}>
                    <Route path="/login" element={<Login />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
