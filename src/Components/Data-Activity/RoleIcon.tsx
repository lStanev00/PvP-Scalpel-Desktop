import { LuCircleHelp, LuHeartPulse, LuShield, LuSwords } from "react-icons/lu";
import type { CSSProperties } from "react";
import type { IconType } from "react-icons";
import type { CombatRole } from "../../Domain/CombatDomainContext";
import styles from "./DataActivity.module.css";

interface RoleIconProps {
    role: CombatRole;
    style?: CSSProperties;
}

export default function RoleIcon({ role, style }: RoleIconProps) {
    const iconMap: Record<CombatRole, { label: string; Icon: IconType }> = {
        tank: { label: "Tank", Icon: LuShield },
        healer: { label: "Healer", Icon: LuHeartPulse },
        dps: { label: "DPS", Icon: LuSwords },
        unknown: { label: "Unknown", Icon: LuCircleHelp },
    };
    const icon = iconMap[role] ?? iconMap.unknown;
    const Icon = icon.Icon;
    return (
        <span className={styles.roleIcon} role="img" aria-label={icon.label} style={style}>
            <Icon aria-hidden="true" />
        </span>
    );
}
