import React, { useState } from 'react';
import { auth, signInWithGoogle, createPaymentRequestInFirestore } from '../lib/firebase';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentSubmitted?: () => void;
}

export const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose, onPaymentSubmitted }) => {
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; price: string; count: string }>({
    name: "10 ta Ism (Kreator)",
    price: "100 000 so'm",
    count: "10 ta video"
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const PAYNET_LINK = "https://app.paynet.uz/?m=49156&i=4805742d-d76c-4b39-8c02-8ddf1c450f33&branchId=&actTypeId=144";
  const TELEGRAM_ADMIN = "https://t.me/Akramjon1984";

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
      await createPaymentRequestInFirestore(selectedPlan.name, selectedPlan.price);
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
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[120] flex items-center justify-center p-4 md:p-6">
      <div className="bg-slate-900 rounded-[32px] max-w-3xl w-full border border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-brand-600 text-white rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-amber-500/20">
              💎
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Tariflar va Obuna</h3>
              <p className="text-[11px] text-slate-400">Ismlar ma'nosi AI videolarni yaratish paketi</p>
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
        <div className="p-6 overflow-y-auto space-y-6">
          
          {submittedMessage && (
            <div className="bg-emerald-500/10 border border-emerald-500/40 p-4 rounded-2xl text-emerald-300 text-xs font-bold flex items-center gap-3">
              <span className="text-xl">✅</span>
              <span>{submittedMessage}</span>
            </div>
          )}

          {/* Pricing Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 3 Ism Plan */}
            <div 
              onClick={() => setSelectedPlan({ name: "3 ta Ism", price: "50 000 so'm", count: "3 ta video" })}
              className={`relative bg-slate-950 rounded-2xl p-6 border transition cursor-pointer flex flex-col justify-between ${
                selectedPlan.price === "50 000 so'm"
                  ? 'border-brand-500 ring-2 ring-brand-500/30 bg-brand-950/20'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Boshlang'ich Paket</span>
                <h4 className="text-2xl font-black text-white">3 ta Ism</h4>
                <p className="text-xs text-slate-400 mt-1">3 ta video yaratish va sinash uchun</p>
                
                <div className="my-5 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">50 000</span>
                  <span className="text-sm font-bold text-slate-400">so'm</span>
                </div>

                <ul className="space-y-2.5 text-xs text-slate-300 border-t border-slate-800/80 pt-4">
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> 3 ta ism uchun to'liq HD AI video
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Professional AI ovozli dublyaj
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Viral TikTok subtitr va animatsiya
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Admin tasdiqlashi bilan faollashadi
                  </li>
                </ul>
              </div>

              <button 
                type="button"
                className={`mt-6 w-full py-3 rounded-xl font-bold text-xs transition ${
                  selectedPlan.price === "50 000 so'm"
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {selectedPlan.price === "50 000 so'm" ? 'Tanlandi ✓' : 'Tanlash (50 000 so\'m)'}
              </button>
            </div>

            {/* 10 Ism Plan (Recommended) */}
            <div 
              onClick={() => setSelectedPlan({ name: "10 ta Ism (Kreator)", price: "100 000 so'm", count: "10 ta video" })}
              className={`relative bg-slate-950 rounded-2xl p-6 border transition cursor-pointer flex flex-col justify-between ${
                selectedPlan.price === "100 000 so'm"
                  ? 'border-purple-500 ring-2 ring-purple-500/30 bg-purple-950/20'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="absolute -top-3 right-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-extrabold text-[10px] px-3 py-1 rounded-full uppercase tracking-wider shadow-md">
                Tavsiya etiladi (Eng tejamkor)
              </div>

              <div>
                <span className="text-xs font-bold text-purple-400 uppercase tracking-wider block mb-1">Kreator Paket</span>
                <h4 className="text-2xl font-black text-white">10 ta Ism</h4>
                <p className="text-xs text-slate-400 mt-1">Faol blogerlar va tarmoq administratorlari uchun</p>
                
                <div className="my-5 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">100 000</span>
                  <span className="text-sm font-bold text-slate-400">so'm</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded ml-2 font-mono">Tejamkor!</span>
                </div>

                <ul className="space-y-2.5 text-xs text-slate-300 border-t border-slate-800/80 pt-4">
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> 10 ta ism uchun to'liq HD AI video
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Professional AI ovozli dublyaj
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Barcha subtitr uslublari va animatsiyalar
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Admin tasdiqlashi bilan faollashadi
                  </li>
                </ul>
              </div>

              <button 
                type="button"
                className={`mt-6 w-full py-3 rounded-xl font-bold text-xs transition ${
                  selectedPlan.price === "100 000 so'm"
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {selectedPlan.price === "100 000 so'm" ? 'Tanlandi ✓' : 'Tanlash (100 000 so\'m)'}
              </button>
            </div>

          </div>

          {/* Payment Instructions Box */}
          <div className="bg-slate-950 p-6 rounded-2xl border border-amber-500/30 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">💳</span>
                <h4 className="font-bold text-sm text-white">To'lov Tartibi va Yo'riqnoma</h4>
              </div>
              <span className="text-xs font-mono font-bold bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-lg border border-amber-500/30">
                Tanlangan: {selectedPlan.name} ({selectedPlan.price})
              </span>
            </div>

            <ol className="space-y-2.5 text-xs text-slate-300 list-decimal list-inside">
              <li>Pastdagi <b>Paynet to'lov linki</b> tugmasini bosing va to'lovni (<b>{selectedPlan.price}</b>) amalga oshiring.</li>
              <li>To'lov bajarilgach, <b>chek skrinshotini</b> olib, Telegram adminga (<b>@Akramjon1984</b>) yuboring.</li>
              <li>Admin chekni tasdiqlaganidan so'ng, videolaringiz avtomatik faollashadi!</li>
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
