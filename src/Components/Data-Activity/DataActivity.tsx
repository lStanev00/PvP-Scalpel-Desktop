import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useMatches from "../../Hooks/useMatches";
import updatePersence from "../../Helpers/updatePresence";
import RouteLayout from "../RouteLayout/RouteLayout";
import FiltersBar from "./FiltersBar";
import MatchHistoryList from "./MatchHistoryList";
import MatchDetailsPanel from "./MatchDetailsPanel";
import {
    buildMatchSummary,
    type MatchMode,
    filterMatches,
    getDefaultSelectedId,
    type MatchFilters,
    type MatchSummary,
} from "./utils";
import styles from "./DataActivity.module.css";

export default function DataActivity() {
    const matches = useMatches();
    const [rpcUpdate, setRpcUpdate] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState<"list" | "details">("list");
    const [filters, setFilters] = useState<MatchFilters>({
        mode: "all",
        character: "all",
        query: "",
    });
    const listScrollTop = useRef(0);

    useEffect(() => {
        if (matches.length > 0) {
            setIsLoading(false);
        }
    }, [matches.length]);

    useEffect(() => {
        const timer = setTimeout(() => setIsLoading(false), 600);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        setView("list");
    }, [filters.mode, filters.character, filters.query]);

    const summaries = useMemo(() => {
        return matches
            .map(buildMatchSummary)
            .sort((a, b) => b.timestampMs - a.timestampMs);
    }, [matches]);
    const modeOptions = useMemo(() => {
        const order: MatchMode[] = ["skirmish", "solo", "rated2", "rated3", "rbg", "unknown"];
        const present = new Set(summaries.map((summary) => summary.mode));
        const options = order
            .filter((mode) => present.has(mode))
            .map((mode) => {
                const label =
                    mode === "solo"
                        ? "Solo Shuffle"
                        : mode === "skirmish"
                          ? "Skirmish"
                          : mode === "rated2"
                            ? "Rated 2v2"
                            : mode === "rated3"
                              ? "Rated 3v3"
                              : mode === "rbg"
                                ? "RBG"
                                : "Unknown";
                return { label, value: mode };
            });
        return [{ label: "All Modes", value: "all" as const }, ...options];
    }, [summaries]);

    const characterOptions = useMemo(() => {
        const ownerName = summaries.find((summary) => summary.owner.isOwner)?.owner.name;
        const unique = Array.from(new Set(summaries.map((summary) => summary.owner.name)));
        const sorted = unique.sort((a, b) => a.localeCompare(b));
        if (ownerName) {
            const idx = sorted.indexOf(ownerName);
            if (idx > 0) {
                sorted.splice(idx, 1);
                sorted.unshift(ownerName);
            }
        }
        return [
            { label: "All Characters", value: "all" as const },
            ...sorted.map((name) => ({ label: name, value: name })),
        ];
    }, [summaries]);

    useEffect(() => {
        const modeValues = new Set(modeOptions.map((option) => option.value));
        if (!modeValues.has(filters.mode)) {
            setFilters((prev) => ({ ...prev, mode: "all" }));
        }
    }, [modeOptions, filters.mode]);

    useEffect(() => {
        const characterValues = new Set(characterOptions.map((option) => option.value));
        if (!characterValues.has(filters.character)) {
            setFilters((prev) => ({ ...prev, character: "all" }));
        }
    }, [characterOptions, filters.character]);
    const filtered = useMemo(() => filterMatches(summaries, filters), [summaries, filters]);

    useEffect(() => {
        const nextId = getDefaultSelectedId(selectedId, filtered);
        if (nextId && nextId !== selectedId) {
            setSelectedId(nextId);
        }
    }, [filtered, selectedId]);

    const selectedMatch =
        filtered.find((match) => match.id === selectedId) ?? filtered[0] ?? null;

    useEffect(() => {
        const ownerName = selectedMatch?.owner.name ?? "";
        updatePersence(rpcUpdate === "" ? "" : `Match lookup: ${ownerName}`);
    }, [rpcUpdate, selectedMatch?.owner.name]);

    useEffect(() => {
        const ownerName = selectedMatch?.owner.name ?? "";
        if (ownerName && ownerName !== rpcUpdate) {
            setRpcUpdate(ownerName);
        }
    }, [selectedMatch?.owner.name, rpcUpdate]);

    const headerActions = useMemo(
        () => <div className={styles.headerMeta}>Total matches: {matches.length}</div>,
        [matches.length]
    );

    const onSelectMatch = useCallback((match: MatchSummary) => {
        listScrollTop.current = window.scrollY;
        setSelectedId(match.id);
        setView("details");
    }, []);

    const onBackToList = useCallback(() => {
        setView("list");
        requestAnimationFrame(() => {
            window.scrollTo(0, listScrollTop.current);
        });
    }, []);

    useEffect(() => {
        if (view !== "details") return;
        const handler = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onBackToList();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [view, onBackToList]);

    return (
        <RouteLayout title="Match History" description="" actions={headerActions}>
            <div className={styles.page}>
                {view === "list" ? (
                    <div className={`${styles.viewPanel} ${styles.viewList}`}>
                        <FiltersBar
                            filters={filters}
                            onChange={setFilters}
                            modeOptions={modeOptions}
                            characterOptions={characterOptions}
                        />

                        <MatchHistoryList
                            matches={filtered}
                            selectedId={selectedId}
                            isLoading={isLoading}
                            onSelect={onSelectMatch}
                        />
                    </div>
                ) : (
                    <div className={`${styles.viewPanel} ${styles.viewDetails}`}>
                        <MatchDetailsPanel
                            match={selectedMatch}
                            isLoading={isLoading}
                            onBack={onBackToList}
                        />
                    </div>
                )}
            </div>
        </RouteLayout>
    );
}
