interface FingerprintDeviceInfo {
    memory: number | "unknown";
    cpuCores: number | "unknown";
}

export interface Fingerprint {
    userAgent: string;
    language: string;
    timezone: string;
    device: FingerprintDeviceInfo;
}

export default function getFingerprint(): Fingerprint {
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "APP";
    const language = typeof navigator !== "undefined" ? navigator.language : "unknown";
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "unknown";

    const memory =
        typeof navigator !== "undefined" && "deviceMemory" in navigator
            ? (navigator as any).deviceMemory
            : "unknown";

    const cpuCores =
        typeof navigator !== "undefined" && "hardwareConcurrency" in navigator
            ? navigator.hardwareConcurrency
            : "unknown";

    return {
        userAgent,
        language,
        timezone,
        device: {
            memory,
            cpuCores,
        },
    };
}
