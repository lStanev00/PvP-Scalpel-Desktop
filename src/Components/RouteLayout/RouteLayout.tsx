import { ReactNode } from "react";
import styles from "./RouteLayout.module.css";

interface RouteLayoutProps {
    title: string;
    description?: string;
    actions?: ReactNode;
    children: ReactNode;
}

export default function RouteLayout({ title, description, actions, children }: RouteLayoutProps) {
    return (
        <section className={styles.layout}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>{title}</h1>
                    {description ? <p className={styles.description}>{description}</p> : null}
                </div>
                {actions ? <div className={styles.actions}>{actions}</div> : null}
            </header>
            <div className={styles.body}>{children}</div>
        </section>
    );
}
