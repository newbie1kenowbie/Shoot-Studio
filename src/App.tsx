/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExportModal } from './components/ExportModal';
import { Filmstrip } from './components/Filmstrip';
import { InspectorPanel } from './components/InspectorPanel';
import { PreviewCanvas } from './components/PreviewCanvas';
import { TopToolbar } from './components/TopToolbar';
import { SAMPLE_SHOOT_NAME, SAMPLE_SHOOT_PHOTOS } from './data/sampleShoot';
import {
  analyzeAndEnhancePhoto,
  createBuiltInStudioWatermarkPng,
} from './services/imageAnalysis';
import {
  openSourceFolder,
  pickWatermarkPng,
  runAiCulling,
  runBatchExport,
} from './services/studioBackend';
import {
  BatchExportSummary,
  ColorAdjustments,
  CullingStatus,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_WATERMARK,
  EnhanceIntensity,
  FilterMode,
  InspectorTab,
  PhotoItem,
  ViewMode,
  WatermarkSettings,
} from './types/studio';

export default function App() {
  const [folderName, setFolderName] = useState<string>(SAMPLE_SHOOT_NAME);
  const [sourceDirPath, setSourceDirPath] = useState<string>(SAMPLE_SHOOT_NAME);
  const [directoryHandle, setDirectoryHandle] = useState<
    FileSystemDirectoryHandle | undefined
  >(undefined);
  const [photos, setPhotos] = useState<PhotoItem[]>(SAMPLE_SHOOT_PHOTOS);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(
    SAMPLE_SHOOT_PHOTOS[0]?.id ?? null
  );

  const [filterMode, setFilterMode] = useState<FilterMode>('alle');
  const [viewMode, setViewMode] = useState<ViewMode>('loupe');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('bewerken');

  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [enhanceIntensity, setEnhanceIntensity] = useState<EnhanceIntensity>('normaal');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceFeedback, setEnhanceFeedback] = useState<string | null>(null);
  const [minSharpness, setMinSharpness] = useState<number>(34);
  const [duplicateThreshold, setDuplicateThreshold] = useState<number>(14);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const [watermark, setWatermark] = useState<WatermarkSettings>(DEFAULT_WATERMARK);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({
    completed: 0,
    total: 0,
    currentFile: '',
  });
  const [exportSummary, setExportSummary] = useState<BatchExportSummary | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const selectedPhotos = useMemo(
    () => photos.filter((p) => p.status === 'geselecteerd'),
    [photos]
  );
  const rejectedPhotos = useMemo(
    () => photos.filter((p) => p.status === 'afgekeurd'),
    [photos]
  );
  const duplicateCount = useMemo(
    () =>
      photos.filter(
        (p) => p.duplicateGroupId !== null && p.status === 'afgekeurd'
      ).length,
    [photos]
  );

  const filteredPhotos = useMemo(() => {
    if (filterMode === 'geselecteerd') return selectedPhotos;
    if (filterMode === 'afgekeurd') return rejectedPhotos;
    return photos;
  }, [filterMode, photos, selectedPhotos, rejectedPhotos]);

  const activePhoto = useMemo(() => {
    const found = filteredPhotos.find((p) => p.id === activePhotoId);
    return found ?? filteredPhotos[0] ?? null;
  }, [filteredPhotos, activePhotoId]);

  const activeIndex = useMemo(() => {
    if (!activePhoto) return -1;
    return filteredPhotos.findIndex((p) => p.id === activePhoto.id);
  }, [filteredPhotos, activePhoto]);

  const goPrev = useCallback(() => {
    if (activeIndex > 0) {
      setActivePhotoId(filteredPhotos[activeIndex - 1].id);
    }
  }, [activeIndex, filteredPhotos]);

  const goNext = useCallback(() => {
    if (activeIndex >= 0 && activeIndex < filteredPhotos.length - 1) {
      setActivePhotoId(filteredPhotos[activeIndex + 1].id);
    }
  }, [activeIndex, filteredPhotos]);

  const handleSetStatus = useCallback(
    (photoId: string, status: CullingStatus) => {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? {
                ...p,
                status,
                cullReason:
                  status === 'onbeoordeeld' ? null : 'Handmatig gemarkeerd',
              }
            : p
        )
      );
    },
    []
  );

  // Lightroom-style keyboard shortcuts: Left/Right arrows, P (Select), X (Reject)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (isExportModalOpen) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if ((e.key === 'p' || e.key === 'P') && activePhoto) {
        e.preventDefault();
        handleSetStatus(
          activePhoto.id,
          activePhoto.status === 'geselecteerd' ? 'onbeoordeeld' : 'geselecteerd'
        );
      } else if ((e.key === 'x' || e.key === 'X') && activePhoto) {
        e.preventDefault();
        handleSetStatus(
          activePhoto.id,
          activePhoto.status === 'afgekeurd' ? 'onbeoordeeld' : 'afgekeurd'
        );
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePhoto, goNext, goPrev, handleSetStatus, isExportModalOpen]);

  const handleOpenFolder = async () => {
    setBannerError(null);
    setIsLoadingFolder(true);
    try {
      const result = await openSourceFolder();
      if (!result) return;
      if (result.photos.length === 0) {
        setBannerError(
          `Geen ondersteunde afbeeldingen (.jpg, .png, .cr3) gevonden in "${result.folderName}".`
        );
        return;
      }
      setFolderName(result.folderName);
      setSourceDirPath(result.sourceDirPath);
      setDirectoryHandle(result.directoryHandle);
      setPhotos(result.photos);
      setActivePhotoId(result.photos[0].id);
      setFilterMode('alle');
    } catch (err) {
      setBannerError(
        err instanceof Error
          ? err.message
          : 'Er is een fout opgetreden bij het openen van de map.'
      );
    } finally {
      setIsLoadingFolder(false);
    }
  };

  const handleChangeAdjustment = <K extends keyof ColorAdjustments>(
    key: K,
    value: ColorAdjustments[K]
  ) => {
    if (!activePhoto) return;
    setSyncFeedback(null);
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === activePhoto.id
          ? { ...p, adjustments: { ...p.adjustments, [key]: value } }
          : p
      )
    );
  };

  const handleResetAdjustments = () => {
    if (!activePhoto) return;
    setSyncFeedback(null);
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === activePhoto.id
          ? { ...p, adjustments: { ...DEFAULT_ADJUSTMENTS } }
          : p
      )
    );
  };

  const handleSyncAdjustmentsToAll = () => {
    if (!activePhoto) return;
    const sourceAdj = { ...activePhoto.adjustments };
    setPhotos((prev) =>
      prev.map((p) => ({
        ...p,
        adjustments: { ...sourceAdj },
      }))
    );
    setSyncFeedback(`Bewerking gekopieerd naar alle ${photos.length} foto’s.`);
    setTimeout(() => setSyncFeedback(null), 4000);
  };

  const handleAiEnhanceActive = async () => {
    if (!activePhoto) return;
    setIsEnhancing(true);
    setEnhanceFeedback(null);
    try {
      const res = await analyzeAndEnhancePhoto(activePhoto, enhanceIntensity);
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === activePhoto.id ? { ...p, adjustments: res.adjustments } : p
        )
      );
      setEnhanceFeedback(res.summary);
    } catch {
      setBannerError('AI-verbetering kon niet worden uitgevoerd op deze foto.');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleAiEnhanceAll = async () => {
    if (photos.length === 0) return;
    setIsEnhancing(true);
    setEnhanceFeedback(null);
    try {
      const updatedMap = new Map<string, ColorAdjustments>();
      for (const p of photos) {
        const res = await analyzeAndEnhancePhoto(p, enhanceIntensity);
        updatedMap.set(p.id, res.adjustments);
      }
      setPhotos((prev) =>
        prev.map((p) => ({
          ...p,
          adjustments: updatedMap.get(p.id) ?? p.adjustments,
        }))
      );
      setEnhanceFeedback(
        `${photos.length} foto’s individueel geanalyseerd en verbeterd.`
      );
    } catch {
      setBannerError('AI-verbetering kon niet worden voltooid voor de hele shoot.');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleRunAiCulling = async () => {
    if (photos.length === 0) return;
    setBannerError(null);
    setIsAnalyzing(true);
    try {
      const outcomes = await runAiCulling(photos, minSharpness, duplicateThreshold);
      const outcomeMap = new Map(outcomes.map((o) => [o.id, o]));
      setPhotos((prev) =>
        prev.map((p) => {
          const out = outcomeMap.get(p.id);
          if (!out) return p;
          return {
            ...p,
            sharpnessScore: out.sharpnessScore,
            dHash: out.dHash,
            duplicateGroupId: out.duplicateGroupId,
            status: out.status,
            cullReason: out.cullReason,
          };
        })
      );
    } catch (err) {
      setBannerError(
        err instanceof Error
          ? err.message
          : 'AI Culling-analyse is mislukt voor deze map.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleResetCulling = () => {
    setPhotos((prev) =>
      prev.map((p) => ({
        ...p,
        status: 'onbeoordeeld',
        sharpnessScore: null,
        duplicateGroupId: null,
        cullReason: null,
      }))
    );
  };

  const handleUploadWatermarkPng = async () => {
    const picked = await pickWatermarkPng();
    if (!picked) return;
    setWatermark((prev) => ({
      ...prev,
      enabled: true,
      pngUrl: picked.pngUrl,
      pngPath: picked.pngPath,
      fileName: picked.fileName,
    }));
  };

  const handleUseBuiltInWatermark = () => {
    const dataUrl = createBuiltInStudioWatermarkPng();
    if (!dataUrl) return;
    setWatermark((prev) => ({
      ...prev,
      enabled: true,
      pngUrl: dataUrl,
      pngPath: null,
      fileName: 'shoot_studio_mark.png',
    }));
  };

  const handleOpenExport = () => {
    setExportSummary(null);
    setExportError(null);
    setExportProgress({ completed: 0, total: selectedPhotos.length, currentFile: '' });
    setIsExportModalOpen(true);
  };

  const handleStartExport = async () => {
    if (selectedPhotos.length === 0) return;
    setIsExporting(true);
    setExportError(null);
    setExportSummary(null);
    try {
      const summary = await runBatchExport({
        sourceDirPath,
        directoryHandle,
        selectedPhotos,
        watermark,
        onProgress: (completed, total, currentFile) => {
          setExportProgress({ completed, total, currentFile });
        },
      });
      setExportSummary(summary);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Batch-export is mislukt.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0B0C0E] text-[#F1F3F5]">
      <TopToolbar
        folderName={folderName}
        totalCount={photos.length}
        selectedCount={selectedPhotos.length}
        rejectedCount={rejectedPhotos.length}
        filterMode={filterMode}
        viewMode={viewMode}
        isLoadingFolder={isLoadingFolder}
        onOpenFolder={handleOpenFolder}
        onFilterChange={setFilterMode}
        onViewModeChange={setViewMode}
        onOpenExport={handleOpenExport}
      />

      {bannerError && (
        <div className="px-5 py-2 bg-[#2B1518] border-b border-rose-500/40 text-xs text-rose-200 flex items-center justify-between">
          <span>{bannerError}</span>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="text-rose-300 hover:text-white underline cursor-pointer"
          >
            Sluiten
          </button>
        </div>
      )}

      {/* Main Studio Workspace: Central Canvas/Grid + Right Inspector */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {viewMode === 'loupe' ? (
            <>
              <PreviewCanvas
                photo={activePhoto}
                watermark={watermark}
                hasPrev={activeIndex > 0}
                hasNext={activeIndex >= 0 && activeIndex < filteredPhotos.length - 1}
                onPrev={goPrev}
                onNext={goNext}
                onSetStatus={handleSetStatus}
                onUpdateWatermarkPosition={(xNorm, yNorm) =>
                  setWatermark((prev) => ({ ...prev, xNorm, yNorm }))
                }
                onOpenFolder={handleOpenFolder}
              />
              <Filmstrip
                photos={filteredPhotos}
                activePhotoId={activePhoto?.id ?? null}
                viewMode="loupe"
                onSelectPhoto={setActivePhotoId}
                onSetStatus={handleSetStatus}
                onSwitchToLoupe={() => setViewMode('loupe')}
              />
            </>
          ) : (
            <Filmstrip
              photos={filteredPhotos}
              activePhotoId={activePhoto?.id ?? null}
              viewMode="grid"
              onSelectPhoto={setActivePhotoId}
              onSetStatus={handleSetStatus}
              onSwitchToLoupe={() => setViewMode('loupe')}
            />
          )}
        </div>

        <InspectorPanel
          activeTab={inspectorTab}
          onTabChange={setInspectorTab}
          activePhoto={activePhoto}
          totalPhotos={photos.length}
          selectedCount={selectedPhotos.length}
          rejectedCount={rejectedPhotos.length}
          duplicateCount={duplicateCount}
          minSharpness={minSharpness}
          duplicateThreshold={duplicateThreshold}
          isAnalyzing={isAnalyzing}
          syncFeedback={syncFeedback}
          watermark={watermark}
          onChangeAdjustment={handleChangeAdjustment}
          onResetAdjustments={handleResetAdjustments}
          onSyncAdjustmentsToAll={handleSyncAdjustmentsToAll}
          enhanceIntensity={enhanceIntensity}
          isEnhancing={isEnhancing}
          enhanceFeedback={enhanceFeedback}
          onEnhanceIntensityChange={setEnhanceIntensity}
          onAiEnhanceActive={handleAiEnhanceActive}
          onAiEnhanceAll={handleAiEnhanceAll}
          onMinSharpnessChange={setMinSharpness}
          onDuplicateThresholdChange={setDuplicateThreshold}
          onRunAiCulling={handleRunAiCulling}
          onResetCulling={handleResetCulling}
          onUploadWatermarkPng={handleUploadWatermarkPng}
          onUseBuiltInWatermark={handleUseBuiltInWatermark}
          onUpdateWatermark={(patch) =>
            setWatermark((prev) => ({ ...prev, ...patch }))
          }
        />
      </main>

      <ExportModal
        isOpen={isExportModalOpen}
        selectedCount={selectedPhotos.length}
        sourceDirPath={sourceDirPath}
        watermark={watermark}
        isExporting={isExporting}
        progress={exportProgress}
        summary={exportSummary}
        errorMessage={exportError}
        onClose={() => setIsExportModalOpen(false)}
        onStartExport={handleStartExport}
      />
    </div>
  );
}
