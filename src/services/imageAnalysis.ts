import { ColorAdjustments, PhotoItem, WatermarkSettings } from '../types/studio';

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
  const needsGrading =
    adj.exposure !== 0 ||
    adj.contrast !== 0 ||
    adj.whiteBalance !== 0 ||
    adj.saturation !== 0;

  if (needsGrading) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
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
