import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

type BadgeInfo = { accountType?: string; verified?: boolean };
const cache: Record<string, BadgeInfo> = {};
const pending: Record<string, Promise<BadgeInfo>> = {};

export async function getBadgeInfo(uid: string): Promise<BadgeInfo> {
  if (cache[uid]) return cache[uid];
  if (uid in pending) return pending[uid];
  pending[uid] = getDoc(doc(db, 'users', uid)).then((snap) => {
    const info: BadgeInfo = {
      accountType: snap.data()?.accountType,
      verified: snap.data()?.verified ?? false,
    };
    cache[uid] = info;
    delete pending[uid];
    return info;
  });
  return pending[uid];
}
