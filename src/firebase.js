import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Data Dash Firebase configuration.
//
// Reads VITE_FIREBASE_* when provided (Vercel / .env) and falls back to the
// demo project so a fresh clone runs with no setup. To point this at another
// Firebase project, set the env vars — no code change needed.
//
// Note: Firebase web config is not secret. It is compiled into the client
// bundle either way; access is controlled by Firestore rules, not by hiding
// these values.
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyAtYOaOt9TWowUriiW1W6GTU0topi-bK7U",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "datadash-b6c5f.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "datadash-b6c5f",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "datadash-b6c5f.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "603566594980",
  appId: env.VITE_FIREBASE_APP_ID || "1:603566594980:web:2d1057cdb849296169ff31",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || "G-MRY97C8MSP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export default app;