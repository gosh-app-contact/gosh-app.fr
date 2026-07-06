import { db } from './firebase';
import {
  doc, setDoc, collection, query, where, getDocs, writeBatch,
} from 'firebase/firestore';
import { loadState, saveState } from './storage';

export async function updateUserName(uid: string, newName: string) {
  const trimmed = newName.trim();
  if (!trimmed) return;

  // 1. Mettre à jour le doc utilisateur
  await setDoc(doc(db, 'users', uid), { prenom: trimmed, displayName: trimmed }, { merge: true });

  // 2. Tous les posts de l'utilisateur
  const postsSnap = await getDocs(query(collection(db, 'posts'), where('uid', '==', uid)));
  if (!postsSnap.empty) {
    const batch = writeBatch(db);
    postsSnap.docs.forEach((d) => batch.update(d.ref, { pseudo: trimmed }));
    await batch.commit();
  }

  // 3. Sync storage local
  const s = await loadState();
  if (s && s.profiles.length > 0) {
    s.profiles[0].name = trimmed;
    await saveState(s);
  }
}
