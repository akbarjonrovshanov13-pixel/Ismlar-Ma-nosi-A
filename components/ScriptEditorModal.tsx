import React, { useState, useEffect } from 'react';

interface ScriptEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  topic: string;
  initialSegments: string[];
  initialOutroText: string;
  onSaveAndGenerate: (segments: string[], outroText: string) => void;
  isLoading: boolean;
  loadingStep: string;
}

const BRAND_PRESETS = [
  "Luxe Core — qadoqlash uchun kerakli hamma narsa.",
  "Sifatli qutilar va paketlar uchun Luxe Core ga murojaat qiling!",
  "Buyurtma berish uchun Instagram: @luxe_core_uz",
  "Mahsulotingiz uchun eng zo'r qadoqlash — Luxe Core!"
];

export const ScriptEditorModal: React.FC<ScriptEditorModalProps> = ({
  isOpen,
  onClose,
  topic,
  initialSegments,
  initialOutroText,
  onSaveAndGenerate,
  isLoading,
  loadingStep,
}) => {
  const [segments, setSegments] = useState<string[]>([]);
  const [outroText, setOutroText] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'segments' | 'preview'>('segments');

  useEffect(() => {
    setSegments(initialSegments.length > 0 ? [...initialSegments] : ['']);
    setOutroText(initialOutroText || BRAND_PRESETS[0]);
  }, [initialSegments, initialOutroText, isOpen]);

  if (!isOpen) return null;

  const handleSegmentChange = (index: number, value: string) => {
    const updated = [...segments];
    updated[index] = value;
    setSegments(updated);
  };

  const addSegment = () => {
    setSegments([...segments, '']);
  };

  const removeSegment = (index: number) => {
    if (segments.length <= 1) return;
    setSegments(segments.filter((_, i) => i !== index));
  };

  const moveSegment = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === segments.length - 1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...segments];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setSegments(updated);
  };

  const addBrandPresetToOutro = (preset: string) => {
    setOutroText(preset);
  };

  const fullTextPreview = `${segments.filter(s => s.trim().length > 0).join(' ')} ${outroText}`.trim();
  const wordCount = fullTextPreview.split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.round(wordCount / 2.3); // Avg speaking speed ~2.3 words/sec in Uzbek

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[110] flex items-center justify-center p-4 md:p-6 overflow-y-auto">
      <div className="bg-slate-900 rounded-[32px] max-w-3xl w-full border border-slate-800 shadow-2xl flex flex-col max-h-[90vh] my-auto overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-500/20 rounded-2xl flex items-center justify-center text-xl border border-brand-500/30">
              ✍️
            </div>
            <div>
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                Ssenariyni Tahrirlash
                <span className="text-xs bg-brand-500/20 text-brand-300 font-mono px-2.5 py-0.5 rounded-full border border-brand-500/30">
                  {topic}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Subtitr va diktor matnini o'zingiz xohlaganday tahrirlang</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-9 h-9 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950 px-6 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('segments')}
            className={`pb-3 text-xs font-bold px-4 border-b-2 transition ${
              activeTab === 'segments'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🧩 Qismma-qism Matn ({segments.length} ta jumla)
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`pb-3 text-xs font-bold px-4 border-b-2 transition ${
              activeTab === 'preview'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📄 To'liq Matn & Vaqt (~{estimatedSeconds}s)
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'segments' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Videodagi Subtitr Jumlalari
                </span>
                <button
                  onClick={addSegment}
                  className="text-xs bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 px-3 py-1.5 rounded-xl border border-brand-500/30 flex items-center gap-1 font-bold transition"
                >
                  <span>+</span> Yangi Jumla Qo'shish
                </button>
              </div>

              {segments.map((seg, idx) => (
                <div key={idx} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 group hover:border-slate-700 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold bg-slate-800 text-brand-300 px-2.5 py-0.5 rounded-md">
                      #{idx + 1} {idx === 0 ? "🔥 Viral Hook" : idx === segments.length - 1 ? "💡 Yakun" : "📖 Tana qismi"}
                    </span>
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                      <button
                        onClick={() => moveSegment(idx, 'up')}
                        disabled={idx === 0}
                        className="w-7 h-7 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 rounded-lg text-xs text-slate-300 flex items-center justify-center"
                        title="Yuqoriga"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveSegment(idx, 'down')}
                        disabled={idx === segments.length - 1}
                        className="w-7 h-7 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 rounded-lg text-xs text-slate-300 flex items-center justify-center"
                        title="Pastga"
                      >
                        ▼
                      </button>
                      <button
                        onClick={() => removeSegment(idx)}
                        disabled={segments.length <= 1}
                        className="w-7 h-7 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-30 rounded-lg text-xs text-red-400 flex items-center justify-center ml-1"
                        title="O'chirish"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    value={seg}
                    onChange={(e) => handleSegmentChange(idx, e.target.value)}
                    placeholder={`#${idx + 1}-jumla matnini kiriting...`}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500 resize-none transition"
                  />
                </div>
              ))}

              {/* Outro Brand Text Section */}
              <div className="bg-gradient-to-br from-amber-500/10 to-slate-900 p-5 rounded-2xl border border-amber-500/20 space-y-3 mt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 text-sm">📢</span>
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      Brend Ovozli Reklama Matni (Outro)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">Luxe Core</span>
                </div>

                <textarea
                  rows={2}
                  value={outroText}
                  onChange={(e) => setOutroText(e.target.value)}
                  placeholder="Video so'ngida diktor aytadigan brend jumlasi..."
                  className="w-full bg-slate-950 border border-amber-500/30 rounded-xl p-3 text-sm text-amber-200 placeholder-slate-600 focus:outline-none focus:border-amber-400 resize-none"
                />

                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 block">Tayyor brend jumlalari:</span>
                  <div className="flex flex-wrap gap-2">
                    {BRAND_PRESETS.map((preset, pIdx) => (
                      <button
                        key={pIdx}
                        onClick={() => addBrandPresetToOutro(preset)}
                        className="text-[10px] bg-slate-900 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 px-2.5 py-1 rounded-lg border border-slate-800 hover:border-amber-500/40 transition text-left"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-brand-400">To'liq Diktorlik Matni</span>
                  <span className="text-xs font-mono text-slate-400">
                    {wordCount} so'z • taxminan {estimatedSeconds} soniya
                  </span>
                </div>
                <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                  {fullTextPreview || "Matn hali kiritilmadi..."}
                </p>
              </div>

              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
                <p className="font-bold text-slate-300">💡 Maslahat:</p>
                <p>Ushbu matn asosida yangi audio va subtitrtlar video playerga integratsiya qilinadi. Har bir jumla ekranda alohida kadr va animasiya bilan chiqadi.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-950 flex items-center justify-between gap-4">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-5 py-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Bekor qilish
          </button>

          <button
            onClick={() => onSaveAndGenerate(segments.filter(s => s.trim().length > 0), outroText)}
            disabled={isLoading || segments.filter(s => s.trim().length > 0).length === 0}
            className="flex-1 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white shadow-lg shadow-brand-500/25 border border-brand-500/40 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{loadingStep || "Video Yaratilmoqda..."}</span>
              </>
            ) : (
              <>
                <span>🎬</span>
                <span>Ushbu Ssenariy Bilan Video Yaratish</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
