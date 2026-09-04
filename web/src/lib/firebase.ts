import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  inMemoryPersistence,
  initializeAuth,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'
import { getStorage } from 'firebase/storage'

function requiredEnv(name: string) {
  const value = import.meta.env[name]
  if (!value) {
    throw new Error(`Missing required Firebase environment variable: ${name}`)
  }
  return value
}

const firebaseConfig = {
  apiKey: requiredEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: requiredEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: requiredEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requiredEnv('VITE_FIREBASE_APP_ID'),
}

export const firebaseApp = initializeApp(firebaseConfig)

// Firebase Auth defaults to IndexedDB for persistence. In some browser states
// (page hidden/bfcache, an IndexedDB connection mid-close, certain privacy
// modes) IndexedDB throws "Database is closing/hidden" during sign-in instead
// of falling back — which blocked Google sign-in. Initialize Auth with a
// localStorage-first persistence chain (falling back to session, then memory)
// so it never depends on IndexedDB. localStorage still syncs auth across tabs.
export const auth = initializeAuth(firebaseApp, {
  persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
})
export const db = getFirestore(firebaseApp)
export const storage = getStorage(firebaseApp)
export const functions = getFunctions(firebaseApp, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1')
