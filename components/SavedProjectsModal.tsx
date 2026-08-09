import React from 'react';
import { SavedVideoDocument } from '../lib/firebase';

interface SavedProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  videos: SavedVideoDocument[];
  onSelectVideo: (video: SavedVideoDocument) => void;
  onDeleteVideo: (videoId: string) => void;
  isLoading: boolean;
}

export const SavedProjectsModal: React.FC<SavedProjectsModalProps> = ({
  isOpen,
  onClose,
  videos,
  onSelectVideo,
  onDeleteVideo,
  isLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[120] flex items-center justify-center p-4 md:p-6">
      <div className="bg-slate-900 rounded-[32px] max-w-2xl w-full border border-slate-800 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-500/20 text-brand-300 rounded-2xl flex items-center justify-center text-xl border border-brand-500/30">
              ☁️
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Saqlangan Video Loyihalar</h3>
              <p className="text-[11px] text-slate-400">Firebase Firestore orqali saqlangan ssenariylar va videolar</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {isLoading ? (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-mono">Bulutdagi loyihalar yuklanmoqda...</p>
            </div>
          ) : videos.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <div className="text-3xl">📁</div>
              <p className="text-sm font-medium text-slate-300">Hozircha saqlangan loyihalar yo'q</p>
              <p className="text-xs">Yaratilgan video tahlili ostidagi "Bulutga Saqlash ☁️" tugmasini bosing.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {videos.map((vid) => (
                <div
                  key={vid.id}
                  className="bg-slate-950 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition flex items-center justify-between gap-4 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {vid.imageUrls && vid.imageUrls[0] ? (
                      <img
                        src={vid.imageUrls[0]}
                        alt={vid.topic}
                        className="w-14 h-14 rounded-xl object-cover border border-slate-800 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-slate-800 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                        🎬
                      </div>
                    )}

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white truncate">{vid.topic}</span>
                        <span className="text-[10px] bg-brand-500/20 text-brand-300 font-mono px-2 py-0.5 rounded border border-brand-500/30">
                          {vid.script.length} jumla
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate max-w-md">
                        {vid.fullScript}
                      </p>
                      <span className="text-[10px] text-slate-500 block">
                        {new Date(vid.createdAt).toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => onSelectVideo(vid)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/30 transition"
                    >
                      Ochish ▶
                    </button>
                    {vid.id && (
                      <button
                        onClick={() => onDeleteVideo(vid.id!)}
                        className="w-8 h-8 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition flex items-center justify-center text-xs"
                        title="O'chirish"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
