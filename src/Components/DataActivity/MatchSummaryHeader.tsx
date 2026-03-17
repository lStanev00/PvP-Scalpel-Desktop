import { useEffect, useMemo, useState } from "react";
import {
    LuArrowLeft,
    LuChevronDown,
    LuChevronUp,
    LuHeart,
    LuSkull,
    LuSword,
    LuTrendingUp,
    LuZap,
} from "react-icons/lu";
import {
    getClassColor,
    getClassMedia,
    getRoleBySpec,
    getSpecMedia,
} from "../../Domain/CombatDomainContext";
import useCharacterProfile, { resolveCharacterProfile } from "../../Hooks/useCharacterProfile";
import type { KickTelemetrySnapshot } from "./kickTelemetry";
import type { MatchPlayer } from "./types";
import { isBattlegroundBracket, type MatchSummary } from "./utils";
import styles from "./DataActivity.module.css";

const CHARACTER_API_SERVER = "eu";

interface MatchSummaryHeaderProps {
    match: MatchSummary;
    players: MatchPlayer[];
    kickTelemetrySnapshot: KickTelemetrySnapshot;
    onBack?: () => void;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const normalizeNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return Number(value);
    }
    return 0;
};

const normalizeCount = (value: unknown) => Math.max(0, Math.trunc(normalizeNumber(value)));

const formatInteger = (value: number) => value.toLocaleString();

const formatRealm = (realm?: string) => {
    if (!realm) return "Unknown Realm";
    return realm.replace(/-/g, " ").replace(/\b\w/g, (v) => v.toUpperCase());
};

const roleLabelMap: Record<string, string> = {
    dps: "DPS",
    healer: "Healer",
    tank: "Tank",
    unknown: "Unknown",
};

const resolveMediaUrl = (value?: string) => {
    if (!value) return null;
    if (value.startsWith("http") || value.startsWith("/") || value.includes(".")) return value;
    return `https://render.worldofwarcraft.com/us/icons/56/${value}.jpg`;
};

function StatCard({
    icon,
    label,
    value,
    sub,
    accent,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
    accent?: string;
}) {
    return (
        <div className={styles.mdStatCard}>
            <div className={styles.mdStatIcon} style={accent ? { color: accent } : undefined}>
                {icon}
            </div>
            <div className={styles.mdStatContent}>
                <span className={styles.mdStatValue} style={accent ? { color: accent } : undefined}>
                    {value}
                </span>
                <span className={styles.mdStatLabel}>{label}</span>
                {sub ? <span className={styles.mdStatSub}>{sub}</span> : null}
            </div>
        </div>
    );
}

function MiniRing({ percent, color, size = 44 }: { percent: number; color: string; size?: number }) {
    const r = (size - 6) / 2;
    const c = size / 2;
    const circ = 2 * Math.PI * r;
    const [anim, setAnim] = useState(0);

    useEffect(() => {
        const raf = requestAnimationFrame(() => setAnim(clampPercent(percent)));
        return () => cancelAnimationFrame(raf);
    }, [percent]);

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
            <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
            <circle
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - anim / 100)}
                style={{ transition: "stroke-dashoffset 860ms cubic-bezier(0.16,1,0.3,1)" }}
            />
        </svg>
    );
}

export default function MatchSummaryHeader({
    match,
    players,
    kickTelemetrySnapshot,
    onBack,
}: MatchSummaryHeaderProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        setIsExpanded(false);
    }, [match.id]);

    const owner = useMemo(() => players.find((p) => p.isOwner) ?? players[0] ?? null, [players]);
    const ownerTeam = useMemo(() => {
        if (!owner || typeof owner.faction !== "number") return players;
        const fp = players.filter((p) => p.faction === owner.faction);
        return fp.length > 0 ? fp : players;
    }, [owner, players]);

    const ownerDamage = normalizeCount(owner?.damage);
    const ownerHealing = normalizeCount(owner?.healing);
    const ownerKills = normalizeCount(owner?.kills);
    const ownerDeaths = normalizeCount(owner?.deaths);
    const teamDamage = ownerTeam.reduce((sum, p) => sum + normalizeCount(p.damage), 0);
    const teamHealing = ownerTeam.reduce((sum, p) => sum + normalizeCount(p.healing), 0);
    const role = getRoleBySpec(owner?.spec);
    const isHealer = role === "healer";
    const outputTotal = isHealer ? ownerHealing : ownerDamage;
    const outputTeamTotal = isHealer ? teamHealing : teamDamage;
    const contributionPct = outputTeamTotal > 0 ? (outputTotal / outputTeamTotal) * 100 : 0;

    const kickSupported = kickTelemetrySnapshot.isSupported;
    const confirmedInterrupts = Math.max(0, kickTelemetrySnapshot.confirmedInterrupts ?? 0);
    const kickTotal = Math.max(
        0,
        kickTelemetrySnapshot.totalKickAttempts ?? kickTelemetrySnapshot.intentAttempts
    );
    const kickPct = kickSupported && kickTotal > 0 ? (confirmedInterrupts / kickTotal) * 100 : 0;
    const missedKicks = Math.max(0, kickTelemetrySnapshot.missedKicks ?? 0);
    const averageReactionMs = null;

    const ownerClassColor = getClassColor(owner?.class) ?? "#8a94a6";
    const profiles = useCharacterProfile({
        server: owner ? CHARACTER_API_SERVER : null,
        realm: owner?.realm ?? null,
        name: owner?.name ?? null,
    });
    const profile = useMemo(
        () =>
            resolveCharacterProfile(profiles, {
                server: owner ? CHARACTER_API_SERVER : null,
                realm: owner?.realm ?? null,
                name: owner?.name ?? null,
            }),
        [owner, profiles]
    );
    const classMedia = resolveMediaUrl(getClassMedia(owner?.class) ?? getSpecMedia(owner?.spec));
    const ownerAvatar = profile?.media?.avatar ?? profile?.media?.charImg ?? null;
    const roleLabel = roleLabelMap[role] ?? "Unknown";
    const isBattleground = isBattlegroundBracket(match.bracketId);
    const kdRatio = ownerDeaths === 0 ? ownerKills : ownerKills / ownerDeaths;
    const kdRatioValue = kdRatio.toFixed(kdRatio % 1 === 0 ? 0 : 2);

    const resultClass =
        match.result === "win"
            ? styles.mdResultWin
            : match.result === "loss"
              ? styles.mdResultLoss
              : styles.mdResultNeutral;

    const resultText =
        match.result === "win" ? "Victory" : match.result === "loss" ? "Defeat" : "Draw";

    const showRatingDelta = match.delta !== null && match.delta !== 0;

    return (
        <section className={`${styles.mdHeader} ${resultClass}`}>
            <div className={styles.mdBanner}>
                <div className={styles.mdBannerLeft}>
                    {onBack ? (
                        <button type="button" className={styles.mdBackBtn} onClick={onBack}>
                            <LuArrowLeft aria-hidden="true" />
                            <span>Back</span>
                        </button>
                    ) : null}
                    <div className={styles.mdResultPill}>{resultText}</div>
                    <span className={styles.mdBannerMeta}>{match.mapName}</span>
                    <span className={styles.mdBannerMeta}>{match.durationLabel}</span>
                    {showRatingDelta ? (
                        <span className={`${styles.mdBannerMeta} ${styles.mdBannerDelta}`}>{match.deltaLabel}</span>
                    ) : null}
                </div>
                <button
                    type="button"
                    className={styles.mdExpandBtn}
                    onClick={() => setIsExpanded((v) => !v)}
                    aria-expanded={isExpanded}
                >
                    {isExpanded ? "Less" : "Details"}
                    {isExpanded ? <LuChevronUp aria-hidden="true" /> : <LuChevronDown aria-hidden="true" />}
                </button>
            </div>

            <div className={styles.mdIdentityRow}>
                <div className={styles.mdAvatarWrap}>
                    {ownerAvatar ? (
                        <img
                            src={ownerAvatar}
                            alt={`${owner?.name ?? "Character"} avatar`}
                            className={styles.mdAvatar}
                            loading="lazy"
                        />
                    ) : classMedia ? (
                        <img src={classMedia} alt="" className={styles.mdAvatar} loading="lazy" />
                    ) : (
                        <div className={styles.mdAvatarFallback}>
                            {(owner?.class ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                    )}
                </div>
                <div className={styles.mdIdentityText}>
                    <h2
                        className={styles.mdPlayerName}
                        style={{ color: ownerClassColor, textShadow: `${ownerClassColor}33 0 0 14px` }}
                    >
                        {owner?.name ?? "Unknown"}
                    </h2>
                    <div className={styles.mdPlayerMeta}>
                        <span>{owner?.spec ?? "Unknown"}</span>
                        <span className={styles.mdMetaDot}>·</span>
                        <span>{roleLabel}</span>
                        <span className={styles.mdMetaDot}>·</span>
                        <span>{formatRealm(owner?.realm)}</span>
                    </div>
                </div>

                <div className={styles.mdRingCard}>
                    <div className={styles.mdRingWrap}>
                        <MiniRing percent={contributionPct} color={ownerClassColor} size={56} />
                        <span className={styles.mdRingValue}>{Math.round(clampPercent(contributionPct))}%</span>
                    </div>
                    <span className={styles.mdRingLabel}>{isHealer ? "Heal" : "Dmg"} Share</span>
                </div>

                <div className={styles.mdRingCard}>
                    <div className={styles.mdRingWrap}>
                        <MiniRing
                            percent={kickPct}
                            color={
                                kickSupported && kickTotal > 0
                                    ? kickPct >= 60
                                        ? "#22c55e"
                                        : kickPct >= 30
                                          ? "#f5a85b"
                                          : "#ef4444"
                                    : "rgba(255,255,255,0.22)"
                            }
                            size={56}
                        />
                        <span className={styles.mdRingValue}>
                            {kickSupported && kickTotal > 0 ? `${confirmedInterrupts}/${kickTotal}` : "?"}
                        </span>
                    </div>
                    <span className={styles.mdRingLabel}>Kicks</span>
                </div>
            </div>

            <div className={styles.mdStatsStrip}>
                <StatCard
                    icon={<LuSword size={14} />}
                    label="Damage"
                    value={formatInteger(ownerDamage)}
                    sub={teamDamage > 0 ? `${((ownerDamage / teamDamage) * 100).toFixed(0)}% of team` : undefined}
                />
                <StatCard
                    icon={<LuHeart size={14} />}
                    label="Healing"
                    value={formatInteger(ownerHealing)}
                    sub={teamHealing > 0 ? `${((ownerHealing / teamHealing) * 100).toFixed(0)}% of team` : undefined}
                />
                <StatCard
                    icon={<LuSkull size={14} />}
                    label={isBattleground ? "KD Ratio" : "K / D"}
                    value={isBattleground ? kdRatioValue : `${ownerKills} / ${ownerDeaths}`}
                    sub={isBattleground ? `${ownerKills} kills · ${ownerDeaths} deaths` : undefined}
                />
                <StatCard
                    icon={<LuZap size={14} />}
                    label="Kick Eff."
                    value={kickSupported && kickTotal > 0 ? `${Math.round(kickPct)}%` : "--"}
                    sub={
                        kickSupported && kickTotal > 0
                            ? averageReactionMs !== null
                                ? `${averageReactionMs}ms avg`
                                : `${confirmedInterrupts} confirmed · ${missedKicks} missed`
                            : undefined
                    }
                    accent={
                        kickPct >= 60
                            ? "#22c55e"
                            : kickPct >= 30
                              ? "#f5a85b"
                              : kickSupported && kickTotal > 0
                                ? "#ef4444"
                                : undefined
                    }
                />
                <StatCard
                    icon={<LuTrendingUp size={14} />}
                    label={showRatingDelta ? "Rating" : "Mode"}
                    value={showRatingDelta ? match.deltaLabel : match.modeLabel}
                    sub={showRatingDelta ? undefined : "Match format"}
                    accent={
                        showRatingDelta
                            ? match.delta !== null && match.delta > 0
                                ? "#3ad29f"
                                : match.delta !== null && match.delta < 0
                                  ? "#ff4d4f"
                                  : undefined
                            : undefined
                    }
                />
            </div>

                <div className={`${styles.mdExpandedLayer} ${isExpanded ? styles.mdExpandedOpen : ""}`}>
                <div className={styles.mdExpandedGrid}>
                    <div className={styles.mdExpandedItem}>
                        <span className={styles.mdExpandedLabel}>Missed Kicks</span>
                        <span className={styles.mdExpandedValue}>{kickSupported ? missedKicks : "--"}</span>
                    </div>
                    <div className={styles.mdExpandedItem}>
                        <span className={styles.mdExpandedLabel}>Total Attempts</span>
                        <span className={styles.mdExpandedValue}>{kickTotal}</span>
                    </div>
                    <div className={styles.mdExpandedItem}>
                        <span className={styles.mdExpandedLabel}>Team {isHealer ? "Healing" : "Damage"}</span>
                        <span className={styles.mdExpandedValue}>{formatInteger(outputTeamTotal)}</span>
                    </div>
                </div>
            </div>
        </section>
    );
}
