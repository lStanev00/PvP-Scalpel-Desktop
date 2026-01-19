import { useContext } from "react";
import { MatchesContext } from "../Context-Providers/matches-context";

export default function useMatches() {
    const matches = useContext(MatchesContext);
    if (!matches) {
        throw new Error("MatchesContext must be used inside <MatchesProvider>");
    }
    return matches;
}
