import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export type NotifType = 'like' | 'comment' | 'follow' | 'friendRequest';

// ID déterministe → setDoc idempotent, impossible de créer un doublon
function notifId(type: NotifType, fromUid: string, postId?: string): string {
  if (postId) return `${type}_${fromUid}_${postId}`;
  return `${type}_${fromUid}`;
}

export async function writeNotif(
  toUid: string,
  fromUid: string,
  fromPseudo: string,
  fromPhoto: string,
  type: NotifType,
  postId?: string,
  postPreview?: string,
  postPhotoUrl?: string,
) {
  if (toUid === fromUid) return;
  const id = notifId(type, fromUid, postId);
  await setDoc(doc(db, 'notifications', toUid, 'items', id), {
    type,
    fromUid,
    fromPseudo,
    fromPhoto,
    postId: postId ?? null,
    postPreview: postPreview ?? null,
    postPhotoUrl: postPhotoUrl ?? null,
    read: false,
    createdAt: serverTimestamp(),
  });
}

// Supprime la notif quand l'action est annulée (unlike, unfollow, cancel friend request)
export async function deleteNotif(
  toUid: string,
  fromUid: string,
  type: NotifType,
  postId?: string,
) {
  if (toUid === fromUid) return;
  const id = notifId(type, fromUid, postId);
  await deleteDoc(doc(db, 'notifications', toUid, 'items', id)).catch(() => {});
}
