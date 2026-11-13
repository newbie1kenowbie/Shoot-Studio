import { ColorAdjustments } from '../types/studio';

export interface StudioPreset {
  id: string;
  name: string;
  category: string;
  isCustom?: boolean;
  adjustments: ColorAdjustments;
}

export const BUILTIN_PRESETS: StudioPreset[] = [
  {
    id: 'preset-portret-warm',
    name: 'Portret Golden Hour',
    category: 'Portret',
    adjustments: {
      exposure: 0.15,
      contrast: 10,
      whiteBalance: 18,
      saturation: 8,
      noiseReduction: 10,
      sharpening: 22,
    },
  },
  {
    id: 'preset-bruiloft-airy',
    name: 'Bruiloft Clean & Airy',
    category: 'Bruiloft',
    adjustments: {
      exposure: 0.35,
      contrast: -8,
      whiteBalance: 8,
      saturation: -6,
      noiseReduction: 8,
      sharpening: 18,
    },
  },
  {
    id: 'preset-editorial-film',
    name: 'Editorial Film Matte',
    category: 'Film',
    adjustments: {
      exposure: -0.05,
      contrast: 24,
      whiteBalance: 6,
      saturation: -16,
      noiseReduction: 12,
      sharpening: 26,
    },
  },
  {
    id: 'preset-bw-classic',
    name: 'Zwart-Wit Klassiek',
    category: 'Monochroom',
    adjustments: {
      exposure: 0.1,
      contrast: 34,
      whiteBalance: 0,
      saturation: -100,
      noiseReduction: 15,
      sharpening: 32,
    },
  },
  {
    id: 'preset-architectuur-crisp',
    name: 'Architectuur Crisp',
    category: 'Architectuur',
    adjustments: {
      exposure: 0,
      contrast: 26,
      whiteBalance: -8,
      saturation: 6,
      noiseReduction: 0,
      sharpening: 44,
    },
  },
  {
    id: 'preset-avond-lowlight',
    name: 'Avond & Low-Light',
    category: 'Receptie',
    adjustments: {
      exposure: 0.45,
      contrast: 12,
      whiteBalance: -14,
      saturation: 4,
      noiseReduction: 48,
      sharpening: 20,
    },
  },
];

const CUSTOM_PRESETS_KEY = 'shoot_studio_custom_presets_v1';

export function loadCustomPresets(): StudioPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: StudioPreset[]): void {
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Ignore storage quota issues cleanly
  }
}

function extractXmpAttrOrTag(xml: string, key: string): number | null {
  const attrRe = new RegExp(`${key}="([^"]+)"`, 'i');
  const attrMatch = xml.match(attrRe);
  if (attrMatch) {
    const num = parseFloat(attrMatch[1]);
    if (!Number.isNaN(num)) return num;
  }
  const tagRe = new RegExp(`<${key}[^>]*>([^<]+)</${key}>`, 'i');
  const tagMatch = xml.match(tagRe);
  if (tagMatch) {
    const num = parseFloat(tagMatch[1]);
    if (!Number.isNaN(num)) return num;
  }
  return null;
}

function extractXmpName(xml: string, fallbackName: string): string {
  const nameMatch = xml.match(/<crs:Name>\s*<rdf:Alt>\s*<rdf:li[^>]*>([^<]+)<\/rdf:li>/i);
  if (nameMatch?.[1]?.trim()) return nameMatch[1].trim();
  return fallbackName.replace(/\.xmp$/i, '');
}

/**
 * Parses an Adobe Lightroom / Camera Raw (.xmp) preset file into Shoot Studio adjustments.
 */
export function parseLightroomXmpPreset(
  xmlContent: string,
  fileName: string
): StudioPreset {
  const exposureRaw = extractXmpAttrOrTag(xmlContent, 'crs:Exposure2012') ?? 0;
  const contrastRaw = extractXmpAttrOrTag(xmlContent, 'crs:Contrast2012') ?? 0;
  const saturationRaw = extractXmpAttrOrTag(xmlContent, 'crs:Saturation') ?? 0;
  const vibranceRaw = extractXmpAttrOrTag(xmlContent, 'crs:Vibrance') ?? 0;
  const tempRaw =
    extractXmpAttrOrTag(xmlContent, 'crs:IncrementalTemperature') ??
    extractXmpAttrOrTag(xmlContent, 'crs:Temperature');
  const lumNoiseRaw =
    extractXmpAttrOrTag(xmlContent, 'crs:LuminanceSmoothing') ?? 0;
  const sharpnessRaw = extractXmpAttrOrTag(xmlContent, 'crs:Sharpness') ?? 0;

  let whiteBalance = 0;
  if (tempRaw !== null) {
    // Handle either incremental (-100..100) or absolute Kelvin (2000..12000, ~5500 neutral)
    if (tempRaw > 500) {
      whiteBalance = Math.round(Math.max(-100, Math.min(100, (tempRaw - 5500) / 45)));
    } else {
      whiteBalance = Math.round(Math.max(-100, Math.min(100, tempRaw)));
    }
  }

  // Check for Lightroom Grayscale/B&W flag
  const isGrayscale = /crs:ConvertToGrayscale="True"/i.test(xmlContent);

  const combinedSat = isGrayscale
    ? -100
    : Math.round(
        Math.max(-100, Math.min(100, saturationRaw + vibranceRaw * 0.45))
      );

  return {
    id: `xmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: extractXmpName(xmlContent, fileName),
    category: 'Lightroom XMP',
    isCustom: true,
    adjustments: {
      exposure: Math.round(Math.max(-2, Math.min(2, exposureRaw)) * 20) / 20,
      contrast: Math.round(Math.max(-100, Math.min(100, contrastRaw))),
      whiteBalance,
      saturation: combinedSat,
      noiseReduction: Math.round(Math.max(0, Math.min(100, lumNoiseRaw))),
      sharpening: Math.round(
        Math.max(0, Math.min(100, sharpnessRaw > 0 ? sharpnessRaw * 0.65 : 0))
      ),
    },
  };
}
