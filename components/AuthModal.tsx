import React, { useState } from 'react';
import { db, signInWithGoogle } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { syncUserWithPostgres } from '../lib/postgresService';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: any) => void;
  onOpenBonusModal?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  onOpenBonusModal,
}) => {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const ADMIN_PASSWORDS = ['Hisobot201415!'];

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const user = await signInWithGoogle();
      if (user) {
        const safeEmail = user.email || `${user.uid}@user.ismlar.ai`;
        const safeName = user.displayName || 'Google Foydalanuvchisi';
        const safePhoto = user.photoURL || '';

        // 1. Sync to PostgreSQL
        const pgUser = await syncUserWithPostgres({
          uid: user.uid,
          email: safeEmail,
          displayName: safeName,
          photoURL: safePhoto
        }).catch(() => null);

        // 2. Also save to local registry as backup
        try {
          const local = JSON.parse(localStorage.getItem('ismlar_local_users') || '[]');
          const idx = local.findIndex((u: any) => u.userId === user.uid || (u.email && u.email === safeEmail));
          const isPrimaryAdmin = safeEmail.toLowerCase() === 'akbarjonrovshanov13@gmail.com';
          const defaultCreds = isPrimaryAdmin ? 9999 : (pgUser?.credits ?? 0);
          const item = {
            userId: user.uid,
            email: safeEmail,
            displayName: safeName,
            photoURL: safePhoto,
            credits: defaultCreds,
            totalAllowed: defaultCreds,
            isApproved: true,
            createdAt: new Date().toISOString()
          };
          if (idx >= 0) local[idx] = { ...local[idx], ...item };
          else local.unshift(item);
          localStorage.setItem('ismlar_local_users', JSON.stringify(local));
        } catch {}

        const userObj = {
          uid: user.uid,
          email: safeEmail,
          displayName: safeName,
          photoURL: safePhoto
        };

        onLoginSuccess(userObj);
        onClose();

        // If user has not claimed bonus and has 0 credits, open bonus modal
        if (pgUser && !pgUser.claimedTelegramBonus && pgUser.credits <= 0) {
          setTimeout(() => {
            onOpenBonusModal?.();
          }, 300);
        }
      }
    } catch (err: any) {
      console.warn("Google login failed:", err);
      if (err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain')) {
        setErrorMsg("Firebase bu sayt domenini kutmoqda. Iltimos, Vercel domenini Firebase Console -> Authentication -> Settings -> Authorized Domains ro'yxatiga qo'shing.");
      } else if (err?.code === 'auth/popup-blocked') {
        setErrorMsg("Brauzeringiz Google oynasini ochishga to'sqinlik qildi. Iltimos, qalqib chiquvchi oynaga (pop-up) ruxsat bering.");
      } else if (err?.code !== 'auth/popup-closed-by-user') {
        setErrorMsg(err?.message || "Google orqali kirishda xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAdminQuickLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (ADMIN_PASSWORDS.includes(adminPass.trim())) {
      const adminUser = {
        uid: "admin_akbarjon",
        email: "akbarjonrovshanov13@gmail.com",
        displayName: "Admin (Akbarjon)",
        photoURL: ""
      };

      // 1. Sync admin to PostgreSQL
      syncUserWithPostgres(adminUser).catch(() => {});

      // 2. Sync admin to Firestore
      try {
        setDoc(doc(db, 'users', adminUser.uid), {
          userId: adminUser.uid,
          email: adminUser.email,
          displayName: adminUser.displayName,
          photoURL: "",
          credits: 9999,
          totalAllowed: 9999,
          isApproved: true,
          createdAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
      } catch {}

      // 3. Sync admin to local registry
      try {
        const local = JSON.parse(localStorage.getItem('ismlar_local_users') || '[]');
        const idx = local.findIndex((u: any) => u.email === adminUser.email);
        const item = {
          userId: adminUser.uid,
          email: adminUser.email,
          displayName: adminUser.displayName,
          photoURL: "",
          credits: 9999,
          totalAllowed: 9999,
          isApproved: true,
          createdAt: new Date().toISOString()
        };
        if (idx >= 0) local[idx] = { ...local[idx], ...item };
        else local.unshift(item);
        localStorage.setItem('ismlar_local_users', JSON.stringify(local));
      } catch {}

      onLoginSuccess(adminUser);
      onClose();
    } else {
      setErrorMsg("Xato Admin paroli!");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[130] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-[32px] max-w-md w-full border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-purple-600 text-white rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-brand-500/20">
              🚀
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Tizimga Kirish</h3>
              <p className="text-[11px] text-slate-400">Google hisobingiz orqali xavfsiz kiring</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 p-3.5 rounded-2xl text-red-300 text-xs font-semibold leading-relaxed">
              ⚠️ {errorMsg}
            </div>
          )}

          {!isAdminMode ? (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-brand-500/10 via-purple-500/10 to-sky-500/10 border border-brand-500/30 p-4 rounded-2xl space-y-1.5">
                <div className="flex items-center gap-2 text-brand-300 font-bold text-xs">
                  <span>🎁</span>
                  <span>1 ta Bepul Video Sovg'asi!</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Google hisobingiz bilan kiring, ism va telefon raqamingizni qoldiring hamda Telegram botimizga a'zo bo'lib <b>1 ta bepul video</b> yarating!
                </p>
              </div>

              {/* Google Sign-in Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full py-4 px-5 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-sm sm:text-base shadow-xl hover:shadow-2xl flex items-center justify-center gap-3 transition-all duration-200 active:scale-95 disabled:opacity-50 border border-slate-200"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                )}
                <span>{loading ? "Bog'lanmoqda..." : "Google hisobi bilan kirish"}</span>
              </button>

              <div className="pt-2 text-center space-y-2">
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                  <span>🔒</span>
                  <span>Parol kiritish shart emas • 100% xavfsiz</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Tizimga kirish orqali xizmat ko'rsatish shartlariga rozilik bildirasiz.
                </p>
              </div>

              {/* Discreet Admin Login Link */}
              <div className="pt-3 border-t border-slate-800/80 text-center">
                <button
                  type="button"
                  onClick={() => { setIsAdminMode(true); setErrorMsg(null); }}
                  className="text-[11px] text-slate-500 hover:text-amber-400 transition font-medium"
                >
                  👑 Admin sifatida kirish
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleAdminQuickLogin} className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl text-amber-300 text-xs">
                👑 <b>Admin hisobiga tezkor kirish:</b><br />
                Parolni kiritish orqali <code>akbarjonrovshanov13@gmail.com</code> sifatida cheksiz imkoniyat bilan kirasiz.
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Admin Maxfiy Paroli</label>
                <input
                  type="password"
                  required
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  placeholder="Parolni kiriting..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setIsAdminMode(false); setErrorMsg(null); }}
                  className="w-1/3 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                >
                  ◀ Orqaga
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-3 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-amber-500/20"
                >
                  👑 Kirish
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
