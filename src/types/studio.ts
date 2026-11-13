export type CullingStatus = 'onbeoordeeld' | 'geselecteerd' | 'afgekeurd';

export type FilterMode = 'alle' | 'geselecteerd' | 'afgekeurd';

export type ViewMode = 'loupe' | 'grid';

export type InspectorTab = 'bewerken' | 'culling' | 'watermerk';

export interface ColorAdjustments {
  exposure: number; // -2.0 to +2.0 EV
  contrast: number; // -100 to +100
  whiteBalance: number; // -100 (cool) to +100 (warm)
  saturation: number; // -100 to +100
}

export interface WatermarkSettings {
  enabled: boolean;
  pngUrl: string | null;
  pngPath: string | null;
  fileName: string | null;
  scale: number; // 0.05 to 0.55 fraction of photo width
  opacity: number; // 0.05 to 1.0
  xNorm: number; // 0.0 to 1.0 center X
  yNorm: number; // 0.0 to 1.0 center Y
}

export interface ExifSummary {
  camera: string;
  lens: string;
  focalLength: string;
  aperture: string;
  shutterSpeed: string;
  iso: number;
}

export interface PhotoItem {
  id: string;
  fileName: string;
  path: string;
  previewUrl: string;
  extension: string;
  isRaw: boolean;
  width: number;
  height: number;
  fileSizeBytes: number;
  status: CullingStatus;
  sharpnessScore: number | null;
  dHash: string | null;
  duplicateGroupId: string | null;
  cullReason: string | null;
  adjustments: ColorAdjustments;
  exif: ExifSummary;
  sourceFile?: File;
}

export interface BatchExportSummary {
  exportedCount: number;
  failedCount: number;
  outputDir: string;
  durationMs: number;
  mode: 'tauri' | 'fs-access' | 'zip';
}

export const DEFAULT_ADJUSTMENTS: ColorAdjustments = {
  exposure: 0,
  contrast: 0,
  whiteBalance: 0,
  saturation: 0,
};

export const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: false,
  pngUrl: null,
  pngPath: null,
  fileName: null,
  scale: 0.22,
  opacity: 0.78,
  xNorm: 0.84,
  yNorm: 0.88,
};
