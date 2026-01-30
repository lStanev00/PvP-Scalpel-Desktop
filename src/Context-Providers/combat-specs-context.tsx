import { ReactNode, useEffect, useMemo, useState } from "react";
import useUserContext from "../Hooks/useUserContext";
import {
    setClassMappings,
    setSpecRoleMappings,
    type CombatRole,
} from "../Domain/CombatDomainContext";

interface GameSpecPayload {
    _id: number;
    name: string;
    media: string;
    role: "tank" | "damage" | "healer";
    relClass: number;
}

interface GameClassPayload {
    _id: number;
    name: string;
    media: string;
    specs?: GameSpecPayload[];
}

interface CachedPayload<T> {
    fetchedAt: number;
    items: T[];
}

const SPEC_CACHE_KEY = "pvp_scalpel_spec_cache_v1";
const CLASS_CACHE_KEY = "pvp_scalpel_class_cache_v1";
const CACHE_TTL_MS = 10 * 24 * 60 * 60 * 1000;

const mapRole = (role: GameSpecPayload["role"]): CombatRole => {
    if (role === "damage") return "dps";
    return role;
};

const extractPayload = <T,>(data: unknown): T[] | null => {
    if (Array.isArray(data)) return data as T[];
    if (data && typeof data === "object") {
        const maybe = data as { data?: unknown; specs?: unknown; items?: unknown; classes?: unknown };
        if (Array.isArray(maybe.data)) return maybe.data as T[];
        if (Array.isArray(maybe.specs)) return maybe.specs as T[];
        if (Array.isArray(maybe.classes)) return maybe.classes as T[];
        if (Array.isArray(maybe.items)) return maybe.items as T[];
    }
    return null;
};

const loadCache = <T,>(key: string): CachedPayload<T> | null => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedPayload<T>;
        if (!parsed || typeof parsed !== "object") return null;
        if (!Array.isArray(parsed.items) || typeof parsed.fetchedAt !== "number") return null;
        if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
        return parsed;
    } catch {
        return null;
    }
};

const saveCache = <T,>(key: string, items: T[]) => {
    const payload: CachedPayload<T> = { fetchedAt: Date.now(), items };
    localStorage.setItem(key, JSON.stringify(payload));
};

export default function CombatSpecsProvider({ children }: { children: ReactNode }) {
    const { httpFetch } = useUserContext();
    const [, setRevision] = useState(0);

    const applySpecs = useMemo(() => {
        return (items: GameSpecPayload[]) => {
            const mapped = items.map((item) => ({ name: item.name, role: mapRole(item.role) }));
            setSpecRoleMappings(mapped);
            setRevision((value) => value + 1);
        };
    }, []);

    const applyClasses = useMemo(() => {
        return (items: GameClassPayload[]) => {
            setClassMappings(items.map((item) => ({ name: item.name })));
            setRevision((value) => value + 1);
        };
    }, []);

    useEffect(() => {
        const cachedSpecs = loadCache<GameSpecPayload>(SPEC_CACHE_KEY);
        if (cachedSpecs) {
            applySpecs(cachedSpecs.items);
        }

        const cachedClasses = loadCache<GameClassPayload>(CLASS_CACHE_KEY);
        if (cachedClasses) {
            applyClasses(cachedClasses.items);
        }

        let cancelled = false;

        const fetchSpecs = async () => {
            if (cachedSpecs) return;
            const res = await httpFetch("/game/specs");
            if (!res.ok || !res.data) return;
            const payload = extractPayload<GameSpecPayload>(res.data);
            if (!payload || cancelled) return;
            saveCache(SPEC_CACHE_KEY, payload);
            applySpecs(payload);
        };

        const fetchClasses = async () => {
            if (cachedClasses) return;
            const res = await httpFetch("/game/classes");
            if (!res.ok || !res.data) return;
            const payload = extractPayload<GameClassPayload>(res.data);
            if (!payload || cancelled) return;
            saveCache(CLASS_CACHE_KEY, payload);
            applyClasses(payload);
        };

        void fetchSpecs();
        void fetchClasses();

        return () => {
            cancelled = true;
        };
    }, [httpFetch, applySpecs, applyClasses]);

    return <>{children}</>;
}
