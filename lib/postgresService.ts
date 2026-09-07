export interface SavedVideoDocument {
  id?: string;
  topic: string;
  script: string[];
  fullScript: string;
  hashtags: string[];
  imageUrls: string[];
  captionStyle: string;
  voice: string;
  userId: string;
  userEmail: string;
  createdAt: string;
}

export interface UserProfileDocument {
  userId: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  credits: number;
  totalAllowed: number;
  isApproved: boolean;
  createdAt: string;
}

export interface PaymentRequestDocument {
  id?: string;
  userId: string;
  userEmail: string;
  displayName: string;
  planName: string;
  amount: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  approvedAt?: string | null;
}

const API_BASE = '/api';

// 1. Foydalanuvchi profilini PostgreSQL'dan olish
export const getUserProfileFromPostgres = async (uid: string): Promise<UserProfileDocument | null> => {
  try {
    const res = await fetch(`${API_BASE}/db-users.js?uid=${encodeURIComponent(uid)}`);
    if (res.ok) {
      const data = await res.json();
      return data.user || null;
    }
    return null;
  } catch (err) {
    console.warn("PostgreSQL: Profilni yuklab bo'lmadi:", err);
    return null;
  }
};

// 2. Foydalanuvchi tizimga kirganda PostgreSQL bilan sinxronlash
export const syncUserWithPostgres = async (userData: {
  uid: string;
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
}): Promise<UserProfileDocument | null> => {
  try {
    const res = await fetch(`${API_BASE}/db-users.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });
    if (res.ok) {
      const data = await res.json();
      return data.user;
    }
    return null;
  } catch (err) {
    console.warn("PostgreSQL: Foydalanuvchi sinxronizatsiyasi xatosi:", err);
    return null;
  }
};

// 3. Kreditni ayirish (-1)
export const deductUserCreditInPostgres = async (uid: string): Promise<number | null> => {
  try {
    const res = await fetch(`${API_BASE}/db-users.js`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, action: "deduct" }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.credits;
    }
    return null;
  } catch (err) {
    console.warn("PostgreSQL: Kreditni ayirishda xatolik:", err);
    return null;
  }
};

// 4. Admin orqali kredit yoki tasdiq holatini o'zgartirish
export const updateUserCreditsInPostgres = async (
  uid: string,
  credits: number,
  isApproved: boolean
): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE}/db-users.js`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, credits, isApproved }),
    });
    return res.ok;
  } catch (err) {
    console.error("PostgreSQL: Kreditni yangilash xatosi:", err);
    return false;
  }
};

// 5. Admin uchun barcha foydalanuvchilar
export const getAllUsersForAdminFromPostgres = async (): Promise<UserProfileDocument[]> => {
  try {
    const res = await fetch(`${API_BASE}/db-users.js?all=true`);
    if (res.ok) {
      const data = await res.json();
      return data.users || [];
    }
    return [];
  } catch (err) {
    console.error("PostgreSQL: Foydalanuvchilar ro'yxati xatosi:", err);
    return [];
  }
};

// 6. Videoni PostgreSQL'ga saqlash
export const saveVideoToPostgres = async (
  videoData: Omit<SavedVideoDocument, 'id' | 'createdAt'>
): Promise<string | null> => {
  try {
    const res = await fetch(`${API_BASE}/db-videos.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(videoData),
    });
    if (res.ok) {
      const data = await res.json();
      return data.id || null;
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Server xatosi (${res.status})`);
  } catch (err: any) {
    console.error("PostgreSQL: Video saqlash xatosi:", err);
    throw err;
  }
};

// 7. Foydalanuvchining barcha saqlangan videolarini olish
export const getUserSavedVideosFromPostgres = async (userId: string): Promise<SavedVideoDocument[]> => {
  try {
    const res = await fetch(`${API_BASE}/db-videos.js?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const data = await res.json();
      return data.videos || [];
    }
    return [];
  } catch (err) {
    console.error("PostgreSQL: Videolarni yuklash xatosi:", err);
    return [];
  }
};

// 8. Videoni PostgreSQL'dan o'chirish
export const deleteSavedVideoFromPostgres = async (videoId: string, userId: string): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE}/db-videos.js?id=${encodeURIComponent(videoId)}&userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch (err) {
    console.error("PostgreSQL: Videoni o'chirish xatosi:", err);
    return false;
  }
};

// 9. To'lov so'rovini qoldirish
export const createPaymentRequestInPostgres = async (
  planName: string,
  amount: string,
  user: { uid: string; email: string; displayName?: string }
): Promise<string | null> => {
  try {
    const res = await fetch(`${API_BASE}/db-payments.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.uid,
        userEmail: user.email,
        displayName: user.displayName || "Foydalanuvchi",
        planName,
        amount,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.id || null;
    }
    return null;
  } catch (err) {
    console.error("PostgreSQL: To'lov so'rovi xatosi:", err);
    return null;
  }
};

// 10. Admin uchun barcha to'lovlar
export const getAllPaymentsForAdminFromPostgres = async (): Promise<PaymentRequestDocument[]> => {
  try {
    const res = await fetch(`${API_BASE}/db-payments.js`);
    if (res.ok) {
      const data = await res.json();
      return data.payments || [];
    }
    return [];
  } catch (err) {
    console.error("PostgreSQL: To'lovlar ro'yxati xatosi:", err);
    return [];
  }
};

// 11. Admin to'lovni tasdiqlashi
export const adminApprovePaymentInPostgres = async (
  paymentId: string,
  creditsToAdd: number = 10
): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE}/db-payments.js`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, status: "APPROVED", creditsToAdd }),
    });
    return res.ok;
  } catch (err) {
    console.error("PostgreSQL: To'lovni tasdiqlash xatosi:", err);
    return false;
  }
};

// 12. Admin to'lovni rad etishi
export const adminRejectPaymentInPostgres = async (paymentId: string): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE}/db-payments.js`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, status: "REJECTED" }),
    });
    return res.ok;
  } catch (err) {
    console.error("PostgreSQL: To'lovni rad etish xatosi:", err);
    return false;
  }
};
