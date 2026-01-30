import { useContext } from "react";
import { SpellDataContext } from "../Context-Providers/spell-data-context";

export default function useSpellData() {
    const spellData = useContext(SpellDataContext);
    if (!spellData) {
        throw new Error("SpellDataContext must be used inside <SpellDataProvider>");
    }
    return spellData;
}
