export type SpellOutcomeResult = "succeeded" | "failed" | "interrupted";

export type LocalSpellSourceFormat =
    | "legacy-timeline"
    | "v4-local-spell-capture"
    | "persisted-normalized-v2";

export interface NormalizedLocalSpellEvent {
    id: number;
    t: number;
    spellId: number;
    event: string;
    castGUID?: string;
    index: number;
    pseudo?: boolean;
}

export interface NormalizedLocalSpellAttempt {
    id: string;
    spellId: number;
    castGUID?: string;
    startTime: number;
    endTime: number;
    windowMs: number;
    grouping: "castGUID" | "fallback" | "normalized";
    events: NormalizedLocalSpellEvent[];
    outcomes: SpellOutcomeResult[];
    resolvedOutcome?: SpellOutcomeResult;
    roundIndex?: number | null;
    interruptible?: boolean | null;
    interruptedBy?: unknown;
    linkedLoc?: number[];
    fakeCastStopReason?: string | null;
    targetInfo?: unknown;
    provenance?: string[];
}

export interface NormalizedLocalLossOfControlEntry {
    id: number;
    t: number;
    duration?: number | null;
    endTime?: number | null;
    roundIndex?: number | null;
    locType?: string | null;
    displayText?: string | null;
    issuedByGuid?: string | null;
    auraInstanceId?: number | null;
    school?: string | number | null;
    raw?: unknown;
}

export interface NormalizedLocalSpellModel {
    schemaVersion: 2;
    sourceFormat: LocalSpellSourceFormat;
    detailAvailable: boolean;
    failureReason?: string | null;
    attempts: NormalizedLocalSpellAttempt[];
    events: NormalizedLocalSpellEvent[];
    locEntries: NormalizedLocalLossOfControlEntry[];
    durationSecondsHint?: number | null;
}

export interface ComputedSpellOutcomeCounts {
    succeeded: number;
    interrupted: number;
    failed: number;
}

export interface ComputedOwnerKickSummary {
    total?: number;
    intentAttempts?: number;
    landed?: number;
    confirmedInterrupts?: number;
    missed?: number;
    succeeded?: number;
    failed?: number;
}

export interface ComputedAnalyticsV2 {
    schemaVersion: 2;
    spellOutcomesBySpellId?: Record<string, ComputedSpellOutcomeCounts>;
    ownerKicks?: ComputedOwnerKickSummary;
    localSpellModel?: NormalizedLocalSpellModel;
}
