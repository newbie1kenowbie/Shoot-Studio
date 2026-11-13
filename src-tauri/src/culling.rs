use crate::raw_cr3::load_image_for_processing;
use image::imageops::FilterType;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CullingResult {
    pub id: String,
    pub sharpness_score: f32,
    pub dhash: u64,
    pub duplicate_group_id: Option<String>,
    pub status: String, // "geselecteerd" | "afgekeurd"
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CullingInput {
    pub id: String,
    pub path: String,
}

/// Computes normalized sharpness (0..100 via Laplacian variance) and 64-bit dHash
/// in parallel across all frames in the shoot using `rayon`.
pub fn analyze_shoot_frames(
    inputs: Vec<CullingInput>,
    min_sharpness_threshold: f32,
    duplicate_hamming_threshold: u32,
) -> Vec<CullingResult> {
    // Step 1: Parallel image decoding + Laplacian variance + dHash calculation
    let metrics: Vec<(String, f32, u64)> = inputs
        .par_iter()
        .map(|item| {
            let path = PathBuf::from(&item.path);
            match load_image_for_processing(&path) {
                Ok(img) => {
                    let gray = img.resize_exact(512, 384, FilterType::Triangle).to_luma8();
                    let sharpness = compute_laplacian_sharpness(&gray);
                    let dhash = compute_dhash(&img);
                    (item.id.clone(), sharpness, dhash)
                }
                Err(_) => (item.id.clone(), 0.0, 0),
            }
        })
        .collect();

    // Step 2: Cluster near-duplicate bursts by dHash Hamming distance
    let mut visited = vec![false; metrics.len()];
    let mut group_assignments: Vec<Option<usize>> = vec![None; metrics.len()];
    let mut group_counter = 0usize;

    for i in 0..metrics.len() {
        if visited[i] {
            continue;
        }
        let mut cluster = vec![i];
        visited[i] = true;

        for j in (i + 1)..metrics.len() {
            if visited[j] {
                continue;
            }
            let dist = (metrics[i].2 ^ metrics[j].2).count_ones();
            if dist <= duplicate_hamming_threshold {
                visited[j] = true;
                cluster.push(j);
            }
        }

        if cluster.len() > 1 {
            group_counter += 1;
            for idx in cluster {
                group_assignments[idx] = Some(group_counter);
            }
        }
    }

    // Step 3: Keep sharpest frame per duplicate cluster, reject soft or redundant frames
    let mut best_in_group = std::collections::HashMap::<usize, usize>::new();
    for (idx, group_opt) in group_assignments.iter().enumerate() {
        if let Some(group_id) = group_opt {
            best_in_group
                .entry(*group_id)
                .and_modify(|best_idx| {
                    if metrics[idx].1 > metrics[*best_idx].1 {
                        *best_idx = idx;
                    }
                })
                .or_insert(idx);
        }
    }

    metrics
        .into_iter()
        .enumerate()
        .map(|(idx, (id, sharpness, dhash))| {
            let group_opt = group_assignments[idx];
            let duplicate_group_id = group_opt.map(|g| format!("burst-{:02}", g));

            let (status, reason) = if sharpness < min_sharpness_threshold {
                (
                    "afgekeurd".to_string(),
                    format!("Lage scherpte ({:.0}/100)", sharpness),
                )
            } else if let Some(group_id) = group_opt {
                if best_in_group.get(&group_id) == Some(&idx) {
                    (
                        "geselecteerd".to_string(),
                        "Scherpste opname in serie".to_string(),
                    )
                } else {
                    (
                        "afgekeurd".to_string(),
                        "Dubbele opname in burst-serie".to_string(),
                    )
                }
            } else {
                (
                    "geselecteerd".to_string(),
                    "Scherp & uniek beeld".to_string(),
                )
            };

            CullingResult {
                id,
                sharpness_score: sharpness,
                dhash,
                duplicate_group_id,
                status,
                reason,
            }
        })
        .collect()
}

fn compute_laplacian_sharpness(gray: &image::GrayImage) -> f32 {
    let (w, h) = gray.dimensions();
    if w < 3 || h < 3 {
        return 0.0;
    }

    // Focus weighting on central 70% region where subjects usually sit
    let x_start = (w as f32 * 0.15) as u32;
    let x_end = (w as f32 * 0.85) as u32;
    let y_start = (h as f32 * 0.15) as u32;
    let y_end = (h as f32 * 0.85) as u32;

    let mut sum = 0.0f64;
    let mut sum_sq = 0.0f64;
    let mut count = 0u64;

    for y in y_start.max(1)..y_end.min(h - 1) {
        for x in x_start.max(1)..x_end.min(w - 1) {
            let center = gray.get_pixel(x, y)[0] as f64;
            let up = gray.get_pixel(x, y - 1)[0] as f64;
            let down = gray.get_pixel(x, y + 1)[0] as f64;
            let left = gray.get_pixel(x - 1, y)[0] as f64;
            let right = gray.get_pixel(x + 1, y)[0] as f64;

            let lap = (up + down + left + right) - 4.0 * center;
            sum += lap;
            sum_sq += lap * lap;
            count += 1;
        }
    }

    if count == 0 {
        return 0.0;
    }

    let mean = sum / count as f64;
    let variance = (sum_sq / count as f64) - (mean * mean);
    // Normalize typical photographic variance (~50..1800) into 0..100
    let normalized = ((variance.sqrt() / 28.0) * 100.0).clamp(0.0, 100.0);
    normalized as f32
}

fn compute_dhash(img: &image::DynamicImage) -> u64 {
    let small = img.resize_exact(9, 8, FilterType::Triangle).to_luma8();
    let mut hash = 0u64;
    let mut bit = 0u32;

    for y in 0..8 {
        for x in 0..8 {
            let left = small.get_pixel(x, y)[0];
            let right = small.get_pixel(x + 1, y)[0];
            if left > right {
                hash |= 1u64 << bit;
            }
            bit += 1;
        }
    }
    hash
}
