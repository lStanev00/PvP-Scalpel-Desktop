import { useEffect, useMemo, useState } from "react";
import { LuSparkles } from "react-icons/lu";
import AnalysisTabBar from "./AnalysisTabBar";
import MatchAnalysisOverviewTab from "./MatchAnalysisOverviewTab";
import SpellAnalysisTab from "./SpellAnalysisTab";
import CcLockoutsTab from "./CcLockoutsTab";
import KicksAnalysisTab from "./KicksAnalysisTab";
import useSpellAnalyticsModel, { type ComputedSpellOutcomeMap } from "./useSpellAnalyticsModel";
import type { KickTelemetrySnapshot } from "./kickTelemetry";
import type { MatchPlayer } from "./types";
import type { MatchSummary } from "./utils";
import type { NormalizedLocalSpellModel } from "../../Interfaces/local-spell-model";
import styles from "./DataActivity.module.css";

type AnalysisTab = "overview" | "spell-analysis" | "cc-lockouts" | "kicks";

interface MatchAnalysisWorkspaceProps {
    match: MatchSummary;
    players: MatchPlayer[];
    localSpellModel: NormalizedLocalSpellModel | null;
    gameVersion: string | null;
    telemetryVersion: number | null;
    spellTotals: Record<string, unknown> | Record<number, unknown> | null;
    spellTotalsBySource: Record<string, unknown> | null;
    interruptSpellsBySource: Record<string, unknown> | null;
    computedSpellOutcomes: ComputedSpellOutcomeMap | null;
    kickTelemetrySnapshot: KickTelemetrySnapshot;
    kickSpellIds: number[];
}

export default function MatchAnalysisWorkspace({
    match,
    players,
    localSpellModel,
    gameVersion,
    telemetryVersion,
    spellTotals,
    spellTotalsBySource,
    interruptSpellsBySource,
    computedSpellOutcomes,
    kickTelemetrySnapshot,
    kickSpellIds,
}: MatchAnalysisWorkspaceProps) {
    const [analysisTab, setAnalysisTab] = useState<AnalysisTab>("overview");

    useEffect(() => {
        setAnalysisTab("overview");
    }, [match.id]);

    const analysisModel = useSpellAnalyticsModel({
        localSpellModel,
        players,
        bracketId: match.bracketId,
        gameVersion,
        telemetryVersion,
        spellTotals,
        spellTotalsBySource,
        interruptSpellsBySource,
        computedSpellOutcomes,
    });

    const topLevelTabs = useMemo(
        () => [
            { id: "overview" as const, label: "Overview", badge: null },
            { id: "spell-analysis" as const, label: "Spell Analysis", badge: null },
            {
                id: "cc-lockouts" as const,
                label: "CC & Lockouts",
                badge: localSpellModel?.locEntries.length ?? null,
            },
            {
                id: "kicks" as const,
                label: "Kicks",
                badge: kickTelemetrySnapshot.summarySupported ? kickTelemetrySnapshot.totalKickCasts || null : null,
            },
        ],
        [kickTelemetrySnapshot.summarySupported, kickTelemetrySnapshot.totalKickCasts, localSpellModel?.locEntries.length]
    );

    return (
        <section className={styles.analysisWorkspace}>
            <header className={styles.analysisWorkspaceHeader}>
                <div>
                    <div className={styles.analysisWorkspaceEyebrow}>Detailed Telemetry</div>
                    <h2 className={styles.analysisWorkspaceTitle}>Personal Combat Analysis</h2>
                    <p className={styles.analysisWorkspaceCopy}>
                        Local-player spell, control, and interrupt analysis layered on top of the
                        match and lobby overview above.
                    </p>
                </div>
                <div className={styles.analysisWorkspaceScope}>
                    <span className={styles.analysisScopeBadge}>
                        <LuSparkles aria-hidden="true" />
                        Local player only
                    </span>
                </div>
            </header>

            <AnalysisTabBar
                tabs={topLevelTabs}
                activeTab={analysisTab}
                onSelect={setAnalysisTab}
                ariaLabel="Match analysis sections"
                prominence="primary"
            />

            <div className={styles.analysisWorkspacePanel}>
                {analysisTab === "overview" ? (
                    <MatchAnalysisOverviewTab
                        analysisModel={analysisModel}
                        localSpellModel={localSpellModel}
                        computedSpellOutcomes={computedSpellOutcomes}
                        kickTelemetrySnapshot={kickTelemetrySnapshot}
                    />
                ) : null}

                {analysisTab === "spell-analysis" ? (
                    <SpellAnalysisTab
                        resetToken={match.id}
                        analysisModel={analysisModel}
                        localSpellModel={localSpellModel}
                    />
                ) : null}

                {analysisTab === "cc-lockouts" ? (
                    <CcLockoutsTab localSpellModel={localSpellModel} />
                ) : null}

                {analysisTab === "kicks" ? (
                    <KicksAnalysisTab
                        localSpellModel={localSpellModel}
                        kickTelemetrySnapshot={kickTelemetrySnapshot}
                        kickSpellIds={kickSpellIds}
                        gameMap={analysisModel.gameMap}
                    />
                ) : null}
            </div>
        </section>
    );
}
