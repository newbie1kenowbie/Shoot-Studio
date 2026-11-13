import {
  ColorAdjustments,
  EnhanceIntensity,
  PhotoItem,
  WatermarkSettings,
} from '../types/studio';

export interface BrowserCullingOutcome {
  id: string;
  sharpnessScore: number;
  dHash: string;
  duplicateGroupId: string | null;
  status: 'geselecteerd' | 'afgekeurd';
  cullReason: string;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Kan afbeelding niet laden: ${src}`));
    img.src = src;
  });
}

function computeLaplacianSharpness(
  data: Uint8ClampedArray,
  w: number,
  h: number
): number {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    gray[i] = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
  }

  const xStart = Math.max(1, Math.floor(w * 0.15));
  const xEnd = Math.min(w - 1, Math.floor(w * 0.85));
  const yStart = Math.max(1, Math.floor(h * 0.15));
  const yEnd = Math.min(h - 1, Math.floor(h * 0.85));

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const idx = y * w + x;
      const lap =
        gray[idx - w] +
        gray[idx + w] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  return Math.min(100, Math.max(0, (Math.sqrt(variance) / 28) * 100));
}

function computeDHashBigInt(img: HTMLImageElement): bigint {
  const canvas = document.createElement('canvas');
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0n;

  ctx.drawImage(img, 0, 0, 9, 8);
  const { data } = ctx.getImageData(0, 0, 9, 8);

  const luma = (x: number, y: number) => {
    const i = (y * 9 + x) * 4;
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  };

  let hash = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (luma(x, y) > luma(x + 1, y)) {
        hash |= 1n << bit;
      }
      bit += 1n;
    }
  }
  return hash;
}

function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let dist = 0;
  while (xor > 0n) {
    dist += Number(xor & 1n);
    xor >>= 1n;
  }
  return dist;
}

export async function analyzeShootInBrowser(
  photos: PhotoItem[],
  minSharpnessThreshold: number,
  duplicateHammingThreshold: number
): Promise<BrowserCullingOutcome[]> {
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = 512;
  analysisCanvas.height = 384;
  const ctx = analysisCanvas.getContext('2d');

  const metrics: Array<{ id: string; sharpness: number; hash: bigint }> = [];

  for (const photo of photos) {
    try {
      const img = await loadHtmlImage(photo.previewUrl);
      let sharpness = 50;
      if (ctx) {
        ctx.clearRect(0, 0, 512, 384);
        ctx.drawImage(img, 0, 0, 512, 384);
        const imgData = ctx.getImageData(0, 0, 512, 384);
        sharpness = computeLaplacianSharpness(imgData.data, 512, 384);
      }
      const hash = computeDHashBigInt(img);
      metrics.push({ id: photo.id, sharpness, hash });
    } catch {
      metrics.push({ id: photo.id, sharpness: 0, hash: 0n });
    }
  }

  // Cluster near-duplicate bursts via dHash Hamming distance
  const visited = new Array<boolean>(metrics.length).fill(false);
  const groupAssignments = new Array<number | null>(metrics.length).fill(null);
  let groupCounter = 0;

  for (let i = 0; i < metrics.length; i++) {
    if (visited[i]) continue;
    const cluster = [i];
    visited[i] = true;

    for (let j = i + 1; j < metrics.length; j++) {
      if (visited[j]) continue;
      if (hammingDistance(metrics[i].hash, metrics[j].hash) <= duplicateHammingThreshold) {
        visited[j] = true;
        cluster.push(j);
      }
    }

    if (cluster.length > 1) {
      groupCounter++;
      for (const idx of cluster) {
        groupAssignments[idx] = groupCounter;
      }
    }
  }

  const bestInGroup = new Map<number, number>();
  groupAssignments.forEach((groupId, idx) => {
    if (groupId === null) return;
    const prevBest = bestInGroup.get(groupId);
    if (prevBest === undefined || metrics[idx].sharpness > metrics[prevBest].sharpness) {
      bestInGroup.set(groupId, idx);
    }
  });

  return metrics.map((m, idx) => {
    const groupId = groupAssignments[idx];
    const duplicateGroupId =
      groupId !== null ? `Serie ${String(groupId).padStart(2, '0')}` : null;
    const roundedSharpness = Math.round(m.sharpness);

    if (roundedSharpness < minSharpnessThreshold) {
      return {
        id: m.id,
        sharpnessScore: roundedSharpness,
        dHash: m.hash.toString(16).padStart(16, '0'),
        duplicateGroupId,
        status: 'afgekeurd',
        cullReason: `Lage scherpte (${roundedSharpness}/100)`,
      };
    }

    if (groupId !== null) {
      if (bestInGroup.get(groupId) === idx) {
        return {
          id: m.id,
          sharpnessScore: roundedSharpness,
          dHash: m.hash.toString(16).padStart(16, '0'),
          duplicateGroupId,
          status: 'geselecteerd',
          cullReason: 'Scherpste in burst-serie',
        };
      }
      return {
        id: m.id,
        sharpnessScore: roundedSharpness,
        dHash: m.hash.toString(16).padStart(16, '0'),
        duplicateGroupId,
        status: 'afgekeurd',
        cullReason: 'Dubbele opname in serie',
      };
    }

    return {
      id: m.id,
      sharpnessScore: roundedSharpness,
      dHash: m.hash.toString(16).padStart(16, '0'),
      duplicateGroupId: null,
      status: 'geselecteerd',
      cullReason: 'Scherp & uniek beeld',
    };
  });
}

/**
 * Fast edge-preserving bilateral noise reduction (luminance + stronger chroma smoothing)
 * using a precomputed 256-entry luminance range lookup table (zero Math.exp inside pixel loop).
 */
export function applyBilateralNoiseReduction(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  amount: number
): void {
  if (amount <= 0 || w < 5 || h < 5) return;

  const strength = Math.min(1, Math.max(0, amount / 100));
  const sigmaRange = 8 + strength * 42;
  const invTwoSigmaSq = 1 / (2 * sigmaRange * sigmaRange);

  // Precomputed LUT for |luma_neighbor - luma_center| in 0..255
  const rangeLut = new Float32Array(256);
  for (let d = 0; d < 256; d++) {
    rangeLut[d] = Math.exp(-(d * d) * invTwoSigmaSq);
  }

  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    luma[i] = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
  }

  const src = new Uint8ClampedArray(data);
  const radius = strength > 0.45 ? 2 : 1;
  const spatialWeights =
    radius === 2
      ? [0.25, 0.6, 1.0, 0.6, 0.25]
      : [0.55, 1.0, 0.55];

  const lumaBlend = strength * 0.78;
  const chromaBlend = Math.min(1, strength * 1.15);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const centerIdx = y * w + x;
      const centerP = centerIdx * 4;
      const y0 = luma[centerIdx];

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumW = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        const ny = Math.min(h - 1, Math.max(0, y + dy));
        const wy = spatialWeights[dy + radius];
        const rowOffset = ny * w;

        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.min(w - 1, Math.max(0, x + dx));
          const nIdx = rowOffset + nx;
          const diff = Math.min(255, Math.round(Math.abs(luma[nIdx] - y0)));
          const weight = wy * spatialWeights[dx + radius] * rangeLut[diff];

          const np = nIdx * 4;
          sumR += src[np] * weight;
          sumG += src[np + 1] * weight;
          sumB += src[np + 2] * weight;
          sumW += weight;
        }
      }

      if (sumW > 0) {
        const filtR = sumR / sumW;
        const filtG = sumG / sumW;
        const filtB = sumB / sumW;

        const origR = src[centerP];
        const origG = src[centerP + 1];
        const origB = src[centerP + 2];

        const filtY = 0.2126 * filtR + 0.7152 * filtG + 0.0722 * filtB;
        const outY = y0 + (filtY - y0) * lumaBlend;

        // Smooth chroma channels stronger than luminance to remove color noise cleanly
        const origCr = origR - y0;
        const origCb = origB - y0;
        const origCg = origG - y0;

        const filtCr = filtR - filtY;
        const filtCb = filtB - filtY;
        const filtCg = filtG - filtY;

        const outR = outY + origCr + (filtCr - origCr) * chromaBlend;
        const outG = outY + origCg + (filtCg - origCg) * chromaBlend;
        const outB = outY + origCb + (filtCb - origCb) * chromaBlend;

        data[centerP] = Math.min(255, Math.max(0, Math.round(outR)));
        data[centerP + 1] = Math.min(255, Math.max(0, Math.round(outG)));
        data[centerP + 2] = Math.min(255, Math.max(0, Math.round(outB)));
      }
    }
  }
}

/**
 * Edge-aware luminance Unsharp Mask sharpening (3x3 Gaussian blur residual).
 * Enhances micro-contrast and optical crispness without halos on flat skies/skin.
 */
export function applyUnsharpMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  amount: number
): void {
  if (amount <= 0 || w < 3 || h < 3) return;
  const strength = Math.min(1, Math.max(0, amount / 100)) * 1.45;
  const src = new Uint8ClampedArray(data);

  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = row + x;
      const p = idx * 4;

      const cLuma =
        0.2126 * src[p] + 0.7152 * src[p + 1] + 0.0722 * src[p + 2];

      let blurLuma = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const nRow = (y + dy) * w;
        const wy = dy === 0 ? 2 : 1;
        for (let dx = -1; dx <= 1; dx++) {
          const np = (nRow + x + dx) * 4;
          const weight = wy * (dx === 0 ? 2 : 1);
          blurLuma +=
            (0.2126 * src[np] + 0.7152 * src[np + 1] + 0.0722 * src[np + 2]) *
            weight;
        }
      }
      blurLuma /= 16;

      const detail = cLuma - blurLuma;
      // Soft threshold avoids amplifying faint sensor noise in smooth areas
      if (Math.abs(detail) < 2.2) continue;
      const delta = Math.max(-42, Math.min(42, detail * strength));

      data[p] = Math.min(255, Math.max(0, Math.round(src[p] + delta)));
      data[p + 1] = Math.min(255, Math.max(0, Math.round(src[p + 1] + delta)));
      data[p + 2] = Math.min(255, Math.max(0, Math.round(src[p + 2] + delta)));
    }
  }
}

export async function renderDetailPreviewUrl(
  srcUrl: string,
  noiseReduction: number,
  sharpening: number
): Promise<string> {
  const img = await loadHtmlImage(srcUrl);
  const srcW = img.naturalWidth || 1280;
  const srcH = img.naturalHeight || 960;
  const maxDim = 1200;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(8, Math.round(srcW * scale));
  const h = Math.max(8, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return srcUrl;

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  if (noiseReduction > 0) {
    applyBilateralNoiseReduction(imgData.data, w, h, noiseReduction);
  }
  if (sharpening > 0) {
    applyUnsharpMask(imgData.data, w, h, sharpening);
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.9);
}

export interface AiEnhancementResult {
  adjustments: ColorAdjustments;
  summary: string;
}

/**
 * Local pixel-histogram & color-cast AI photo enhancer.
 * Analyzes tonal percentiles, white-balance cast, chroma saturation,
 * and high-frequency noise floor to calibrate tailored edits per photo.
 */
export async function analyzeAndEnhancePhoto(
  photo: PhotoItem,
  intensity: EnhanceIntensity
): Promise<AiEnhancementResult> {
  const img = await loadHtmlImage(photo.previewUrl);
  const w = 320;
  const h = 240;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      adjustments: { ...photo.adjustments },
      summary: 'Standaard profiel behouden',
    };
  }

  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const hist = new Uint32Array(256);
  const lumaGrid = new Float32Array(w * h);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let midCount = 0;
  let chromaSum = 0;
  const totalPixels = w * h;

  for (let i = 0; i < totalPixels; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaGrid[i] = y;
    const yi = Math.min(255, Math.max(0, Math.round(y)));
    hist[yi]++;

    if (y > 32 && y < 224) {
      sumR += r;
      sumG += g;
      sumB += b;
      midCount++;
    }

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    chromaSum += maxC - minC;
  }

  const percentile = (pct: number) => {
    const target = totalPixels * pct;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return i;
    }
    return 255;
  };

  const p05 = percentile(0.05);
  const p50 = percentile(0.5);
  const p95 = percentile(0.95);
  const p98 = percentile(0.98);

  // Estimate noise vs texture from Laplacian in mid/shadow regions
  let noiseAccum = 0;
  let noiseSamples = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const lap = Math.abs(
        lumaGrid[idx - w] +
          lumaGrid[idx + w] +
          lumaGrid[idx - 1] +
          lumaGrid[idx + 1] -
          4 * lumaGrid[idx]
      );
      if (lap < 28) {
        noiseAccum += lap;
        noiseSamples++;
      }
    }
  }
  const avgMicroNoise = noiseSamples > 0 ? noiseAccum / noiseSamples : 4;

  const mult = intensity === 'subtiel' ? 0.65 : intensity === 'krachtig' ? 1.3 : 1.0;

  // 1. Exposure targeting balanced median (~124) while guarding p98 highlights
  let exposure = ((124 - p50) / 115) * mult;
  if (p98 > 246 && exposure > 0) {
    exposure = Math.min(exposure, 0.1);
  }
  if (p95 > 244 && p50 > 135) {
    exposure = Math.min(exposure, -0.25 * mult);
  }
  exposure = Math.round(Math.max(-1.2, Math.min(1.2, exposure)) * 20) / 20;

  // 2. Contrast based on dynamic range spread (p95 - p05)
  const spread = p95 - p05;
  let contrast = 0;
  if (spread < 155) {
    contrast = Math.round(Math.min(34, ((165 - spread) / 95) * 28 * mult));
  } else if (spread < 195) {
    contrast = Math.round(10 * mult);
  } else {
    contrast = Math.round(4 * mult);
  }

  // 3. White balance counter-shift (warm tungsten vs cool shade)
  let whiteBalance = 0;
  if (midCount > 0) {
    const avgR = sumR / midCount;
    const avgB = sumB / midCount;
    const warmthBias = (avgR - avgB) / 255;
    // Gently neutralize heavy color casts while keeping golden hour warmth natural
    if (Math.abs(warmthBias) > 0.04) {
      whiteBalance = Math.round(
        Math.max(-35, Math.min(35, -warmthBias * 145 * mult))
      );
    }
  }

  // 4. Saturation boost based on average chroma
  const avgChroma = chromaSum / totalPixels;
  let saturation = 0;
  if (avgChroma < 36) {
    saturation = Math.round(Math.min(28, ((42 - avgChroma) / 26) * 20 * mult));
  } else if (avgChroma < 64) {
    saturation = Math.round(8 * mult);
  }

  // 5. Noise Reduction from ISO + micro-noise floor
  const isoFactor = photo.exif.iso >= 1600 ? 32 : photo.exif.iso >= 800 ? 18 : 0;
  const rawNoiseEst = Math.round(
    Math.max(0, (avgMicroNoise - 3.2) * 8.5 + isoFactor) * mult
  );
  const noiseReduction = Math.min(75, rawNoiseEst);

  // 6. Smart Sharpening (higher for softer frames, moderated if heavy noise)
  const sharpnessBase =
    photo.sharpnessScore !== null && photo.sharpnessScore < 42 ? 38 : 24;
  const sharpening = Math.min(
    65,
    Math.round(Math.max(10, sharpnessBase * mult - noiseReduction * 0.18))
  );

  const notes: string[] = [];
  if (Math.abs(exposure) >= 0.1) {
    notes.push(
      `Belichting ${exposure > 0 ? '+' : ''}${exposure.toFixed(2)} EV`
    );
  }
  if (contrast > 0) notes.push(`Contrast +${contrast}`);
  if (Math.abs(whiteBalance) >= 4) {
    notes.push(
      `Witbalans ${whiteBalance > 0 ? `+${whiteBalance}` : whiteBalance}`
    );
  }
  if (noiseReduction >= 12) notes.push(`Ruis -${noiseReduction}%`);
  notes.push(`Verscherping +${sharpening}%`);

  return {
    adjustments: {
      exposure,
      contrast,
      whiteBalance,
      saturation,
      noiseReduction,
      sharpening,
    },
    summary: notes.join(' · '),
  };
}

export async function renderGradedPhotoBlob(
  photo: PhotoItem,
  watermark: WatermarkSettings
): Promise<Blob> {
  const img = await loadHtmlImage(photo.previewUrl);
  const w = img.naturalWidth || photo.width || 1600;
  const h = img.naturalHeight || photo.height || 1200;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D-context niet beschikbaar');
  }

  ctx.drawImage(img, 0, 0, w, h);

  const adj: ColorAdjustments = photo.adjustments;
  const needsDenoise = adj.noiseReduction > 0;
  const needsSharpen = adj.sharpening > 0;
  const needsGrading =
    adj.exposure !== 0 ||
    adj.contrast !== 0 ||
    adj.whiteBalance !== 0 ||
    adj.saturation !== 0;

  if (needsDenoise || needsSharpen || needsGrading) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    if (needsDenoise) {
      applyBilateralNoiseReduction(data, w, h, adj.noiseReduction);
    }

    if (needsGrading) {
      const exposureMult = Math.pow(2, adj.exposure);
      const contrastFactor = 1 + (adj.contrast / 100) * 0.85;
      const wbShift = adj.whiteBalance / 100;
      const satFactor = 1 + adj.saturation / 100;
      const rWb = 1 + wbShift * 0.22;
      const bWb = 1 - wbShift * 0.22;

      for (let i = 0; i < data.length; i += 4) {
        let r = (data[i] / 255) * exposureMult * rWb;
        let g = (data[i + 1] / 255) * exposureMult;
        let b = (data[i + 2] / 255) * exposureMult * bWb;

        r = (r - 0.5) * contrastFactor + 0.5;
        g = (g - 0.5) * contrastFactor + 0.5;
        b = (b - 0.5) * contrastFactor + 0.5;

        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = luma + (r - luma) * satFactor;
        g = luma + (g - luma) * satFactor;
        b = luma + (b - luma) * satFactor;

        data[i] = Math.min(255, Math.max(0, Math.round(r * 255)));
        data[i + 1] = Math.min(255, Math.max(0, Math.round(g * 255)));
        data[i + 2] = Math.min(255, Math.max(0, Math.round(b * 255)));
      }
    }

    if (needsSharpen) {
      applyUnsharpMask(data, w, h, adj.sharpening);
    }

    ctx.putImageData(imgData, 0, 0);
  }

  if (watermark.enabled && watermark.pngUrl) {
    const wmImg = await loadHtmlImage(watermark.pngUrl);
    const targetW = Math.max(24, w * watermark.scale);
    const aspect = (wmImg.naturalHeight || 1) / Math.max(1, wmImg.naturalWidth || 1);
    const targetH = targetW * aspect;
    const centerX = w * watermark.xNorm;
    const centerY = h * watermark.yNorm;

    ctx.save();
    ctx.globalAlpha = watermark.opacity;
    ctx.drawImage(
      wmImg,
      centerX - targetW / 2,
      centerY - targetH / 2,
      targetW,
      targetH
    );
    ctx.restore();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('JPEG-export mislukt'));
      },
      'image/jpeg',
      0.92
    );
  });
}

/** Generates a crisp transparent studio PNG watermark so users can test dragging immediately */
export function createBuiltInStudioWatermarkPng(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, 640, 180);

  // Subtle camera aperture mark + clean studio wordmark
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 44, 92, 92);
  ctx.beginPath();
  ctx.arc(66, 90, 26, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.font = '600 44px "Plus Jakarta Sans", sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText('SHOOT STUDIO', 136, 94);

  ctx.fillStyle = 'rgba(245, 158, 11, 0.95)';
  ctx.font = '500 20px "JetBrains Mono", monospace';
  ctx.letterSpacing = '6px';
  ctx.fillText('PHOTOGRAPHY · ARCHIVE', 138, 130);

  return canvas.toDataURL('image/png');
}
