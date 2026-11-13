mod culling;
mod export;
mod raw_cr3;

use culling::{analyze_shoot_frames, CullingInput, CullingResult};
use export::{run_parallel_batch_export, BatchExportSummary, ExportPhotoItem, WatermarkSettings};
use raw_cr3::{resolve_preview_and_dimensions, ExtractedExif};
use serde::Serialize;
use std::path::PathBuf;
use walkdir::WalkDir;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedPhoto {
    pub id: String,
    pub file_name: String,
    pub path: String,
    pub preview_path: String,
    pub extension: String,
    pub width: u32,
    pub height: u32,
    pub file_size_bytes: u64,
    pub is_raw: bool,
    pub exif: ExtractedExif,
}

#[tauri::command]
fn scan_folder(folder_path: String, app: tauri::AppHandle) -> Result<Vec<ScannedPhoto>, String> {
    use tauri::Manager;

    let cache_dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("shoot_studio_cache"));

    let mut photos = Vec::new();

    for entry in WalkDir::new(&folder_path)
        .max_depth(2)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path: PathBuf = entry.path().to_path_buf();
        if !path.is_file() {
            continue;
        }
        // Skip previously generated export directories
        if path.to_string_lossy().contains("Shoot_Studio_Export") {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "cr3") {
            continue;
        }

        let file_size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let file_name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("image")
            .to_string();

        if let Ok((preview_path, width, height, exif)) =
            resolve_preview_and_dimensions(&path, &cache_dir)
        {
            photos.push(ScannedPhoto {
                id: path.to_string_lossy().to_string(),
                file_name,
                path: path.to_string_lossy().to_string(),
                preview_path: preview_path.to_string_lossy().to_string(),
                extension: ext.to_uppercase(),
                width,
                height,
                file_size_bytes,
                is_raw: ext == "cr3",
                exif,
            });
        }
    }

    photos.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    Ok(photos)
}

#[tauri::command]
fn analyze_shoot(
    inputs: Vec<CullingInput>,
    min_sharpness: Option<f32>,
    duplicate_threshold: Option<u32>,
) -> Vec<CullingResult> {
    analyze_shoot_frames(
        inputs,
        min_sharpness.unwrap_or(32.0),
        duplicate_threshold.unwrap_or(10),
    )
}

#[tauri::command]
fn export_batch(
    source_dir: String,
    items: Vec<ExportPhotoItem>,
    watermark: WatermarkSettings,
) -> Result<BatchExportSummary, String> {
    run_parallel_batch_export(&source_dir, items, watermark)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            analyze_shoot,
            export_batch
        ])
        .run(tauri::generate_context!())
        .expect("Fout tijdens het starten van Shoot Studio");
}
