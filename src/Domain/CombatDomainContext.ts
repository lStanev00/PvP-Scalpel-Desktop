import type { SpellDataBucket, SpellDataEntry, SpellDataType } from "../Interfaces/spell-data";

export type ClassId = string;

export type CombatRole = "tank" | "healer" | "dps" | "unknown";

export type SpellRelevance = "damage" | "healing" | "mitigation" | "utility" | "unknown";

export type DamageType = "MELEE_PHYSICAL" | "RANGED_PHYSICAL" | "RANGED_MAGIC" | "HYBRID" | "UNKNOWN";

export interface ClassMetadata {
    id: ClassId;
    name: string;
    color?: string;
    media?: string;
}

export interface SpellContext {
    spellId: number;
    name?: string;
    icon?: string;
    description?: string;
    subtext?: string;
    type?: SpellDataType;
    classId?: ClassId;
    spec?: string;
    role?: CombatRole;
    relevance: SpellRelevance;
    damageType?: DamageType;
}

export let classMetadataMap: Record<ClassId, ClassMetadata> = {};

const fallbackClassColors: Record<string, string> = {
    WARRIOR: "#C79C6E",
    PALADIN: "#F58CBA",
    HUNTER: "#ABD473",
    ROGUE: "#FFF569",
    PRIEST: "#FFFFFF",
    DEATHKNIGHT: "#C41F3B",
    SHAMAN: "#0070DE",
    MAGE: "#69CCF0",
    WARLOCK: "#9482C9",
    MONK: "#00FF96",
    DRUID: "#FF7D0A",
    DEMONHUNTER: "#A330C9",
    EVOKER: "#33937F",
};

export const specToRoleMap: Record<string, CombatRole> = {};

let dynamicSpecRoleMap: Record<string, CombatRole> = {};
let dynamicSpecMediaMap: Record<string, string> = {};

export const specToDamageTypeMap: Record<string, DamageType> = {};

export const ROLE_ICON_PATHS: Record<CombatRole, { label: string; path: string }> = {
    tank: {
        label: "Tank",
        path: "M12 2l8 4v6c0 5-4 9-8 10-4-1-8-5-8-10V6l8-4z",
    },
    healer: {
        label: "Healer",
        path: "M11 4h2v4h4v2h-4v4h-2v-4H7V8h4z",
    },
    dps: {
        label: "DPS",
        path: "M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6z",
    },
    unknown: {
        label: "Unknown",
        path: "M12 6a4 4 0 0 0-4 4h2a2 2 0 1 1 4 0c0 2-3 2-3 5h2c0-2 3-2 3-5a4 4 0 0 0-4-4zm-1 11h2v2h-2z",
    },
};

const normalizeSpec = (spec?: string) => {
    if (!spec) return "";
    return spec.toLowerCase().replace(/[\s-]/g, "");
};

const normalizeClassId = (classId?: string) => {
    if (!classId) return "";
    return classId.toUpperCase().replace(/[\s_]/g, "");
};

export const getClassColor = (classId?: string) => {
    if (!classId) return undefined;
    const key = normalizeClassId(classId);
    return classMetadataMap[key]?.color ?? fallbackClassColors[key];
};

export const getClassMedia = (classId?: string) => {
    if (!classId) return undefined;
    const key = normalizeClassId(classId);
    return classMetadataMap[key]?.media;
};

export const getRoleBySpec = (spec?: string): CombatRole => {
    if (!spec) return "unknown";
    const key = normalizeSpec(spec);
    return dynamicSpecRoleMap[key] ?? "unknown";
};

export const getSpecMedia = (spec?: string) => {
    if (!spec) return undefined;
    const key = normalizeSpec(spec);
    return dynamicSpecMediaMap[key];
};

export const getRoleByClassAndSpec = (classId?: string, spec?: string): CombatRole => {
    const role = getRoleBySpec(spec);
    if (role !== "unknown") return role;
    if (!classId) return "unknown";
    return "unknown";
};

export const setSpecRoleMappings = (entries: Array<{ name: string; role: CombatRole; media?: string }>) => {
    dynamicSpecRoleMap = {};
    dynamicSpecMediaMap = {};
    entries.forEach((entry) => {
        const key = normalizeSpec(entry.name);
        if (!key) return;
        dynamicSpecRoleMap[key] = entry.role;
        if (typeof entry.media === "string" && entry.media.trim()) {
            dynamicSpecMediaMap[key] = entry.media;
        }
    });
};

export const setClassMappings = (entries: Array<{ name: string; color?: string; media?: string }>) => {
    classMetadataMap = {};
    entries.forEach((entry) => {
        const key = normalizeClassId(entry.name);
        if (!key) return;
        classMetadataMap[key] = {
            id: key,
            name: entry.name,
            color: entry.color ?? fallbackClassColors[key],
            media: entry.media,
        };
    });
};

export const getDamageTypeBySpec = (spec?: string): DamageType => {
    const key = normalizeSpec(spec);
    return specToDamageTypeMap[key] ?? "UNKNOWN";
};

export const spellClassMap: Record<
    number,
    { classId: ClassId; spec?: string; relevance?: SpellRelevance }
> = {};

const inferRelevance = (type?: SpellDataType): SpellRelevance => {
    if (type === "harmfull") return "damage";
    if (type === "helpful") return "healing";
    if (type === "passive") return "utility";
    return "unknown";
};

const isSpellEntry = (value: unknown): value is SpellDataEntry => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const entry = value as SpellDataEntry;
    return (
        "name" in entry ||
        "description" in entry ||
        "subtext" in entry ||
        "type" in entry ||
        "icon" in entry ||
        "texture" in entry ||
        "iconId" in entry ||
        "textureId" in entry
    );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);

const parseVersionKey = (value: string) => {
    const parts = value.split(/[^0-9]+/).filter(Boolean).map(Number);
    return parts.length ? parts : [0];
};

const compareVersions = (a: string, b: string) => {
    const pa = parseVersionKey(a);
    const pb = parseVersionKey(b);
    const max = Math.max(pa.length, pb.length);
    for (let i = 0; i < max; i += 1) {
        const av = pa[i] ?? 0;
        const bv = pb[i] ?? 0;
        if (av !== bv) return bv - av;
    }
    return 0;
};

const resolveSpellEntry = (
    spellId: number,
    spellData?: SpellDataBucket
): SpellDataEntry | undefined => {
    if (!spellData) return undefined;
    const key = String(spellId);
    const bucket = spellData[key];
    if (!bucket) {
        const rootVersionKeys = Object.keys(spellData).sort(compareVersions);
        for (const versionKey of rootVersionKeys) {
            const versionBucket = spellData[versionKey];
            if (!isRecord(versionBucket)) continue;
            if (isSpellEntry(versionBucket[key])) {
                return versionBucket[key] as SpellDataEntry;
            }
        }
        return undefined;
    }

    if (isSpellEntry(bucket)) return bucket;
    if (isRecord(bucket) && isSpellEntry(bucket[key])) return bucket[key] as SpellDataEntry;

    if (!isRecord(bucket)) return undefined;

    const versionKeys = Object.keys(bucket).sort(compareVersions);
    for (const versionKey of versionKeys) {
        const versionBucket = bucket[versionKey];
        if (!isRecord(versionBucket)) {
            continue;
        }
        if (isSpellEntry(versionBucket[key])) {
            return versionBucket[key] as SpellDataEntry;
        }
        const first = Object.values(versionBucket)[0];
        if (isSpellEntry(first)) return first as SpellDataEntry;
    }

    const first = Object.values(bucket)[0];
    return isSpellEntry(first) ? (first as SpellDataEntry) : undefined;
};

const resolveIcon = (entry?: SpellDataEntry) => {
    if (!entry) return undefined;
    if (entry.icon) return entry.icon;
    if (entry.texture) return entry.texture;
    if (entry.iconId) return String(entry.iconId);
    if (entry.textureId) return String(entry.textureId);
    return undefined;
};

export const getSpellContext = (
    spellId: number,
    spellData?: SpellDataBucket
): SpellContext => {
    const entry = resolveSpellEntry(spellId, spellData);
    const mapped = spellClassMap[spellId];
    const relevance = mapped?.relevance ?? inferRelevance(entry?.type);
    const role = mapped?.spec ? getRoleBySpec(mapped.spec) : "unknown";
    const damageType = mapped?.spec ? getDamageTypeBySpec(mapped.spec) : undefined;
    const icon = resolveIcon(entry);

    return {
        spellId,
        name: entry?.name,
        icon,
        description: entry?.description,
        subtext: entry?.subtext,
        type: entry?.type,
        classId: mapped?.classId,
        spec: mapped?.spec,
        role,
        relevance,
        damageType,
    };
};

export const CombatDomainContext = {
    classMetadataMap,
    specToRoleMap,
    specToDamageTypeMap,
    spellClassMap,
    ROLE_ICON_PATHS,
    getClassColor,
    getClassMedia,
    getSpecMedia,
    getRoleBySpec,
    getRoleByClassAndSpec,
    getDamageTypeBySpec,
    getSpellContext,
};
