use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};
use tauri::{AppHandle, Manager};

const OFFKILTER_URL: &str = "https://offkilter.app";

#[derive(Debug, Deserialize)]
struct BridgeResponse {
    ok: bool,
    result: Option<Value>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct BridgeRequest<'a> {
    command: &'a str,
    #[serde(rename = "appDataDir")]
    app_data_dir: String,
    payload: Option<Value>,
}

#[tauri::command]
fn load_state(app: AppHandle) -> Result<Value, String> {
    run_bridge(&app, "loadState", None)
}

#[tauri::command]
fn create_sample_workspace(app: AppHandle) -> Result<Value, String> {
    run_bridge(&app, "createSampleWorkspace", None)
}

#[tauri::command]
fn create_qa_workspace(app: AppHandle) -> Result<Value, String> {
    run_bridge(&app, "createQaWorkspace", None)
}

#[tauri::command]
fn save_config(app: AppHandle, config: Value) -> Result<Value, String> {
    run_bridge(&app, "saveConfig", Some(config))
}

#[tauri::command]
fn preview(app: AppHandle, config: Value) -> Result<Value, String> {
    run_bridge(&app, "preview", Some(config))
}

#[tauri::command]
fn apply(app: AppHandle, config: Value) -> Result<Value, String> {
    run_bridge(&app, "apply", Some(config))
}

#[tauri::command]
fn undo_last_run(app: AppHandle) -> Result<Value, String> {
    run_bridge(&app, "undoLastRun", None)
}

#[tauri::command]
fn open_offkilter() -> Result<(), String> {
    tauri_plugin_opener::open_url(OFFKILTER_URL, None::<&str>).map_err(|error| error.to_string())
}

fn run_bridge(app: &AppHandle, command: &str, payload: Option<Value>) -> Result<Value, String> {
    let request = BridgeRequest {
        command,
        app_data_dir: app_data_dir(app)?,
        payload,
    };
    let request_body = serde_json::to_vec(&request).map_err(|error| error.to_string())?;
    let bridge_path = bridge_path()?;

    let mut child = Command::new("node")
        .arg(bridge_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start File Butler bridge: {error}"))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Could not open File Butler bridge stdin.".to_string())?;
    stdin
        .write_all(&request_body)
        .map_err(|error| format!("Could not write to File Butler bridge: {error}"))?;
    drop(stdin);

    let output = child
        .wait_with_output()
        .map_err(|error| format!("File Butler bridge failed: {error}"))?;

    if !output.stderr.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if !stderr.trim().is_empty() {
            eprintln!("{stderr}");
        }
    }

    let response: BridgeResponse = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("File Butler bridge returned invalid JSON: {error}"))?;

    if response.ok {
        return Ok(response.result.unwrap_or_else(|| json!(null)));
    }

    Err(response
        .error
        .unwrap_or_else(|| "File Butler bridge returned an unknown error.".to_string()))
}

fn app_data_dir(app: &AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| error.to_string())
        .map(|path| path.to_string_lossy().to_string())
}

fn bridge_path() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let desktop_dir = manifest_dir
        .parent()
        .ok_or_else(|| "Could not resolve desktop app directory.".to_string())?;
    let bridge_path = desktop_dir.join("dist").join("bridge").join("bridge.js");

    if !bridge_path.exists() {
        return Err(format!(
            "File Butler bridge is missing at {}. Run npm run build:bridge first.",
            bridge_path.display()
        ));
    }

    Ok(bridge_path)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            create_sample_workspace,
            create_qa_workspace,
            load_state,
            save_config,
            preview,
            apply,
            undo_last_run,
            open_offkilter
        ])
        .run(tauri::generate_context!())
        .expect("error while running File Butler desktop app");
}
