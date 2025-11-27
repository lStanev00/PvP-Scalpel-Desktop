use serde::Serialize;
use ts_rs::TS;

// const HEADER1: &str = "600";
const VALUE1: &str = "BasicPass";
// const HEADER2: &str = "ga6n1fa4fcvt";
const VALUE2: &str = "EiDcafRc45$td4aedrgh4615DESKTOP";
const VALUE3: &str = "EiDcafRc45$td4aedrgh4615tokenbtw";

#[derive(Serialize, TS)]
#[ts(export, export_to="../../src/Interfaces/HttpAccessHeadersInterface.ts")]
pub struct HttpAccessHeadersInterface {
    #[serde(rename = "600")]
    header1: String,

    #[serde(rename = "desktop")]
    header2: String,
}

#[tauri::command]
pub fn get_config() -> HttpAccessHeadersInterface {
    HttpAccessHeadersInterface {
        header1: VALUE1.to_string(),
        header2: VALUE2.to_string(),
    }
}

#[derive(Serialize, TS)]
#[ts(export, export_to="../../src/Interfaces/LocalPass.ts")]
pub struct LocalPass {
    #[serde(rename = "ga6n1fa4fcvt")]
    header1: String,

}

#[tauri::command]
pub fn get_local_config() -> LocalPass {
    LocalPass {
        header1: VALUE3.to_string(),
    }
}
