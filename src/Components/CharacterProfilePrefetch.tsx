import { useEffect, useMemo } from "react";
import useUserContext from "../Hooks/useUserContext";
import useMatches from "../Hooks/useMatches";
import { usePreferences } from "../Context-Providers/preferences-context";
import {
    buildCharacterOptions,
    buildMatchSummary,
    isRatedBracket,
    resolveStoredCharacterValue,
    type MatchSummary,
} from "./DataActivity/utils";
import {
    isCharacterProfileCacheFresh,
    prefetchCharacterProfile,
} from "../Hooks/useCharacterProfile";

const CHARACTER_API_SERVER = "eu";
const PREFETCH_DELAY_MS = 10_000;

type PrefetchTarget = {
    key: string;
    name: string;
    realm: string;
};

const compareTargets = (a: PrefetchTarget, b: PrefetchTarget) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.realm.localeCompare(b.realm);
};

export default function CharacterProfilePrefetch() {
    const { user, httpFetch } = useUserContext();
    const matches = useMatches();
    const {
        autoScopeStrategy,
        autoScopeCharacter,
        autoScopeRatedPreference,
    } = usePreferences();

    const summaries = useMemo(
        () =>
            matches
                .map(buildMatchSummary)
                .sort((a, b) => b.timestampMs - a.timestampMs),
        [matches]
    );

    const characterOptions = useMemo(() => buildCharacterOptions(summaries), [summaries]);
    const resolvedAutoScopeCharacter = useMemo(
        () => resolveStoredCharacterValue(autoScopeCharacter, characterOptions),
        [autoScopeCharacter, characterOptions]
    );

    const bestCharacterKey = useMemo(() => {
        if (!summaries.length) return null;

        const pickPreferredMatch = (candidates: MatchSummary[]) => {
            if (!candidates.length) return null;

            if (autoScopeRatedPreference === "prefer_rated") {
                return candidates.find((match) => isRatedBracket(match.bracketId)) ?? candidates[0];
            }

            if (autoScopeRatedPreference === "prefer_non_rated") {
                return candidates.find((match) => !isRatedBracket(match.bracketId)) ?? candidates[0];
            }

            return candidates[0];
        };

        if (autoScopeStrategy === "latest_character_latest_bracket") {
            return pickPreferredMatch(summaries)?.owner.key ?? summaries[0]?.owner.key ?? null;
        }

        const resolvedCharacter =
            resolvedAutoScopeCharacter !== "auto"
                ? resolvedAutoScopeCharacter
                : summaries[0]?.owner.key ?? null;

        if (!resolvedCharacter) return null;

        const characterMatches = summaries.filter(
            (summary) => summary.owner.key === resolvedCharacter
        );
        const referenceMatch = characterMatches[0] ?? summaries[0] ?? null;

        return referenceMatch?.owner.key ?? resolvedCharacter;
    }, [
        summaries,
        autoScopeStrategy,
        autoScopeRatedPreference,
        resolvedAutoScopeCharacter,
    ]);

    const orderedTargets = useMemo<PrefetchTarget[]>(() => {
        const deduped = characterOptions
            .filter(
                (option): option is typeof option & { value: string; name: string; realm: string } =>
                    option.value !== "all" &&
                    option.value !== "auto" &&
                    typeof option.name === "string" &&
                    option.name.trim() !== "" &&
                    typeof option.realm === "string" &&
                    option.realm.trim() !== ""
            )
            .map((option) => ({
                key: option.value,
                name: option.name,
                realm: option.realm,
            }));

        const sorted = [...deduped].sort(compareTargets);
        if (!bestCharacterKey) return sorted;

        const bestIndex = sorted.findIndex((target) => target.key === bestCharacterKey);
        if (bestIndex <= 0) return sorted;

        const [best] = sorted.splice(bestIndex, 1);
        return [best, ...sorted];
    }, [characterOptions, bestCharacterKey]);

    useEffect(() => {
        if (!user || orderedTargets.length === 0) return;

        let disposed = false;
        let timer: number | null = null;

        const fetchTarget = (target: PrefetchTarget) =>
            prefetchCharacterProfile(
                {
                    server: CHARACTER_API_SERVER,
                    realm: target.realm,
                    name: target.name,
                },
                httpFetch
            );

        const getNextStaleTarget = () =>
            orderedTargets.find(
                (target) =>
                    !isCharacterProfileCacheFresh({
                        server: CHARACTER_API_SERVER,
                        realm: target.realm,
                        name: target.name,
                    })
            ) ?? null;

        const bestTarget =
            bestCharacterKey !== null
                ? orderedTargets.find((target) => target.key === bestCharacterKey) ?? null
                : null;

        if (
            bestTarget &&
            !isCharacterProfileCacheFresh({
                server: CHARACTER_API_SERVER,
                realm: bestTarget.realm,
                name: bestTarget.name,
            })
        ) {
            void fetchTarget(bestTarget);
        }

        const scheduleNext = () => {
            if (disposed) return;

            const nextTarget = getNextStaleTarget();
            if (nextTarget) {
                void fetchTarget(nextTarget);
            }

            timer = window.setTimeout(scheduleNext, PREFETCH_DELAY_MS);
        };

        timer = window.setTimeout(scheduleNext, PREFETCH_DELAY_MS);

        return () => {
            disposed = true;
            if (timer !== null) {
                window.clearTimeout(timer);
            }
        };
    }, [user, httpFetch, orderedTargets, bestCharacterKey]);

    return null;
}
