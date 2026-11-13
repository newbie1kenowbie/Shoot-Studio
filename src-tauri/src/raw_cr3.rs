use image::DynamicImage;
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::fs::{self, File};
use std::hash::{Hash, Hasher};
use std::io::Read;
use std::path::{Path, PathBuf};

const CANON_UUID: [u8; 16] = [
    0x85, 0xc0, 0xb6, 0x87, 0x82, 0x0f, 0x11, 0xe0, 0x81, 0x11, 0xf4, 0xce, 0x46, 0x2b, 0x6a, 0x48,
];

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedExif {
    pub camera: Option<String>,
    pub lens: Option<String>,
    pub focal_length: Option<String>,
    pub aperture: Option<String>,
    pub shutter_speed: Option<String>,
    pub iso: Option<u32>,
    #[serde(skip_serializing)]
    pub orientation: u16,
}

fn read_u16_be(buf: &[u8], off: usize) -> u16 {
    ((buf[off] as u16) << 8) | (buf[off + 1] as u16)
}

fn read_u32_be(buf: &[u8], off: usize) -> u32 {
    ((buf[off] as u32) << 24)
        | ((buf[off + 1] as u32) << 16)
        | ((buf[off + 2] as u32) << 8)
        | (buf[off + 3] as u32)
}

fn read_u64_be(buf: &[u8], off: usize) -> u64 {
    ((read_u32_be(buf, off) as u64) << 32) | (read_u32_be(buf, off + 4) as u64)
}

struct IsoBox<'a> {
    box_type: [u8; 4],
    data_start: usize,
    end: usize,
    _phantom: std::marker::PhantomData<&'a [u8]>,
}

fn collect_iso_boxes(buf: &[u8], start: usize, end: usize) -> Vec<IsoBox<'_>> {
    let mut boxes = Vec::new();
    let mut pos = start;
    while pos + 8 <= end {
        let size32 = read_u32_be(buf, pos) as usize;
        let box_type = [buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]];
        let (box_size, header_size) = if size32 == 1 {
            if pos + 16 > end {
                break;
            }
            (read_u64_be(buf, pos + 8) as usize, 16)
        } else if size32 == 0 {
            (end - pos, 8)
        } else {
            (size32, 8)
        };

        if box_size < header_size || pos + box_size > end {
            break;
        }
        boxes.push(IsoBox {
            box_type,
            data_start: pos + header_size,
            end: pos + box_size,
            _phantom: std::marker::PhantomData,
        });
        pos += box_size;
    }
    boxes
}

fn extract_track_sample_jpegs(buf: &[u8], start: usize, end: usize) -> Vec<(usize, usize)> {
    let mut sample_sizes = Vec::new();
    let mut chunk_offsets = Vec::new();

    for b in collect_iso_boxes(buf, start, end) {
        if &b.box_type == b"stsz" && b.data_start + 12 <= b.end {
            let uniform = read_u32_be(buf, b.data_start + 4) as usize;
            let count = read_u32_be(buf, b.data_start + 8) as usize;
            if uniform == 0 {
                for i in 0..count {
                    let off = b.data_start + 12 + i * 4;
                    if off + 4 > b.end {
                        break;
                    }
                    sample_sizes.push(read_u32_be(buf, off) as usize);
                }
            } else {
                sample_sizes.resize(count, uniform);
            }
        } else if &b.box_type == b"stco" && b.data_start + 8 <= b.end {
            let count = read_u32_be(buf, b.data_start + 4) as usize;
            for i in 0..count {
                let off = b.data_start + 8 + i * 4;
                if off + 4 > b.end {
                    break;
                }
                chunk_offsets.push(read_u32_be(buf, off) as usize);
            }
        } else if &b.box_type == b"co64" && b.data_start + 8 <= b.end {
            let count = read_u32_be(buf, b.data_start + 4) as usize;
            for i in 0..count {
                let off = b.data_start + 8 + i * 8;
                if off + 8 > b.end {
                    break;
                }
                chunk_offsets.push(read_u64_be(buf, off) as usize);
            }
        }
    }

    let mut out = Vec::new();
    let count = chunk_offsets.len().min(sample_sizes.len());
    for i in 0..count {
        let off = chunk_offsets[i];
        let size = sample_sizes[i];
        if off + size <= buf.len()
            && size > 16_384
            && buf[off] == 0xFF
            && buf[off + 1] == 0xD8
            && buf[off + 2] == 0xFF
        {
            out.push((off, size));
        }
    }
    out
}

fn parse_tiff_exif_block(buf: &[u8], start: usize, end: usize, out: &mut ExtractedExif) {
    if start + 8 > end {
        return;
    }
    let le = match &buf[start..start + 2] {
        b"II" => true,
        b"MM" => false,
        _ => return,
    };

    let u16_at = |off: usize| -> u16 {
        if le {
            (buf[off] as u16) | ((buf[off + 1] as u16) << 8)
        } else {
            ((buf[off] as u16) << 8) | (buf[off + 1] as u16)
        }
    };
    let u32_at = |off: usize| -> u32 {
        if le {
            (buf[off] as u32)
                | ((buf[off + 1] as u32) << 8)
                | ((buf[off + 2] as u32) << 16)
                | ((buf[off + 3] as u32) << 24)
        } else {
            read_u32_be(buf, off)
        }
    };

    let ifd_rel = u32_at(start + 4) as usize;
    let ifd_pos = start + ifd_rel;
    if ifd_pos + 2 > end {
        return;
    }
    let count = u16_at(ifd_pos) as usize;

    for i in 0..count {
        let e_pos = ifd_pos + 2 + i * 12;
        if e_pos + 12 > end {
            break;
        }
        let tag = u16_at(e_pos);
        let typ = u16_at(e_pos + 2);
        let val_count = u32_at(e_pos + 4) as usize;
        let val_off = e_pos + 8;

        let read_str = || -> Option<String> {
            let ptr = if val_count <= 4 {
                val_off
            } else {
                start + u32_at(val_off) as usize
            };
            if ptr + val_count > end {
                return None;
            }
            let raw = &buf[ptr..ptr + val_count];
            let s = String::from_utf8_lossy(raw)
                .trim_end_matches('\0')
                .trim()
                .to_string();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        };

        let read_rational = || -> Option<f64> {
            let ptr = start + u32_at(val_off) as usize;
            if ptr + 8 > end {
                return None;
            }
            let num = u32_at(ptr) as f64;
            let den = u32_at(ptr + 4) as f64;
            if den > 0.0 {
                Some(num / den)
            } else {
                None
            }
        };

        match tag {
            0x0110 if typ == 2 => {
                if let Some(m) = read_str() {
                    out.camera = Some(m);
                }
            }
            0x0112 if typ == 3 => {
                out.orientation = u16_at(val_off);
            }
            0xA434 if typ == 2 => {
                if let Some(l) = read_str() {
                    out.lens = Some(l);
                }
            }
            0x8827 if typ == 3 || typ == 4 => {
                out.iso = Some(if typ == 3 {
                    u16_at(val_off) as u32
                } else {
                    u32_at(val_off)
                });
            }
            0x829D if typ == 5 => {
                if let Some(f) = read_rational() {
                    out.aperture = Some(format!("f/{:.1}", f).replace(".0", ""));
                }
            }
            0x920A if typ == 5 => {
                if let Some(fl) = read_rational() {
                    out.focal_length = Some(format!("{}mm", fl.round() as u32));
                }
            }
            0x829A if typ == 5 => {
                if let Some(exp) = read_rational() {
                    if exp > 0.0 {
                        out.shutter_speed = Some(if exp >= 1.0 {
                            format!("{:.1}s", exp)
                        } else {
                            format!("1/{}s", (1.0 / exp).round() as u32)
                        });
                    }
                }
            }
            _ => {}
        }
    }
}

/// Marker-aware JPEG end finder so nested APP1 EXIF thumbnails (containing 0xFF 0xD9)
/// never truncate full-resolution Canon EOS R6 previews.
fn find_complete_jpeg_end(buf: &[u8], start: usize) -> Option<usize> {
    let mut pos = start + 2;
    let len = buf.len();

    while pos + 1 < len {
        if buf[pos] != 0xFF {
            pos += 1;
            continue;
        }
        while pos < len && buf[pos] == 0xFF {
            pos += 1;
        }
        if pos >= len {
            break;
        }
        let marker = buf[pos];
        pos += 1;

        if marker == 0x00 || (0xD0..=0xD7).contains(&marker) || marker == 0xD8 {
            continue;
        }
        if marker == 0xD9 {
            return Some(pos);
        }

        if pos + 2 > len {
            break;
        }
        let seg_len = read_u16_be(buf, pos) as usize;
        if seg_len < 2 || pos + seg_len > len {
            break;
        }
        pos += seg_len;

        if marker == 0xDA {
            while pos + 1 < len {
                if buf[pos] == 0xFF {
                    let next = buf[pos + 1];
                    if next == 0xD9 {
                        return Some(pos + 2);
                    }
                    if next == 0x00 || (0xD0..=0xD7).contains(&next) || next == 0xFF {
                        pos += 2;
                        continue;
                    }
                    break;
                }
                pos += 1;
            }
        }
    }
    None
}

fn find_app1_exif_offset(jpeg: &[u8]) -> Option<usize> {
    let mut pos = 2usize;
    let max_scan = jpeg.len().min(65_536);
    while pos + 4 < max_scan {
        if jpeg[pos] != 0xFF {
            break;
        }
        let marker = jpeg[pos + 1];
        if marker == 0xDA || marker == 0xD9 {
            break;
        }
        let seg_len = read_u16_be(jpeg, pos + 2) as usize;
        if marker == 0xE1 && pos + 10 < jpeg.len() && &jpeg[pos + 4..pos + 8] == b"Exif" {
            return Some(pos + 10);
        }
        pos += 2 + seg_len;
    }
    None
}

/// Extracts the highest-resolution embedded JPEG preview + EXIF metadata from a Canon `.cr3`
/// ISOBMFF file (including EOS R6, R6 Mark II, R5, C-RAW, and HDR PQ).
pub fn extract_cr3_preview_and_exif(cr3_path: &Path) -> Result<(Vec<u8>, ExtractedExif), String> {
    let mut file = File::open(cr3_path)
        .map_err(|e| format!("Kan CR3-bestand niet openen ({}): {}", cr3_path.display(), e))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("Fout bij lezen van CR3-bestand: {}", e))?;

    if buffer.len() < 24 || &buffer[4..8] != b"ftyp" {
        return Err("Ongeldig Canon CR3 ISOBMFF-containerformaat".to_string());
    }

    let mut best_jpeg: Option<&[u8]> = None;
    let mut exif = ExtractedExif {
        orientation: 1,
        ..Default::default()
    };

    for top in collect_iso_boxes(&buffer, 0, buffer.len()) {
        if &top.box_type != b"moov" {
            continue;
        }
        for child in collect_iso_boxes(&buffer, top.data_start, top.end) {
            if &child.box_type == b"trak" {
                for tc in collect_iso_boxes(&buffer, child.data_start, child.end) {
                    if &tc.box_type != b"mdia" {
                        continue;
                    }
                    for mc in collect_iso_boxes(&buffer, tc.data_start, tc.end) {
                        if &mc.box_type != b"minf" {
                            continue;
                        }
                        for minf_c in collect_iso_boxes(&buffer, mc.data_start, mc.end) {
                            if &minf_c.box_type != b"stbl" {
                                continue;
                            }
                            for (off, size) in
                                extract_track_sample_jpegs(&buffer, minf_c.data_start, minf_c.end)
                            {
                                let cand = &buffer[off..off + size];
                                if best_jpeg.map_or(true, |prev| cand.len() > prev.len()) {
                                    best_jpeg = Some(cand);
                                }
                            }
                        }
                    }
                }
            } else if &child.box_type == b"uuid"
                && child.data_start + 16 <= child.end
                && buffer[child.data_start..child.data_start + 16] == CANON_UUID
            {
                for cb in collect_iso_boxes(&buffer, child.data_start + 16, child.end) {
                    if &cb.box_type == b"CMT1" || &cb.box_type == b"CMT2" {
                        parse_tiff_exif_block(&buffer, cb.data_start, cb.end, &mut exif);
                    } else if &cb.box_type == b"PRVW" && cb.data_start + 16 < cb.end {
                        let search_end = cb.end.min(cb.data_start + 32);
                        for k in cb.data_start..search_end.saturating_sub(3) {
                            if buffer[k] == 0xFF && buffer[k + 1] == 0xD8 && buffer[k + 2] == 0xFF
                            {
                                let cand = &buffer[k..cb.end];
                                if best_jpeg.map_or(true, |prev| cand.len() > prev.len()) {
                                    best_jpeg = Some(cand);
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    // Marker-aware fallback scan if ISOBMFF track/PRVW boxes yielded nothing
    if best_jpeg.is_none() {
        let mut i = 0usize;
        while i + 4 < buffer.len() {
            if buffer[i] == 0xFF && buffer[i + 1] == 0xD8 && buffer[i + 2] == 0xFF {
                let marker = buffer[i + 3];
                if matches!(marker, 0xE0..=0xEF | 0xDB | 0xC0 | 0xC4) {
                    if let Some(end_idx) = find_complete_jpeg_end(&buffer, i) {
                        let cand = &buffer[i..end_idx];
                        if cand.len() > 32_768
                            && best_jpeg.map_or(true, |prev| cand.len() > prev.len())
                        {
                            best_jpeg = Some(cand);
                        }
                        i = end_idx;
                        continue;
                    }
                }
            }
            i += 1;
        }
    }

    let jpeg_bytes = best_jpeg
        .map(|s| s.to_vec())
        .ok_or_else(|| "Geen ingesloten JPEG-voorvertoning gevonden in CR3-bestand".to_string())?;

    if exif.camera.is_none() || exif.iso.is_none() {
        if let Some(app1_off) = find_app1_exif_offset(&jpeg_bytes) {
            parse_tiff_exif_block(&jpeg_bytes, app1_off, jpeg_bytes.len(), &mut exif);
        }
    }

    Ok((jpeg_bytes, exif))
}

pub fn extract_cr3_preview_bytes(cr3_path: &Path) -> Result<(Vec<u8>, u16), String> {
    let (bytes, exif) = extract_cr3_preview_and_exif(cr3_path)?;
    Ok((bytes, exif.orientation))
}

fn apply_exif_orientation(img: DynamicImage, orientation: u16) -> DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}

fn read_jpeg_exif(path: &Path) -> ExtractedExif {
    let mut exif = ExtractedExif {
        orientation: 1,
        ..Default::default()
    };
    if let Ok(mut f) = File::open(path) {
        let mut head = vec![0u8; 65_536];
        if let Ok(n) = f.read(&mut head) {
            let slice = &head[..n];
            if slice.len() > 4 && slice[0] == 0xFF && slice[1] == 0xD8 {
                if let Some(off) = find_app1_exif_offset(slice) {
                    parse_tiff_exif_block(slice, off, slice.len(), &mut exif);
                }
            }
        }
    }
    exif
}

/// Ensures a viewable preview image exists on disk (extracting `.cr3` into cache if needed)
/// and returns `(preview_path, width, height, exif)`.
pub fn resolve_preview_and_dimensions(
    source_path: &Path,
    cache_dir: &Path,
) -> Result<(PathBuf, u32, u32, ExtractedExif), String> {
    let ext = source_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "cr3" {
        fs::create_dir_all(cache_dir)
            .map_err(|e| format!("Kan preview-cachemap niet aanmaken: {}", e))?;

        let mut hasher = DefaultHasher::new();
        source_path.to_string_lossy().hash(&mut hasher);
        let path_hash = hasher.finish();

        let stem = source_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("raw_preview");
        let cached_jpg = cache_dir.join(format!("{}_{:x}_cr3_preview.jpg", stem, path_hash));

        let (jpeg_bytes, exif) = extract_cr3_preview_and_exif(source_path)?;
        if !cached_jpg.exists() {
            fs::write(&cached_jpg, &jpeg_bytes)
                .map_err(|e| format!("Kan CR3-preview niet cachen: {}", e))?;
        }

        let dims = image::image_dimensions(&cached_jpg)
            .map_err(|e| format!("Kan afmetingen van CR3-preview niet lezen: {}", e))?;
        let (w, h) = if matches!(exif.orientation, 5..=8) {
            (dims.1, dims.0)
        } else {
            dims
        };
        Ok((cached_jpg, w, h, exif))
    } else {
        let exif = if ext == "jpg" || ext == "jpeg" {
            read_jpeg_exif(source_path)
        } else {
            ExtractedExif {
                orientation: 1,
                ..Default::default()
            }
        };
        let dims = image::image_dimensions(source_path)
            .map_err(|e| format!("Kan afmetingen van afbeelding niet lezen: {}", e))?;
        let (w, h) = if matches!(exif.orientation, 5..=8) {
            (dims.1, dims.0)
        } else {
            dims
        };
        Ok((source_path.to_path_buf(), w, h, exif))
    }
}

/// Loads a `DynamicImage` from `.jpg`, `.png`, or `.cr3` (with EXIF orientation applied).
pub fn load_image_for_processing(source_path: &Path) -> Result<DynamicImage, String> {
    let ext = source_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "cr3" {
        let (bytes, orientation) = extract_cr3_preview_bytes(source_path)?;
        let img = image::load_from_memory(&bytes)
            .map_err(|e| format!("Kan CR3-preview niet decoderen: {}", e))?;
        Ok(apply_exif_orientation(img, orientation))
    } else {
        let orientation = if ext == "jpg" || ext == "jpeg" {
            read_jpeg_exif(source_path).orientation
        } else {
            1
        };
        let img = image::open(source_path)
            .map_err(|e| format!("Kan afbeelding niet openen ({}): {}", source_path.display(), e))?;
        Ok(apply_exif_orientation(img, orientation))
    }
}
