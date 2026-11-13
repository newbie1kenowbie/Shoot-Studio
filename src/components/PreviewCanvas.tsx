import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Move,
  RotateCcw,
  X,
} from 'lucide-react';
import { CullingStatus, PhotoItem, WatermarkSettings } from '../types/studio';

interface PreviewCanvasProps {
  photo: PhotoItem | null;
  watermark: WatermarkSettings;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSetStatus: (photoId: string, status: CullingStatus) => void;
  onUpdateWatermarkPosition: (xNorm: number, yNorm: number) => void;
  onOpenFolder: () => void;
}

export function PreviewCanvas({
  photo,
  watermark,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onSetStatus,
  onUpdateWatermarkPosition,
  onOpenFolder,
}: PreviewCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageRect, setImageRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [isDraggingWatermark, setIsDraggingWatermark] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [imgError, setImgError] = useState(false);

  const measureImageBox = () => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return;
    const sRect = stage.getBoundingClientRect();
    const iRect = img.getBoundingClientRect();
    if (iRect.width > 0 && iRect.height > 0) {
      setImageRect({
        left: iRect.left - sRect.left,
        top: iRect.top - sRect.top,
        width: iRect.width,
        height: iRect.height,
      });
    }
  };

  useEffect(() => {
    setImgError(false);
  }, [photo?.id, photo?.previewUrl]);

  useEffect(() => {
    measureImageBox();
    const observer = new ResizeObserver(measureImageBox);
    if (stageRef.current) observer.observe(stageRef.current);
    if (imgRef.current) observer.observe(imgRef.current);
    window.addEventListener('resize', measureImageBox);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measureImageBox);
    };
  }, [photo?.id, photo?.previewUrl]);

  // Compute exact 5x4 color matrix matching the Rust export pipeline
  const colorMatrixValues = useMemo(() => {
    if (!photo || showOriginal) {
      return '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0';
    }
    const { exposure, contrast, whiteBalance, saturation } = photo.adjustments;
    const exp = Math.pow(2, exposure);
    const con = 1 + (contrast / 100) * 0.85;
    const wb = whiteBalance / 100;
    const sat = 1 + saturation / 100;

    const rWb = 1 + wb * 0.22;
    const bWb = 1 - wb * 0.22;

    // Saturation matrix coefficients (Rec.709)
    const lr = 0.2126 * (1 - sat);
    const lg = 0.7152 * (1 - sat);
    const lb = 0.0722 * (1 - sat);

    const sr0 = lr + sat;
    const sr1 = lg;
    const sr2 = lb;

    const sg0 = lr;
    const sg1 = lg + sat;
    const sg2 = lb;

    const sb0 = lr;
    const sb1 = lg;
    const sb2 = lb + sat;

    // Apply Exposure & WB first, then Contrast around 0.5, then Saturation
    const m00 = sr0 * con * exp * rWb;
    const m01 = sr1 * con * exp;
    const m02 = sr2 * con * exp * bWb;

    const m10 = sg0 * con * exp * rWb;
    const m11 = sg1 * con * exp;
    const m12 = sg2 * con * exp * bWb;

    const m20 = sb0 * con * exp * rWb;
    const m21 = sb1 * con * exp;
    const m22 = sb2 * con * exp * bWb;

    const offset = 0.5 * (1 - con);

    return [
      m00.toFixed(4), m01.toFixed(4), m02.toFixed(4), '0', offset.toFixed(4),
      m10.toFixed(4), m11.toFixed(4), m12.toFixed(4), '0', offset.toFixed(4),
      m20.toFixed(4), m21.toFixed(4), m22.toFixed(4), '0', offset.toFixed(4),
      '0', '0', '0', '1', '0',
    ].join(' ');
  }, [photo, showOriginal]);

  const handleWatermarkPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!imageRect) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    setIsDraggingWatermark(true);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startXNorm = watermark.xNorm;
    const startYNorm = watermark.yNorm;

    const onMove = (moveEvt: PointerEvent) => {
      const dx = (moveEvt.clientX - startClientX) / Math.max(1, imageRect.width);
      const dy = (moveEvt.clientY - startClientY) / Math.max(1, imageRect.height);
      const nextX = Math.min(0.96, Math.max(0.04, startXNorm + dx));
      const nextY = Math.min(0.96, Math.max(0.04, startYNorm + dy));
      onUpdateWatermarkPosition(nextX, nextY);
    };

    const onUp = (upEvt: PointerEvent) => {
      setIsDraggingWatermark(false);
      if (target.hasPointerCapture(upEvt.pointerId)) {
        target.releasePointerCapture(upEvt.pointerId);
      }
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    };

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  if (!photo) {
    return (
      <section className="flex-1 bg-[#07080A] flex flex-col items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-4">
          <h2 className="text-lg font-semibold text-[#F3F4F6]">
            Geen foto’s in deze weergave
          </h2>
          <p className="text-sm text-[#9CA3AF] leading-relaxed">
            Pas het filter aan of open een lokale map met .JPG-, .PNG- of Canon .CR3
            RAW-bestanden om te starten.
          </p>
          <button
            type="button"
            onClick={onOpenFolder}
            className="px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-[#0B0C0E] text-xs font-semibold transition-colors cursor-pointer"
          >
            Map openen
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#07080A] relative select-none">
      {/* Hidden SVG filter matrix for real-time color grading */}
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <filter id="shoot-studio-grade" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={colorMatrixValues} />
          </filter>
        </defs>
      </svg>

      {/* Main viewport stage */}
      <div
        ref={stageRef}
        className="flex-1 min-h-0 relative flex items-center justify-center p-6 overflow-hidden"
      >
        {!imgError ? (
          <img
            ref={imgRef}
            src={photo.previewUrl}
            alt={photo.fileName}
            referrerPolicy="no-referrer"
            onLoad={measureImageBox}
            onError={() => setImgError(true)}
            draggable={false}
            style={{ filter: 'url(#shoot-studio-grade)' }}
            className="max-w-full max-h-full object-contain shadow-2xl rounded-[2px] transition-[filter] duration-75"
          />
        ) : (
          <div className="w-96 h-64 rounded-lg border border-[#242832] bg-[#121418] flex flex-col items-center justify-center p-6 text-center">
            <span className="text-sm font-medium text-[#E5E7EB]">{photo.fileName}</span>
            <span className="text-xs text-[#9CA3AF] mt-1">
              Voorvertoning kon niet worden geladen
            </span>
          </div>
        )}

        {/* Interactive Draggable Watermark Overlay bounded to exact image dimensions */}
        {watermark.enabled && watermark.pngUrl && imageRect && !showOriginal && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: imageRect.left,
              top: imageRect.top,
              width: imageRect.width,
              height: imageRect.height,
            }}
          >
            {isDraggingWatermark && (
              <>
                <div
                  className="absolute inset-y-0 border-l border-dashed border-amber-400/50"
                  style={{ left: `${watermark.xNorm * 100}%` }}
                />
                <div
                  className="absolute inset-x-0 border-t border-dashed border-amber-400/50"
                  style={{ top: `${watermark.yNorm * 100}%` }}
                />
              </>
            )}

            <div
              onPointerDown={handleWatermarkPointerDown}
              title="Sleep om de positie van het watermerk te bepalen"
              style={{
                left: `${watermark.xNorm * 100}%`,
                top: `${watermark.yNorm * 100}%`,
                width: `${watermark.scale * 100}%`,
                transform: 'translate(-50%, -50%)',
                opacity: watermark.opacity,
              }}
              className={`absolute pointer-events-auto group ${
                isDraggingWatermark ? 'cursor-grabbing' : 'cursor-grab'
              }`}
            >
              <div
                className={`relative rounded border transition-colors ${
                  isDraggingWatermark
                    ? 'border-amber-400 bg-amber-500/10'
                    : 'border-transparent hover:border-amber-400/70'
                }`}
              >
                <img
                  src={watermark.pngUrl}
                  alt="Watermerk voorbeeld"
                  draggable={false}
                  className="w-full h-auto block pointer-events-none"
                />
                <span
                  className={`absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-[#111318]/90 border border-[#2C313D] text-[11px] font-mono-tabular text-[#F3F4F6] whitespace-nowrap transition-opacity flex items-center gap-1 ${
                    isDraggingWatermark
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Move className="w-3 h-3 text-amber-400" />
                  {Math.round(watermark.xNorm * 100)}% · {Math.round(watermark.yNorm * 100)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Left / Right navigation arrows */}
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label="Vorige foto"
          className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#111318]/85 hover:bg-[#1E222B] border border-[#2A2F3B] flex items-center justify-center text-[#E5E7EB] disabled:opacity-25 transition-colors cursor-pointer disabled:cursor-default"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Volgende foto"
          className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#111318]/85 hover:bg-[#1E222B] border border-[#2A2F3B] flex items-center justify-center text-[#E5E7EB] disabled:opacity-25 transition-colors cursor-pointer disabled:cursor-default"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Before / After indicator when comparing */}
        {showOriginal && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded bg-[#111318]/90 border border-[#2C313D] text-xs font-medium text-[#E5E7EB]">
            Origineel (onbewerkt)
          </div>
        )}
      </div>

      {/* Bottom Loupe Inspection Strip */}
      <div className="h-11 shrink-0 border-t border-[#1E222B] bg-[#101216] px-5 flex items-center justify-between gap-4">
        {/* Culling quick actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              onSetStatus(
                photo.id,
                photo.status === 'geselecteerd' ? 'onbeoordeeld' : 'geselecteerd'
              )
            }
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              photo.status === 'geselecteerd'
                ? 'bg-[#132B21] border-emerald-500/50 text-emerald-300'
                : 'bg-[#171A21] border-[#282D38] text-[#D1D5DB] hover:border-[#3A4152]'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>Geselecteerd</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onSetStatus(
                photo.id,
                photo.status === 'afgekeurd' ? 'onbeoordeeld' : 'afgekeurd'
              )
            }
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              photo.status === 'afgekeurd'
                ? 'bg-[#2E1619] border-rose-500/50 text-rose-300'
                : 'bg-[#171A21] border-[#282D38] text-[#D1D5DB] hover:border-[#3A4152]'
            }`}
          >
            <X className="w-3.5 h-3.5" />
            <span>Afgekeurd</span>
          </button>

          {photo.status !== 'onbeoordeeld' && (
            <button
              type="button"
              onClick={() => onSetStatus(photo.id, 'onbeoordeeld')}
              title="Beoordeling wissen"
              className="p-1.5 rounded text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-[#1B1F27] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Unboxed EXIF & Sharpness metadata */}
        <div className="hidden md:flex items-center gap-2 text-xs text-[#9CA3AF] font-mono-tabular truncate">
          <span className="text-[#E5E7EB] font-medium">{photo.fileName}</span>
          <span aria-hidden="true">·</span>
          <span>
            {photo.width}×{photo.height}
          </span>
          <span aria-hidden="true">·</span>
          <span>{photo.exif.camera}</span>
          <span aria-hidden="true">·</span>
          <span>{photo.exif.focalLength}</span>
          <span aria-hidden="true">·</span>
          <span>{photo.exif.aperture}</span>
          <span aria-hidden="true">·</span>
          <span>{photo.exif.shutterSpeed}</span>
          <span aria-hidden="true">·</span>
          <span>ISO {photo.exif.iso}</span>
          {photo.sharpnessScore !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-amber-400">Scherpte {photo.sharpnessScore}</span>
            </>
          )}
        </div>

        {/* Before / After compare toggle */}
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            showOriginal
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-[#171A21] border-[#282D38] text-[#D1D5DB] hover:border-[#3A4152]'
          }`}
        >
          <Columns2 className="w-3.5 h-3.5" />
          <span>Voor / Na</span>
        </button>
      </div>
    </section>
  );
}
