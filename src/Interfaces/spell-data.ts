export type SpellDataType = "harmfull" | "helpful" | "passive";

export interface SpellDataEntry {
    name?: string;
    description?: string;
    subtext?: string;
    type?: SpellDataType;
    icon?: string;
    texture?: string;
    iconId?: number;
    textureId?: number;
}

export type SpellDataVersionBucket = Record<string, SpellDataEntry>;
export type SpellDataBucket = Record<
    string,
    SpellDataEntry | SpellDataVersionBucket | Record<string, SpellDataVersionBucket>
>;
