import { useEffect, useMemo, useState } from "react";
import {
    getClassColor,
    getClassMedia,
    getRoleBySpec,
    getSpecMedia,
} from "../../Domain/CombatDomainContext";
import { LuArrowLeft } from "react-icons/lu";
import type { MatchSummary } from "./utils";
import type { MatchPlayer, MatchTimelineEntry } from "./types";
import { resolveIntentAttempts, type AttemptRecord } from "./spellCastResolver";
import styles from "./DataActivity.module.css";

interface MatchSummaryHeaderProps {
    match: MatchSummary;
    players: MatchPlayer[];
    timeline: MatchTimelineEntry[];
    kickSpellIds: number[];
    onBack?: () => void;
}

const KICK_COLLAPSE_WINDOW_SECONDS = 0.35;

const normalizeCount = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return Math.max(0, Math.trunc(Number(value)));
    }
    return 0;
};

const parseInterruptTuple = (player: MatchPlayer | null) => {
    if (!player) return { issued: 0, succeeded: 0 };
    const raw = (player as MatchPlayer & { interrupts?: unknown }).interrupts;

    if (Array.isArray(raw)) {
        return {
            issued: normalizeCount(raw[0]),
            succeeded: normalizeCount(raw[1]),
        };
    }

    if (raw && typeof raw === "object") {
        const tuple = raw as Record<string, unknown>;
        return {
            issued: normalizeCount(tuple["1"] ?? tuple["0"]),
            succeeded: normalizeCount(tuple["2"] ?? tuple["1"]),
        };
    }

    return { issued: 0, succeeded: 0 };
};

const normalizeValue = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return Number(value);
    }
    return 0;
};

const hasIntentSignal = (attempt: AttemptRecord) =>
    attempt.events.some((event) => event.event === "SENT" || event.event === "START");

const getCastGuidCollapseKey = (castGUID?: string) => {
    if (!castGUID) return null;
    const match = castGUID.match(/^(.*-)([0-9a-fA-F]{10})$/);
    if (!match) return castGUID;
    const [, prefix, tail] = match;
    return `${prefix}${tail.slice(0, 4)}${tail.slice(5)}`;
};

const collapseKickAttempts = (input: AttemptRecord[]) => {
    const sorted = [...input].sort((a, b) =>
        a.startTime === b.startTime ? a.id.localeCompare(b.id) : a.startTime - b.startTime
    );
    const collapsed: AttemptRecord[] = [];
    let active: AttemptRecord | null = null;

    sorted.forEach((attempt) => {
        if (!active) {
            active = attempt;
            return;
        }

        const sameSpell = active.spellId === attempt.spellId;
        const delta = Math.abs(attempt.startTime - active.endTime);
        const activeGuidKey = getCastGuidCollapseKey(active.castGUID);
        const incomingGuidKey = getCastGuidCollapseKey(attempt.castGUID);
        const similarGuid =
            !!activeGuidKey && !!incomingGuidKey && activeGuidKey === incomingGuidKey;

        if (sameSpell && (similarGuid || delta <= KICK_COLLAPSE_WINDOW_SECONDS)) {
            active = {
                ...active,
                startTime: Math.min(active.startTime, attempt.startTime),
                endTime: Math.max(active.endTime, attempt.endTime),
                events: [...active.events, ...attempt.events].sort((a, b) =>
                    a.t === b.t ? a.index - b.index : a.t - b.t
                ),
                resolvedOutcome:
                    active.resolvedOutcome === "succeeded" || attempt.resolvedOutcome === "succeeded"
                        ? "succeeded"
                        : active.resolvedOutcome === "interrupted" ||
                            attempt.resolvedOutcome === "interrupted"
                          ? "interrupted"
                          : active.resolvedOutcome ?? attempt.resolvedOutcome,
            };
            return;
        }

        collapsed.push(active);
        active = attempt;
    });

    if (active) collapsed.push(active);
    return collapsed;
};

const toPct = (value: number) => Math.max(0, Math.min(100, value));

const resolveMediaUrl = (value?: string) => {
    if (!value) return null;
    if (value.startsWith("http") || value.startsWith("/") || value.includes(".")) return value;
    if (/^\d+$/.test(value)) return `https://render.worldofwarcraft.com/us/icons/56/${value}.jpg`;
    return `https://render.worldofwarcraft.com/us/icons/56/${value}.jpg`;
};

const formatRealm = (realm?: string) => {
    if (!realm) return "Unknown Realm";
    return realm
        .replace(/-/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatClass = (value?: string) => (value ? value[0].toUpperCase() + value.slice(1).toLowerCase() : "-");

const CircleMetric = ({
    percent,
    color,
    title,
    valueLabel,
    primaryLabel,
    secondaryLabel,
}: {
    percent: number;
    color: string;
    title?: string;
    valueLabel: string;
    primaryLabel: string;
    secondaryLabel: string;
}) => {
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const [animatedPct, setAnimatedPct] = useState(0);

    useEffect(() => {
        setAnimatedPct(0);
        const frame = window.requestAnimationFrame(() => setAnimatedPct(toPct(percent)));
        return () => window.cancelAnimationFrame(frame);
    }, [percent]);

    const offset = circumference * (1 - animatedPct / 100);

    return (
        <div className={styles.summaryCircleWrap} title={title}>
            <svg className={styles.summaryCircle} viewBox="0 0 120 120" aria-hidden="true">
                <circle className={styles.summaryCircleBase} cx="60" cy="60" r={radius} />
                <circle
                    className={styles.summaryCircleMetric}
                    cx="60"
                    cy="60"
                    r={radius}
                    stroke={color}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{ transitionDuration: "820ms" }}
                />
            </svg>
            <div className={styles.summaryCircleContent}>
                <div className={styles.summaryCircleValue}>{valueLabel}</div>
                <div className={styles.summaryCirclePrimary}>{primaryLabel}</div>
                <div className={styles.summaryCircleSecondary}>{secondaryLabel}</div>
            </div>
        </div>
    );
};

const SplitCircleMetric = ({
    success,
    failed,
    successColor,
    failedColor,
    title,
}: {
    success: number;
    failed: number;
    successColor: string;
    failedColor: string;
    title?: string;
}) => {
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const total = Math.max(0, success + failed);
    const successPctFinal = total > 0 ? success / total : 0;
    const failedPctFinal = total > 0 ? failed / total : 0;
    const [animatedFactor, setAnimatedFactor] = useState(0);

    useEffect(() => {
        setAnimatedFactor(0);
        const frame = window.requestAnimationFrame(() => setAnimatedFactor(1));
        return () => window.cancelAnimationFrame(frame);
    }, [success, failed]);

    const successPct = successPctFinal * animatedFactor;
    const failedPct = failedPctFinal * animatedFactor;
    const successLen = circumference * successPct;
    const failedLen = circumference * failedPct;
    const startOffset = circumference * 0.25;
    const successRate = total > 0 ? (success / total) * 100 : 0;

    return (
        <div className={styles.summaryCircleWrap} title={title}>
            <svg className={styles.summaryCircle} viewBox="0 0 120 120" aria-hidden="true">
                <circle className={styles.summaryCircleBase} cx="60" cy="60" r={radius} />
                <circle
                    className={styles.summaryCircleMetric}
                    cx="60"
                    cy="60"
                    r={radius}
                    stroke={successColor}
                    strokeDasharray={`${successLen} ${circumference - successLen}`}
                    strokeDashoffset={startOffset}
                    style={{ transitionDuration: "820ms" }}
                />
                <circle
                    className={styles.summaryCircleMetric}
                    cx="60"
                    cy="60"
                    r={radius}
                    stroke={failedColor}
                    strokeDasharray={`${failedLen} ${circumference - failedLen}`}
                    strokeDashoffset={startOffset - successLen}
                    style={{ transitionDuration: "820ms" }}
                />
            </svg>
            <div className={styles.summaryCircleContent}>
                <div className={styles.summaryCircleValue}>
                    {success} / {total}
                </div>
                <div className={styles.summaryCirclePrimary}>{Math.round(successRate)}% Efficiency</div>
                <div className={styles.summaryCircleSecondary}>Kick Success Rate</div>
            </div>
        </div>
    );
};

export default function MatchSummaryHeader({
    match,
    players,
    timeline,
    kickSpellIds,
    onBack,
}: MatchSummaryHeaderProps) {
    const owner = useMemo(() => players.find((player) => player.isOwner) ?? players[0] ?? null, [players]);
    const ownerTeam = useMemo(() => {
        if (!owner || typeof owner.faction !== "number") return players;
        const sameFaction = players.filter((player) => player.faction === owner.faction);
        return sameFaction.length > 0 ? sameFaction : players;
    }, [owner, players]);

    const ownerDamage = normalizeValue(owner?.damage);
    const ownerHealing = normalizeValue(owner?.healing);
    const teamDamage = ownerTeam.reduce((sum, player) => sum + normalizeValue(player.damage), 0);
    const teamHealing = ownerTeam.reduce((sum, player) => sum + normalizeValue(player.healing), 0);

    const role = getRoleBySpec(owner?.spec);
    const useHealingContribution = role === "healer";
    const ownerContributionValue = useHealingContribution ? ownerHealing : ownerDamage;
    const teamContributionTotal = useHealingContribution ? teamHealing : teamDamage;
    const contributionPct =
        teamContributionTotal > 0 ? (ownerContributionValue / teamContributionTotal) * 100 : 0;

    const { issued, succeeded } = parseInterruptTuple(owner);
    const kickSet = useMemo(() => new Set(kickSpellIds.map((id) => normalizeCount(id)).filter((id) => id > 0)), [
        kickSpellIds,
    ]);
    const { resolvedAttempts } = useMemo(() => resolveIntentAttempts(timeline), [timeline]);

    const kickAttempts = useMemo(() => {
        const kickOnly = resolvedAttempts.filter((attempt) => kickSet.has(attempt.spellId));
        return collapseKickAttempts(kickOnly).filter(hasIntentSignal);
    }, [resolvedAttempts, kickSet]);

    const intentAttempts = kickAttempts.length;
    const failedAlignment = Math.max(0, intentAttempts - succeeded);
    const failedOutcomeCount = kickAttempts.filter((attempt) => attempt.resolvedOutcome === "failed").length;
    const immuneKicks = kickAttempts.filter((attempt) =>
        attempt.events.some((event) => event.event === "FAILED_QUIET")
    ).length;
    const airKicks = Math.max(0, failedOutcomeCount - immuneKicks);

    const ownerClassColor = getClassColor(owner?.class) ?? "#8a94a6";
    const avatarMedia = resolveMediaUrl(getClassMedia(owner?.class) ?? getSpecMedia(owner?.spec));
    const kickTotal = succeeded + failedAlignment;

    const contributionTitle = `${useHealingContribution ? "Healing" : "Damage"}: ${ownerContributionValue.toLocaleString()}
Team Total: ${teamContributionTotal.toLocaleString()}
Contribution: ${toPct(contributionPct).toFixed(1)}%`;
    const kickTitle = `Successful: ${succeeded}
Failed: ${failedAlignment}
Air kicks: ${airKicks}
Immune kicks: ${immuneKicks}
Issued: ${issued}
Intent attempts: ${intentAttempts}`;

    return (
        <section className={styles.summaryHeader}>
            <div className={styles.summaryIdentityBlock}>
                <div className={styles.summaryTopRow}>
                    {onBack ? (
                        <button type="button" className={styles.backButton} onClick={onBack}>
                            <LuArrowLeft aria-hidden="true" className={styles.backIcon} />
                            Match History
                        </button>
                    ) : <span />}
                </div>

                <div className={styles.summaryIdentity}>
                    <div className={styles.summaryAvatar}>
                        {avatarMedia ? (
                            <img src={avatarMedia} alt="" loading="lazy" />
                        ) : (
                            <span>{(owner?.class ?? "?").slice(0, 1).toUpperCase()}</span>
                        )}
                    </div>
                    <div className={styles.summaryIdentityText}>
                        <div className={styles.summaryNameRow}>
                            <h2 style={{ color: ownerClassColor }}>{owner?.name ?? "Unknown"}</h2>
                            <span>{formatRealm(owner?.realm)}</span>
                        </div>
                        <div className={styles.summaryMetaRow}>
                            <span>
                                {owner?.spec ?? "-"} ({formatClass(owner?.class)})
                            </span>
                            {normalizeValue(owner?.rating) > 0 ? (
                                <span>Rating {normalizeValue(owner?.rating).toLocaleString()}</span>
                            ) : null}
                            <span>{match.durationLabel}</span>
                        </div>
                        <div className={styles.summaryMetaRowMuted}>
                            <span>{match.timestampLabel}</span>
                            <span>{match.mapName}</span>
                            <span>MMR {match.deltaLabel}</span>
                            <span>Match ID: {match.id}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.summaryMetricCard}>
                <CircleMetric
                    percent={contributionPct}
                    color={ownerClassColor}
                    valueLabel={`${Math.round(toPct(contributionPct))}%`}
                    primaryLabel={useHealingContribution ? "Team Healing" : "Team Damage"}
                    secondaryLabel="Contribution"
                    title={contributionTitle}
                />
                <div className={styles.summaryMetricFooter}>
                    {ownerContributionValue.toLocaleString()} / {teamContributionTotal.toLocaleString()}
                </div>
            </div>

            <div className={styles.summaryMetricCard}>
                <SplitCircleMetric
                    success={succeeded}
                    failed={failedAlignment}
                    successColor="#22c55e"
                    failedColor="#ef4444"
                    title={kickTitle}
                />
                <div className={styles.summaryMetricFooter}>
                    Success {succeeded} • Failed {failedAlignment}
                </div>
                {kickTotal > 0 ? (
                    <div className={styles.summaryMetricFootnote}>
                        Alignment: intent {intentAttempts} - scoreboard success {succeeded}
                    </div>
                ) : null}
            </div>
        </section>
    );
}
