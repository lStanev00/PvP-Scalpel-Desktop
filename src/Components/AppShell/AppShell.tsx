import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { usePreferences } from "../../Context-Providers/preferences-context";
import TopBar from "../TopBar/TopBar";
import NavigationMenu from "../NavigationMenu/NavigationMenu";
import styles from "./AppShell.module.css";

export default function AppShell() {
    const [introActive, setIntroActive] = useState(true);
    const [revealActive, setRevealActive] = useState(false);
    const [showUi, setShowUi] = useState(false);
    const [introCycle, setIntroCycle] = useState(0);
    const [forceIntro, setForceIntro] = useState(true);
    const { minimizeToTray, navCollapsed, setNavCollapsed } = usePreferences();
    const minimizeToTrayRef = useRef(minimizeToTray);
    const closeListenerRef = useRef<null | (() => void)>(null);
    const entranceTimerRef = useRef<number | null>(null);
    const revealTimerRef = useRef<number | null>(null);
    const introDoneRef = useRef(false);

    useEffect(() => {
        const win = getCurrentWindow();
        win.setShadow(false).catch(() => undefined);
    }, []);

    useEffect(() => {
        const id = window.setTimeout(() => setForceIntro(false), 30);
        return () => window.clearTimeout(id);
    }, []);

    useEffect(() => {
        minimizeToTrayRef.current = minimizeToTray;
    }, [minimizeToTray]);

    const finishIntro = () => {
        if (introDoneRef.current) return;
        introDoneRef.current = true;
        if (entranceTimerRef.current) window.clearTimeout(entranceTimerRef.current);
        setIntroActive(false);
        setShowUi(true);
        setRevealActive(true);
        if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = window.setTimeout(() => setRevealActive(false), 900);
    };

    const startIntro = (durationMs: number) => {
        if (entranceTimerRef.current) window.clearTimeout(entranceTimerRef.current);
        if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
        introDoneRef.current = false;
        setRevealActive(false);
        setIntroActive(true);
        setShowUi(false);
        setIntroCycle((value) => value + 1);
        entranceTimerRef.current = window.setTimeout(() => {
            finishIntro();
        }, durationMs);
    };

    useEffect(() => {
        startIntro(5000);
        return () => {
            if (entranceTimerRef.current) window.clearTimeout(entranceTimerRef.current);
            if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
        };
    }, []);

    const handleIntroEnd = () => {
        finishIntro();
    };

    const hideToTray = async () => {
        const win = getCurrentWindow();
        await win.setSkipTaskbar(true).catch(() => undefined);
        await win.minimize().catch(() => undefined);
        await win.hide().catch(() => undefined);
    };

    const showFromTray = async () => {
        const win = getCurrentWindow();
        if (entranceTimerRef.current) window.clearTimeout(entranceTimerRef.current);
        if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
        setIntroActive(false);
        setRevealActive(false);
        setShowUi(true);
        await win.setSkipTaskbar(false).catch(() => undefined);
        await win.unminimize().catch(() => undefined);
        await win.show().catch(() => undefined);
        await win.center().catch(() => undefined);
        await win.setFocus().catch(() => undefined);
    };

    useEffect(() => {
        let cancelled = false;
        const win = getCurrentWindow();
        win.onCloseRequested(async (event) => {
            event.preventDefault();
            if (minimizeToTrayRef.current) {
                await hideToTray();
                return;
            }
            await invoke("exit_app").catch(() => win.close());
        }).then((stop) => {
            if (cancelled) {
                stop();
                return;
            }
            if (closeListenerRef.current) closeListenerRef.current();
            closeListenerRef.current = stop;
        });

        return () => {
            cancelled = true;
            if (closeListenerRef.current) {
                closeListenerRef.current();
                closeListenerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        let unlistenShow: (() => void) | null = null;
        let unlistenHide: (() => void) | null = null;
        let unlistenLaunch: (() => void) | null = null;
        listen("tray-show", () => {
            showFromTray();
        }).then((stop) => {
            unlistenShow = stop;
        });
        listen("tray-hide", () => {
            hideToTray();
        }).then((stop) => {
            unlistenHide = stop;
        });
        listen("tray-launch", () => {
            showFromTray();
        }).then((stop) => {
            unlistenLaunch = stop;
        });
        return () => {
            if (unlistenShow) unlistenShow();
            if (unlistenHide) unlistenHide();
            if (unlistenLaunch) unlistenLaunch();
        };
    }, []);

    const handleMinimize = async () => {
        if (minimizeToTrayRef.current) {
            await hideToTray();
            return;
        }
        const win = getCurrentWindow();
        await win.minimize().catch(() => undefined);
    };

    const handleMaximize = async () => {
        const win = getCurrentWindow();
        await win.toggleMaximize().catch(() => undefined);
    };

    const handleClose = async () => {
        if (minimizeToTrayRef.current) {
            await hideToTray();
            return;
        }
        const win = getCurrentWindow();
        await invoke("exit_app").catch(() => win.close());
    };

    const shellClass = `${styles.shell} ${introActive || forceIntro ? styles.shellIntro : ""}`;

    return (
        <div className={shellClass}>
            <div className={styles.bgGlow} />
            <div className={styles.bgNoise} />
            <div
                className={`${styles.frame} ${introActive || forceIntro ? styles.frameIntro : ""} ${
                    revealActive ? styles.frameReveal : ""
                }`}
            >
                <div className={`${styles.introOverlay} ${introActive ? styles.introActive : styles.introHidden}`}>
                    <div key={introCycle} className={styles.introLogo} onAnimationEnd={handleIntroEnd} />
                </div>
                {showUi ? (
                    <>
                        <div className={styles.headerWrap}>
                            <TopBar onMinimize={handleMinimize} onMaximize={handleMaximize} onClose={handleClose} />
                        </div>
                        <div className={styles.body}>
                            <NavigationMenu
                                collapsed={navCollapsed}
                                onToggle={() => setNavCollapsed(!navCollapsed)}
                            />
                            <main className={styles.main}>
                                <Outlet />
                            </main>
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    );
}
