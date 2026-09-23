import React, { useState, useEffect } from 'react';
import { 
  UserProfileDocument, 
  PaymentRequestDocument, 
  getAllUsersForAdmin, 
  getAllPaymentRequestsForAdmin, 
  adminApprovePayment, 
  adminRejectPayment,
  updateUserCreditsInFirestore
} from '../lib/firebase';
import {
  getAllUsersForAdminFromPostgres,
  getAllPaymentsForAdminFromPostgres,
  adminApprovePaymentInPostgres,
  adminRejectPaymentInPostgres,
  updateUserCreditsInPostgres,
  syncUserWithPostgres
} from '../lib/postgresService';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string | null;
  onRefreshUserProfile?: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  currentUserEmail,
  onRefreshUserProfile
}) => {
  const [passkey, setPasskey] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<'PAYMENTS' | 'USERS'>('PAYMENTS');
  
  const [users, setUsers] = useState<UserProfileDocument[]>([]);
  const [payments, setPayments] = useState<PaymentRequestDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState<boolean>(true);

  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editCreditsInput, setEditCreditsInput] = useState<number>(5);

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newCredits, setNewCredits] = useState(5);
  const [isAddingUser, setIsAddingUser] = useState(false);

  const ADMIN_PASSKEYS = ['Hisobot201415!'];

  useEffect(() => {
    // Auto unlock if logged in as primary admin email
    if (currentUserEmail && currentUserEmail.toLowerCase() === 'akbarjonrovshanov13@gmail.com') {
      setIsUnlocked(true);
    }
  }, [currentUserEmail]);

  useEffect(() => {
    if (isOpen && isUnlocked) {
      loadAdminData();
    }
  }, [isOpen, isUnlocked]);

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch from PostgreSQL
      const pgRes = await getAllUsersForAdminFromPostgres().catch(() => ({ users: [], dbConnected: false }));
      const pgPayments = await getAllPaymentsForAdminFromPostgres().catch(() => []);

      setIsDbConnected(pgRes.dbConnected);

      // 2. Fetch from Firestore
      const firestoreUsers = await getAllUsersForAdmin().catch(() => []);
      const firestorePayments = await getAllPaymentRequestsForAdmin().catch(() => []);

      // 3. Fallback: check localStorage for saved sessions and current active user
      const localUsers: UserProfileDocument[] = (() => {
        try {
          const list: UserProfileDocument[] = JSON.parse(localStorage.getItem('ismlar_local_users') || '[]');
          
          // Also check currently active logged in user in this browser
          const authUserRaw = localStorage.getItem('ismlar_auth_user');
          if (authUserRaw) {
            const authUser = JSON.parse(authUserRaw);
            if (authUser && (authUser.uid || authUser.email)) {
              const safeUid = authUser.uid || `user_${Date.now()}`;
              const safeEmail = authUser.email || `${safeUid}@user.ismlar.ai`;
              const exists = list.some((u: any) => u.userId === safeUid || (u.email && u.email.toLowerCase() === safeEmail.toLowerCase()));
              if (!exists) {
                list.unshift({
                  userId: safeUid,
                  email: safeEmail,
                  displayName: authUser.displayName || 'Foydalanuvchi',
                  photoURL: authUser.photoURL || '',
                  credits: 3,
                  totalAllowed: 3,
                  isApproved: true,
                  createdAt: new Date().toISOString()
                });
              }
            }
          }
          return list;
        } catch {
          return [];
        }
      })();

      // Auto-sync any local users to PostgreSQL so they are permanently saved in cloud DB
      localUsers.forEach(u => {
        if (u.userId && !pgRes.users.some(pu => pu.userId === u.userId || (pu.email && pu.email.toLowerCase() === (u.email || '').toLowerCase()))) {
          syncUserWithPostgres({
            uid: u.userId,
            email: u.email || `${u.userId}@user.ismlar.ai`,
            displayName: u.displayName,
            photoURL: u.photoURL,
          }).catch(() => {});
        }
      });

      // Merge all unique users by email or userId
      const userMap = new Map<string, UserProfileDocument>();
      [...pgRes.users, ...firestoreUsers, ...localUsers].forEach(u => {
        const key = (u.email || u.userId || '').toLowerCase();
        if (key && !userMap.has(key)) {
          userMap.set(key, u);
        }
      });

      // Merge all unique payments by id
      const paymentMap = new Map<string, PaymentRequestDocument>();
      [...pgPayments, ...firestorePayments].forEach(p => {
        const key = p.id || `${p.userId}_${p.createdAt}`;
        if (key && !paymentMap.has(key)) {
          paymentMap.set(key, p);
        }
      });

      setUsers(Array.from(userMap.values()));
      setPayments(Array.from(paymentMap.values()));
    } catch (err) {
      console.error("Failed to load admin data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUserManually = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      alert("Iltimos, to'g'ri email manzilini kiriting!");
      return;
    }

    setIsAddingUser(true);
    try {
      let encoded = "";
      try {
        encoded = btoa(encodeURIComponent(cleanEmail).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
      } catch {
        encoded = Math.random().toString(36).substring(2, 15);
      }
      const pseudoUid = 'email_' + encoded.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
      const newUserObj: UserProfileDocument = {
        userId: pseudoUid,
        email: cleanEmail,
        displayName: newName.trim() || cleanEmail.split('@')[0],
        photoURL: "",
        credits: newCredits,
        totalAllowed: newCredits,
        isApproved: true,
        createdAt: new Date().toISOString()
      };

      // 1. Sync to PostgreSQL
      await syncUserWithPostgres({
        uid: pseudoUid,
        email: cleanEmail,
        displayName: newUserObj.displayName,
        photoURL: ""
      }).catch(() => {});
      await updateUserCreditsInPostgres(pseudoUid, newCredits, true).catch(() => {});

      // 2. Sync to Firestore
      await updateUserCreditsInFirestore(pseudoUid, newCredits, true).catch(() => {});

      // 3. Sync to local registry
      try {
        const local = JSON.parse(localStorage.getItem('ismlar_local_users') || '[]');
        const idx = local.findIndex((u: any) => u.email === cleanEmail);
        if (idx >= 0) local[idx] = newUserObj;
        else local.unshift(newUserObj);
        localStorage.setItem('ismlar_local_users', JSON.stringify(local));
      } catch {}

      alert(`Foydalanuvchi muvaffaqiyatli qo'shildi! (${cleanEmail} -> ${newCredits} ta kredit)`);
      setShowAddUserModal(false);
      setNewEmail('');
      setNewName('');
      setNewCredits(5);
      loadAdminData();
      if (onRefreshUserProfile) onRefreshUserProfile();
    } catch (err: any) {
      alert("Xatolik: " + err.message);
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (ADMIN_PASSKEYS.includes(passkey.trim())) {
      setIsUnlocked(true);
      loadAdminData();
    } else {
      alert("Xato Admin paroli!");
    }
  };

  const handleApprovePayment = async (payment: PaymentRequestDocument, overrideCredits?: number) => {
    if (!payment.id) return;
    const creditsToAdd = overrideCredits ?? (payment.planName.includes('10') ? 10 : 3);
    try {
      await adminApprovePaymentInPostgres(payment.id, creditsToAdd);
      await adminApprovePayment(payment.id, payment.userId, creditsToAdd).catch(() => {});
      alert(`Muvaffaqiyatli! ${payment.userEmail} uchun +${creditsToAdd} ta ism/video taqdim etildi va holat tasdiqlandi.`);
      loadAdminData();
      if (onRefreshUserProfile) onRefreshUserProfile();
    } catch (err: any) {
      alert("Xatolik: " + err.message);
    }
  };

  const handleRejectPayment = async (paymentId: string) => {
    try {
      await adminRejectPaymentInPostgres(paymentId);
      await adminRejectPayment(paymentId).catch(() => {});
      loadAdminData();
    } catch (err: any) {
      alert("Xatolik: " + err.message);
    }
  };

  const handleQuickAddCredits = async (userId: string, currentCredits: number, addAmount: number) => {
    try {
      const newTotal = (currentCredits || 0) + addAmount;
      await updateUserCreditsInPostgres(userId, newTotal, true);
      await updateUserCreditsInFirestore(userId, newTotal, true).catch(() => {});
      alert(`Foydalanuvchiga +${addAmount} ta video kredit berildi!`);
      loadAdminData();
      if (onRefreshUserProfile) onRefreshUserProfile();
    } catch (err: any) {
      alert("Xatolik: " + err.message);
    }
  };

  const handleCustomSetCredits = async (userId: string) => {
    try {
      await updateUserCreditsInPostgres(userId, editCreditsInput, editCreditsInput > 0);
      await updateUserCreditsInFirestore(userId, editCreditsInput, editCreditsInput > 0).catch(() => {});
      setEditUserId(null);
      alert(`Limit yangilandi: ${editCreditsInput} ta video.`);
      loadAdminData();
      if (onRefreshUserProfile) onRefreshUserProfile();
    } catch (err: any) {
      alert("Xatolik: " + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[130] flex items-center justify-center p-4 md:p-6">
      <div className="bg-slate-900 rounded-[32px] max-w-4xl w-full border border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-amber-600 text-white rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg shadow-red-500/20">
              👑
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Admin Boshqaruv Paneli</h3>
              <p className="text-[11px] text-slate-400">Foydalanuvchilar to'lovlari va video yaratish ruxsatlarini tasdiqlash</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Lock Screen if passkey not entered */}
        {!isUnlocked ? (
          <div className="p-8 text-center space-y-5 max-w-md mx-auto my-auto">
            <div className="w-16 h-16 bg-red-500/10 text-red-400 border border-red-500/20 rounded-3xl flex items-center justify-center text-3xl mx-auto">
              🔐
            </div>
            <div>
              <h4 className="text-xl font-bold text-white">Admin Kirish Kodu</h4>
              <p className="text-xs text-slate-400 mt-1">Admin panelga kirish uchun maxfiy parolni kiriting</p>
            </div>

            <form onSubmit={handleUnlock} className="space-y-3">
              <input
                type="password"
                value={passkey}
                onChange={(e) => setPasskey(e.target.value)}
                placeholder="Admin maxfiy paroli"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-center text-white focus:outline-none focus:border-red-500 transition"
              />
              <button
                type="submit"
                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-2xl shadow-lg transition"
              >
                Admin Panelni Ochish 🔑
              </button>
            </form>
          </div>
        ) : (
          /* Main Admin Content */
          <div className="flex-1 flex flex-col min-h-0">
            
            {/* Admin Tabs */}
            <div className="px-6 pt-4 border-b border-slate-800 flex items-center gap-3">
              <button
                onClick={() => setActiveTab('PAYMENTS')}
                className={`pb-3 px-4 font-bold text-xs border-b-2 transition flex items-center gap-2 ${
                  activeTab === 'PAYMENTS'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>💳 To'lov So'rovlari</span>
                {payments.filter(p => p.status === 'PENDING').length > 0 && (
                  <span className="bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full text-[10px] font-black">
                    {payments.filter(p => p.status === 'PENDING').length} yangi
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('USERS')}
                className={`pb-3 px-4 font-bold text-xs border-b-2 transition flex items-center gap-2 ${
                  activeTab === 'USERS'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>👥 Foydalanuvchilar va Limitlar</span>
                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full text-[10px]">
                  {users.length} ta
                </span>
              </button>

              <div className="ml-auto flex items-center gap-2 pb-3">
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition flex items-center gap-1.5"
                  title="Yangi foydalanuvchi qo'shish"
                >
                  <span>➕</span>
                  <span className="hidden sm:inline">Foydalanuvchi</span> qo'shish
                </button>
                <button
                  onClick={loadAdminData}
                  className="px-2.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center gap-1"
                  title="Yangilash"
                >
                  <span>🔄</span>
                  <span className="hidden sm:inline">Yangilash</span>
                </button>
              </div>
            </div>

            {/* Tab Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {isLoading ? (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-mono">Ma'lumotlar yuklanmoqda...</p>
                </div>
              ) : activeTab === 'PAYMENTS' ? (
                /* Payments List */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span>Admin Paynet to'lovi chekini tasdiqlaganidan so'ng foydalanuvchiga avtomatik video kredit qo'shiladi.</span>
                  </div>

                  {payments.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 space-y-2">
                      <div className="text-3xl">📭</div>
                      <p className="text-sm">Hozircha to'lov so'rovlari mavjud emas</p>
                    </div>
                  ) : (
                    payments.map((req) => (
                      <div
                        key={req.id}
                        className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                          req.status === 'PENDING'
                            ? 'bg-amber-950/20 border-amber-500/40'
                            : req.status === 'APPROVED'
                            ? 'bg-emerald-950/20 border-emerald-500/30'
                            : 'bg-slate-950 border-slate-800 opacity-60'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{req.displayName}</span>
                            <span className="text-[11px] text-slate-400">({req.userEmail})</span>
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                              req.status === 'PENDING'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : req.status === 'APPROVED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-red-500/20 text-red-300'
                            }`}>
                              {req.status === 'PENDING' ? '⏳ Kutilmoqda' : req.status === 'APPROVED' ? '✓ Tasdiqlandi' : '✕ Rad etildi'}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-300">
                            <span className="font-bold text-amber-300">{req.planName}</span>
                            <span>•</span>
                            <span className="font-mono">{req.amount}</span>
                            <span>•</span>
                            <span className="text-[10px] text-slate-500">
                              {new Date(req.createdAt).toLocaleString('uz-UZ')}
                            </span>
                          </div>
                        </div>

                        {req.status === 'PENDING' && (
                          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                            <button
                              onClick={() => handleApprovePayment(req, 3)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition"
                            >
                              ✓ +3 Ism Tasdiqlash
                            </button>
                            <button
                              onClick={() => handleApprovePayment(req, 10)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow transition"
                            >
                              ✓ +10 Ism Tasdiqlash
                            </button>
                            <button
                              onClick={() => handleRejectPayment(req.id!)}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-red-500/20 text-red-400 border border-slate-700 transition"
                            >
                              ✕ Rad etish
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                /* Users List */
                <div className="space-y-4">
                  {!isDbConnected && (
                    <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-4 text-xs text-amber-200 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-amber-300">
                        <span>⚠️</span>
                        <span>PostgreSQL bazasi ulanmagan (Foydalanuvchilar hozircha brauzer va Firestore xotirasidan olinmoqda)</span>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        Foydalanuvchilar va to'lovlar hamma qurilmalarda bir xil saqlanishi uchun Vercel'da bepul Postgres bazasini ulab qo'yish mumkin:
                      </p>
                      <div className="bg-slate-950/70 p-2.5 rounded-xl font-mono text-[11px] text-slate-300 space-y-1">
                        <div>1. <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="text-amber-400 underline hover:text-amber-300">Vercel Dashboard</a> &rarr; <strong>Storage</strong> bo'limiga kiring.</div>
                        <div>2. <strong>Create Database</strong> &rarr; <strong>Postgres (Neon)</strong> ni tanlang va yarating.</div>
                        <div>3. <strong>Connect to Project</strong> tugmasini bosing. Bo'ldi, tizim avtomatik ulanadi!</div>
                      </div>
                    </div>
                  )}

                  {users.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 space-y-3">
                      <div className="text-3xl">👥</div>
                      <p className="text-sm font-semibold text-slate-200">Ro'yxatdan o'tgan foydalanuvchilar topilmadi</p>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        Foydalanuvchilar saytda Google yoki Email orqali kirganida shu yerda paydo bo'ladi. Xohlasangiz, istalgan odamni hoziroq o'zingiz qo'shishingiz mumkin:
                      </p>
                      <button
                        onClick={() => setShowAddUserModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition"
                      >
                        <span>➕</span> Yangi Foydalanuvchi Qo'shish
                      </button>
                    </div>
                  ) : (
                    users.map((u) => (
                      <div
                        key={u.userId}
                        className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3">
                          {u.photoURL ? (
                            <img src={u.photoURL} alt={u.displayName} className="w-10 h-10 rounded-full border border-slate-700" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300">
                              {u.displayName?.charAt(0) || 'U'}
                            </div>
                          )}

                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-white">{u.displayName || 'Foydalanuvchi'}</span>
                              {u.isApproved ? (
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-bold border border-emerald-500/30">
                                  ✓ Ruxsat Berilgan
                                </span>
                              ) : (
                                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-bold border border-amber-500/30">
                                  ⚠️ Ruxsatsiz (0 limit)
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 font-mono">{u.email}</p>
                          </div>
                        </div>

                        {/* Credit Actions */}
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block uppercase font-mono">Qolgan Limit</span>
                            <span className="text-lg font-black text-amber-400">{u.credits} ta video</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleQuickAddCredits(u.userId, u.credits, 3)}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/30 transition"
                              title="+3 ta ism kredit qo'shish"
                            >
                              +3 Ism
                            </button>
                            <button
                              onClick={() => handleQuickAddCredits(u.userId, u.credits, 10)}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 transition"
                              title="+10 ta ism kredit qo'shish"
                            >
                              +10 Ism
                            </button>
                            
                            {editUserId === u.userId ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={editCreditsInput}
                                  onChange={(e) => setEditCreditsInput(Number(e.target.value))}
                                  className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center text-white"
                                />
                                <button
                                  onClick={() => handleCustomSetCredits(u.userId)}
                                  className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                                >
                                  Saqlash
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditUserId(u.userId);
                                  setEditCreditsInput(u.credits);
                                }}
                                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center justify-center text-xs"
                                title="Limitni o'zgartirish"
                              >
                                ✏️
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* Manual Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">➕</span>
                <h4 className="text-white font-bold text-base">Foydalanuvchi Qo'shish</h4>
              </div>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="text-slate-400 hover:text-white text-lg w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Foydalanuvchining email manzili va unga beriladigan video kreditlar sonini kiriting. U saytga kirganda shu limitdan foydalana oladi.
            </p>

            <form onSubmit={handleAddUserManually} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Email manzil *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="masalan: user@gmail.com"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Ism / Familiya (ixtiyoriy)</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="masalan: Jasur Aliyev"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Beriladigan Video Kreditlar Soni</label>
                <div className="grid grid-cols-4 gap-2">
                  {[3, 5, 10, 20].map((num) => (
                    <button
                      type="button"
                      key={num}
                      onClick={() => setNewCredits(num)}
                      className={`py-2 text-xs rounded-xl font-bold border transition ${
                        newCredits === num
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {num} ta
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={newCredits}
                  onChange={(e) => setNewCredits(Math.max(1, parseInt(e.target.value) || 1))}
                  className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isAddingUser}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg transition flex items-center justify-center gap-1.5"
                >
                  {isAddingUser ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>✓ Qo'shish</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
