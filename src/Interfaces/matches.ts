export * from "./matches-v1";
export * from "./matches-v2";
export * from "./matches-v4";
export * from "./local-spell-model";

import type { Match } from "./matches-v1";
import type { MatchV2 } from "./matches-v2";
import type { MatchV4 } from "./matches-v4";

export type MatchWithId = (Match | MatchV2 | MatchV4) & {
    id: string;
    interruptSpellIds?: number[];
};
