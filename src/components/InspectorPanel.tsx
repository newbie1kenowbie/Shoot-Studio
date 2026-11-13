import {
  Check,
  CopyCheck,
  ImagePlus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Stamp,
  X,
} from 'lucide-react';
import {
  ColorAdjustments,
  InspectorTab,
  PhotoItem,
  WatermarkSettings,
} from '../types/studio';

interface InspectorPanelProps {
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  activePhoto: PhotoItem | null;
  totalPhotos: number;
  selectedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  minSharpness: number;
  duplicateThreshold: number;
  isAnalyzing: boolean;
  syncFeedback: string | null;
  watermark: WatermarkSettings;
  onChangeAdjustment: <K extends keyof ColorAdjustments>(
    key: K,
    value: ColorAdjustments[K]
  ) => void;
  onResetAdjustments: () => void;
  onSyncAdjustmentsToAll: () => void;
  onMinSharpnessChange: (val: number) => void;
  onDuplicateThresholdChange: (val: number) => void;
  onRunAiCulling: () => void;
  onResetCulling: () => void;
  onUploadWatermarkPng: () => void;
  onUseBuiltInWatermark: () => void;
  onUpdateWatermark: (patch: Partial<WatermarkSettings>) => void;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (v: number) => string;
  onChange: (val: number) => void;
  onReset: () => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
  onReset,
}: SliderRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onDoubleClick={onReset}
          title="Dubbelklik om te resetten"
          className="text-[#D1D5DB] font-medium hover:text-[#F3F4F6] cursor-pointer"
        >
          {label}
        </button>
        <span className="font-mono-tabular text-[#E5E7EB]">{formatValue(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="studio-slider"
      />
    </div>
  );
}

export function InspectorPanel({
  activeTab,
  onTabChange,
  activePhoto,
  totalPhotos,
  selectedCount,
  rejectedCount,
  duplicateCount,
  minSharpness,
  duplicateThreshold,
  isAnalyzing,
  syncFeedback,
  watermark,
  onChangeAdjustment,
  onResetAdjustments,
  onSyncAdjustmentsToAll,
  onMinSharpnessChange,
  onDuplicateThresholdChange,
  onRunAiCulling,
  onResetCulling,
  onUploadWatermarkPng,
  onUseBuiltInWatermark,
  onUpdateWatermark,
}: InspectorPanelProps) {
  return (
    <aside className="w-[332px] shrink-0 border-l border-[#222630] bg-[#121418] flex flex-col min-h-0">
      {/* Segmented Inspector Navigation */}
      <div className="p-3 border-b border-[#222630]">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-[#0B0C0E] border border-[#222630]">
          <button
            type="button"
            onClick={() => onTabChange('bewerken')}
            className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'bewerken'
                ? 'bg-[#212631] text-[#F3F4F6]'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Bewerken</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('culling')}
            className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'culling'
                ? 'bg-[#212631] text-[#F3F4F6]'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Culling</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('watermerk')}
            className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'watermerk'
                ? 'bg-[#212631] text-[#F3F4F6]'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            <Stamp className="w-3.5 h-3.5" />
            <span>Watermerk</span>
          </button>
        </div>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto studio-scroll p-5 space-y-6">
        {activeTab === 'bewerken' && (
          <>
            {!activePhoto ? (
              <p className="text-xs text-[#9CA3AF]">
                Selecteer een foto om belichting en kleur te bewerken.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-[#F3F4F6]">
                    Basiscorrecties
                  </h2>
                  <button
                    type="button"
                    onClick={onResetAdjustments}
                    className="inline-flex items-center gap-1 text-xs text-[#9CA3AF] hover:text-[#F3F4F6] transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>

                <div className="space-y-5">
                  <SliderRow
                    label="Belichting"
                    value={activePhoto.adjustments.exposure}
                    min={-2}
                    max={2}
                    step={0.05}
                    formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`}
                    onChange={(v) => onChangeAdjustment('exposure', v)}
                    onReset={() => onChangeAdjustment('exposure', 0)}
                  />

                  <SliderRow
                    label="Contrast"
                    value={activePhoto.adjustments.contrast}
                    min={-100}
                    max={100}
                    step={1}
                    formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`}
                    onChange={(v) => onChangeAdjustment('contrast', v)}
                    onReset={() => onChangeAdjustment('contrast', 0)}
                  />

                  <SliderRow
                    label="Witbalans"
                    value={activePhoto.adjustments.whiteBalance}
                    min={-100}
                    max={100}
                    step={1}
                    formatValue={(v) =>
                      v === 0
                        ? '0'
                        : v > 0
                        ? `+${Math.round(v)} Warm`
                        : `${Math.round(v)} Koel`
                    }
                    onChange={(v) => onChangeAdjustment('whiteBalance', v)}
                    onReset={() => onChangeAdjustment('whiteBalance', 0)}
                  />

                  <SliderRow
                    label="Verzadiging"
                    value={activePhoto.adjustments.saturation}
                    min={-100}
                    max={100}
                    step={1}
                    formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`}
                    onChange={(v) => onChangeAdjustment('saturation', v)}
                    onReset={() => onChangeAdjustment('saturation', 0)}
                  />
                </div>

                <div className="pt-4 border-t border-[#222630] space-y-4">
                  <h3 className="text-xs font-semibold text-[#F3F4F6]">
                    Detail & Ruisonderdrukking
                  </h3>
                  <SliderRow
                    label="Ruisverwijdering"
                    value={activePhoto.adjustments.noiseReduction}
                    min={0}
                    max={100}
                    step={1}
                    formatValue={(v) => (v === 0 ? 'Uit' : `${Math.round(v)}%`)}
                    onChange={(v) => onChangeAdjustment('noiseReduction', v)}
                    onReset={() => onChangeAdjustment('noiseReduction', 0)}
                  />
                </div>

                <div className="pt-4 border-t border-[#222630] space-y-3">
                  <h3 className="text-xs font-semibold text-[#F3F4F6]">
                    Bulkbewerking
                  </h3>
                  <p className="text-xs text-[#9CA3AF] leading-relaxed">
                    Pas de huidige instellingen voor belichting, contrast, witbalans,
                    verzadiging en ruisverwijdering met één klik toe op alle{' '}
                    {totalPhotos} foto’s in deze shoot.
                  </p>
                  <button
                    type="button"
                    onClick={onSyncAdjustmentsToAll}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-[#1D222C] hover:bg-[#262C39] border border-[#303746] text-xs font-medium text-[#F3F4F6] transition-colors cursor-pointer"
                  >
                    <CopyCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Kopieer bewerking naar hele shoot</span>
                  </button>

                  {syncFeedback && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{syncFeedback}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {activeTab === 'culling' && (
          <>
            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold text-[#F3F4F6]">
                Automatische AI Culling
              </h2>
              <p className="text-xs text-[#9CA3AF] leading-relaxed">
                Analyseert scherpte (Laplacian-variantie) en groepeert dubbele
                burst-opnamen via perceptuele dHash-vergelijking.
              </p>
            </div>

            <div className="space-y-5">
              <SliderRow
                label="Minimale scherpte"
                value={minSharpness}
                min={10}
                max={80}
                step={1}
                formatValue={(v) => `${Math.round(v)} / 100`}
                onChange={onMinSharpnessChange}
                onReset={() => onMinSharpnessChange(34)}
              />

              <SliderRow
                label="Duplicaat-tolerantie"
                value={duplicateThreshold}
                min={4}
                max={26}
                step={1}
                formatValue={(v) => `${Math.round(v)} bits`}
                onChange={onDuplicateThresholdChange}
                onReset={() => onDuplicateThresholdChange(14)}
              />
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={onRunAiCulling}
                disabled={isAnalyzing || totalPhotos === 0}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:bg-[#222630] disabled:text-[#6B7280] text-[#0B0C0E] text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {isAnalyzing ? 'Beelden analyseren...' : 'Analyseer volledige shoot'}
                </span>
              </button>

              <button
                type="button"
                onClick={onResetCulling}
                disabled={totalPhotos === 0}
                className="w-full px-4 py-2 rounded-md bg-[#181B22] hover:bg-[#20242E] border border-[#282D38] text-xs font-medium text-[#D1D5DB] transition-colors cursor-pointer"
              >
                Markeringen wissen
              </button>
            </div>

            {/* Clean unboxed summary metrics */}
            <div className="pt-4 border-t border-[#222630] space-y-2.5">
              <h3 className="text-xs font-semibold text-[#F3F4F6]">
                Resultaatoverzicht
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-[#1C2029]">
                  <span className="text-[#9CA3AF]">Totaal in shoot</span>
                  <span className="font-mono-tabular text-[#F3F4F6]">{totalPhotos}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-[#1C2029]">
                  <span className="text-emerald-400 inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>Geselecteerd</span>
                  </span>
                  <span className="font-mono-tabular text-emerald-300">
                    {selectedCount}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-[#1C2029]">
                  <span className="text-rose-400 inline-flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5" />
                    <span>Afgekeurd</span>
                  </span>
                  <span className="font-mono-tabular text-rose-300">
                    {rejectedCount}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-[#9CA3AF]">Burst-duplicaten</span>
                  <span className="font-mono-tabular text-amber-400">
                    {duplicateCount}
                  </span>
                </div>
              </div>
            </div>

            {activePhoto?.cullReason && (
              <div className="pt-3 border-t border-[#222630] space-y-1">
                <span className="text-[11px] text-[#9CA3AF]">Actieve foto</span>
                <p className="text-xs text-[#E5E7EB]">{activePhoto.cullReason}</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'watermerk' && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold text-[#F3F4F6]">
                  Interactief Watermerk
                </h2>
                <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                  Sleep het logo direct op de foto
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={watermark.enabled}
                onClick={() => onUpdateWatermark({ enabled: !watermark.enabled })}
                className={`w-10 h-5 rounded-full transition-colors p-0.5 cursor-pointer ${
                  watermark.enabled ? 'bg-amber-500' : 'bg-[#262B36]'
                }`}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-[#0B0C0E] transition-transform ${
                    watermark.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={onUploadWatermarkPng}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-[#1D222C] hover:bg-[#262C39] border border-[#303746] text-xs font-medium text-[#F3F4F6] transition-colors cursor-pointer"
              >
                <ImagePlus className="w-3.5 h-3.5 text-amber-400" />
                <span>Upload PNG-logo</span>
              </button>

              <button
                type="button"
                onClick={onUseBuiltInWatermark}
                className="w-full px-4 py-1.5 rounded-md bg-[#171A21] hover:bg-[#1E222B] border border-[#262B36] text-xs text-[#D1D5DB] transition-colors cursor-pointer"
              >
                Gebruik Studio-voorbeeldlogo
              </button>

              {watermark.fileName && (
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-[#9CA3AF]">Actief logo</span>
                  <span className="text-[#E5E7EB] font-mono-tabular truncate max-w-[160px]">
                    {watermark.fileName}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-5 pt-2 border-t border-[#222630]">
              <SliderRow
                label="Grootte"
                value={watermark.scale * 100}
                min={5}
                max={55}
                step={1}
                formatValue={(v) => `${Math.round(v)}%`}
                onChange={(v) => onUpdateWatermark({ scale: v / 100 })}
                onReset={() => onUpdateWatermark({ scale: 0.22 })}
              />

              <SliderRow
                label="Transparantie"
                value={watermark.opacity * 100}
                min={10}
                max={100}
                step={1}
                formatValue={(v) => `${Math.round(v)}%`}
                onChange={(v) => onUpdateWatermark({ opacity: v / 100 })}
                onReset={() => onUpdateWatermark({ opacity: 0.78 })}
              />
            </div>

            {/* Position presets + live coordinates */}
            <div className="pt-4 border-t border-[#222630] space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#F3F4F6]">Positie</span>
                <span className="font-mono-tabular text-[#9CA3AF]">
                  X {Math.round(watermark.xNorm * 100)}% · Y{' '}
                  {Math.round(watermark.yNorm * 100)}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'Linksboven', x: 0.16, y: 0.12 },
                  { label: 'Boven', x: 0.5, y: 0.12 },
                  { label: 'Rechtsboven', x: 0.84, y: 0.12 },
                  { label: 'Links', x: 0.16, y: 0.5 },
                  { label: 'Midden', x: 0.5, y: 0.5 },
                  { label: 'Rechts', x: 0.84, y: 0.5 },
                  { label: 'Linksonder', x: 0.16, y: 0.88 },
                  { label: 'Onder', x: 0.5, y: 0.88 },
                  { label: 'Rechtsonder', x: 0.84, y: 0.88 },
                ].map((pos) => (
                  <button
                    key={pos.label}
                    type="button"
                    onClick={() =>
                      onUpdateWatermark({ xNorm: pos.x, yNorm: pos.y, enabled: true })
                    }
                    className="py-1.5 px-1 rounded bg-[#181B22] hover:bg-[#232834] border border-[#252A36] text-[11px] text-[#D1D5DB] transition-colors cursor-pointer truncate"
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
