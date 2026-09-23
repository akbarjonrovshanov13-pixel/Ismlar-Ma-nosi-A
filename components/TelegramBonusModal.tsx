import React, { useState, useEffect } from 'react';
import { claimTelegramBonusInPostgres, UserProfileDocument } from '../lib/postgresService';

interface TelegramBonusModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  userProfile: UserProfileDocument | null;
  onBonusClaimed: (newCredits: number, phone: string) => void;
  onOpenAuthModal: () => void;
}

export const TelegramBonusModal: React.FC<TelegramBonusModalProps> = ({
  isOpen,
  onClose,
  user,
  userProfile,
  onBonusClaimed,
  onOpenAuthModal,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [hasVisitedTelegram, setHasVisitedTelegram] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.displayName || userProfile?.displayName || '');
      setPhone(userProfile?.phone || '');
    }
  }, [user, userProfile]);

  if (!isOpen) return null;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    // Allow digits, spaces, plus, hyphens
    if (/^[0-9+\s-]*$/.test(val)) {
      setPhone(val);
    }
  };

  const handleOpenTelegram = () => {
    window.open('https://t.me/Luxecoreuzbot', '_blank');
    setHasVisitedTelegram(true);
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!user) {
      onClose();
      onOpenAuthModal();
      return;
    }

    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg("Iltimos, ismingizni kiriting.");
      return;
    }

    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length < 9) {
      setErrorMsg("Iltimos, to'liq telefon raqamingizni kiriting (masalan: +998 90 123 45 67).");
      return;
    }

    setLoading(true);
    try {
      const res = await claimTelegramBonusInPostgres(user.uid, phone.trim(), cleanName);

      if (res?.granted) {
        onBonusClaimed(res.credits, phone.trim());
        onClose();
      } else {
        setErrorMsg(
          res?.error || 
          "Ushbu Google akkaunt yoki telefon raqami orqali allaqachon bepul video olingan. Har bir foydalanuvchiga faqat 1 marta bepul video beriladi."
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Bonusni faollashtirishda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[140] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-[32px] max-w-md w-full border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-sky-500/10 via-brand-500/10 to-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-sky-500/30 animate-bounce">
              🎁
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-400">Maxsus Sovg'a</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">1 ta Video</span>
              </div>
              <h3 className="font-extrabold text-base sm:text-lg text-white">Bepul Videoni Olish</h3>
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
        <div className="p-6 space-y-5">
          {errorMsg && (
            <div className="bg-red-500/15 border border-red-500/30 p-3.5 rounded-2xl text-red-300 text-xs font-semibold leading-relaxed animate-in fade-in">
              ⚠️ {errorMsg}
            </div>
          )}

          {!user ? (
            <div className="space-y-4 text-center py-2">
              <div className="w-16 h-16 bg-slate-800 rounded-3xl mx-auto flex items-center justify-center text-3xl">
                🔐
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-white text-sm">Avval tizimga kiring</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Bepul video olish uchun Google akkauntingiz orqali bir bosishda kiring:
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuthModal();
                }}
                className="w-full py-3.5 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-2xl text-sm transition shadow-lg flex items-center justify-center gap-2"
              >
                <span>🌐</span>
                <span>Google bilan kirish</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleClaim} className="space-y-4">
              {/* Google Verified Account Badge */}
              <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    G
                  </div>
                  <div className="truncate text-left">
                    <p className="text-[10px] text-slate-400">Google Akkaunt</p>
                    <p className="text-xs font-semibold text-white truncate font-mono">{user.email}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 flex-shrink-0">
                  <span>✓</span> Tasdiqlangan
                </span>
              </div>

              {/* Ism Field */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Ismingiz <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Masalan: Sardor"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>

              {/* Telefon Raqam Field */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center justify-between">
                  <span>Telefon raqamingiz <span className="text-amber-400">*</span></span>
                  <span className="text-[10px] text-slate-400 font-normal">SMS / Aloqa uchun</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="+998 90 123 45 67"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 pl-3 text-white text-sm focus:ring-2 focus:ring-brand-500 outline-none font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                  Har bir telefon raqami va Google akkauntiga <b>1 marta</b> bepul video beriladi.
                </p>
              </div>

              {/* Step 3: Telegram Bot Obunasi */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-sky-500/10 via-blue-500/10 to-indigo-500/10 border border-sky-500/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">✈️</span>
                    <span className="text-xs font-bold text-white">Telegram botga obuna:</span>
                  </div>
                  {hasVisitedTelegram && (
                    <span className="text-[10px] font-bold text-sky-400 flex items-center gap-1">
                      <span>✓</span> O'tildi
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 leading-tight">
                  Telegram botimizga ulaning va bepul videoni darhol hisobingizga yuklang:
                </p>
                <button
                  type="button"
                  onClick={handleOpenTelegram}
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 active:scale-95"
                >
                  <span>✈️ @Luxecoreuzbot ga obuna bo'lish</span>
                  <span>↗</span>
                </button>
              </div>

              {/* Claim Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-brand-600 via-purple-600 to-indigo-600 hover:from-brand-500 hover:to-purple-500 text-white font-extrabold rounded-2xl text-sm sm:text-base transition shadow-xl shadow-brand-500/20 disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2 border border-brand-400/20"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>🎁</span>
                    <span>Obuna bo'ldim va 1 ta bepul videoni olish</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
