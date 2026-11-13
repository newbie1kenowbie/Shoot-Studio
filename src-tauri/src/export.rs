use crate::raw_cr3::load_image_for_processing;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::{overlay, FilterType};
use image::{DynamicImage, RgbaImage};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorAdjustments {
    pub exposure: f32,    // -2.0 .. +2.0 EV
    pub contrast: f32,    // -100 .. +100
    pub white_balance: f32, // -100 (cool) .. +100 (warm)
    pub saturation: f32,  // -100 .. +100
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkSettings {
    pub enabled: bool,
    pub png_path: Option<String>,
    pub scale: f32,   // 0.05 .. 0.60 fraction of image width
    pub opacity: f32, // 0.0 .. 1.0
    pub x_norm: f32,  // 0.0 .. 1.0 center X
    pub y_norm: f32,  // 0.0 .. 1.0 center Y
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPhotoItem {
    pub id: String,
    pub file_name: String,
    pub path: String,
    pub adjustments: ColorAdjustments,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchExportSummary {
    pub exported_count: usize,
    pub failed_count: usize,
    pub output_dir: String,
    pub duration_ms: u128,
}

pub fn run_parallel_batch_export(
    source_dir: &str,
    items: Vec<ExportPhotoItem>,
    watermark: WatermarkSettings,
) -> Result<BatchExportSummary, String> {
    let start = Instant::now();
    let export_dir = Path::new(source_dir).join("Shoot_Studio_Export");
    fs::create_dir_all(&export_dir)
        .map_err(|e| format!("Kan exportmap niet aanmaken: {}", e))?;

    let watermark_img: Option<DynamicImage> = if watermark.enabled {
        match watermark.png_path.as_deref() {
            Some(path_str) if !path_str.is_empty() => {
                Some(image::open(path_str).map_err(|e| {
                    format!("Kan watermerk-PNG niet laden ({}): {}", path_str, e)
                })?)
            }
            _ => None,
        }
    } else {
        None
    };

    let results: Vec<Result<PathBuf, String>> = items
        .par_iter()
        .map(|item| {
            let src_path = Path::new(&item.path);
            let loaded = load_image_for_processing(src_path)?;
            let mut rgba = apply_color_grading(loaded.to_rgba8(), &item.adjustments);

            if let Some(ref wm) = watermark_img {
                composite_watermark(&mut rgba, wm, &watermark);
            }

            let stem = Path::new(&item.file_name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("export");
            let out_path = export_dir.join(format!("{}_studio.jpg", stem));

            let rgb = DynamicImage::ImageRgba8(rgba).to_rgb8();
            let out_file = File::create(&out_path)
                .map_err(|e| format!("Kan uitvoerbestand niet aanmaken: {}", e))?;
            let writer = BufWriter::new(out_file);
            let mut encoder = JpegEncoder::new_with_quality(writer, 92);
            encoder
                .encode_image(&rgb)
                .map_err(|e| format!("JPEG-codering mislukt: {}", e))?;

            Ok(out_path)
        })
        .collect();

    let exported_count = results.iter().filter(|r| r.is_ok()).count();
    let failed_count = results.len() - exported_count;

    Ok(BatchExportSummary {
        exported_count,
        failed_count,
        output_dir: export_dir.to_string_lossy().to_string(),
        duration_ms: start.elapsed().as_millis(),
    })
}

fn apply_color_grading(mut img: RgbaImage, adj: &ColorAdjustments) -> RgbaImage {
    let exposure_mult = 2.0f32.powf(adj.exposure);
    let contrast_factor = 1.0 + (adj.contrast / 100.0) * 0.85;
    let wb_shift = adj.white_balance / 100.0;
    let sat_factor = 1.0 + (adj.saturation / 100.0);

    for pixel in img.pixels_mut() {
        let mut r = (pixel[0] as f32 / 255.0) * exposure_mult;
        let mut g = (pixel[1] as f32 / 255.0) * exposure_mult;
        let mut b = (pixel[2] as f32 / 255.0) * exposure_mult;

        // White balance (warm amber vs cool blue shift)
        r *= 1.0 + wb_shift * 0.22;
        b *= 1.0 - wb_shift * 0.22;

        // Contrast around mid-gray 0.5
        r = (r - 0.5) * contrast_factor + 0.5;
        g = (g - 0.5) * contrast_factor + 0.5;
        b = (b - 0.5) * contrast_factor + 0.5;

        // Saturation preserving Rec.709 luminance
        let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = luma + (r - luma) * sat_factor;
        g = luma + (g - luma) * sat_factor;
        b = luma + (b - luma) * sat_factor;

        pixel[0] = (r.clamp(0.0, 1.0) * 255.0) as u8;
        pixel[1] = (g.clamp(0.0, 1.0) * 255.0) as u8;
        pixel[2] = (b.clamp(0.0, 1.0) * 255.0) as u8;
    }

    img
}

fn composite_watermark(base: &mut RgbaImage, wm: &DynamicImage, settings: &WatermarkSettings) {
    let (base_w, base_h) = base.dimensions();
    let target_w = ((base_w as f32) * settings.scale.clamp(0.04, 0.85)).round() as u32;
    let aspect = wm.height() as f32 / wm.width().max(1) as f32;
    let target_h = ((target_w as f32) * aspect).round().max(1.0) as u32;

    let mut resized = wm
        .resize_exact(target_w.max(1), target_h.max(1), FilterType::Lanczos3)
        .to_rgba8();

    let opacity = settings.opacity.clamp(0.0, 1.0);
    if opacity < 0.999 {
        for px in resized.pixels_mut() {
            px[3] = ((px[3] as f32) * opacity).round() as u8;
        }
    }

    let center_x = (base_w as f32 * settings.x_norm.clamp(0.0, 1.0)).round() as i64;
    let center_y = (base_h as f32 * settings.y_norm.clamp(0.0, 1.0)).round() as i64;
    let top_left_x = center_x - (target_w as i64 / 2);
    let top_left_y = center_y - (target_h as i64 / 2);

    overlay(base, &resized, top_left_x, top_left_y);
}
