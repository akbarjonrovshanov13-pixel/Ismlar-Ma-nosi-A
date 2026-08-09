import React from 'react';
import { WatermarkPosition, AdConfig } from '../types';

interface AdSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  adConfig: AdConfig;
  onUpdateAdConfig: (newConfig: Partial<AdConfig>) => void;
}

export const AdSettingsModal: React.FC<AdSettingsModalProps> = ({
  isOpen,
  onClose,
  adConfig,
  onUpdateAdConfig
}) => {
  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          onUpdateAdConfig({
            customOutroImages: [...adConfig.customOutroImages, reader.result as string].slice(0, 6)
          });
        }
      };
      reader.readAsDataURL(file as Blob);
    });
  };

  const removeImage = (index: number) => {
    onUpdateAdConfig({
      customOutroImages: adConfig.customOutroImages.filter((_, i) => i !== index)
    });
  };

  const resetToDefaults = () => {
    onUpdateAdConfig({
      watermarkText: "✨ @luxe_core_uz",
      watermarkPosition: WatermarkPosition.TOP_RIGHT,
      adTitle: "LUXE CORE",
      adSubtitle: "Qutilar • Paketlar • Qadoqlash • HoReCa",
      adHandle: "@luxe_core_uz",
      customOutroImages: []
    });
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[120] flex items-center justify-center p-4 md:p-6">
      <div className="bg-slate-900 rounded-[32px] max-w-2xl w-full border border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-gradient-to-r from-amber-500/10 via-slate-900 to-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center text-xl shadow-lg shadow-amber-500/20">
              📢
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Reklama Joyi & Watermark Sozlamalari</h3>
              <p className="text-xs text-slate-400">Videodagi brend va reklama joylarini moslashtirish</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Section 1: Watermark Tag */}
          <div className="bg-slate-950/80 rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <span>🏷️</span> Watermark / Logotip Belgisi
              </h4>
              <span className="text-[10px] bg-amber-500/10 text-amber-300 px-2.5 py-1 rounded-lg border border-amber-500/20 font-mono">
                Videoda ko'rinadigan belgi
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Watermark Matni / Nik / Tel</label>
                <input
                  type="text"
                  value={adConfig.watermarkText}
                  onChange={(e) => onUpdateAdConfig({ watermarkText: e.target.value })}
                  placeholder="masalan: ✨ @luxe_core_uz"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Watermark Joylashuvi (Pozitsiyasi)</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateAdConfig({ watermarkPosition: WatermarkPosition.TOP_RIGHT })}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
                      adConfig.watermarkPosition === WatermarkPosition.TOP_RIGHT
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>↗️</span>
                    <span>Yuqori O'ng (Tavsiya)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateAdConfig({ watermarkPosition: WatermarkPosition.TOP_LEFT })}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
                      adConfig.watermarkPosition === WatermarkPosition.TOP_LEFT
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>↖️</span>
                    <span>Yuqori Chap</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateAdConfig({ watermarkPosition: WatermarkPosition.BOTTOM_RIGHT })}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
                      adConfig.watermarkPosition === WatermarkPosition.BOTTOM_RIGHT
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>↘️</span>
                    <span>Pastki O'ng</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateAdConfig({ watermarkPosition: WatermarkPosition.BOUNCING })}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
                      adConfig.watermarkPosition === WatermarkPosition.BOUNCING
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>🌀</span>
                    <span>Raqs tushuvchi</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateAdConfig({ watermarkPosition: WatermarkPosition.DISABLED })}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
                      adConfig.watermarkPosition === WatermarkPosition.DISABLED
                        ? 'bg-red-500/20 border-red-500 text-red-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>🚫</span>
                    <span>O'chirilgan</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Outro Advert Showcase Card */}
          <div className="bg-slate-950/80 rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                <span>🎬</span> Video Oxiridagi Reklama Karti (Outro Ad)
              </h4>
              <span className="text-[10px] bg-purple-500/10 text-purple-300 px-2.5 py-1 rounded-lg border border-purple-500/20 font-mono">
                Luxe Core Reklama Sloti
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Brend / Sarlavha</label>
                <input
                  type="text"
                  value={adConfig.adTitle}
                  onChange={(e) => onUpdateAdConfig({ adTitle: e.target.value })}
                  placeholder="masalan: LUXE CORE"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Murojaat / Akkaunt</label>
                <input
                  type="text"
                  value={adConfig.adHandle}
                  onChange={(e) => onUpdateAdConfig({ adHandle: e.target.value })}
                  placeholder="masalan: @luxe_core_uz"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Xizmatlar / Tavsif Matni</label>
                <input
                  type="text"
                  value={adConfig.adSubtitle}
                  onChange={(e) => onUpdateAdConfig({ adSubtitle: e.target.value })}
                  placeholder="masalan: Qutilar • Paketlar • Qadoqlash • HoReCa"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition"
                />
              </div>
            </div>

            {/* Product Images Showcase */}
            <div className="pt-2 border-t border-slate-800/80">
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Reklama Mahsulot Rasmlari (Avval ko'rsatiladigan kadrlar)
              </label>

              <div className="grid grid-cols-4 gap-2 mb-3">
                {adConfig.customOutroImages.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-700 group">
                    <img src={url} alt={`Ad slide ${idx}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {adConfig.customOutroImages.length < 6 && (
                  <label className="aspect-square rounded-xl border-2 border-dashed border-slate-700 hover:border-purple-500 bg-slate-900/50 hover:bg-purple-500/10 flex flex-col items-center justify-center cursor-pointer transition text-slate-400 hover:text-purple-300">
                    <span className="text-xl">➕</span>
                    <span className="text-[10px] mt-1 font-bold">Rasm</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                💡 Agar rasmlar yuklanmasa, standart quti va paketlar to'plami namoyish etiladi.
              </p>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={resetToDefaults}
            className="text-xs text-slate-400 hover:text-white underline transition"
          >
            Standart holatga qaytarish
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white py-2.5 px-6 rounded-xl font-bold text-xs shadow-lg shadow-purple-500/20 transition"
          >
            Saqlash va Yopish ✓
          </button>
        </div>

      </div>
    </div>
  );
};
