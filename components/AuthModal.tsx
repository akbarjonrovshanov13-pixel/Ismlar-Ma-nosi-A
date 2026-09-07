import React, { useState } from 'react';
import { signInWithGoogle } from '../lib/firebase';
import { syncUserWithPostgres } from '../lib/postgresService';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: any) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [tab, setTab] = useState<'GOOGLE' | 'EMAIL' | 'ADMIN'>('GOOGLE');
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const ADMIN_PASSWORDS = ['1984', 'Akramjon1984', 'admin123', 'admin'];

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const user = await signInWithGoogle();
      if (user) {
        onLoginSuccess(user);
        onClose();
      }
    } catch (err: any) {
      console.warn("Google login failed:", err);
      if (err?.code === 'auth/unauthorized-domain') {
        setErrorMsg("Firebase da domen ruxsati sozlanmagan. Iltimos, 'Email orqali' yoki 'Admin' yorlig'idan kiring!");
      } else if (err?.code !== 'auth/popup-closed-by-user') {
        setErrorMsg(err?.message || "Google orqali kirishda xatolik yuz berdi");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setErrorMsg("Iltimos, to'g'ri email manzilini kiriting");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const pseudoUid = 'email_' + Buffer.from(email).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
      const userData = {
        uid: pseudoUid,
        email,
        displayName: nameInput.trim() || email.split('@')[0],
        photoURL: ""
      };

      // Sync to PostgreSQL
      await syncUserWithPostgres(userData);

      onLoginSuccess(userData);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Email orqali kirishda xatolik yuz berdi");
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

      // Sync admin to PostgreSQL
      syncUserWithPostgres(adminUser).catch(() => {});

      onLoginSuccess(adminUser);
      onClose();
    } else {
      setErrorMsg("Xato Admin paroli! (Masalan: 1984 yoki Akramjon1984)");
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
              <p className="text-[11px] text-slate-400">Ismlar ma'nosi AI generatoridan foydalanish</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-3 p-2 bg-slate-950/60 border-b border-slate-800 text-xs font-bold gap-1">
          <button
            onClick={() => { setTab('GOOGLE'); setErrorMsg(null); }}
            className={`py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
              tab === 'GOOGLE'
                ? 'bg-brand-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <span>🌐</span> Google
          </button>
          <button
            onClick={() => { setTab('EMAIL'); setErrorMsg(null); }}
            className={`py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
              tab === 'EMAIL'
                ? 'bg-brand-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <span>✉️</span> Email
          </button>
          <button
            onClick={() => { setTab('ADMIN'); setErrorMsg(null); }}
            className={`py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
              tab === 'ADMIN'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <span>👑</span> Admin
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 p-3.5 rounded-2xl text-red-300 text-xs font-semibold leading-relaxed">
              ⚠️ {errorMsg}
            </div>
          )}

          {tab === 'GOOGLE' && (
            <div className="space-y-4 text-center py-2">
              <p className="text-xs text-slate-400">
                Google hisobingiz orqali bir bosishda xavfsiz tizimga kiring:
              </p>

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm shadow-lg flex items-center justify-center gap-3 transition disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>{loading ? "Kirilmoqda..." : "Google bilan davom etish"}</span>
              </button>

              <p className="text-[10px] text-slate-500">
                Agar domen ruxsati sabab xatolik bersa, yuqoridagi <b>Email</b> yoki <b>Admin</b> bo'limidan foydalaning.
              </p>
            </div>
          )}

          {tab === 'EMAIL' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Ismingiz (ixtiyoriy)</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Masalan: Sardor"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Email manzilingiz *</label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-brand-500/20 disabled:opacity-50"
              >
                {loading ? "Kirilmoqda..." : "Kirish →"}
              </button>
            </form>
          )}

          {tab === 'ADMIN' && (
            <form onSubmit={handleAdminQuickLogin} className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl text-amber-300 text-xs">
                👑 <b>Admin hisobiga tezkor kirish:</b><br />
                Parolni kiritish orqali darhol <code>akbarjonrovshanov13@gmail.com</code> sifatida cheksiz imkoniyat bilan kirasiz.
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

              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-amber-500/20"
              >
                👑 Admin sifatida kirish
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
