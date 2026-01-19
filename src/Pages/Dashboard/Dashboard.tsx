import { useNavigate } from "react-router-dom";
import useMatches from "../../Hooks/useMatches";
import RouteLayout from "../../Components/RouteLayout/RouteLayout";
import StatusCard from "../../Components/StatusCard/StatusCard";
import PrimaryActionButton from "../../Components/PrimaryActionButton/PrimaryActionButton";
import EmptyState from "../../Components/EmptyState/EmptyState";
import { openUrl } from "../../Helpers/open";
import styles from "./Dashboard.module.css";

export default function Dashboard() {
    const matches = useMatches();
    const navigate = useNavigate();
    const totalMatches = matches.length;
    const latestMatch = totalMatches > 0 ? matches[totalMatches - 1] : null;
    const owner = latestMatch?.players.find((player) => player.isOwner);
    const ratingDelta =
        owner && owner.postmatchMMR !== null && owner.prematchMMR !== null
            ? owner.postmatchMMR - owner.prematchMMR
            : null;
    const ratingTone =
        ratingDelta === null ? "info" : ratingDelta < 0 ? "bad" : "good";

    const deltaClass =
        ratingDelta === null
            ? styles.deltaNeutral
            : ratingDelta > 0
              ? styles.deltaPositive
              : ratingDelta < 0
                ? styles.deltaNegative
                : styles.deltaNeutral;

    return (
        <RouteLayout
            title="Dashboard"
            description="Live status and recent activity for your PvP Scalpel desktop sessions."
        >
            <div className={styles.grid}>
                <StatusCard
                    title="Matches Tracked"
                    value={`${totalMatches}`}
                    detail="All sessions"
                    tone={totalMatches > 0 ? "good" : "info"}
                />
                <StatusCard
                    title="Latest Map"
                    value={latestMatch?.matchDetails.mapName ?? "No data"}
                    detail={latestMatch?.matchDetails.format ?? "Awaiting activity"}
                    tone={latestMatch ? "info" : "warn"}
                />
                <StatusCard
                    title="Recent MMR Shift"
                    value={ratingDelta === null ? "No data" : `${ratingDelta > 0 ? "+" : ""}${ratingDelta}`}
                    detail={owner?.name ?? "Owner unknown"}
                    tone={ratingTone}
                />
            </div>

            <div className={styles.columns}>
                <div className={styles.panel}>
                    <div className={styles.panelTitle}>Recent Match</div>
                    {latestMatch ? (
                        <div className={styles.kvList}>
                            <div className={styles.kv}>
                                <span className={styles.k}>Map</span>
                                <span className={styles.v}>{latestMatch.matchDetails.mapName}</span>
                            </div>
                            <div className={styles.kv}>
                                <span className={styles.k}>Format</span>
                                <span className={styles.v}>{latestMatch.matchDetails.format}</span>
                            </div>
                            <div className={styles.kv}>
                                <span className={styles.k}>Timestamp</span>
                                <span className={styles.v}>{latestMatch.matchDetails.timestamp}</span>
                            </div>
                            <div className={styles.kv}>
                                <span className={styles.k}>MMR Change</span>
                                <span className={`${styles.v} ${deltaClass}`}>
                                    {ratingDelta === null
                                        ? "No data"
                                        : `${ratingDelta > 0 ? "+" : ""}${ratingDelta}`}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <EmptyState
                            title="No matches recorded yet"
                            description="Once your first match is detected, a quick snapshot will appear here."
                        />
                    )}
                </div>

                <div className={styles.panel}>
                    <div className={styles.panelTitle}>Quick Actions</div>
                    <div className={styles.actions}>
                        <PrimaryActionButton
                            label="View match history"
                            onClick={() => navigate("/data")}
                            disabled={totalMatches === 0}
                        />
                        <button
                            className={styles.ghostBtn}
                            onClick={() => openUrl("https://www.pvpscalpel.com")}
                        >
                            Open web portal
                        </button>
                        <button className={styles.ghostBtn} onClick={() => navigate("/logs")}>
                            Review diagnostics
                        </button>
                    </div>
                </div>
            </div>
        </RouteLayout>
    );
}
