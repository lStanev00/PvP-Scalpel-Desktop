import { invoke } from "@tauri-apps/api/core";

export default async function updatePersence(state : String) {
    await invoke("update_state_rich_presence", {
        state: state
    })
}