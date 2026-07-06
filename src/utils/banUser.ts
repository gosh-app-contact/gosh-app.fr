import { db, auth } from './firebase';
import {
  collection, query, where, getDocs, doc, updateDoc, deleteDoc,
  arrayRemove, writeBatch, getDoc, deleteField, addDoc, serverTimestamp,
} from 'firebase/firestore';

// Banni un compte et le retire de toutes les listes de l'app
export async function banUserCompletely(uid: string, pseudo?: string): Promise<void> {
  const batch = writeBatch(db);

  // 1. Marquer le compte comme banni
  batch.update(doc(db, 'users', uid), { accountType: 'banned' });

  await batch.commit();

  // 2. Créer/mettre à jour un document report avec status 'banned' pour l'onglet modération
  const reportedPseudo = pseudo ?? (await getDoc(doc(db, 'users', uid))).data()?.pseudo ?? uid;
  const existingReports = await getDocs(query(
    collection(db, 'reports'),
    where('reportedUid', '==', uid),
    where('status', '==', 'pending'),
  ));
  if (!existingReports.empty) {
    // Mettre à jour le premier rapport existant
    await updateDoc(existingReports.docs[0].ref, { status: 'banned' });
  } else {
    // Créer un rapport de bannissement direct
    await addDoc(collection(db, 'reports'), {
      reporterUid: auth.currentUser?.uid ?? 'admin',
      reportedUid: uid,
      reportedPseudo,
      contentType: 'user',
      contentId: null,
      contentText: null,
      clubId: null,
      reason: 'other',
      status: 'banned',
      createdAt: serverTimestamp(),
    });
  }

  // 3. Retirer des listes amis/abonnés de tous les autres utilisateurs
  const [friendOfSnap, followerOfSnap, followingSnap] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('friends', 'array-contains', uid))),
    getDocs(query(collection(db, 'users'), where('followers', 'array-contains', uid))),
    getDocs(query(collection(db, 'users'), where('following', 'array-contains', uid))),
  ]);

  // Retirer le banni de la liste friends des autres
  await Promise.all(friendOfSnap.docs.map((d) =>
    updateDoc(d.ref, { friends: arrayRemove(uid), friendRequests: arrayRemove(uid) }).catch(() => {}),
  ));
  // Retirer le banni de la liste followers des gens qu'il suivait
  await Promise.all(followingSnap.docs.map((d) =>
    updateDoc(d.ref, { followers: arrayRemove(uid) }).catch(() => {}),
  ));
  // Retirer le banni de la liste following des gens qui le suivaient
  await Promise.all(followerOfSnap.docs.map((d) =>
    updateDoc(d.ref, { following: arrayRemove(uid) }).catch(() => {}),
  ));

  // 4. Retirer de tous les clubs (memberIds, adminIds, pendingRequests)
  const clubQueries = await Promise.all([
    getDocs(query(collection(db, 'clubs'), where('memberIds', 'array-contains', uid))),
    getDocs(query(collection(db, 'clubs'), where('adminIds', 'array-contains', uid))),
    getDocs(query(collection(db, 'clubs'), where('pendingRequests', 'array-contains', uid))),
  ]);

  const clubIds = new Set<string>();
  clubQueries.forEach((snap) => snap.docs.forEach((d) => clubIds.add(d.id)));

  await Promise.all(
    [...clubIds].map((clubId) =>
      updateDoc(doc(db, 'clubs', clubId), {
        memberIds: arrayRemove(uid),
        adminIds: arrayRemove(uid),
        pendingRequests: arrayRemove(uid),
      }).catch(() => {}),
    ),
  );

  // 5. Nettoyer les relations de coaching
  const userSnap = await getDoc(doc(db, 'users', uid));
  const userData = userSnap.data() ?? {};

  // Si c'est un élève avec un coach → stopper le coaching
  if (userData.coachUid) {
    const coachUid = userData.coachUid;
    const coachRequestId = userData.coachRequestId;
    await Promise.all([
      coachRequestId ? deleteDoc(doc(db, 'coachRequests', coachRequestId)) : Promise.resolve(),
      deleteDoc(doc(db, 'coachStudents', coachUid, 'students', uid)).catch(() => {}),
      updateDoc(doc(db, 'users', uid), {
        coachUid: deleteField(),
        coachStatus: deleteField(),
        coachRequestId: deleteField(),
      }).catch(() => {}),
    ]);
  }

  // Si c'est un coach → retirer tous ses élèves
  if (userData.accountType === 'coach' || userData.accountType === 'banned') {
    const studentsSnap = await getDocs(collection(db, 'coachStudents', uid, 'students'));
    await Promise.all(
      studentsSnap.docs.map(async (s) => {
        const studentUid = s.id;
        await Promise.all([
          deleteDoc(s.ref).catch(() => {}),
          updateDoc(doc(db, 'users', studentUid), {
            accountType: 'standard',
            coachUid: deleteField(),
            coachStatus: deleteField(),
            coachRequestId: deleteField(),
          }).catch(() => {}),
        ]);
      }),
    );
    // Supprimer toutes les demandes de coaching en attente
    const reqsSnap = await getDocs(query(collection(db, 'coachRequests'), where('coachUid', '==', uid)));
    await Promise.all(reqsSnap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  }
}
