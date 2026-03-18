import { isRenderableSpellMeta, type GameSpellEntry } from "../../Domain/spellMetaCache";
import type {
    NormalizedLocalLossOfControlEntry,
    NormalizedLocalSpellAttempt,
    NormalizedLocalSpellModel,
    SpellOutcomeResult,
} from "../../Interfaces/local-spell-model";

export type RoundFilterValue = "all" | number;

export type SpellOutcomeTableRow = {
    spellId: number;
    name: string;
    iconUrl: string | null;
    description?: string | null;
    attempts: number;
    succeeded: number;
    interrupted: number;
    failed: number;
    successRate: number;
    fakeCastCount: number;
    topStopReason: string | null;
};

export type SpellAttemptSummary = {
    attempts: number;
    succeeded: number;
    interrupted: number;
    failed: number;
    fakeCastCount: number;
    topStopReason: string | null;
    topStopReasonCount: number;
};

export type LocCategory = "control" | "lockout";

export type LocSummary = {
    totalCcSeconds: number;
    totalLockoutSeconds: number;
    topControlType: string | null;
    topLockoutLabel: string | null;
};

export type KickJourneyRow = {
    id: string;
    spellId: number;
    name: string;
    iconUrl: string | null;
    time: number;
    roundIndex: number | null;
    resolvedOutcome?: SpellOutcomeResult;
    fakeCastStopReason?: string | null;
    interruptedByLabel: string | null;
    linkedLocEntries: NormalizedLocalLossOfControlEntry[];
};

const resolveIconUrl = (icon?: string) => {
    if (!icon) return null;
    if (icon.startsWith("http") || icon.startsWith("/") || icon.includes(".")) return icon;
    if (/^\d+$/.test(icon)) return `https://render.worldofwarcraft.com/us/icons/56/${icon}.jpg`;
    return `https://render.worldofwarcraft.com/us/icons/56/${icon}.jpg`;
};

const normalizeDuration = (value?: number | null) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

const toCountLabel = (value: number, singular: string, plural = `${singular}s`) =>
    `${value} ${value === 1 ? singular : plural}`;

export const formatAnalysisTime = (seconds?: number | null) => {
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "--";
    const rounded = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(rounded / 60);
    const remaining = rounded % 60;
    return `${minutes}:${String(remaining).padStart(2, "0")}`;
};

export const summarizeUnknownValue = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (Array.isArray(value)) {
        const compact: string = value
            .map((item) => summarizeUnknownValue(item))
            .filter((item): item is string => !!item)
            .slice(0, 3)
            .join(", ");
        return compact || null;
    }
    if (typeof value === "object") {
        const pairs: string = Object.entries(value as Record<string, unknown>)
            .slice(0, 3)
            .map(([key, item]) => {
                const summarized: string | null = summarizeUnknownValue(item);
                return summarized ? `${key}: ${summarized}` : key;
            })
            .join(" / ");
        return pairs || null;
    }
    return null;
};

export const resolveSpellPresentation = (
    spellId: number,
    gameMap: Record<string, GameSpellEntry | null>
): { name: string; iconUrl: string | null; description: string | null } => {
    const meta = gameMap[String(spellId)];
    if (meta && isRenderableSpellMeta(meta)) {
        return {
            name: meta.name ?? `Spell ${spellId}`,
            iconUrl: resolveIconUrl(meta.media ?? undefined),
            description: meta.description ?? null,
        };
    }

    return {
        name: `Spell ${spellId}`,
        iconUrl: null,
        description: null,
    };
};

export const collectRoundOptions = (localSpellModel: NormalizedLocalSpellModel | null) => {
    const rounds = new Set<number>();
    localSpellModel?.attempts.forEach((attempt) => {
        if (typeof attempt.roundIndex === "number" && Number.isFinite(attempt.roundIndex)) {
            rounds.add(Math.trunc(attempt.roundIndex));
        }
    });
    localSpellModel?.locEntries.forEach((entry) => {
        if (typeof entry.roundIndex === "number" && Number.isFinite(entry.roundIndex)) {
            rounds.add(Math.trunc(entry.roundIndex));
        }
    });

    return [
        { value: "all" as const, label: "All Rounds" },
        ...Array.from(rounds)
            .sort((a, b) => a - b)
            .map((round) => ({
                value: round,
                label: `Round ${round}`,
            })),
    ];
};

export const filterAttemptsByRound = (
    attempts: NormalizedLocalSpellAttempt[],
    selectedRound: RoundFilterValue
) => {
    if (selectedRound === "all") return attempts;
    return attempts.filter((attempt) => attempt.roundIndex === selectedRound);
};

export const filterLocEntriesByRound = (
    locEntries: NormalizedLocalLossOfControlEntry[],
    selectedRound: RoundFilterValue
) => {
    if (selectedRound === "all") return locEntries;
    return locEntries.filter((entry) => entry.roundIndex === selectedRound);
};

const sortOutcomeRows = (rows: SpellOutcomeTableRow[]) =>
    [...rows].sort((a, b) => {
        if (b.attempts !== a.attempts) return b.attempts - a.attempts;
        if (b.successRate !== a.successRate) return b.successRate - a.successRate;
        return a.name.localeCompare(b.name);
    });

export const buildAttemptSummaryBySpellId = (attempts: NormalizedLocalSpellAttempt[]) => {
    const bySpellId = new Map<number, SpellAttemptSummary & { reasons: Map<string, number> }>();

    attempts.forEach((attempt) => {
        const current = bySpellId.get(attempt.spellId) ?? {
            attempts: 0,
            succeeded: 0,
            interrupted: 0,
            failed: 0,
            fakeCastCount: 0,
            topStopReason: null,
            topStopReasonCount: 0,
            reasons: new Map<string, number>(),
        };

        current.attempts += 1;
        if (attempt.resolvedOutcome === "succeeded") current.succeeded += 1;
        if (attempt.resolvedOutcome === "interrupted") current.interrupted += 1;
        if (attempt.resolvedOutcome === "failed") current.failed += 1;

        if (attempt.fakeCastStopReason) {
            current.fakeCastCount += 1;
            const label = attempt.fakeCastStopReason.trim();
            current.reasons.set(label, (current.reasons.get(label) ?? 0) + 1);
        } else if (attempt.resolvedOutcome === "interrupted") {
            current.reasons.set("Interrupted", (current.reasons.get("Interrupted") ?? 0) + 1);
        } else if (attempt.resolvedOutcome === "failed") {
            current.reasons.set("Failed", (current.reasons.get("Failed") ?? 0) + 1);
        }

        bySpellId.set(attempt.spellId, current);
    });

    return new Map<number, SpellAttemptSummary>(
        Array.from(bySpellId.entries()).map(([spellId, summary]) => {
            let topStopReason: string | null = null;
            let topStopReasonCount = 0;
            summary.reasons.forEach((count, label) => {
                if (count > topStopReasonCount) {
                    topStopReason = label;
                    topStopReasonCount = count;
                }
            });

            return [
                spellId,
                {
                    attempts: summary.attempts,
                    succeeded: summary.succeeded,
                    interrupted: summary.interrupted,
                    failed: summary.failed,
                    fakeCastCount: summary.fakeCastCount,
                    topStopReason,
                    topStopReasonCount,
                },
            ] as const;
        })
    );
};

export const buildOutcomeRows = ({
    attempts,
    gameMap,
}: {
    attempts: NormalizedLocalSpellAttempt[];
    gameMap: Record<string, GameSpellEntry | null>;
}) => {
    const summaryMap = buildAttemptSummaryBySpellId(attempts);
    const rows: SpellOutcomeTableRow[] = Array.from(summaryMap.entries()).map(([spellId, summary]) => {
        const presentation = resolveSpellPresentation(spellId, gameMap);
        return {
            spellId,
            name: presentation.name,
            iconUrl: presentation.iconUrl,
            description: presentation.description,
            attempts: summary.attempts,
            succeeded: summary.succeeded,
            interrupted: summary.interrupted,
            failed: summary.failed,
            successRate:
                summary.attempts > 0 ? Math.round((summary.succeeded / summary.attempts) * 100) : 0,
            fakeCastCount: summary.fakeCastCount,
            topStopReason: summary.topStopReason,
        };
    });

    return sortOutcomeRows(rows);
};

export const classifyLocEntry = (entry: NormalizedLocalLossOfControlEntry): LocCategory => {
    const rawLabel = `${entry.locType ?? ""} ${entry.displayText ?? ""}`.toLowerCase();
    const hasSchool =
        entry.school !== null &&
        entry.school !== undefined &&
        String(entry.school).trim() !== "";
    const looksLikeLockout = /lockout|locked out|school lock|interrupt lock/i.test(rawLabel);
    return hasSchool || looksLikeLockout ? "lockout" : "control";
};

export const buildLocSummary = (locEntries: NormalizedLocalLossOfControlEntry[]): LocSummary => {
    const controlTotals = new Map<string, number>();
    const lockoutTotals = new Map<string, number>();
    let totalCcSeconds = 0;
    let totalLockoutSeconds = 0;

    locEntries.forEach((entry) => {
        const duration = normalizeDuration(entry.duration);
        const category = classifyLocEntry(entry);
        const controlLabel = entry.displayText ?? entry.locType ?? "Unknown control";
        const lockoutLabel =
            (entry.school !== null && entry.school !== undefined
                ? String(entry.school)
                : entry.displayText ?? entry.locType) ?? "Unknown lockout";

        if (category === "lockout") {
            totalLockoutSeconds += duration;
            lockoutTotals.set(lockoutLabel, (lockoutTotals.get(lockoutLabel) ?? 0) + duration);
        } else {
            totalCcSeconds += duration;
            controlTotals.set(controlLabel, (controlTotals.get(controlLabel) ?? 0) + duration);
        }
    });

    const topControlType =
        Array.from(controlTotals.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const topLockoutLabel =
        Array.from(lockoutTotals.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
        totalCcSeconds,
        totalLockoutSeconds,
        topControlType,
        topLockoutLabel,
    };
};

export const toLocDurationLabel = (entry: NormalizedLocalLossOfControlEntry) => {
    const duration = normalizeDuration(entry.duration);
    if (duration <= 0) return "Duration unknown";
    return `${duration.toFixed(duration >= 10 ? 0 : 1)}s`;
};

export const toLinkedLocHint = (entryCount: number) => {
    if (entryCount <= 0) return null;
    return `Linked to ${toCountLabel(entryCount, "lockout")}`;
};

export const buildKickJourneyRows = ({
    attempts,
    locEntries,
    kickSpellIds,
    gameMap,
}: {
    attempts: NormalizedLocalSpellAttempt[];
    locEntries: NormalizedLocalLossOfControlEntry[];
    kickSpellIds: number[];
    gameMap: Record<string, GameSpellEntry | null>;
}) => {
    const kickSet = new Set(kickSpellIds);
    const locById = new Map<number, NormalizedLocalLossOfControlEntry>();
    locEntries.forEach((entry) => {
        locById.set(entry.id, entry);
    });

    const rows: KickJourneyRow[] = attempts
        .filter((attempt) => kickSet.has(attempt.spellId))
        .map((attempt) => {
            const presentation = resolveSpellPresentation(attempt.spellId, gameMap);
            const linkedLocEntries = (attempt.linkedLoc ?? [])
                .map((id) => locById.get(id))
                .filter((entry): entry is NormalizedLocalLossOfControlEntry => !!entry);

            return {
                id: attempt.id,
                spellId: attempt.spellId,
                name: presentation.name,
                iconUrl: presentation.iconUrl,
                time: attempt.startTime,
                roundIndex:
                    typeof attempt.roundIndex === "number" && Number.isFinite(attempt.roundIndex)
                        ? attempt.roundIndex
                        : null,
                resolvedOutcome: attempt.resolvedOutcome,
                fakeCastStopReason: attempt.fakeCastStopReason ?? null,
                interruptedByLabel: summarizeUnknownValue(attempt.interruptedBy),
                linkedLocEntries,
            };
        })
        .sort((a, b) => a.time - b.time);

    return rows;
};
