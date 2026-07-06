import { initializeApp, getApps } from 'firebase/app';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error getReactNativePersistence exists in the RN bundle but is missing from @firebase/auth public types
import { initializeAuth, getAuth, getReactNativePersistence } from '@firebase/auth';
import { initializeFirestore, getFirestore, persistentLocalCache, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyC6r-oTxQPu2NKdXfzrHGIwKjbsXmy9vwI',
  authDomain: 'dietapp-ef7ea.firebaseapp.com',
  projectId: 'dietapp-ef7ea',
  storageBucket: 'dietapp-ef7ea.firebasestorage.app',
  messagingSenderId: '620669751371',
  appId: '1:620669751371:ios:df253fa24e2f0b05923dce',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

function getOrInitAuth() {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e: any) {
    if (e?.code !== 'auth/already-initialized') {
      console.error('[firebase] initializeAuth unexpected error:', e);
    }
    return getAuth(app);
  }
}

function getOrInitFirestore() {
  try {
    // persistentMultipleTabManager est web-only — pas de tabManager en React Native
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
      }),
    });
  } catch (e) {
    // Already initialized — return existing instance
    return getFirestore(app);
  }
}

export const auth = getOrInitAuth();
export const db = getOrInitFirestore();
export const storage = getStorage(app);
