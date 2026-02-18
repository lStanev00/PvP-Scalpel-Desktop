export * from "./matches-v1";
export * from "./matches-v2";

import type { Match } from "./matches-v1";
import type { MatchV2 } from "./matches-v2";

export type MatchWithId = (Match | MatchV2) & {
    id: string;
    interruptSpellIds?: number[];
};
