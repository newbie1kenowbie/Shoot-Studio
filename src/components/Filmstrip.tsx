import { Check, Copy, X } from 'lucide-react';
import { CullingStatus, PhotoItem, ViewMode } from '../types/studio';

interface FilmstripProps {
  photos: PhotoItem[];
  activePhotoId: string | null;
  viewMode: ViewMode;
  onSelectPhoto: (id: string) => void;
  onSetStatus: (id: string, status: CullingStatus) => void;
  onSwitchToLoupe: () => void;
}

export function Filmstrip({
  photos,
  activePhotoId,
  viewMode,
  onSelectPhoto,
  onSetStatus,
  onSwitchToLoupe,
}: FilmstripProps) {
  if (viewMode === 'grid') {
    return (
      <section className="flex-1 min-w-0 min-h-0 bg-[#0B0C0E] overflow-y-auto studio-scroll p-6">
        {photos.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-[#9CA3AF]">
            Geen foto’s gevonden voor het gekozen filter.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {photos.map((photo) => {
              const isActive = photo.id === activePhotoId;
              return (
                <div
                  key={photo.id}
                  onClick={() => onSelectPhoto(photo.id)}
                  onDoubleClick={() => {
                    onSelectPhoto(photo.id);
                    onSwitchToLoupe();
                  }}
                  className={`group rounded-lg border bg-[#121419] overflow-hidden cursor-pointer transition-colors ${
                    isActive
                      ? 'border-amber-500 ring-1 ring-amber-500/40'
                      : 'border-[#222630] hover:border-[#363C4A]'
                  }`}
                >
                  <div className="aspect-[4/3] bg-[#07080A] relative overflow-hidden">
                    <img
                      src={photo.previewUrl}
                      alt={photo.fileName}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className={`w-full h-full object-cover transition-opacity ${
                        photo.status === 'afgekeurd' ? 'opacity-45' : 'opacity-100'
                      }`}
                    />
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetStatus(
                            photo.id,
                            photo.status === 'geselecteerd'
                              ? 'onbeoordeeld'
                              : 'geselecteerd'
                          );
                        }}
                        title="Selecteren"
                        className="w-7 h-7 rounded bg-[#111318]/90 border border-[#2C313D] flex items-center justify-center text-emerald-400 hover:bg-[#173026] cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetStatus(
                            photo.id,
                            photo.status === 'afgekeurd' ? 'onbeoordeeld' : 'afgekeurd'
                          );
                        }}
                        title="Afkeuren"
                        className="w-7 h-7 rounded bg-[#111318]/90 border border-[#2C313D] flex items-center justify-center text-rose-400 hover:bg-[#331B1E] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-[#E5E7EB] truncate">
                        {photo.fileName}
                      </div>
                      <div className="text-[11px] text-[#9CA3AF] font-mono-tabular flex items-center gap-1.5 mt-0.5">
                        <span>{photo.extension}</span>
                        {photo.sharpnessScore !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Scherpte {photo.sharpnessScore}</span>
                          </>
                        )}
                        {photo.duplicateGroupId && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-0.5 text-amber-400">
                              <Copy className="w-2.5 h-2.5" />
                              {photo.duplicateGroupId}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {photo.status === 'geselecteerd' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        <span>Geselecteerd</span>
                      </span>
                    )}
                    {photo.status === 'afgekeurd' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400 shrink-0">
                        <X className="w-3.5 h-3.5" />
                        <span>Afgekeurd</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <aside
      aria-label="Filmstrip"
      className="h-[138px] shrink-0 border-t border-[#222630] bg-[#101216] px-4 py-2.5 flex items-center gap-3 overflow-x-auto studio-scroll"
    >
      {photos.length === 0 ? (
        <div className="w-full text-center text-xs text-[#9CA3AF]">
          Geen foto’s in dit filter.
        </div>
      ) : (
        photos.map((photo) => {
          const isActive = photo.id === activePhotoId;
          return (
            <button
              key={photo.id}
              type="button"
              onClick={() => onSelectPhoto(photo.id)}
              className={`group relative h-full aspect-[4/3] shrink-0 rounded overflow-hidden border bg-[#07080A] text-left transition-colors cursor-pointer ${
                isActive
                  ? 'border-amber-500 ring-1 ring-amber-500/50'
                  : 'border-[#252A36] hover:border-[#3D4558]'
              }`}
            >
              <img
                src={photo.previewUrl}
                alt={photo.fileName}
                referrerPolicy="no-referrer"
                loading="lazy"
                className={`w-full h-full object-cover transition-opacity ${
                  photo.status === 'afgekeurd' ? 'opacity-40' : 'opacity-100'
                }`}
              />

              {/* Subtle measured scrim for legibility */}
              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none" />

              <div className="absolute inset-x-1.5 bottom-1 flex items-center justify-between gap-1 text-[10px] font-mono-tabular">
                <span className="text-[#F3F4F6] truncate">{photo.fileName}</span>
                <span className="text-[#D1D5DB] shrink-0">{photo.extension}</span>
              </div>

              {/* Explicit non-hue-only status icon in top-left */}
              {photo.status === 'geselecteerd' && (
                <span
                  title="Geselecteerd"
                  className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#0E241B]/90 border border-emerald-500/50 text-[10px] font-medium text-emerald-300"
                >
                  <Check className="w-2.5 h-2.5" />
                  <span>Select</span>
                </span>
              )}
              {photo.status === 'afgekeurd' && (
                <span
                  title="Afgekeurd"
                  className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#2A1215]/90 border border-rose-500/50 text-[10px] font-medium text-rose-300"
                >
                  <X className="w-2.5 h-2.5" />
                  <span>Afgekeurd</span>
                </span>
              )}

              {photo.sharpnessScore !== null && (
                <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-[#0B0C0E]/85 text-[10px] font-mono-tabular text-[#E5E7EB]">
                  {photo.sharpnessScore}
                </span>
              )}
            </button>
          );
        })
      )}
    </aside>
  );
}
