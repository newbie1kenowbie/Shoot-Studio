import { useState } from 'react';
import {
  BookmarkPlus,
  Check,
  CopyCheck,
  FileUp,
  ImagePlus,
  Layers,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Stamp,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { StudioPreset } from '../data/presets';
import {
  ColorAdjustments,
  EnhanceIntensity,
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
  enhanceIntensity: EnhanceIntensity;
  isEnhancing: boolean;
  enhanceFeedback: string | null;
  onEnhanceIntensityChange: (val: EnhanceIntensity) => void;
  onAiEnhanceActive: () => void;
  onAiEnhanceAll: () => void;
  presets: StudioPreset[];
  presetFeedback: string | null;
  onApplyPreset: (preset: StudioPreset) => void;
  onApplyPresetToShoot: (preset: StudioPreset) => void;
  onSaveCurrentAsPreset: (name: string) => void;
  onDeleteCustomPreset: (presetId: string) => void;
  onImportXmpPreset: () => void;
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
  enhanceIntensity,
  isEnhancing,
  enhanceFeedback,
  onEnhanceIntensityChange,
  onAiEnhanceActive,
  onAiEnhanceAll,
  presets,
  presetFeedback,
  onApplyPreset,
  onApplyPresetToShoot,
  onSaveCurrentAsPreset,
  onDeleteCustomPreset,
  onImportXmpPreset,
  onMinSharpnessChange,
  onDuplicateThresholdChange,
  onRunAiCulling,
  onResetCulling,
  onUploadWatermarkPng,
  onUseBuiltInWatermark,
  onUpdateWatermark,
}: InspectorPanelProps) {
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const handleConfirmSavePreset = () => {
    const trimmed = newPresetName.trim();
    if (!trimmed) return;
    onSaveCurrentAsPreset(trimmed);
    setNewPresetName('');
    setIsSavingPreset(false);
  };

  return (
    <aside className="w-[368px] shrink-0 border-l border-[#222630] bg-[#121418] flex flex-col min-h-0">
      {/* Segmented Inspector Navigation */}
      <div className="p-3 border-b border-[#222630]">
        <div className="grid grid-cols-4 gap-1 p-1 rounded-md bg-[#0B0C0E] border border-[#222630]">
          <button
            type="button"
            onClick={() => onTabChange('bewerken')}
            className={`inline-flex items-center justify-center gap-1 py-1.5 px-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'bewerken'
                ? 'bg-[#212631] text-[#F3F4F6]'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3 shrink-0" />
            <span>Bewerken</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('presets')}
            className={`inline-flex items-center justify-center gap-1 py-1.5 px-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'presets'
                ? 'bg-[#212631] text-[#F3F4F6]'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            <Layers className="w-3 h-3 shrink-0" />
            <span>Presets</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('culling')}
            className={`inline-flex items-center justify-center gap-1 py-1.5 px-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'culling'
                ? 'bg-[#212631] text-[#F3F4F6]'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            <Sparkles className="w-3 h-3 shrink-0" />
            <span>Culling</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('watermerk')}
            className={`inline-flex items-center justify-center gap-1 py-1.5 px-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'watermerk'
                ? 'bg-[#212631] text-[#F3F4F6]'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            <Stamp className="w-3 h-3 shrink-0" />
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
                {/* AI Photo Enhancement Tool */}
                <div className="pb-5 border-b border-[#222630] space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-[#F3F4F6]">
                      AI Fotoverbetering
                    </h2>
                    <div
                      className="flex items-center p-0.5 rounded bg-[#0B0C0E] border border-[#222630]"
                      role="group"
                      aria-label="Verbeteringsintensiteit"
                    >
                      {(['subtiel', 'normaal', 'krachtig'] as EnhanceIntensity[]).map(
                        (lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => onEnhanceIntensityChange(lvl)}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-colors cursor-pointer ${
                              enhanceIntensity === lvl
                                ? 'bg-[#222732] text-[#F3F4F6]'
                                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
                            }`}
                          >
                            {lvl}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-[#9CA3AF] leading-relaxed">
                    Analyseert dynamisch bereik, kleurzweem, hoge-ISO ruis en
                    micro-contrast om direct optimale waarden in te stellen.
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={onAiEnhanceActive}
                      disabled={isEnhancing}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-amber-500 hover:bg-amber-400 disabled:bg-[#222630] disabled:text-[#6B7280] text-[#0B0C0E] text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Wand2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{isEnhancing ? 'Bezig...' : 'Verbeter foto'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onAiEnhanceAll}
                      disabled={isEnhancing || totalPhotos === 0}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[#1D222C] hover:bg-[#262C39] disabled:opacity-50 border border-[#303746] text-xs font-medium text-[#F3F4F6] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <span>Hele shoot ({totalPhotos})</span>
                    </button>
                  </div>

                  {enhanceFeedback && (
                    <p className="text-[11px] text-emerald-400 leading-relaxed font-mono-tabular">
                      {enhanceFeedback}
                    </p>
                  )}
                </div>

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

                  <SliderRow
                    label="Verscherping"
                    value={activePhoto.adjustments.sharpening}
                    min={0}
                    max={100}
                    step={1}
                    formatValue={(v) => (v === 0 ? 'Uit' : `${Math.round(v)}%`)}
                    onChange={(v) => onChangeAdjustment('sharpening', v)}
                    onReset={() => onChangeAdjustment('sharpening', 0)}
                  />
                </div>

                <div className="pt-4 border-t border-[#222630] space-y-3">
                  <h3 className="text-xs font-semibold text-[#F3F4F6]">
                    Bulkbewerking
                  </h3>
                  <p className="text-xs text-[#9CA3AF] leading-relaxed">
                    Pas de huidige instellingen voor belichting, contrast, witbalans,
                    verzadiging, ruisverwijdering en verscherping met één klik toe op
                    alle {totalPhotos} foto’s in deze shoot.
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

        {activeTab === 'presets' && (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-[#F3F4F6]">
                  Lightroom Presets
                </h2>
                <span className="text-[11px] font-mono-tabular text-[#9CA3AF]">
                  {presets.length} stijlen
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsSavingPreset((v) => !v)}
                  disabled={!activePhoto}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[#1D222C] hover:bg-[#262C39] disabled:opacity-50 border border-[#303746] text-xs font-medium text-[#F3F4F6] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <BookmarkPlus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Preset opslaan</span>
                </button>
                <button
                  type="button"
                  onClick={onImportXmpPreset}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[#1D222C] hover:bg-[#262C39] border border-[#303746] text-xs font-medium text-[#F3F4F6] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <FileUp className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Importeer .XMP</span>
                </button>
              </div>

              {isSavingPreset && (
                <div className="p-3 rounded-md border border-[#2C313D] bg-[#0E1014] space-y-2.5">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmSavePreset();
                      if (e.key === 'Escape') setIsSavingPreset(false);
                    }}
                    placeholder="Naam voor nieuwe preset..."
                    className="w-full px-2.5 py-1.5 rounded bg-[#161920] border border-[#2C313D] text-xs text-[#F3F4F6] placeholder-[#6B7280] focus:outline-none focus:border-amber-500"
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsSavingPreset(false)}
                      className="px-2.5 py-1 rounded text-xs text-[#9CA3AF] hover:text-[#F3F4F6] cursor-pointer"
                    >
                      Annuleren
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmSavePreset}
                      disabled={!newPresetName.trim()}
                      className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-[#0B0C0E] text-xs font-semibold cursor-pointer"
                    >
                      Opslaan
                    </button>
                  </div>
                </div>
              )}

              {presetFeedback && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{presetFeedback}</span>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1">
              {presets.map((preset) => {
                const isActive = activePhoto?.activePresetId === preset.id;
                const { exposure, contrast, whiteBalance, saturation } =
                  preset.adjustments;
                return (
                  <div
                    key={preset.id}
                    className={`group rounded-md border transition-colors ${
                      isActive
                        ? 'border-amber-500/70 bg-[#1B1D23]'
                        : 'border-[#232732] bg-[#161920] hover:border-[#353B4B]'
                    }`}
                  >
                    <div className="p-3 flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onApplyPreset(preset)}
                        disabled={!activePhoto}
                        className="flex-1 text-left min-w-0 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[#F3F4F6] truncate">
                            {preset.name}
                          </span>
                          {isActive && (
                            <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          )}
                        </div>
                        <div className="mt-1 text-[11px] text-[#9CA3AF] font-mono-tabular truncate">
                          {preset.category} · {exposure >= 0 ? '+' : ''}
                          {exposure.toFixed(2)} EV · C {contrast >= 0 ? '+' : ''}
                          {contrast} · WB {whiteBalance >= 0 ? '+' : ''}
                          {whiteBalance} · Sat {saturation >= 0 ? '+' : ''}
                          {saturation}
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onApplyPresetToShoot(preset)}
                          disabled={totalPhotos === 0}
                          title="Toepassen op hele shoot"
                          className="px-2 py-1 rounded bg-[#212631] hover:bg-[#2B3140] text-[11px] font-medium text-[#E5E7EB] transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Op shoot
                        </button>
                        {preset.isCustom && (
                          <button
                            type="button"
                            onClick={() => onDeleteCustomPreset(preset.id)}
                            title="Aangepaste preset verwijderen"
                            className="p-1 rounded text-[#9CA3AF] hover:text-rose-400 hover:bg-[#2A171A] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
