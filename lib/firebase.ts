import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  collection, 
  addDoc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  deleteDoc 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { syncUserWithPostgres } from './postgresService';

const app = initializeApp(firebaseConfig);

// CRITICAL: Must pass database ID as second parameter
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.addScope('openid');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice:', errInfo.error);
}

export async function testConnection() {
  try {
    await getDoc(doc(db, 'test', 'connection'));
  } catch (error) {
    // Graceful silent fallback if offline or initial connection pending
  }
}

// Initial connection test
testConnection();

// Auth Helpers
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (result.user) {
      // 1. Get Google ID token claims (contains verified email, name, picture directly from Google)
      let claimsEmail = '';
      let claimsName = '';
      let claimsPhoto = '';
      try {
        const idTokenResult = await result.user.getIdTokenResult(true);
        if (idTokenResult && idTokenResult.claims) {
          claimsEmail = (idTokenResult.claims.email as string) || '';
          claimsName = (idTokenResult.claims.name as string) || '';
          claimsPhoto = (idTokenResult.claims.picture as string) || '';
        }
      } catch {}

      const providerData = result.user.providerData || [];
      const googleProviderInfo = providerData.find(
        (p: any) => p && (p.providerId === 'google.com' || (p.email && p.email.includes('@')))
      );
      const tokenResponse = (result as any)._tokenResponse;

      const realEmail = 
        (result.user.email && result.user.email.includes('@') ? result.user.email : '')
        || (claimsEmail && claimsEmail.includes('@') ? claimsEmail : '')
        || (googleProviderInfo?.email && googleProviderInfo.email.includes('@') ? googleProviderInfo.email : '')
        || (tokenResponse?.email && tokenResponse.email.includes('@') ? tokenResponse.email : '')
        || '';

      const realName = 
        result.user.displayName 
        || claimsName 
        || googleProviderInfo?.displayName 
        || tokenResponse?.displayName 
        || (realEmail ? realEmail.split('@')[0] : 'Google Foydalanuvchisi');

      const realPhoto = 
        result.user.photoURL 
        || claimsPhoto 
        || googleProviderInfo?.photoURL 
        || tokenResponse?.photoUrl 
        || '';

      // 1. Sync to PostgreSQL immediately with real email
      if (realEmail && realEmail.includes('@')) {
        syncUserWithPostgres({
          uid: result.user.uid,
          email: realEmail,
          displayName: realName,
          photoURL: realPhoto
        }).catch((err) => console.warn("Postgres sync error:", err));
      }

      // 2. Non-blocking firestore sync
      setDoc(doc(db, 'users', result.user.uid), {
        userId: result.user.uid,
        email: realEmail,
        displayName: realName,
        photoURL: realPhoto,
        createdAt: new Date().toISOString()
      }, { merge: true }).catch(() => {});

      return {
        ...result.user,
        email: realEmail || result.user.email,
        displayName: realName,
        photoURL: realPhoto
      };
    }
    return result.user;
  } catch (error: any) {
    console.error("Google sign in error:", error);
    const code = error?.code;
    if (code === 'auth/unauthorized-domain') {
      alert("⚠️ Firebase Auth Xatosi (unauthorized-domain):\n\nFirebase Console -> Authentication -> Settings -> Authorized Domains qismida vercel domeni ruxsat berilmagan.\n\nSiz 'Email' yorlig'i orqali emailingizni kiritib darhol kirishingiz mumkin!");
    } else if (code === 'auth/popup-blocked') {
      alert("⚠️ Brauzer qalqib chiquvchi oynani (popup) blokladi. Iltimos, brauzerda pop-up oynalarga ruxsat bering yoki 'Email' yorlig'idan kiring.");
    } else if (code === 'auth/operation-not-allowed') {
      alert("⚠️ Firebase Console dagi Authentication bo'limida Google Provayderi yoqilmagan. Iltimos, 'Email' yorlig'idan kiring.");
    } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      alert(`⚠️ Google bilan kirishda xatolik: ${error.message || code || error}`);
    }
    throw error;
  }
};

export const logOut = async () => {
  return firebaseSignOut(auth);
};

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
}

// User Profile & Credits functions
export const getUserProfileData = async (userId: string): Promise<UserProfileDocument | null> => {
  const path = `users/${userId}`;
  try {
    const docSnap = await getDoc(doc(db, 'users', userId));
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        userId: data.userId || userId,
        email: data.email || '',
        displayName: data.displayName || '',
        photoURL: data.photoURL || '',
        credits: typeof data.credits === 'number' ? data.credits : 0,
        totalAllowed: typeof data.totalAllowed === 'number' ? data.totalAllowed : 0,
        isApproved: !!data.isApproved,
        createdAt: data.createdAt || new Date().toISOString()
      };
    }
    return null;
  } catch (error) {
    console.warn("User profile fetch error (using defaults):", error);
    return null;
  }
};

export const updateUserCreditsInFirestore = async (userId: string, credits: number, isApproved: boolean) => {
  const path = `users/${userId}`;
  try {
    await setDoc(doc(db, 'users', userId), {
      userId,
      credits,
      totalAllowed: credits,
      isApproved,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const deductUserCreditInFirestore = async (userId: string, currentCredits: number) => {
  const path = `users/${userId}`;
  const newCredits = Math.max(0, currentCredits - 1);
  try {
    await setDoc(doc(db, 'users', userId), {
      credits: newCredits
    }, { merge: true });
    return newCredits;
  } catch (error) {
    console.error("Failed to deduct credit:", error);
    return newCredits;
  }
};

// Payment Request functions
export const createPaymentRequestInFirestore = async (planName: string, amount: string) => {
  if (!auth.currentUser) throw new Error("Tizimga kirilmagan");
  const path = 'payments';
  try {
    const docRef = await addDoc(collection(db, path), {
      userId: auth.currentUser.uid,
      userEmail: auth.currentUser.email || "Noma'lum",
      displayName: auth.currentUser.displayName || "Foydalanuvchi",
      planName,
      amount,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const getAllUsersForAdmin = async (): Promise<UserProfileDocument[]> => {
  const path = 'users';
  try {
    const querySnapshot = await getDocs(collection(db, path));
    const usersList: UserProfileDocument[] = [];
    querySnapshot.forEach((docSnap) => {
      const d = docSnap.data();
      usersList.push({
        userId: docSnap.id,
        email: d.email || 'No email',
        displayName: d.displayName || 'Anonim',
        photoURL: d.photoURL || '',
        credits: d.credits || 0,
        totalAllowed: d.totalAllowed || 0,
        isApproved: !!d.isApproved,
        createdAt: d.createdAt || ''
      });
    });
    return usersList;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const getAllPaymentRequestsForAdmin = async (): Promise<PaymentRequestDocument[]> => {
  const path = 'payments';
  try {
    const querySnapshot = await getDocs(collection(db, path));
    const list: PaymentRequestDocument[] = [];
    querySnapshot.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() } as PaymentRequestDocument);
    });
    // Sort by createdAt desc
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const adminApprovePayment = async (paymentId: string, userId: string, creditsToAdd: number) => {
  try {
    // 1. Update payment status
    await setDoc(doc(db, 'payments', paymentId), {
      status: 'APPROVED',
      approvedAt: new Date().toISOString()
    }, { merge: true });

    // 2. Add credits to user
    const userSnap = await getDoc(doc(db, 'users', userId));
    const currentCredits = userSnap.exists() ? (userSnap.data().credits || 0) : 0;
    const currentAllowed = userSnap.exists() ? (userSnap.data().totalAllowed || 0) : 0;
    
    await setDoc(doc(db, 'users', userId), {
      userId,
      credits: currentCredits + creditsToAdd,
      totalAllowed: currentAllowed + creditsToAdd,
      isApproved: true,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error("Admin approve payment error:", error);
    throw error;
  }
};

export const adminRejectPayment = async (paymentId: string) => {
  try {
    await setDoc(doc(db, 'payments', paymentId), {
      status: 'REJECTED',
      rejectedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error("Admin reject payment error:", error);
    throw error;
  }
};

// Firestore CRUD operations for Saved Videos
export const saveVideoToFirestore = async (videoData: Omit<SavedVideoDocument, 'id' | 'userId' | 'userEmail' | 'createdAt'>) => {
  if (!auth.currentUser) {
    throw new Error("Video saqlash uchun tizimga kiring.");
  }

  const path = 'videos';
  try {
    const docRef = await addDoc(collection(db, path), {
      ...videoData,
      userId: auth.currentUser.uid,
      userEmail: auth.currentUser.email || 'Anonym',
      createdAt: new Date().toISOString()
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const getUserSavedVideos = async (): Promise<SavedVideoDocument[]> => {
  if (!auth.currentUser) return [];

  const path = 'videos';
  try {
    const q = query(
      collection(db, path),
      where('userId', '==', auth.currentUser.uid)
    );
    const querySnapshot = await getDocs(q);
    const videos: SavedVideoDocument[] = [];
    querySnapshot.forEach((docSnap) => {
      videos.push({ id: docSnap.id, ...docSnap.data() } as SavedVideoDocument);
    });
    return videos;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const deleteSavedVideoFromFirestore = async (videoId: string) => {
  if (!auth.currentUser) throw new Error("Avtorizatsiyadan o'tilmagan");

  const path = `videos/${videoId}`;
  try {
    await deleteDoc(doc(db, 'videos', videoId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};
