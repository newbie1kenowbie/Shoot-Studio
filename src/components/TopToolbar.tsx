import { FolderOpen, Grid, Image as ImageIcon, Upload } from 'lucide-react';
import { FilterMode, ViewMode } from '../types/studio';

interface TopToolbarProps {
  folderName: string;
  totalCount: number;
  selectedCount: number;
  rejectedCount: number;
  filterMode: FilterMode;
  viewMode: ViewMode;
  isLoadingFolder: boolean;
  onOpenFolder: () => void;
  onFilterChange: (mode: FilterMode) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenExport: () => void;
}

export function TopToolbar({
  folderName,
  totalCount,
  selectedCount,
  rejectedCount,
  filterMode,
  viewMode,
  isLoadingFolder,
  onOpenFolder,
  onFilterChange,
  onViewModeChange,
  onOpenExport,
}: TopToolbarProps) {
  return (
    <header className="h-14 shrink-0 border-b border-[#222630] bg-[#111318] px-5 flex items-center justify-between gap-6">
      {/* Zone 1: Brand mark + folder action */}
      <div className="flex items-center gap-5 min-w-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <img
            src="/shoot-studio-logo.png"
            alt="Shoot Studio logo"
            className="w-7 h-7 rounded-md object-contain shrink-0"
          />
          <span className="text-[17px] font-semibold tracking-tight text-[#F3F4F6] whitespace-nowrap shrink-0">
            Shoot Studio
          </span>
        </div>

        <div className="h-4 w-px bg-[#262B36] shrink-0" aria-hidden="true" />

        <button
          type="button"
          onClick={onOpenFolder}
          disabled={isLoadingFolder}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#1B1F27] hover:bg-[#232833] border border-[#2C313D] text-xs font-medium text-[#E5E7EB] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
        >
          <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{isLoadingFolder ? 'Inlezen...' : 'Map openen'}</span>
        </button>

        <span
          className="hidden lg:inline-block text-xs text-[#9CA3AF] truncate max-w-[220px]"
          title={folderName}
        >
          {folderName}
        </span>
      </div>

      {/* Zone 2: Segmented filter & view controls */}
      <div className="flex items-center gap-3 shrink-0">
        <div
          className="flex items-center p-0.5 rounded-md bg-[#0B0C0E] border border-[#222630]"
          role="group"
          aria-label="Filter foto's"
        >
          <button
            type="button"
            onClick={() => onFilterChange('alle')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'alle'
                ? 'bg-[#222732] text-[#F3F4F6]'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            Alle <span className="font-mono-tabular text-[#9CA3AF] ml-1">{totalCount}</span>
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('geselecteerd')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'geselecteerd'
                ? 'bg-[#173026] text-emerald-300'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            Geselecteerd{' '}
            <span className="font-mono-tabular ml-1 opacity-80">{selectedCount}</span>
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('afgekeurd')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'afgekeurd'
                ? 'bg-[#331B1E] text-rose-300'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            Afgekeurd{' '}
            <span className="font-mono-tabular ml-1 opacity-80">{rejectedCount}</span>
          </button>
        </div>

        <div
          className="flex items-center p-0.5 rounded-md bg-[#0B0C0E] border border-[#222630]"
          role="group"
          aria-label="Weergavemodus"
        >
          <button
            type="button"
            onClick={() => onViewModeChange('loupe')}
            title="Voorvertoning"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'loupe'
                ? 'bg-[#222732] text-[#F3F4F6]'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Loupe</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            title="Rasterweergave"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-[#222732] text-[#F3F4F6]'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Raster</span>
          </button>
        </div>
      </div>

      {/* Zone 3: Single primary CTA */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenExport}
          disabled={selectedCount === 0}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:bg-[#222630] disabled:text-[#6B7280] text-[#0B0C0E] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Batch-export ({selectedCount})</span>
        </button>
      </div>
    </header>
  );
}
