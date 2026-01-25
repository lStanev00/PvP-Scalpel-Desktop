// THIS MODULE IS IMPORTED FROM https://www.pvpscalpel.com/login
import { useState, FormEvent } from "react";
import Style from "./Login.module.css";
import { useNavigate } from "react-router-dom";
import useUserContext from "../../Hooks/useUserContext.js";
import getFingerprint from "../../Helpers/getFingerprint.js";
import { openUrl } from "../../Helpers/open.js";

interface ErrorAction {
    label: string;
    url: string;
}

export default function Login() {
    const [error, setError] = useState<string | undefined>();
    const [errorNote, setErrorNote] = useState<string | undefined>();
    const [errorAction, setErrorAction] = useState<ErrorAction | undefined>();
    const navigate = useNavigate();
    const { setUser, httpFetch } = useUserContext();

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();

        const formData = new FormData(e.currentTarget);
        const email = (formData.get("email") as string | null)?.trim();
        const password = (formData.get("password") as string | null) ?? "";
        const fingerprint = getFingerprint();

        let isValid = true;

        setError(undefined);
        setErrorNote(undefined);
        setErrorAction(undefined);

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
            if (req.error) setError(req.error);

            if (req.status === 200) {
                if (req.data && typeof req.data === "object") {
                    setUser(req.data as any);
                } else {
                    setUser({ _id: "pending", email, fingerprint });
                }

                navigate(`/`);

                void (async () => {
                    await wait(150);
                    for (let attempt = 0; attempt < 4; attempt += 1) {
                        const verify = await httpFetch(`/verify/me`);
                        if (verify.ok && verify.data) {
                            setUser(verify.data as any);
                            return;
                        }
                        await wait(250);
                    }
                })();

                await wait(200);
                return;
            }

            if (req.status === 409) {
                setError("Bad credentials! Check the input or create an account.");
                setErrorAction({ label: "Reset password", url: "https://www.pvpscalpel.com/reset/password" });
                return;
            }

            if (req.status === 500) {
                setError("Internal server error. Please report to admin.");
                return;
            }

            if (req.status === 400) {
                setUser({ email, fingerprint });
                setError("Bad credentials!");
                setErrorNote("Try resetting your password.");
                setErrorAction({ label: "Reset password", url: "https://www.pvpscalpel.com/reset/password" });
            }
        }
    }

    return (
        <div className={Style.shell}>
            <section className={Style.container}>
                <div className={Style.header}>
                    <div className={Style.logo} aria-hidden="true" />
                    <div>
                        <h4 className={Style.title}>Login</h4>
                        <p className={Style.subtitle}>Access your PvP Scalpel desktop analytics.</p>
                    </div>
                </div>

                <form className={Style.form} onSubmit={handleSubmit}>
                    <div className={Style.field}>
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            name="email"
                            placeholder="you@example.com"
                        />
                    </div>

                    <div className={Style.field}>
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            autoComplete="current-password"
                            name="password"
                            placeholder="Password"
                        />
                    </div>

                    {(error || errorNote) && (
                        <div className={Style.errorBox}>
                            {error ? <p className={Style.errorText}>{error}</p> : null}
                            {errorNote ? <p className={Style.errorHint}>{errorNote}</p> : null}
                            {errorAction ? (
                                <button
                                    type="button"
                                    className={Style.errorLink}
                                    onClick={() => openUrl(errorAction.url)}
                                >
                                    {errorAction.label}
                                </button>
                            ) : null}
                        </div>
                    )}

                    <button type="submit" className={Style.submit}>
                        Sign in
                    </button>

                    <div className={Style.links}>
                        <button
                            type="button"
                            className={Style.link}
                            onClick={() => openUrl("https://www.pvpscalpel.com/reset/password")}
                        >
                            Forgot your password?
                        </button>
                        <button
                            type="button"
                            className={Style.link}
                            onClick={() => openUrl("https://www.pvpscalpel.com/register")}
                        >
                            Create a new account
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}
