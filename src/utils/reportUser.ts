import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove, getDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

export const DAILY_REPORT_LIMIT = 5;

export type ReportReason = 'spam' | 'inappropriate' | 'harassment' | 'fake' | 'other';

export const REPORT_REASONS: { key: ReportReason; label: string; description: string }[] = [
  { key: 'spam', label: 'Spam', description: 'Contenu répétitif ou indésirable' },
  { key: 'inappropriate', label: 'Contenu inapproprié', description: 'Contenu choquant ou offensant' },
  { key: 'harassment', label: 'Harcèlement', description: 'Comportement abusif ou menaçant' },
  { key: 'fake', label: 'Faux compte', description: 'Usurpation d\'identité' },
  { key: 'other', label: 'Autre', description: 'Autre raison' },
];

export async function sendReport(params: {
  reportedUid: string;
  contentType: 'post' | 'message' | 'user' | 'club' | 'coach';
  contentId?: string;
  reason: ReportReason;
  reportedPseudo?: string;
  contentText?: string;
  clubId?: string;
}): Promise<void> {
  const me = auth.currentUser;
  if (!me) return;

  // Vérifier la limite de 5 signalements par jour (requête simple sans index composite)
  const todaySnap = await getDocs(query(
    collection(db, 'reports'),
    where('reporterUid', '==', me.uid),
  ));
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = todaySnap.docs.filter((d) => {
    const ts = d.data().createdAt?.toDate?.();
    return ts && ts.toISOString().slice(0, 10) === todayStr;
  }).length;
  if (todayCount >= DAILY_REPORT_LIMIT) {
    throw new Error('daily_limit_reached');
  }

  await Promise.all([
    addDoc(collection(db, 'reports'), {
      reporterUid: me.uid,
      reportedUid: params.reportedUid,
      reportedPseudo: params.reportedPseudo ?? null,
      contentType: params.contentType,
      contentId: params.contentId ?? null,
      contentText: params.contentText ?? null,
      clubId: params.clubId ?? null,
      reason: params.reason,
      status: 'pending',
      createdAt: serverTimestamp(),
    }),
    // Masquer le post signalé du feed en attendant la modération
    params.contentType === 'post' && params.contentId
      ? updateDoc(doc(db, 'posts', params.contentId), { hidden: true })
      : Promise.resolve(),
  ]);
}

export async function blockUser(blockedUid: string): Promise<void> {
  const me = auth.currentUser;
  if (!me || me.uid === blockedUid) return;
  const results = await Promise.allSettled([
    updateDoc(doc(db, 'users', me.uid), {
      blockedUsers: arrayUnion(blockedUid),
      friends: arrayRemove(blockedUid),
      following: arrayRemove(blockedUid),
      followers: arrayRemove(blockedUid),
    }),
    updateDoc(doc(db, 'users', blockedUid), {
      blockedBy: arrayUnion(me.uid),
      friends: arrayRemove(me.uid),
      following: arrayRemove(me.uid),
      followers: arrayRemove(me.uid),
    }),
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`blockUser write ${i} failed:`, r.reason);
  });
}

export async function unblockUser(blockedUid: string): Promise<void> {
  const me = auth.currentUser;
  if (!me) return;
  await Promise.all([
    updateDoc(doc(db, 'users', me.uid), { blockedUsers: arrayRemove(blockedUid) }),
    updateDoc(doc(db, 'users', blockedUid), { blockedBy: arrayRemove(me.uid) }),
  ]);
}

export async function getBlockedUsers(): Promise<string[]> {
  const me = auth.currentUser;
  if (!me) return [];
  const snap = await getDoc(doc(db, 'users', me.uid));
  return snap.data()?.blockedUsers ?? [];
}
