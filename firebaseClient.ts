import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  signInWithEmailAndPassword,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/** Metro’s RN bundle includes this; Node typecheck may not. */
function getReactNativePersistenceFromAuth(): ((storage: unknown) => unknown) | undefined {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("firebase/auth") as {
    getReactNativePersistence?: (storage: unknown) => unknown;
  };
  return mod.getReactNativePersistence;
}

const firebaseConfig = {
  apiKey: "AIzaSyBVC_ksPauLr_qImpGr0gx8X9irbaQeqkQ",
  authDomain: "home-management-hamayel.firebaseapp.com",
  projectId: "home-management-hamayel",
  storageBucket: "home-management-hamayel.firebasestorage.app",
  messagingSenderId: "372946396682",
  appId: "1:372946396682:web:4a724ffbb09e4abfe8a1f3",
  measurementId: "G-4X7FJTJ9KF",
};

/**
 * Auth order: if both email + password are set → Email/Password; otherwise → Anonymous.
 * For a shared list at `order_lists/1` with anonymous users, leave email/password empty.
 *
 * Firestore rules must use the path segment name `{userId}` — not `docId`:
 *
 *   match /order_lists/{userId} {
 *     allow read, write: if request.auth != null && userId == "1";
 *   }
 *
 * Each device gets its own Anonymous UID (e.g. gSaU8… on one phone). You do not put that
 * UID in the rule unless you only want that one device to access the list.
 */
export const FIREBASE_SHARED_EMAIL = "m.hamayel@gmail.com";
export const FIREBASE_SHARED_PASSWORD = "123123";

/** Fixed doc id when using anonymous auth + `userId == "1"` rules. */
export const ORDER_LIST_SHARED_DOC_ID = "1";

let authSingleton: Auth | null = null;

function getFirebaseApp(): FirebaseApp {
  if (getApps().length === 0) {
    return initializeApp(firebaseConfig);
  }
  return getApp();
}

export function getFirebaseAuth(): Auth {
  if (authSingleton) return authSingleton;
  const app = getFirebaseApp();
  const rnPersistenceFactory = getReactNativePersistenceFromAuth();
  try {
    if (rnPersistenceFactory) {
      authSingleton = initializeAuth(app, {
        persistence: rnPersistenceFactory(AsyncStorage) as never,
      });
    } else {
      authSingleton = getAuth(app);
    }
  } catch {
    authSingleton = getAuth(app);
  }
  return authSingleton;
}

export const firestore = getFirestore(getFirebaseApp());

export function getOrderListDocumentId(user: User): string {
  const email = FIREBASE_SHARED_EMAIL.trim();
  if (email !== "" && FIREBASE_SHARED_PASSWORD !== "") {
    return user.uid;
  }
  return ORDER_LIST_SHARED_DOC_ID;
}

export async function ensureOrderListAuth(): Promise<User> {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return auth.currentUser;

  const email = FIREBASE_SHARED_EMAIL.trim();
  if (email !== "" && FIREBASE_SHARED_PASSWORD !== "") {
    const cred = await signInWithEmailAndPassword(
      auth,
      email,
      FIREBASE_SHARED_PASSWORD
    );
    return cred.user;
  }

  const cred = await signInAnonymously(auth);
  return cred.user;
}
