import { ExifSummary } from '../types/studio';

export interface Cr3ExtractionResult {
  previewUrl: string;
  width: number;
  height: number;
  exif?: Partial<ExifSummary>;
}

const CANON_UUID_HEX = '85c0b687820f11e08111f4ce462b6a48';

function readUint16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function readUint32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) |
      (buf[off + 1] << 16) |
      (buf[off + 2] << 8) |
      buf[off + 3]) >>>
    0
  );
}

function readUint64BE(buf: Uint8Array, off: number): number {
  const hi = readUint32BE(buf, off);
  const lo = readUint32BE(buf, off + 4);
  return hi * 4294967296 + lo;
}

function readAscii(buf: Uint8Array, off: number, len: number): string {
  let out = '';
  for (let i = 0; i < len && off + i < buf.length; i++) {
    out += String.fromCharCode(buf[off + i]);
  }
  return out;
}

function bytesToHex(buf: Uint8Array, off: number, len: number): string {
  let hex = '';
  for (let i = 0; i < len && off + i < buf.length; i++) {
    hex += buf[off + i].toString(16).padStart(2, '0');
  }
  return hex;
}

interface IsoBox {
  type: string;
  start: number;
  dataStart: number;
  end: number;
}

function* iterIsoBoxes(
  buf: Uint8Array,
  start: number,
  end: number
): Generator<IsoBox> {
  let pos = start;
  while (pos + 8 <= end) {
    const size32 = readUint32BE(buf, pos);
    const type = readAscii(buf, pos + 4, 4);
    let boxSize = size32;
    let headerSize = 8;

    if (size32 === 1) {
      if (pos + 16 > end) break;
      boxSize = readUint64BE(buf, pos + 8);
      headerSize = 16;
    } else if (size32 === 0) {
      boxSize = end - pos;
    }

    if (boxSize < headerSize || pos + boxSize > end) break;
    yield {
      type,
      start: pos,
      dataStart: pos + headerSize,
      end: pos + boxSize,
    };
    pos += boxSize;
  }
}

function extractTrackSampleJpegs(
  buf: Uint8Array,
  stblStart: number,
  stblEnd: number
): Array<{ offset: number; size: number }> {
  let sampleSizes: number[] = [];
  let uniformSize = 0;
  let chunkOffsets: number[] = [];

  for (const box of iterIsoBoxes(buf, stblStart, stblEnd)) {
    if (box.type === 'stsz' && box.dataStart + 12 <= box.end) {
      uniformSize = readUint32BE(buf, box.dataStart + 4);
      const count = readUint32BE(buf, box.dataStart + 8);
      if (uniformSize === 0) {
        for (let i = 0; i < count && box.dataStart + 12 + i * 4 + 4 <= box.end; i++) {
          sampleSizes.push(readUint32BE(buf, box.dataStart + 12 + i * 4));
        }
      } else {
        sampleSizes = new Array(count).fill(uniformSize);
      }
    } else if (box.type === 'stco' && box.dataStart + 8 <= box.end) {
      const count = readUint32BE(buf, box.dataStart + 4);
      for (let i = 0; i < count && box.dataStart + 8 + i * 4 + 4 <= box.end; i++) {
        chunkOffsets.push(readUint32BE(buf, box.dataStart + 8 + i * 4));
      }
    } else if (box.type === 'co64' && box.dataStart + 8 <= box.end) {
      const count = readUint32BE(buf, box.dataStart + 4);
      for (let i = 0; i < count && box.dataStart + 8 + i * 8 + 8 <= box.end; i++) {
        chunkOffsets.push(readUint64BE(buf, box.dataStart + 8 + i * 8));
      }
    }
  }

  const candidates: Array<{ offset: number; size: number }> = [];
  if (chunkOffsets.length > 0 && sampleSizes.length > 0) {
    // Most CR3 preview tracks have 1 sample per chunk (1 chunk = 1 full-res JPEG)
    const count = Math.min(chunkOffsets.length, sampleSizes.length);
    for (let i = 0; i < count; i++) {
      const off = chunkOffsets[i];
      const size = sampleSizes[i];
      if (
        off + size <= buf.length &&
        size > 16384 &&
        buf[off] === 0xff &&
        buf[off + 1] === 0xd8 &&
        buf[off + 2] === 0xff
      ) {
        candidates.push({ offset: off, size });
      }
    }
  }
  return candidates;
}

/**
 * Parses a TIFF IFD block (used inside Canon CMT1/CMT2 or JPEG APP1 EXIF)
 */
function parseTiffExifBlock(
  buf: Uint8Array,
  tiffStart: number,
  tiffEnd: number
): Partial<ExifSummary> {
  const result: Partial<ExifSummary> = {};
  if (tiffStart + 8 > tiffEnd) return result;

  const endian = readAscii(buf, tiffStart, 2);
  const le = endian === 'II';
  if (!le && endian !== 'MM') return result;

  const u16 = (off: number) =>
    le ? buf[off] | (buf[off + 1] << 8) : (buf[off] << 8) | buf[off + 1];
  const u32 = (off: number) =>
    le
      ? (buf[off] |
          (buf[off + 1] << 8) |
          (buf[off + 2] << 16) |
          (buf[off + 3] << 24)) >>>
        0
      : readUint32BE(buf, off);

  const firstIfdOffset = u32(tiffStart + 4);
  const ifdPos = tiffStart + firstIfdOffset;
  if (ifdPos + 2 > tiffEnd) return result;

  const entryCount = u16(ifdPos);
  for (let i = 0; i < entryCount; i++) {
    const ePos = ifdPos + 2 + i * 12;
    if (ePos + 12 > tiffEnd) break;
    const tag = u16(ePos);
    const typ = u16(ePos + 2);
    const count = u32(ePos + 4);
    const valOff = ePos + 8;

    const getStr = () => {
      const ptr = count <= 4 ? valOff : tiffStart + u32(valOff);
      if (ptr + count > tiffEnd) return '';
      return readAscii(buf, ptr, count).replace(/\0+$/, '').trim();
    };

    const getRational = () => {
      const ptr = tiffStart + u32(valOff);
      if (ptr + 8 > tiffEnd) return null;
      const num = u32(ptr);
      const den = u32(ptr + 4);
      return den > 0 ? num / den : null;
    };

    // Model (0x0110)
    if (tag === 0x0110 && typ === 2) {
      const model = getStr();
      if (model) result.camera = model;
    }
    // LensModel (0xA434)
    if (tag === 0xa434 && typ === 2) {
      const lens = getStr();
      if (lens) result.lens = lens;
    }
    // ISO (0x8827)
    if (tag === 0x8827 && (typ === 3 || typ === 4)) {
      result.iso = typ === 3 ? u16(valOff) : u32(valOff);
    }
    // FNumber (0x829D)
    if (tag === 0x829d && typ === 5) {
      const f = getRational();
      if (f) result.aperture = `f/${Number(f.toFixed(1))}`;
    }
    // FocalLength (0x920A)
    if (tag === 0x920a && typ === 5) {
      const fl = getRational();
      if (fl) result.focalLength = `${Math.round(fl)}mm`;
    }
    // ExposureTime (0x829A)
    if (tag === 0x829a && typ === 5) {
      const exp = getRational();
      if (exp && exp > 0) {
        result.shutterSpeed =
          exp >= 1 ? `${exp.toFixed(1)}s` : `1/${Math.round(1 / exp)}s`;
      }
    }
  }

  return result;
}

/**
 * Marker-aware JPEG stream length finder.
 * Jumps cleanly over APP1 (EXIF) and other segment headers so nested TIFF thumbnails
 * (which contain their own 0xFF 0xD9 EOI) never truncate full-resolution Canon R6 JPEGs.
 */
function findCompleteJpegEnd(buf: Uint8Array, start: number): number | null {
  let pos = start + 2;
  const len = buf.length;

  while (pos + 1 < len) {
    if (buf[pos] !== 0xff) {
      pos++;
      continue;
    }
    while (pos < len && buf[pos] === 0xff) {
      pos++;
    }
    if (pos >= len) break;
    const marker = buf[pos];
    pos++;

    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8) {
      continue;
    }
    if (marker === 0xd9) {
      return pos;
    }

    if (pos + 2 > len) break;
    const segLen = readUint16BE(buf, pos);
    if (segLen < 2 || pos + segLen > len) break;
    pos += segLen;

    // After SOS (0xDA), scan entropy-coded stream for true EOI (0xFF 0xD9)
    if (marker === 0xda) {
      while (pos + 1 < len) {
        if (buf[pos] === 0xff) {
          const next = buf[pos + 1];
          if (next === 0xd9) {
            return pos + 2;
          }
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7) || next === 0xff) {
            pos += 2;
            continue;
          }
          // Another JPEG marker encountered inside/after scan
          break;
        }
        pos++;
      }
    }
  }

  return null;
}

/**
 * Extracts the highest-resolution JPEG preview and EXIF metadata from Canon `.CR3` files
 * (including EOS R6, R6 Mark II, R5, C-RAW, and HDR PQ).
 */
export async function extractCr3PreviewInBrowser(
  file: File
): Promise<Cr3ExtractionResult> {
  const buffer = new Uint8Array(await file.arrayBuffer());

  if (buffer.length < 24 || readAscii(buffer, 4, 4) !== 'ftyp') {
    throw new Error('Ongeldig Canon CR3 ISOBMFF-containerformaat.');
  }

  let bestJpegSlice: Uint8Array | null = null;
  let exifSummary: Partial<ExifSummary> = {};

  // Pass 1: Walk ISOBMFF boxes (`moov` -> `trak` / Canon `uuid` `PRVW` / `CMT1` / `CMT2`)
  for (const topBox of iterIsoBoxes(buffer, 0, buffer.length)) {
    if (topBox.type !== 'moov') continue;

    for (const child of iterIsoBoxes(buffer, topBox.dataStart, topBox.end)) {
      if (child.type === 'trak') {
        for (const tChild of iterIsoBoxes(buffer, child.dataStart, child.end)) {
          if (tChild.type !== 'mdia') continue;
          for (const mChild of iterIsoBoxes(buffer, tChild.dataStart, tChild.end)) {
            if (mChild.type !== 'minf') continue;
            for (const minfChild of iterIsoBoxes(buffer, mChild.dataStart, mChild.end)) {
              if (minfChild.type !== 'stbl') continue;
              const jpegs = extractTrackSampleJpegs(
                buffer,
                minfChild.dataStart,
                minfChild.end
              );
              for (const cand of jpegs) {
                if (!bestJpegSlice || cand.size > bestJpegSlice.length) {
                  bestJpegSlice = buffer.subarray(cand.offset, cand.offset + cand.size);
                }
              }
            }
          }
        }
      } else if (
        child.type === 'uuid' &&
        child.dataStart + 16 <= child.end &&
        bytesToHex(buffer, child.dataStart, 16) === CANON_UUID_HEX
      ) {
        // Canon metadata & PRVW container
        for (const cBox of iterIsoBoxes(buffer, child.dataStart + 16, child.end)) {
          if (cBox.type === 'CMT1' || cBox.type === 'CMT2') {
            const parsed = parseTiffExifBlock(buffer, cBox.dataStart, cBox.end);
            exifSummary = { ...exifSummary, ...parsed };
          } else if (cBox.type === 'PRVW' && cBox.dataStart + 16 < cBox.end) {
            // Canon PRVW box: 12..16 bytes header before embedded JPEG SOI
            const searchEnd = Math.min(cBox.end, cBox.dataStart + 32);
            for (let k = cBox.dataStart; k + 3 < searchEnd; k++) {
              if (
                buffer[k] === 0xff &&
                buffer[k + 1] === 0xd8 &&
                buffer[k + 2] === 0xff
              ) {
                const candidate = buffer.subarray(k, cBox.end);
                if (!bestJpegSlice || candidate.length > bestJpegSlice.length) {
                  bestJpegSlice = candidate;
                }
                break;
              }
            }
          }
        }
      }
    }
  }

  // Pass 2: Marker-aware JPEG scan fallback if no ISOBMFF preview track was found
  if (!bestJpegSlice) {
    let i = 0;
    while (i + 4 < buffer.length) {
      if (
        buffer[i] === 0xff &&
        buffer[i + 1] === 0xd8 &&
        buffer[i + 2] === 0xff &&
        ((buffer[i + 3] >= 0xe0 && buffer[i + 3] <= 0xef) ||
          buffer[i + 3] === 0xdb ||
          buffer[i + 3] === 0xc0)
      ) {
        const end = findCompleteJpegEnd(buffer, i);
        if (end && end - i > 32768) {
          const candidate = buffer.subarray(i, end);
          if (!bestJpegSlice || candidate.length > bestJpegSlice.length) {
            bestJpegSlice = candidate;
          }
          i = end;
          continue;
        }
      }
      i++;
    }
  }

  if (!bestJpegSlice) {
    throw new Error(`Geen geldige JPEG-voorvertoning gevonden in ${file.name}`);
  }

  // Also check APP1 EXIF inside the extracted JPEG if CMT1/CMT2 didn't provide everything
  if (!exifSummary.camera || !exifSummary.iso) {
    const app1Pos = findApp1ExifOffset(bestJpegSlice);
    if (app1Pos !== null) {
      const app1Exif = parseTiffExifBlock(
        bestJpegSlice,
        app1Pos,
        bestJpegSlice.length
      );
      exifSummary = { ...app1Exif, ...exifSummary };
    }
  }

  const blob = new Blob([new Uint8Array(bestJpegSlice)], { type: 'image/jpeg' });
  const previewUrl = URL.createObjectURL(blob);
  const dims = await getImageDimensions(previewUrl);

  return {
    previewUrl,
    width: dims.width,
    height: dims.height,
    exif: exifSummary,
  };
}

function findApp1ExifOffset(jpeg: Uint8Array): number | null {
  let pos = 2;
  const maxScan = Math.min(jpeg.length, 65536);
  while (pos + 4 < maxScan) {
    if (jpeg[pos] !== 0xff) break;
    const marker = jpeg[pos + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const segLen = readUint16BE(jpeg, pos + 2);
    if (
      marker === 0xe1 &&
      pos + 10 < jpeg.length &&
      readAscii(jpeg, pos + 4, 4) === 'Exif'
    ) {
      return pos + 10;
    }
    pos += 2 + segLen;
  }
  return null;
}

export function getImageDimensions(
  url: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || 1600,
        height: img.naturalHeight || 1200,
      });
    };
    img.onerror = () => resolve({ width: 1600, height: 1200 });
    img.src = url;
  });
}
