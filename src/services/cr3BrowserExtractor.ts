/**
 * Browser-side Canon .CR3 ISOBMFF preview extractor.
 * Scans the ISOBMFF container for the largest embedded JPEG preview stream
 * (SOI 0xFF 0xD8 0xFF ... EOI 0xFF 0xD9) so .CR3 RAW files preview immediately
 * in the web runtime just like the Rust backend in src-tauri/src/raw_cr3.rs.
 */
export async function extractCr3PreviewInBrowser(file: File): Promise<{
  previewUrl: string;
  width: number;
  height: number;
}> {
  const buffer = new Uint8Array(await file.arrayBuffer());

  if (buffer.length < 16) {
    throw new Error('CR3-bestand is te klein of ongeldig.');
  }

  let bestStart = -1;
  let bestEnd = -1;
  let bestLength = 0;

  let i = 0;
  const len = buffer.length;

  while (i + 3 < len) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8 && buffer[i + 2] === 0xff) {
      const marker = buffer[i + 3];
      const isValidMarker =
        (marker >= 0xe0 && marker <= 0xef) ||
        marker === 0xdb ||
        marker === 0xc0 ||
        marker === 0xc4;

      if (isValidMarker) {
        let j = i + 2;
        while (j + 1 < len) {
          if (buffer[j] === 0xff && buffer[j + 1] === 0xd9) {
            const end = j + 2;
            const streamLen = end - i;
            if (streamLen > 32768 && streamLen > bestLength) {
              bestStart = i;
              bestEnd = end;
              bestLength = streamLen;
            }
            i = end;
            break;
          }
          j += 1;
        }
        if (j + 1 >= len) break;
        continue;
      }
    }
    i += 1;
  }

  if (bestStart === -1 || bestEnd === -1) {
    throw new Error(`Geen ingesloten JPEG-voorvertoning gevonden in ${file.name}`);
  }

  const jpegBytes = buffer.slice(bestStart, bestEnd);
  const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
  const previewUrl = URL.createObjectURL(blob);
  const dims = await getImageDimensions(previewUrl);

  return {
    previewUrl,
    width: dims.width,
    height: dims.height,
  };
}

export function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
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
