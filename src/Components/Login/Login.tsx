// THIS MODULE IS IMPORTED FROM https://www.pvpscalpel.com/login
import { useState, FormEvent, JSX } from "react";
import Style from "./Login.module.css";
import { useNavigate } from "react-router-dom";
import useUserContext from "../../Hooks/useUserContext.js";
import getFingerprint from "../../Helpers/getFingerprint.js";
import { open } from "@tauri-apps/plugin-shell";

export default function Login() {
    const [error, setError] = useState<string | JSX.Element | undefined>();
    const [newDivError, setNewDivError] = useState<JSX.Element | undefined>();
    const navigate = useNavigate();
    const { setUser, httpFetch } = useUserContext();

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();

        const formData = new FormData(e.currentTarget);
        const email = (formData.get("email") as string | null)?.trim();
        const password = formData.get("password") as string | null;
        const fingerprint = getFingerprint();

        let isValid = true;

        setError(undefined);
        setNewDivError(undefined);

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError("Invalid email address.");
            isValid = false;
        }

        if (!password || password.length < 6) {
            setError("Invalid password.");
            isValid = false;
        }

        if (isValid) {
            const apiEndpoint = `/login`;

            const req = await httpFetch(apiEndpoint, {
                method: "POST",
                body: JSON.stringify({
                    email,
                    password,
                    fingerprint,
                }),
            });
            if(req.error) setError(req.error);

            if (req.status === 200) {
                await httpFetch(`/verify/me`);
                navigate(`/`);
                await new Promise((resolve) => setTimeout(resolve, 200));
                return;
            }

            if (req.status === 409) {
                return setError(
                    <>
                        Bad credentials! Check the input or create an account.{" "}
                        <a
                            onClick={(e) => {
                                e.preventDefault();
                                open("https://www.pvpscalpel.com/reset/password");
                            }}></a>
                    </>
                );
            }

            if (req.status === 500) {
                return setError("Internal server error. Please report to admin.");
            }

            if (req.status === 400) {
                setUser({ email, fingerprint });
                return setNewDivError(
                    <div style={{ textAlign: "center", fontSize: "medium" }}>
                        <p style={{ color: "red" }}>Bad credentials!</p>
                        Try{" "}
                        <a
                            onClick={(e) => {
                                e.preventDefault();
                                open("https://www.pvpscalpel.com/reset/password");
                            }}>
                            Reset password
                        </a>
                    </div>
                );
            }
        }
    }

    return (
        <section className={Style["container"]}>
            <section
                className={Style["inner-section"]}
                style={{ color: "#facc15", fontSize: "40px" }}>
                <h4>Login</h4>
            </section>

            <div>
                <form onSubmit={handleSubmit}>
                    <div className={Style["inner-section"]}>
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            name="email"
                            placeholder="Email.."
                        />

                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            autoComplete="current-password"
                            name="password"
                            placeholder="Password.."
                        />

                        {error && (
                            <p className={Style["error-msg"]}>
                                <b>{error}</b>
                            </p>
                        )}

                        {newDivError}

                        <button type="submit">Login</button>

                        <p>
                            Forgot your password?{" "}
                            <a
                                onClick={(e) => {
                                    e.preventDefault();
                                    open("https://www.pvpscalpel.com/reset/password");
                                }}>
                                Reset here
                            </a>
                        </p>
                        <p>
                            Don't have an account?{" "}
                            <a
                                onClick={(e) => {
                                    e.preventDefault();
                                    open("https://www.pvpscalpel.com/register");
                                }}>
                                Register here
                            </a>
                        </p>
                    </div>
                </form>
            </div>
        </section>
    );
}
