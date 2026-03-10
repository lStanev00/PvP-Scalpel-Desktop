import { useNavigate } from "react-router-dom";
import { LuShield, LuSwords, LuZap } from "react-icons/lu";
import RouteLayout from "../../Components/RouteLayout/RouteLayout";
import styles from "./Home.module.css";

const featureCards = [
    {
        title: "Match History",
        copy: "Detailed breakdown of every PvP match with player stats, ratings, and outcomes.",
        icon: <LuSwords aria-hidden="true" />,
    },
    {
        title: "Spell Analytics",
        copy: "Cast timelines, interrupt tracking, and per-spell damage and healing metrics.",
        icon: <LuZap aria-hidden="true" />,
    },
    {
        title: "Performance Metrics",
        copy: "Contribution circles, kick efficiency, and MSS stats at a glance.",
        icon: <LuShield aria-hidden="true" />,
    },
];

export default function Home() {
    const navigate = useNavigate();

    return (
        <RouteLayout
            title="Home"
            description="Precision PvP Intelligence"
            showHeader={false}
        >
            <section className={styles.page}>
                <div className={styles.hero}>
                    <span className={styles.badge}>PvP Analytics Platform</span>
                    <h1 className={styles.title}>
                        <span className={styles.titleStatic}>Precision PvP</span>
                        <span className={styles.titleAccent}>Intelligence</span>
                    </h1>
                    <p className={styles.copy}>
                        Track every match, analyze spell usage, and gain the competitive edge
                        with data-driven insights for World of Warcraft PvP.
                    </p>
                    <button
                        type="button"
                        className={styles.cta}
                        onClick={() => navigate("/data")}
                    >
                        <LuSwords aria-hidden="true" />
                        <span>View Match History</span>
                    </button>
                </div>

                <div className={styles.featureGrid}>
                    {featureCards.map((card) => (
                        <article key={card.title} className={styles.featureCard}>
                            <div className={styles.featureIcon}>{card.icon}</div>
                            <h2 className={styles.featureTitle}>{card.title}</h2>
                            <p className={styles.featureCopy}>{card.copy}</p>
                        </article>
                    ))}
                </div>
            </section>
        </RouteLayout>
    );
}
