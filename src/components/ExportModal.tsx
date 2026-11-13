import { CheckCircle2, FolderOutput, X } from 'lucide-react';
import { BatchExportSummary, WatermarkSettings } from '../types/studio';

interface ExportModalProps {
  isOpen: boolean;
  selectedCount: number;
  sourceDirPath: string;
  watermark: WatermarkSettings;
  isExporting: boolean;
  progress: { completed: number; total: number; currentFile: string };
  summary: BatchExportSummary | null;
  errorMessage: string | null;
  onClose: () => void;
  onStartExport: () => void;
}

export function ExportModal({
  isOpen,
  selectedCount,
  sourceDirPath,
  watermark,
  isExporting,
  progress,
  summary,
  errorMessage,
  onClose,
  onStartExport,
}: ExportModalProps) {
  if (!isOpen) return null;

  const pct =
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="w-full max-w-md rounded-lg border border-[#272C38] bg-[#13151A] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#222630] flex items-center justify-between">
          <h2 id="export-modal-title" className="text-sm font-semibold text-[#F3F4F6]">
            Batch-export naar /Shoot_Studio_Export
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="p-1 rounded text-[#9CA3AF] hover:text-[#F3F4F6] disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1.5 border-b border-[#1E222B]">
              <span className="text-[#9CA3AF]">Geselecteerde foto’s</span>
              <span className="font-mono-tabular text-[#F3F4F6] font-medium">
                {selectedCount} bestanden
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[#1E222B]">
              <span className="text-[#9CA3AF]">Doelmap</span>
              <span className="font-mono-tabular text-[#E5E7EB] truncate max-w-[230px]">
                {sourceDirPath}/Shoot_Studio_Export
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[#9CA3AF]">Watermerk</span>
              <span className="text-[#E5E7EB]">
                {watermark.enabled && watermark.pngUrl
                  ? `Actief (${Math.round(watermark.opacity * 100)}% transparantie)`
                  : 'Uitgeschakeld'}
              </span>
            </div>
          </div>

          {isExporting && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#D1D5DB] truncate max-w-[260px]">
                  {progress.currentFile}
                </span>
                <span className="font-mono-tabular text-amber-400">{pct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#222630] overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-[width] duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {summary && !isExporting && (
            <div className="p-3.5 rounded-md border border-emerald-500/30 bg-[#11221B] space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-300 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {summary.exportedCount} foto’s geëxporteerd in{' '}
                  <span className="font-mono-tabular">{summary.durationMs} ms</span>
                </span>
              </div>
              <p className="text-[11px] text-emerald-200/80 font-mono-tabular break-all">
                {summary.outputDir}
              </p>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-md border border-rose-500/40 bg-[#2A1417] text-rose-200">
              {errorMessage}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[#222630] bg-[#101216] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-3.5 py-1.5 rounded-md border border-[#2B313E] bg-[#181B22] hover:bg-[#21252F] text-xs font-medium text-[#E5E7EB] transition-colors cursor-pointer disabled:opacity-50"
          >
            {summary ? 'Sluiten' : 'Annuleren'}
          </button>

          {!summary && (
            <button
              type="button"
              onClick={onStartExport}
              disabled={isExporting || selectedCount === 0}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:bg-[#222630] disabled:text-[#6B7280] text-[#0B0C0E] text-xs font-semibold transition-colors cursor-pointer"
            >
              <FolderOutput className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Exporteren...' : 'Start Batch-export'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
