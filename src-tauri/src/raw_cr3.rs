use image::DynamicImage;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

/// Extracts the largest embedded JPEG preview stream from a Canon `.cr3` ISOBMFF file.
/// Canon CR3 stores full-resolution JPEG previews inside ISOBMFF `mdat`/`PRVW` boxes,
/// allowing sub-10ms preview extraction without slow full-sensor demosaicing.
pub fn extract_cr3_preview_bytes(cr3_path: &Path) -> Result<Vec<u8>, String> {
    let mut file = File::open(cr3_path)
        .map_err(|e| format!("Kan CR3-bestand niet openen ({}): {}", cr3_path.display(), e))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("Fout bij lezen van CR3-bestand: {}", e))?;

    // Verify ISOBMFF Canon signature ('ftypcrx ' or 'ftyp')
    if buffer.len() < 16 || &buffer[4..8] != b"ftyp" {
        return Err("Ongeldig Canon CR3 ISOBMFF-containerformaat".to_string());
    }

    let mut best_jpeg: Option<&[u8]> = None;
    let mut i = 0usize;
    let len = buffer.len();

    // Scan for embedded JPEG SOI (0xFF 0xD8 0xFF) ... EOI (0xFF 0xD9) streams.
    // CR3 typically contains a 160x120 thumbnail and a full-resolution (up to 6000x4000) preview JPEG.
    while i + 3 < len {
        if buffer[i] == 0xFF && buffer[i + 1] == 0xD8 && buffer[i + 2] == 0xFF {
            // Valid JPEG marker follows SOI (APP0/APP1/DQT/DHT/SOF)
            let marker = buffer[i + 3];
            if matches!(marker, 0xE0..=0xEF | 0xDB | 0xC0 | 0xC4) {
                if let Some(end_idx) = find_jpeg_eoi(&buffer[i..]) {
                    let candidate = &buffer[i..i + end_idx];
                    if candidate.len() > 32_768 {
                        if best_jpeg.map_or(true, |prev| candidate.len() > prev.len()) {
                            best_jpeg = Some(candidate);
                        }
                    }
                    i += end_idx;
                    continue;
                }
            }
        }
        i += 1;
    }

    best_jpeg
        .map(|slice| slice.to_vec())
        .ok_or_else(|| "Geen ingesloten JPEG-voorvertoning gevonden in CR3-bestand".to_string())
}

fn find_jpeg_eoi(slice: &[u8]) -> Option<usize> {
    let mut j = 2usize;
    while j + 1 < slice.len() {
        if slice[j] == 0xFF && slice[j + 1] == 0xD9 {
            return Some(j + 2);
        }
        j += 1;
    }
    None
}

/// Ensures a viewable preview image exists on disk (extracting `.cr3` into cache if needed)
/// and returns `(preview_path, width, height)`.
pub fn resolve_preview_and_dimensions(
    source_path: &Path,
    cache_dir: &Path,
) -> Result<(PathBuf, u32, u32), String> {
    let ext = source_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "cr3" {
        fs::create_dir_all(cache_dir)
            .map_err(|e| format!("Kan preview-cachemap niet aanmaken: {}", e))?;

        let stem = source_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("raw_preview");
        let cached_jpg = cache_dir.join(format!("{}_cr3_preview.jpg", stem));

        if !cached_jpg.exists() {
            let jpeg_bytes = extract_cr3_preview_bytes(source_path)?;
            fs::write(&cached_jpg, &jpeg_bytes)
                .map_err(|e| format!("Kan CR3-preview niet cachen: {}", e))?;
        }

        let dims = image::image_dimensions(&cached_jpg)
            .map_err(|e| format!("Kan afmetingen van CR3-preview niet lezen: {}", e))?;
        Ok((cached_jpg, dims.0, dims.1))
    } else {
        let dims = image::image_dimensions(source_path)
            .map_err(|e| format!("Kan afmetingen van afbeelding niet lezen: {}", e))?;
        Ok((source_path.to_path_buf(), dims.0, dims.1))
    }
}

/// Loads a `DynamicImage` from `.jpg`, `.png`, or `.cr3` (via extracted preview).
pub fn load_image_for_processing(source_path: &Path) -> Result<DynamicImage, String> {
    let ext = source_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "cr3" {
        let bytes = extract_cr3_preview_bytes(source_path)?;
        image::load_from_memory(&bytes)
            .map_err(|e| format!("Kan CR3-preview niet decoderen: {}", e))
    } else {
        image::open(source_path)
            .map_err(|e| format!("Kan afbeelding niet openen ({}): {}", source_path.display(), e))
    }
}
