import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import JSZip from 'jszip';
import {
  BatchExportSummary,
  DEFAULT_ADJUSTMENTS,
  PhotoItem,
  WatermarkSettings,
} from '../types/studio';
import { extractCr3PreviewInBrowser, getImageDimensions } from './cr3BrowserExtractor';
import { analyzeShootInBrowser, renderGradedPhotoBlob } from './imageAnalysis';

export interface TauriScannedPhoto {
  id: string;
  fileName: string;
  path: string;
  previewPath: string;
  extension: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  isRaw: boolean;
}

export interface TauriCullingResult {
  id: string;
  sharpnessScore: number;
  dhash: number;
  duplicateGroupId: string | null;
  status: 'geselecteerd' | 'afgekeurd';
  reason: string;
}

export interface FolderLoadResult {
  folderName: string;
  sourceDirPath: string;
  photos: PhotoItem[];
  directoryHandle?: FileSystemDirectoryHandle;
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'cr3']);

function getExtension(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

async function filesToPhotoItems(files: File[]): Promise<PhotoItem[]> {
  const validFiles = files
    .filter((f) => {
      const ext = getExtension(f.name);
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || '';
      return SUPPORTED_EXTENSIONS.has(ext) && !rel.includes('Shoot_Studio_Export');
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const items: PhotoItem[] = [];

  for (const file of validFiles) {
    const ext = getExtension(file.name);
    const isRaw = ext === 'cr3';
    try {
      let previewUrl = '';
      let width = 1600;
      let height = 1200;

      if (isRaw) {
        const extracted = await extractCr3PreviewInBrowser(file);
        previewUrl = extracted.previewUrl;
        width = extracted.width;
        height = extracted.height;
      } else {
        previewUrl = URL.createObjectURL(file);
        const dims = await getImageDimensions(previewUrl);
        width = dims.width;
        height = dims.height;
      }

      items.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        fileName: file.name,
        path:
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
        previewUrl,
        extension: ext.toUpperCase(),
        isRaw,
        width,
        height,
        fileSizeBytes: file.size,
        status: 'onbeoordeeld',
        sharpnessScore: null,
        dHash: null,
        duplicateGroupId: null,
        cullReason: null,
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        exif: {
          camera: isRaw ? 'Canon EOS R5' : 'Lokale Import',
          lens: isRaw ? 'RF 50mm F1.2L' : 'Standaard profiel',
          focalLength: '50mm',
          aperture: 'f/2.0',
          shutterSpeed: '1/500s',
          iso: 200,
        },
        sourceFile: file,
      });
    } catch {
      // Skip unreadable file cleanly
    }
  }

  return items;
}

function pickFolderViaInputFallback(): Promise<FolderLoadResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.accept = '.jpg,.jpeg,.png,.cr3,.JPG,.JPEG,.PNG,.CR3';

    let settled = false;

    const cleanup = () => {
      window.removeEventListener('focus', onWindowFocus);
    };

    const onWindowFocus = () => {
      setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          settled = true;
          cleanup();
          resolve(null);
        }
      }, 400);
    };

    window.addEventListener('focus', onWindowFocus);

    input.onchange = async () => {
      settled = true;
      cleanup();
      const fileList = Array.from(input.files || []);
      if (fileList.length === 0) {
        resolve(null);
        return;
      }
      const firstRel =
        (fileList[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
      const folderName = firstRel.split('/')[0] || 'Geselecteerde map';
      const photos = await filesToPhotoItems(fileList);
      resolve({
        folderName,
        sourceDirPath: folderName,
        photos,
      });
    };

    input.click();
  });
}

export async function openSourceFolder(): Promise<FolderLoadResult | null> {
  if (isTauriRuntime()) {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: 'Kies een bronmap met foto’s (.jpg, .png, .cr3)',
    });

    if (!selected || Array.isArray(selected)) {
      return null;
    }

    const scanned = await invoke<TauriScannedPhoto[]>('scan_folder', {
      folderPath: selected,
    });

    const folderName = selected.split(/[/\\]/).filter(Boolean).pop() || selected;
    const photos: PhotoItem[] = scanned.map((item) => ({
      id: item.id,
      fileName: item.fileName,
      path: item.path,
      previewUrl: convertFileSrc(item.previewPath),
      extension: item.extension,
      isRaw: item.isRaw,
      width: item.width,
      height: item.height,
      fileSizeBytes: item.fileSizeBytes,
      status: 'onbeoordeeld',
      sharpnessScore: null,
      dHash: null,
      duplicateGroupId: null,
      cullReason: null,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      exif: {
        camera: item.isRaw ? 'Canon EOS R-serie' : 'Lokale bron',
        lens: item.isRaw ? 'Canon RF-objectief' : 'Systeembestand',
        focalLength: item.isRaw ? '50mm' : '—',
        aperture: item.isRaw ? 'f/1.8' : '—',
        shutterSpeed: item.isRaw ? '1/1000s' : '—',
        iso: item.isRaw ? 160 : 100,
      },
    }));

    return {
      folderName,
      sourceDirPath: selected,
      photos,
    };
  }

  // Try modern File System Access API first; fall back to webkitdirectory input in sandboxed iframes
  const win = window as Window & {
    showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
  };

  if (typeof win.showDirectoryPicker === 'function') {
    try {
      const dirHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
      const files: File[] = [];
      for await (const [, handle] of (
        dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>
      )) {
        if (handle.kind === 'file') {
          const file = await (handle as FileSystemFileHandle).getFile();
          files.push(file);
        }
      }
      const photos = await filesToPhotoItems(files);
      return {
        folderName: dirHandle.name,
        sourceDirPath: dirHandle.name,
        photos,
        directoryHandle: dirHandle,
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null;
      }
      // SecurityError inside cross-origin iframe -> fall back cleanly
    }
  }

  return pickFolderViaInputFallback();
}

export async function pickWatermarkPng(): Promise<{
  pngUrl: string;
  pngPath: string | null;
  fileName: string;
} | null> {
  if (isTauriRuntime()) {
    const selected = await openDialog({
      directory: false,
      multiple: false,
      title: 'Selecteer een PNG-watermerklogo',
      filters: [{ name: 'PNG Afbeelding', extensions: ['png'] }],
    });
    if (!selected || Array.isArray(selected)) return null;
    const fileName = selected.split(/[/\\]/).filter(Boolean).pop() || 'watermerk.png';
    return {
      pngUrl: convertFileSrc(selected),
      pngPath: selected,
      fileName,
    };
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/webp,image/svg+xml';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve({
        pngUrl: URL.createObjectURL(file),
        pngPath: null,
        fileName: file.name,
      });
    };
    input.click();
  });
}

export async function runAiCulling(
  photos: PhotoItem[],
  minSharpness: number,
  duplicateThreshold: number
): Promise<
  Array<{
    id: string;
    sharpnessScore: number;
    dHash: string;
    duplicateGroupId: string | null;
    status: 'geselecteerd' | 'afgekeurd';
    cullReason: string;
  }>
> {
  // Use Rust rayon backend only when photos come from local filesystem paths in Tauri
  const allNativePaths =
    isTauriRuntime() && photos.every((p) => !p.previewUrl.startsWith('/') && !p.previewUrl.startsWith('blob:'));

  if (allNativePaths) {
    const results = await invoke<TauriCullingResult[]>('analyze_shoot', {
      inputs: photos.map((p) => ({ id: p.id, path: p.path })),
      minSharpness,
      duplicateThreshold,
    });
    return results.map((r) => ({
      id: r.id,
      sharpnessScore: Math.round(r.sharpnessScore),
      dHash: r.dhash.toString(16).padStart(16, '0'),
      duplicateGroupId: r.duplicateGroupId,
      status: r.status,
      cullReason: r.reason,
    }));
  }

  return analyzeShootInBrowser(photos, minSharpness, duplicateThreshold);
}

export async function runBatchExport(params: {
  sourceDirPath: string;
  directoryHandle?: FileSystemDirectoryHandle;
  selectedPhotos: PhotoItem[];
  watermark: WatermarkSettings;
  onProgress: (completed: number, total: number, currentFile: string) => void;
}): Promise<BatchExportSummary> {
  const { sourceDirPath, directoryHandle, selectedPhotos, watermark, onProgress } = params;
  const start = performance.now();

  const allNativePaths =
    isTauriRuntime() &&
    selectedPhotos.every(
      (p) => !p.previewUrl.startsWith('/') && !p.previewUrl.startsWith('blob:')
    );

  if (allNativePaths) {
    onProgress(0, selectedPhotos.length, 'Multithreaded Rayon-verwerking...');
    const summary = await invoke<{
      exportedCount: number;
      failedCount: number;
      outputDir: string;
      durationMs: number;
    }>('export_batch', {
      sourceDir: sourceDirPath,
      items: selectedPhotos.map((p) => ({
        id: p.id,
        fileName: p.fileName,
        path: p.path,
        adjustments: {
          exposure: p.adjustments.exposure,
          contrast: p.adjustments.contrast,
          whiteBalance: p.adjustments.whiteBalance,
          saturation: p.adjustments.saturation,
          noiseReduction: p.adjustments.noiseReduction,
          sharpening: p.adjustments.sharpening,
        },
      })),
      watermark: {
        enabled: watermark.enabled,
        pngPath: watermark.pngPath,
        scale: watermark.scale,
        opacity: watermark.opacity,
        xNorm: watermark.xNorm,
        yNorm: watermark.yNorm,
      },
    });
    onProgress(selectedPhotos.length, selectedPhotos.length, 'Voltooid');
    return {
      ...summary,
      mode: 'tauri',
    };
  }

  // Browser File System Access API direct folder write
  if (directoryHandle) {
    try {
      const exportDir = await directoryHandle.getDirectoryHandle('Shoot_Studio_Export', {
        create: true,
      });

      let exported = 0;
      let failed = 0;

      for (let i = 0; i < selectedPhotos.length; i++) {
        const photo = selectedPhotos[i];
        onProgress(i, selectedPhotos.length, photo.fileName);
        try {
          const blob = await renderGradedPhotoBlob(photo, watermark);
          const stem = photo.fileName.replace(/\.[^/.]+$/, '');
          const outHandle = await exportDir.getFileHandle(`${stem}_studio.jpg`, {
            create: true,
          });
          const writable = await outHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          exported++;
        } catch {
          failed++;
        }
      }
      onProgress(selectedPhotos.length, selectedPhotos.length, 'Voltooid');
      return {
        exportedCount: exported,
        failedCount: failed,
        outputDir: `${sourceDirPath}/Shoot_Studio_Export`,
        durationMs: Math.round(performance.now() - start),
        mode: 'fs-access',
      };
    } catch {
      // Fall through to ZIP export if folder write permission was denied
    }
  }

  // Universal Browser ZIP Export containing /Shoot_Studio_Export/
  const zip = new JSZip();
  const folder = zip.folder('Shoot_Studio_Export');
  let exported = 0;
  let failed = 0;

  for (let i = 0; i < selectedPhotos.length; i++) {
    const photo = selectedPhotos[i];
    onProgress(i, selectedPhotos.length, photo.fileName);
    try {
      const blob = await renderGradedPhotoBlob(photo, watermark);
      const stem = photo.fileName.replace(/\.[^/.]+$/, '');
      folder?.file(`${stem}_studio.jpg`, blob);
      exported++;
    } catch {
      failed++;
    }
  }

  onProgress(selectedPhotos.length, selectedPhotos.length, 'ZIP-archief genereren...');
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Shoot_Studio_Export.zip';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);

  onProgress(selectedPhotos.length, selectedPhotos.length, 'Voltooid');

  return {
    exportedCount: exported,
    failedCount: failed,
    outputDir: 'Shoot_Studio_Export.zip (/Shoot_Studio_Export)',
    durationMs: Math.round(performance.now() - start),
    mode: 'zip',
  };
}
