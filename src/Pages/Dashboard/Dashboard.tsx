import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FaDiscord } from "react-icons/fa6";
import {
    LuBadgeCheck,
    LuClock3,
    LuCrosshair,
    LuRadar,
    LuShield,
    LuSwords,
    LuTrendingUp,
} from "react-icons/lu";
import useMatches from "../../Hooks/useMatches";
import useCharacterProfile, {
    resolveCharacterProfile,
    resolveCharacterBracketSnapshot,
} from "../../Hooks/useCharacterProfile";
import RouteLayout from "../../Components/RouteLayout/RouteLayout";
import { buildMatchSummary } from "../../Components/Data-Activity/utils";
import { openUrl } from "../../Helpers/open";
import styles from "./Dashboard.module.css";

const CHARACTER_API_SERVER = "eu";
const DEMO_DISCORD_URL = "https://discord.com/invite/2h45zpyJdb";

const formatResultLabel = (result: "win" | "loss" | "neutral") => {
    if (result === "win") return "Victory";
    if (result === "loss") return "Defeat";
    return "Unresolved";
};

export default function Dashboard() {
    const matches = useMatches();
    const navigate = useNavigate();

    const summaries = useMemo(
        () =>
            matches
                .map(buildMatchSummary)
                .sort((a, b) => b.timestampMs - a.timestampMs),
        [matches]
    );

    const latest = summaries[0] ?? null;
    const latestOwner = useMemo(() => {
        if (!latest) return null;
        return latest.raw.players.find((player) => player.isOwner) ?? latest.raw.players[0] ?? null;
    }, [latest]);
    const latestOwnerRealm = latestOwner?.realm ?? null;
    const profiles = useCharacterProfile({
        server: latest ? CHARACTER_API_SERVER : null,
        realm: latestOwnerRealm,
        name: latest?.owner.name ?? null,
    });
    const profile = useMemo(
        () =>
            resolveCharacterProfile(profiles, {
                server: latest ? CHARACTER_API_SERVER : null,
                realm: latestOwnerRealm,
                name: latest?.owner.name ?? null,
            }),
        [latest, latestOwnerRealm, profiles]
    );
    const scopedSummaries = useMemo(() => {
        if (!latest) return [];
        return summaries.filter(
            (match) => match.owner.name === latest.owner.name && match.mode === latest.mode
        );
    }, [latest, summaries]);
    const resolvedMatches = scopedSummaries.filter((match) => match.result !== "neutral");
    const recentWindow = resolvedMatches.slice(0, 6);
    const winCount = recentWindow.filter((match) => match.result === "win").length;
    const lossCount = recentWindow.filter((match) => match.result === "loss").length;
    const recentWinRate =
        recentWindow.length > 0 ? Math.round((winCount / recentWindow.length) * 100) : null;
    const recentDurationSamples = scopedSummaries
        .slice(0, 8)
        .map((match) => match.durationSeconds)
        .filter((value): value is number => typeof value === "number" && value > 0);
    const averageDuration =
        recentDurationSamples.length > 0
            ? Math.round(
                  recentDurationSamples.reduce((sum, value) => sum + value, 0) /
                      recentDurationSamples.length
              )
            : null;
    const apiBracketSnapshot = resolveCharacterBracketSnapshot(profiles, latest);
    const currentRating =
        scopedSummaries.find((match) => typeof match.owner.rating === "number")?.owner.rating ??
        apiBracketSnapshot?.rating ??
        null;
    const ownerName = latest?.owner.name ?? "Your character";
    const ownerSpec = profile?.activeSpec?.name ?? latest?.owner.spec ?? "Spec pending";
    const ownerClass = profile?.class?.name ?? latest?.owner.class ?? "Class pending";
    const currentBracketLabel = latest?.modeLabel ?? "Current bracket";
    const ownerRealmLabel =
        profile?.playerRealm?.name ??
        latestOwnerRealm?.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") ??
        "Realm pending";
    const ownerGuild = profile?.guildName ?? null;
    const seasonRecord = apiBracketSnapshot?.seasonMatchStatistics;
    const latestDelta = latest?.delta ?? null;
    const latestDeltaLabel =
        latestDelta === null ? "No rating data" : `${latestDelta > 0 ? "+" : ""}${latestDelta}`;
    const latestDeltaTone =
        latestDelta === null
            ? styles.metricNeutral
            : latestDelta > 0
              ? styles.metricGood
              : latestDelta < 0
                ? styles.metricBad
                : styles.metricNeutral;
    const verdictInsight = latest
        ? latestDelta !== null
            ? latestDelta > 0
                ? "Positive rating swing captured in the latest match."
                : latestDelta < 0
                  ? "Rating slipped in the latest capture."
                  : "No rating movement recorded for this capture."
            : latest.result === "win"
              ? "Win captured. Local telemetry has no rating delta for this mode."
              : latest.result === "loss"
                ? "Loss captured. Local telemetry has no rating delta for this mode."
                : "Capture recorded. Awaiting a decisive outcome."
        : "Waiting for the first captured match.";
    const heroTitle = latest
        ? `${ownerName} is ready for review`
        : "Desktop capture is live";
    const heroCopy = latest
        ? `Latest capture: ${latest.modeLabel} on ${latest.mapName}. Review the match, confirm the verdict, and keep the session context moving.`
        : "Once matches are detected, this dashboard turns into your command surface for review, diagnostics, and next actions.";
    const heroStyle =
        profile?.media?.banner
            ? {
                  backgroundImage: `linear-gradient(135deg, rgba(8, 14, 24, 0.96), rgba(5, 10, 18, 0.9)), radial-gradient(circle at 0% 0%, rgba(58, 167, 255, 0.12), transparent 38%), url("${profile.media.banner}")`,
                  backgroundSize: "auto, auto, cover",
                  backgroundPosition: "0 0, 0 0, center",
              }
            : undefined;
    const showRatingMetric = currentRating !== null && currentRating > 0;
    const metricFourLabel = showRatingMetric ? "Current rating" : "Active spec";
    const metricFourValue = showRatingMetric
        ? String(Math.round(currentRating))
        : ownerSpec;
    const metricFourDetail = showRatingMetric
        ? latest
            ? `${ownerName} in ${currentBracketLabel}`
            : "Rating attaches once match data is available"
        : `${ownerClass} in ${currentBracketLabel}`;
    const metricFourIcon = showRatingMetric ? <LuSwords aria-hidden="true" /> : <LuShield aria-hidden="true" />;
    const resultBadgeClass =
        latest?.result === "win"
            ? styles.resultGood
            : latest?.result === "loss"
              ? styles.resultBad
              : styles.resultNeutral;

    return (
        <RouteLayout
            title="Command Center"
            description="A sharper starting point for your desktop sessions, match review, and next actions."
            showHeader={false}
        >
            <div className={styles.dashboardSurface}>
                <div className={styles.dashboardCross}>
                    <span className={`${styles.dashboardCrossBand} ${styles.dashboardCrossBandA}`} />
                    <span className={`${styles.dashboardCrossBand} ${styles.dashboardCrossBandB}`} />
                    <div className={styles.demoOverlayCopy}>
                        <span className={`${styles.demoNote} ${styles.demoNoteTop}`}>Demo content</span>
                        <span className={`${styles.demoNote} ${styles.demoNoteLeft}`}>Demo content</span>
                        <span className={`${styles.demoNote} ${styles.demoNoteRight}`}>Demo content</span>
                        <div className={styles.demoCallout}>
                            <span className={styles.demoCalloutText}>Have ideas? Give them there</span>
                            <button
                                className={styles.demoCalloutBtn}
                                type="button"
                                onClick={() => openUrl(DEMO_DISCORD_URL)}
                            >
                                <FaDiscord aria-hidden="true" />
                                <span>Join Discord</span>
                            </button>
                        </div>
                    </div>
                </div>
                <section className={styles.hero} style={heroStyle}>
                    <div className={styles.heroCopy}>
                        <span className={styles.eyebrow}>PvP Scalpel Desktop</span>
                        <h2 className={styles.heroTitle}>{heroTitle}</h2>
                        <p className={styles.heroText}>{heroCopy}</p>

                        <div className={styles.heroIdentity}>
                            <div className={styles.identityVisual}>
                                {profile?.media?.avatar ? (
                                    <img
                                        className={styles.identityAvatar}
                                        src={profile.media.avatar}
                                        alt={`${ownerName} avatar`}
                                    />
                                ) : (
                                    <div className={styles.identityFallback}>{ownerName.charAt(0)}</div>
                                )}
                                <div className={styles.identityText}>
                                    <div className={styles.identityPrimary}>{ownerName}</div>
                                    <div className={styles.identityMeta}>
                                        <span>{ownerSpec}</span>
                                        <span>{ownerClass}</span>
                                        <span>{ownerRealmLabel}</span>
                                        <span>{latest?.timestampLabel ?? "Awaiting first session"}</span>
                                    </div>
                                    {ownerGuild ? (
                                        <div className={styles.identityGuild}>
                                            <LuBadgeCheck aria-hidden="true" />
                                            <span>{ownerGuild}</span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className={styles.heroActions}>
                            <button
                                className={styles.workflowBtn}
                                type="button"
                                onClick={() => navigate("/data")}
                                disabled={!latest}
                            >
                                <LuCrosshair aria-hidden="true" />
                                <span>Inspect match history</span>
                            </button>
                        </div>
                    </div>

                    <div className={styles.heroRail}>
                        <article className={styles.signalCard}>
                            <div className={styles.signalTop}>
                                <span className={styles.signalLabel}>Latest capture</span>
                                <span className={`${styles.signalBadge} ${latest ? styles.signalLive : styles.signalIdle}`}>
                                    {latest ? "LIVE" : "IDLE"}
                                </span>
                            </div>
                            <div className={styles.signalValue}>{latest?.mapName ?? "Waiting for first match"}</div>
                            <div className={styles.signalMeta}>
                                <span>{latest?.modeLabel ?? "No bracket yet"}</span>
                                <span>{latest?.timestampLabel ?? "No capture time"}</span>
                            </div>
                            <div className={styles.signalSubMeta}>
                                <span>{ownerName}</span>
                                <span>{latest?.durationLabel ?? "--"}</span>
                            </div>
                        </article>

                        <article className={styles.signalCard}>
                            <div className={styles.signalTop}>
                                <span className={styles.signalLabel}>Match verdict</span>
                                <span className={`${styles.deltaPill} ${latestDeltaTone}`}>{latestDeltaLabel}</span>
                            </div>
                            <div className={styles.signalValue}>
                                {latest ? formatResultLabel(latest.result) : "No verdict yet"}
                            </div>
                            <div className={styles.signalInsight}>{verdictInsight}</div>
                            <div className={styles.signalMeta}>
                                <span>{currentRating === null ? "Rating unavailable" : `${Math.round(currentRating)} rating`}</span>
                                <span>
                                    {seasonRecord?.won !== undefined && seasonRecord?.lost !== undefined
                                        ? `${seasonRecord.won}W - ${seasonRecord.lost}L season`
                                        : `${scopedSummaries.length} tracked in ${currentBracketLabel}`}
                                </span>
                            </div>
                        </article>
                    </div>
                </section>

                <section className={styles.metricsGrid}>
                    <article className={styles.metricCard}>
                        <div className={styles.metricIcon}>
                            <LuRadar aria-hidden="true" />
                        </div>
                        <div>
                            <div className={styles.metricLabel}>Matches tracked</div>
                            <div className={styles.metricValue}>{scopedSummaries.length}</div>
                            <div className={styles.metricDetail}>
                                {latest ? `${ownerName} in ${currentBracketLabel}` : "Across current desktop history"}
                            </div>
                        </div>
                    </article>

                    <article className={styles.metricCard}>
                        <div className={styles.metricIcon}>
                            <LuTrendingUp aria-hidden="true" />
                        </div>
                        <div>
                            <div className={styles.metricLabel}>Recent win rate</div>
                            <div className={styles.metricValue}>
                                {recentWinRate === null ? "--" : `${recentWinRate}%`}
                            </div>
                            <div className={styles.metricDetail}>
                                {recentWindow.length > 0 ? `${winCount}W - ${lossCount}L in last ${recentWindow.length}` : "Need resolved matches"}
                            </div>
                        </div>
                    </article>

                    <article className={styles.metricCard}>
                        <div className={styles.metricIcon}>
                            <LuClock3 aria-hidden="true" />
                        </div>
                        <div>
                            <div className={styles.metricLabel}>Average duration</div>
                            <div className={styles.metricValue}>
                                {averageDuration === null ? "--" : `${Math.floor(averageDuration / 60)}:${String(averageDuration % 60).padStart(2, "0")}`}
                            </div>
                            <div className={styles.metricDetail}>
                                {recentDurationSamples.length > 0 ? `From last ${recentDurationSamples.length} ${currentBracketLabel} captures` : "No duration samples"}
                            </div>
                        </div>
                    </article>

                    <article className={styles.metricCard}>
                        <div className={styles.metricIcon}>
                            {metricFourIcon}
                        </div>
                        <div>
                            <div className={styles.metricLabel}>{metricFourLabel}</div>
                            <div className={styles.metricValue}>{metricFourValue}</div>
                            <div className={styles.metricDetail}>{metricFourDetail}</div>
                        </div>
                    </article>
                </section>

                <section className={styles.contentGrid}>
                    <article className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <div>
                                <div className={styles.panelEyebrow}>Spotlight</div>
                                <h3 className={styles.panelTitle}>Latest captured match</h3>
                            </div>
                            {latest ? <span className={styles.panelTag}>{latest.modeLabel}</span> : null}
                        </div>

                        {latest ? (
                            <>
                                <div className={styles.spotlightHighlights}>
                                    <span className={`${styles.resultBadge} ${resultBadgeClass}`}>
                                        {formatResultLabel(latest.result)}
                                    </span>
                                    <span className={styles.highlightChip}>{ownerName}</span>
                                    <span className={styles.highlightChip}>{latest.durationLabel}</span>
                                    <span className={styles.highlightChip}>{latest.modeLabel}</span>
                                </div>

                                <div className={styles.spotlightGrid}>
                                    <div className={styles.spotlightCard}>
                                        <span className={styles.spotlightLabel}>Map</span>
                                        <span className={styles.spotlightValue}>{latest.mapName}</span>
                                    </div>
                                    <div className={styles.spotlightCard}>
                                        <span className={styles.spotlightLabel}>Verdict</span>
                                        <span className={styles.spotlightValue}>{verdictInsight}</span>
                                    </div>
                                    <div className={styles.spotlightCard}>
                                        <span className={styles.spotlightLabel}>MMR delta</span>
                                        <span className={`${styles.spotlightValue} ${latestDeltaTone}`}>{latest.deltaLabel}</span>
                                    </div>
                                    <div className={styles.spotlightCard}>
                                        <span className={styles.spotlightLabel}>Captured</span>
                                        <span className={styles.spotlightValue}>{latest.timestampLabel}</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className={styles.emptyPanel}>
                                <div className={styles.emptyTitle}>No matches recorded yet</div>
                                <p className={styles.emptyCopy}>
                                    Start queueing, and this space will turn into a match spotlight with map, result,
                                    rating swing, and jump-off points into history.
                                </p>
                            </div>
                        )}
                    </article>

                    <article className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <div>
                                <div className={styles.panelEyebrow}>Momentum</div>
                                <h3 className={styles.panelTitle}>Recent form</h3>
                            </div>
                            <button className={styles.inlineAction} type="button" onClick={() => navigate("/data")}>
                                Open full history
                            </button>
                        </div>

                        <div className={styles.formStrip}>
                            {recentWindow.length > 0 ? (
                                recentWindow.map((match) => (
                                    <div
                                        key={match.id}
                                        className={`${styles.formPill} ${
                                            match.result === "win"
                                                ? styles.formWin
                                                : match.result === "loss"
                                                  ? styles.formLoss
                                                  : styles.formNeutral
                                        }`}
                                    >
                                        <span>{match.result === "win" ? "W" : match.result === "loss" ? "L" : "?"}</span>
                                        <span>{match.deltaLabel}</span>
                                    </div>
                                ))
                            ) : (
                                <div className={styles.formEmpty}>Recent form fills in once resolved matches are detected.</div>
                            )}
                        </div>

                        <div className={styles.actionStack}>
                            <button className={styles.commandBtn} type="button" onClick={() => navigate("/data")}>
                                <span className={styles.commandIcon}>
                                    <LuRadar aria-hidden="true" />
                                </span>
                                <span>
                                    <strong>Inspect match history</strong>
                                    <small>Drill into timelines, summaries, and individual outcomes.</small>
                                </span>
                            </button>
                        </div>
                    </article>
                </section>
            </div>
        </RouteLayout>
    );
}
