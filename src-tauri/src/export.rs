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
    #[serde(default)]
    pub noise_reduction: f32, // 0 .. 100
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
            let mut base_rgba = loaded.to_rgba8();
            if item.adjustments.noise_reduction > 0.0 {
                base_rgba = apply_noise_reduction(&base_rgba, item.adjustments.noise_reduction);
            }
            let mut rgba = apply_color_grading(base_rgba, &item.adjustments);

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

fn apply_noise_reduction(src: &RgbaImage, amount: f32) -> RgbaImage {
    let (w, h) = src.dimensions();
    if amount <= 0.0 || w < 5 || h < 5 {
        return src.clone();
    }

    let strength = (amount / 100.0).clamp(0.0, 1.0);
    let sigma_range = 8.0 + strength * 42.0;
    let inv_two_sigma_sq = 1.0 / (2.0 * sigma_range * sigma_range);

    let mut range_lut = [0.0f32; 256];
    for (d, slot) in range_lut.iter_mut().enumerate() {
        let df = d as f32;
        *slot = (-(df * df) * inv_two_sigma_sq).exp();
    }

    let src_raw = src.as_raw();
    let total_px = (w * h) as usize;
    let mut luma = vec![0.0f32; total_px];
    for i in 0..total_px {
        let p = i * 4;
        luma[i] = 0.2126 * src_raw[p] as f32
            + 0.7152 * src_raw[p + 1] as f32
            + 0.0722 * src_raw[p + 2] as f32;
    }

    let radius: i32 = if strength > 0.45 { 2 } else { 1 };
    let spatial: &[f32] = if radius == 2 {
        &[0.25, 0.6, 1.0, 0.6, 0.25]
    } else {
        &[0.55, 1.0, 0.55]
    };

    let luma_blend = strength * 0.78;
    let chroma_blend = (strength * 1.15).min(1.0);
    let mut out = src.clone();
    let out_raw = out.as_mut();

    for y in 0..h as i32 {
        for x in 0..w as i32 {
            let c_idx = (y as u32 * w + x as u32) as usize;
            let c_p = c_idx * 4;
            let y0 = luma[c_idx];

            let mut sum_r = 0.0f32;
            let mut sum_g = 0.0f32;
            let mut sum_b = 0.0f32;
            let mut sum_w = 0.0f32;

            for dy in -radius..=radius {
                let ny = (y + dy).clamp(0, h as i32 - 1) as u32;
                let wy = spatial[(dy + radius) as usize];
                let row_off = (ny * w) as usize;

                for dx in -radius..=radius {
                    let nx = (x + dx).clamp(0, w as i32 - 1) as u32;
                    let n_idx = row_off + nx as usize;
                    let diff = (luma[n_idx] - y0).abs().round().min(255.0) as usize;
                    let weight = wy * spatial[(dx + radius) as usize] * range_lut[diff];

                    let np = n_idx * 4;
                    sum_r += src_raw[np] as f32 * weight;
                    sum_g += src_raw[np + 1] as f32 * weight;
                    sum_b += src_raw[np + 2] as f32 * weight;
                    sum_w += weight;
                }
            }

            if sum_w > 0.0 {
                let filt_r = sum_r / sum_w;
                let filt_g = sum_g / sum_w;
                let filt_b = sum_b / sum_w;

                let orig_r = src_raw[c_p] as f32;
                let orig_g = src_raw[c_p + 1] as f32;
                let orig_b = src_raw[c_p + 2] as f32;

                let filt_y = 0.2126 * filt_r + 0.7152 * filt_g + 0.0722 * filt_b;
                let out_y = y0 + (filt_y - y0) * luma_blend;

                let orig_cr = orig_r - y0;
                let orig_cg = orig_g - y0;
                let orig_cb = orig_b - y0;

                let filt_cr = filt_r - filt_y;
                let filt_cg = filt_g - filt_y;
                let filt_cb = filt_b - filt_y;

                out_raw[c_p] = (out_y + orig_cr + (filt_cr - orig_cr) * chroma_blend)
                    .clamp(0.0, 255.0)
                    .round() as u8;
                out_raw[c_p + 1] = (out_y + orig_cg + (filt_cg - orig_cg) * chroma_blend)
                    .clamp(0.0, 255.0)
                    .round() as u8;
                out_raw[c_p + 2] = (out_y + orig_cb + (filt_cb - orig_cb) * chroma_blend)
                    .clamp(0.0, 255.0)
                    .round() as u8;
            }
        }
    }

    out
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
