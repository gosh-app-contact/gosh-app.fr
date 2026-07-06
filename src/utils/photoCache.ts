import { Image as ExpoImage } from 'expo-image';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

// Cache module-level : survit aux re-renders et navigations, jamais vidé en session
const cache: Record<string, string> = {};

export function getCachedPhoto(uid: string): string | undefined {
  return cache[uid] || undefined;
}

export async function fetchAndCachePhoto(uid: string): Promise<string | undefined> {
  if (cache[uid] !== undefined) return cache[uid] || undefined;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const url: string = snap.data()?.photoUrl ?? '';
    cache[uid] = url;
    if (url) ExpoImage.prefetch(url, 'memory-disk');
    return url || undefined;
  } catch {
    return undefined;
  }
}

export async function fetchAndCachePhotos(uids: string[]): Promise<void> {
  const toLoad = uids.filter((u) => cache[u] === undefined);
  if (toLoad.length === 0) return;
  await Promise.all(toLoad.map(fetchAndCachePhoto));
}

export function setCachedPhoto(uid: string, url: string) {
  cache[uid] = url;
  if (url) ExpoImage.prefetch(url, 'memory-disk');
}
