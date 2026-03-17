import { useEffect, useMemo, useRef, useState } from "react";
import useUserContext from "../../Hooks/useUserContext";
import {
    extractSpellPayload,
    getGameSpellMap,
    loadSpellMetaCache,
    normalizeGameVersionKey,
    saveSpellMetaCache,
    upsertGameSpells,
    type GameSpellEntry,
    type SpellMetaCache,
} from "../../Domain/spellMetaCache";
import { buildSpellOutcomeCounts } from "../../Domain/localSpellModel";
import type { NormalizedLocalSpellModel } from "../../Interfaces/local-spell-model";
import type { MatchPlayer } from "./types";
import {
    buildPersonalModel,
    collectInterruptBackedSpellIds,
    collectSpellIdsForFetch,
    findOwnerPlayer,
    getPlayerGuid,
    parseInterruptSpellsBySource,
    parseSpellTotals,
    parseSpellTotalsBySource,
    type AttemptCounts,
    type PersonalModel,
    type ParsedInterruptsBySource,
    type ParsedSpellTotals,
    type ParsedSpellTotalsBySource,
    type SpellMetricType,
} from "./spellMetrics.utils";
import { isBattlegroundBracket, type MatchMode } from "./utils";

const BG_TELEMETRY_SUPPORT_VERSION = 3.1;

const normalizeGuid = (value?: string | null) => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim().toLowerCase();
    return trimmed ? trimmed : null;
};

export const resolveSpellIconUrl = (icon?: string) => {
    if (!icon) return null;
    if (icon.startsWith("http") || icon.startsWith("/") || icon.includes(".")) return icon;
    if (/^\d+$/.test(icon)) return `https://render.worldofwarcraft.com/us/icons/56/${icon}.jpg`;
    return `https://render.worldofwarcraft.com/us/icons/56/${icon}.jpg`;
};

export type ComputedSpellOutcomeMap = Record<
    string,
    {
        succeeded: number;
        interrupted: number;
        failed: number;
    }
>;

export type SpellAnalyticsModel = {
    owner: MatchPlayer | null;
    ownerGuid: string | null;
    gameMap: Record<string, GameSpellEntry | null>;
    isFetching: boolean;
    attemptCounts: Map<number, AttemptCounts>;
    parsedSpellTotals: ParsedSpellTotals;
    parsedSpellTotalsBySource: ParsedSpellTotalsBySource;
    parsedInterruptsBySource: ParsedInterruptsBySource;
    personalModels: Record<SpellMetricType, PersonalModel>;
    interruptBackedSpellIds: Set<number>;
    isBgTelemetryUnsupported: boolean;
};

export default function useSpellAnalyticsModel({
    localSpellModel,
    players,
    bracketId = null,
    gameVersion,
    telemetryVersion,
    spellTotals,
    spellTotalsBySource,
    interruptSpellsBySource,
    computedSpellOutcomes,
}: {
    localSpellModel?: NormalizedLocalSpellModel | null;
    players: MatchPlayer[];
    bracketId?: MatchMode | null;
    gameVersion?: string | null;
    telemetryVersion?: number | null;
    spellTotals?: Record<string, unknown> | Record<number, unknown> | null;
    spellTotalsBySource?: Record<string, unknown> | null;
    interruptSpellsBySource?: Record<string, unknown> | null;
    computedSpellOutcomes?: ComputedSpellOutcomeMap | null;
}): SpellAnalyticsModel {
    const { httpFetch } = useUserContext();
    const gameKey = useMemo(() => normalizeGameVersionKey(gameVersion), [gameVersion]);
    const [spellCache, setSpellCache] = useState<SpellMetaCache>(() => loadSpellMetaCache());
    const [isFetching, setIsFetching] = useState(false);
    const inFlight = useRef<Set<string>>(new Set());
    const pendingFetches = useRef(0);

    const gameMap = useMemo(() => getGameSpellMap(spellCache, gameKey), [spellCache, gameKey]);
    const owner = useMemo(() => findOwnerPlayer(players), [players]);
    const ownerGuid = useMemo(
        () => normalizeGuid(owner ? getPlayerGuid(owner) : null),
        [owner]
    );

    const attemptCounts = useMemo(() => {
        if (computedSpellOutcomes && Object.keys(computedSpellOutcomes).length > 0) {
            const map = new Map<number, AttemptCounts>();
            Object.entries(computedSpellOutcomes).forEach(([spellIdRaw, row]) => {
                const spellId = Number(spellIdRaw);
                if (!Number.isFinite(spellId) || spellId <= 0) return;
                map.set(spellId, {
                    spellId,
                    succeeded: Math.max(0, Math.trunc(row.succeeded)),
                    failed: Math.max(0, Math.trunc(row.failed)),
                    interrupted: Math.max(0, Math.trunc(row.interrupted)),
                });
            });
            return map;
        }

        const derivedOutcomes = buildSpellOutcomeCounts(localSpellModel ?? null);
        const map = new Map<number, AttemptCounts>();
        Object.entries(derivedOutcomes).forEach(([spellIdRaw, row]) => {
            const spellId = Number(spellIdRaw);
            if (!Number.isFinite(spellId) || spellId <= 0) return;
            map.set(spellId, {
                spellId,
                succeeded: Math.max(0, Math.trunc(row.succeeded)),
                failed: Math.max(0, Math.trunc(row.failed)),
                interrupted: Math.max(0, Math.trunc(row.interrupted)),
            });
        });
        return map;
    }, [computedSpellOutcomes, localSpellModel]);

    const parsedSpellTotals = useMemo(() => parseSpellTotals(spellTotals), [spellTotals]);
    const parsedSpellTotalsBySource = useMemo(
        () => parseSpellTotalsBySource(spellTotalsBySource),
        [spellTotalsBySource]
    );
    const parsedInterruptsBySource = useMemo(
        () => parseInterruptSpellsBySource(interruptSpellsBySource),
        [interruptSpellsBySource]
    );
    const interruptBackedSpellIds = useMemo(
        () => collectInterruptBackedSpellIds(parsedInterruptsBySource),
        [parsedInterruptsBySource]
    );

    const usedSpellIds = useMemo(() => {
        return collectSpellIdsForFetch(
            attemptCounts,
            parsedSpellTotals,
            parsedSpellTotalsBySource,
            parsedInterruptsBySource
        );
    }, [attemptCounts, parsedSpellTotals, parsedSpellTotalsBySource, parsedInterruptsBySource]);

    useEffect(() => {
        const missing = usedSpellIds.filter((spellId) => {
            const requestKey = `${gameKey}:${spellId}`;
            return !(String(spellId) in gameMap) && !inFlight.current.has(requestKey);
        });
        if (!missing.length) return;

        missing.forEach((spellId) => inFlight.current.add(`${gameKey}:${spellId}`));
        pendingFetches.current += 1;
        setIsFetching(true);
        let cancelled = false;

        const run = async () => {
            try {
                const res = await httpFetch("/game/spells", {
                    method: "POST",
                    body: JSON.stringify({ ids: missing }),
                });

                if (!res.ok || !res.data || cancelled) return;
                const payload = extractSpellPayload(res.data);
                setSpellCache((prev) => {
                    const next = upsertGameSpells(
                        prev,
                        gameKey,
                        payload,
                        missing,
                        interruptBackedSpellIds
                    );
                    saveSpellMetaCache(next);
                    return next;
                });
            } finally {
                missing.forEach((spellId) => inFlight.current.delete(`${gameKey}:${spellId}`));
                pendingFetches.current = Math.max(0, pendingFetches.current - 1);
                if (pendingFetches.current === 0 && !cancelled) {
                    setIsFetching(false);
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [gameKey, gameMap, httpFetch, interruptBackedSpellIds, usedSpellIds]);

    const personalModels = useMemo<Record<SpellMetricType, PersonalModel>>(
        () => ({
            damage: buildPersonalModel({
                metric: "damage",
                ownerGuid,
                attemptCounts,
                spellMetaById: gameMap,
                spellTotals: parsedSpellTotals,
                spellTotalsBySource: parsedSpellTotalsBySource,
                interruptsBySource: parsedInterruptsBySource,
                interruptBackedSpellIds,
            }),
            healing: buildPersonalModel({
                metric: "healing",
                ownerGuid,
                attemptCounts,
                spellMetaById: gameMap,
                spellTotals: parsedSpellTotals,
                spellTotalsBySource: parsedSpellTotalsBySource,
                interruptsBySource: parsedInterruptsBySource,
                interruptBackedSpellIds,
            }),
            interrupts: buildPersonalModel({
                metric: "interrupts",
                ownerGuid,
                attemptCounts,
                spellMetaById: gameMap,
                spellTotals: parsedSpellTotals,
                spellTotalsBySource: parsedSpellTotalsBySource,
                interruptsBySource: parsedInterruptsBySource,
                interruptBackedSpellIds,
            }),
        }),
        [
            attemptCounts,
            gameMap,
            interruptBackedSpellIds,
            ownerGuid,
            parsedInterruptsBySource,
            parsedSpellTotals,
            parsedSpellTotalsBySource,
        ]
    );

    const isBgTelemetryUnsupported =
        bracketId !== null &&
        isBattlegroundBracket(bracketId) &&
        (telemetryVersion === null ||
            telemetryVersion === undefined ||
            !Number.isFinite(telemetryVersion) ||
            telemetryVersion < BG_TELEMETRY_SUPPORT_VERSION);

    return {
        owner,
        ownerGuid,
        gameMap,
        isFetching,
        attemptCounts,
        parsedSpellTotals,
        parsedSpellTotalsBySource,
        parsedInterruptsBySource,
        personalModels,
        interruptBackedSpellIds,
        isBgTelemetryUnsupported,
    };
}
