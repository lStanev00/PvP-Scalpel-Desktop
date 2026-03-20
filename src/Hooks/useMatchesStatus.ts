import { useContext } from "react";
import { MatchesStatusContext } from "../Context-Providers/matches-context";

export default function useMatchesStatus() {
    const status = useContext(MatchesStatusContext);
    if (!status) {
        throw new Error("MatchesStatusContext must be used inside <MatchesProvider>");
    }
    return status;
}
