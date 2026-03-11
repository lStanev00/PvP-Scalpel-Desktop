import type { Player } from "../../Interfaces/matches-v1";
import type { PlayerEntryV2, TimelineEventV2 } from "../../Interfaces/matches-v2";
import type { TimelineEntry } from "../../Interfaces/matches-v1";

export type MatchPlayer = Player | PlayerEntryV2;
export type MatchTimelineEntry = TimelineEntry | TimelineEventV2;
