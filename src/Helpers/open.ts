import { invoke } from "@tauri-apps/api/core";

export async function openUrl(url: string): Promise<void> {
    try {
        await invoke("open_url", { path: url });
    } catch (err) {
        console.error("Failed to open URL:", err);
    }
}
