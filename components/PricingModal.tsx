import React, { useState } from 'react';
import { auth, signInWithGoogle, createPaymentRequestInFirestore } from '../lib/firebase';
import { createPaymentRequestInPostgres, claimTelegramBonusInPostgres } from '../lib/postgresService';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentSubmitted?: () => void;
  onBonusClaimed?: () => void;
  userCredits?: number;
}

export const TELEGRAM_CHANNEL = "https://t.me/Akramjon1984";
const PAYNET_LINK = "https://app.paynet.uz/?m=49156&i=4805742d-d76c-4b39-8c02-8ddf1c450f33&branchId=&actTypeId=144";
const TELEGRAM_ADMIN = "https://t.me/Akramjon1984";

export const PricingModal: React.FC<PricingModalProps> = ({
  isOpen,
  onClose,
  onPaymentSubmitted,
  onBonusClaimed,
  userCredits = 0,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; price: string; count: string }>({
    name: "10 ta Ism (Kreator)",
    price: "79 000 so'm",
    count: "10 ta video"
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClaimingBonus, setIsClaimingBonus] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClaimBonusClick = async () => {
    setIsClaimingBonus(true);
    // 1. Open Telegram channel in new tab
    window.open(TELEGRAM_CHANNEL, '_blank');

    // 2. Claim bonus in backend
    try {
      const currentUser = auth.currentUser;
      const uid = currentUser?.uid || localStorage.getItem('ismlar_auth_user') 
        ? JSON.parse(localStorage.getItem('ismlar_auth_user') || '{}').uid 
        : null;

      if (uid) {
        const res = await claimTelegramBonusInPostgres(uid);
        if (res?.granted) {
          setSubmittedMessage("🎉 Tabriklaymiz! 1 ta bepul video hisobingizga qo'shildi. Telegramga a'zo bo'lganingiz uchun rahmat!");
        } else {
          setSubmittedMessage("✅ Siz allaqachon bepul videongizdan foydalangansiz yoki hisobingizda kredit mavjud.");
        }
      } else {
        setSubmittedMessage("🎉 Telegramga a'zo bo'ldingiz! Saytga kiring va 1 ta bepul videoni yarating.");
      }

      if (onBonusClaimed) onBonusClaimed();
    } catch (err) {
      console.warn("Bonus claiming error:", err);
    } finally {
      setIsClaimingBonus(false);
    }
  };

  const handleRegisterPaymentAndOpenPaynet = async (url: string) => {
    if (!auth.currentUser) {
      try {
        await signInWithGoogle();
      } catch (e) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (auth.currentUser) {
        await createPaymentRequestInPostgres(selectedPlan.name, selectedPlan.price, {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email || '',
          displayName: auth.currentUser.displayName || ''
        });
        await createPaymentRequestInFirestore(selectedPlan.name, selectedPlan.price).catch(() => {});
      }
      setSubmittedMessage(`So'rov adminga yuborildi! Paynet to'lovini bajarib, chekni Telegram adminga (@Akramjon1984) yuboring.`);
      if (onPaymentSubmitted) onPaymentSubmitted();
    } catch (err: any) {
      console.error("Payment request error:", err);
    } finally {
      setIsSubmitting(false);
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[120] flex items-center justify-center p-3 md:p-6">
      <div className="bg-slate-900 rounded-[32px] max-w-4xl w-full border border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-5 md:p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-brand-600 text-white rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-amber-500/20">
              💎
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Tariflar va Obuna</h3>
              <p className="text-[11px] text-slate-400">Ismlar ma'nosi AI videolarni yaratish to'plamlari</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 md:p-6 overflow-y-auto space-y-6">
          
          {submittedMessage && (
            <div className="bg-emerald-500/10 border border-emerald-500/40 p-4 rounded-2xl text-emerald-300 text-xs font-bold flex items-center gap-3">
              <span className="text-xl">✅</span>
              <span>{submittedMessage}</span>
            </div>
          )}

          {/* 🎁 FREE TELEGRAM BONUS CARD */}
          <div className="bg-gradient-to-r from-blue-950/70 via-indigo-950/70 to-slate-950 border border-blue-500/40 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl shadow-blue-950/40">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center text-2xl border border-blue-400/30 flex-shrink-0">
                🎁
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded uppercase tracking-wider border border-blue-400/30">
                    Bepul Sinov
                  </span>
                  <span className="text-xs text-emerald-400 font-extrabold">0 so'm</span>
                </div>
                <h4 className="text-white font-black text-sm md:text-base mt-1">1 ta Ism Videosini BEPUL Yarating</h4>
                <p className="text-slate-300 text-xs mt-0.5">
                  Rasmiy Telegram kanalimizga a'zo bo'ling va hisobingizga darhol 1 ta bepul video oling!
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={isClaimingBonus}
              onClick={handleClaimBonusClick}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 transition transform active:scale-95 whitespace-nowrap"
            >
              <span>✈️</span>
              <span>{isClaimingBonus ? "Kutilmoqda..." : "Telegramga a'zo bo'lish (+1 Video)"}</span>
            </button>
          </div>

          {/* Pricing Cards Grid (3 Cards) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* 1. 3 Ism Plan */}
            <div 
              onClick={() => setSelectedPlan({ name: "3 ta Ism (Boshlang'ich)", price: "29 000 so'm", count: "3 ta video" })}
              className={`relative bg-slate-950 rounded-2xl p-5 border transition cursor-pointer flex flex-col justify-between ${
                selectedPlan.price === "29 000 so'm"
                  ? 'border-brand-500 ring-2 ring-brand-500/30 bg-brand-950/20'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Boshlang'ich</span>
                <h4 className="text-xl font-black text-white">3 ta Ism</h4>
                <p className="text-[11px] text-slate-400 mt-1">O'zingiz va yaqinlaringiz uchun</p>
                
                <div className="my-4 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">29 000</span>
                  <span className="text-xs font-bold text-slate-400">so'm</span>
                </div>

                <ul className="space-y-2 text-xs text-slate-300 border-t border-slate-800/80 pt-3">
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> 3 ta ism uchun to'liq HD AI video
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> 3D Oltin & Koinot san'at rasmlari
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Professional diktor ovozi
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Viral TikTok / Reels animatsiyalari
                  </li>
                </ul>
              </div>

              <button 
                type="button"
                className={`mt-5 w-full py-2.5 rounded-xl font-bold text-xs transition ${
                  selectedPlan.price === "29 000 so'm"
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {selectedPlan.price === "29 000 so'm" ? 'Tanlandi ✓' : 'Tanlash (29 000 so\'m)'}
              </button>
            </div>

            {/* 2. 10 Ism Plan (Recommended) */}
            <div 
              onClick={() => setSelectedPlan({ name: "10 ta Ism (Kreator)", price: "79 000 so'm", count: "10 ta video" })}
              className={`relative bg-slate-950 rounded-2xl p-5 border transition cursor-pointer flex flex-col justify-between ${
                selectedPlan.price === "79 000 so'm"
                  ? 'border-purple-500 ring-2 ring-purple-500/30 bg-purple-950/20'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="absolute -top-3 right-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-extrabold text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider shadow-md">
                Tavsiya etiladi (Eng ommabop)
              </div>

              <div>
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block mb-1">Kreator Paket</span>
                <h4 className="text-xl font-black text-white">10 ta Ism</h4>
                <p className="text-[11px] text-slate-400 mt-1">Faol blogerlar va tarmoq administratorlari uchun</p>
                
                <div className="my-4 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">79 000</span>
                  <span className="text-xs font-bold text-slate-400">so'm</span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded ml-2 font-mono">Tejamkor!</span>
                </div>

                <ul className="space-y-2 text-xs text-slate-300 border-t border-slate-800/80 pt-3">
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> 10 ta ism uchun to'liq HD video
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> 4 xil betakror 3D san'at uslublari
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> gemini-3.8-flash chuqur tahlili
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Barcha ovoz va subtitr uslublari
                  </li>
                </ul>
              </div>

              <button 
                type="button"
                className={`mt-5 w-full py-2.5 rounded-xl font-bold text-xs transition ${
                  selectedPlan.price === "79 000 so'm"
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {selectedPlan.price === "79 000 so'm" ? 'Tanlandi ✓' : 'Tanlash (79 000 so\'m)'}
              </button>
            </div>

            {/* 3. 25 Ism Plan (VIP / Biznes) */}
            <div 
              onClick={() => setSelectedPlan({ name: "25 ta Ism (VIP)", price: "179 000 so'm", count: "25 ta video" })}
              className={`relative bg-slate-950 rounded-2xl p-5 border transition cursor-pointer flex flex-col justify-between ${
                selectedPlan.price === "179 000 so'm"
                  ? 'border-amber-500 ring-2 ring-amber-500/30 bg-amber-950/20'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">VIP Paket</span>
                <h4 className="text-xl font-black text-white">25 ta Ism</h4>
                <p className="text-[11px] text-slate-400 mt-1">Katta hajmda video yaratuvchilar uchun</p>
                
                <div className="my-4 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">179 000</span>
                  <span className="text-xs font-bold text-slate-400">so'm</span>
                  <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded ml-2 font-mono">Maksimal!</span>
                </div>

                <ul className="space-y-2 text-xs text-slate-300 border-t border-slate-800/80 pt-3">
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> 25 ta ism uchun to'liq HD AI video
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Tezkor navbatsiz generatsiya
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Suv belgisisiz (Watermark-free)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> 24/7 Shaxsiy admin yordami
                  </li>
                </ul>
              </div>

              <button 
                type="button"
                className={`mt-5 w-full py-2.5 rounded-xl font-bold text-xs transition ${
                  selectedPlan.price === "179 000 so'm"
                    ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {selectedPlan.price === "179 000 so'm" ? 'Tanlandi ✓' : 'Tanlash (179 000 so\'m)'}
              </button>
            </div>

          </div>

          {/* Payment Instructions Box */}
          <div className="bg-slate-950 p-5 rounded-2xl border border-amber-500/30 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">💳</span>
                <h4 className="font-bold text-sm text-white">To'lov Tartibi va Yo'riqnoma</h4>
              </div>
              <span className="text-xs font-mono font-bold bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-lg border border-amber-500/30">
                Tanlangan: {selectedPlan.name} ({selectedPlan.price})
              </span>
            </div>

            <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside">
              <li>Pastdagi <b>Paynet to'lov linki</b> tugmasini bosing va to'lovni (<b>{selectedPlan.price}</b>) amalga oshiring.</li>
              <li>To'lov bajarilgach, <b>chek skrinshotini</b> olib, Telegram adminga (<b>@Akramjon1984</b>) yuboring.</li>
              <li>Admin chekni tasdiqlaganidan so'ng, hisobingizga kreditlar avtomatik biriktiriladi!</li>
            </ol>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleRegisterPaymentAndOpenPaynet(PAYNET_LINK)}
                className="w-full sm:w-auto flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-center py-3 px-4 rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/20 border border-emerald-400/30 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>💳</span>
                <span>Paynet Orqali To'lash ({selectedPlan.price})</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleRegisterPaymentAndOpenPaynet(TELEGRAM_ADMIN)}
                className="w-full sm:w-auto flex-1 bg-blue-600 hover:bg-blue-500 text-white text-center py-3 px-4 rounded-xl font-bold text-xs shadow-lg shadow-blue-600/20 border border-blue-400/30 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>✈️</span>
                <span>Chekni Adminga Yuborish (@Akramjon1984)</span>
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
