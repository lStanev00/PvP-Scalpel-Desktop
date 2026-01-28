export type SpellDataType = "harmfull" | "helpful" | "passive";

export interface SpellDataEntry {
    name?: string;
    description?: string;
    subtext?: string;
    type?: SpellDataType;
}

export type SpellDataBucket = Record<string, Record<string, SpellDataEntry>>;
