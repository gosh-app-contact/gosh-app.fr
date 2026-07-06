import {
  collection, doc, getDocs, deleteDoc, query,
  where, writeBatch, updateDoc, arrayRemove, getDoc, increment,
} from 'firebase/firestore';
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { db, auth, storage } from './firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

async function deleteStorageFolder(path: string) {
  try {
    const folderRef = ref(storage, path);
    const list = await listAll(folderRef);
    await Promise.all(list.items.map((item) => deleteObject(item)));
    await Promise.all(list.prefixes.map((sub) => deleteStorageFolder(sub.fullPath)));
  } catch (e) {
    console.error(`[deleteAccount] storage folder "${path}":`, e);
  }
}

async function deleteSubcollection(path: string) {
  try {
    const snap = await getDocs(collection(db, path));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (e) {
    console.error(`[deleteAccount] subcollection "${path}":`, e);
  }
}

export async function deleteAccount(password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('Non authentifié');

  const cred = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, cred);

  const uid = user.uid;

  // 1. Lire le doc user
  const userSnap = await getDoc(doc(db, 'users', uid));
  const userData = userSnap.data();
  const coachCode: string | undefined = userData?.coachCode;
  const isCoach = userData?.accountType === 'coach';
  const isStudent = userData?.accountType === 'student';

  // 2. Notifications reçues
  await deleteSubcollection(`notifications/${uid}/items`);
  await deleteDoc(doc(db, 'notifications', uid)).catch((e) => console.error('[deleteAccount] step2 notif doc:', e));

  // 3. Posts + leurs sous-collections (comments, likes)
  const postsSnap = await getDocs(query(collection(db, 'posts'), where('uid', '==', uid))).catch((e) => { console.error('[deleteAccount] step3 posts query:', e); return null; });
  for (const postDoc of postsSnap?.docs ?? []) {
    await deleteSubcollection(`posts/${postDoc.id}/comments`);
    await deleteDoc(postDoc.ref).catch((e) => console.error('[deleteAccount] step3 post delete:', e));
  }

  // 4. Demandes de coaching (comme étudiant ou comme coach)
  try {
    const [reqAsStudent, reqAsCoach] = await Promise.all([
      getDocs(query(collection(db, 'coachRequests'), where('studentUid', '==', uid))),
      getDocs(query(collection(db, 'coachRequests'), where('coachUid', '==', uid))),
    ]);
    const allReqs = [...reqAsStudent.docs, ...reqAsCoach.docs];
    if (allReqs.length > 0) {
      const batch = writeBatch(db);
      allReqs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (e) { console.error('[deleteAccount] step4 coachRequests:', e); }

  // 5. Données coach
  if (isCoach) {
    try {
      const studentsSnap = await getDocs(collection(db, 'coachStudents', uid, 'students'));
      for (const s of studentsSnap.docs) {
        await Promise.all([
          updateDoc(doc(db, 'users', s.id), { coachUid: null, coachStatus: 'none' }).catch((e) => console.error('[deleteAccount] step5 student update:', e)),
          deleteDoc(doc(db, 'studentTraining', s.id)).catch((e) => console.error('[deleteAccount] step5 studentTraining:', e)),
        ]);
      }
      await deleteSubcollection(`coachStudents/${uid}/students`);
      await deleteDoc(doc(db, 'coachStudents', uid)).catch((e) => console.error('[deleteAccount] step5 coachStudents doc:', e));
      await deleteSubcollection(`coachSessions/${uid}/items`);
      await deleteDoc(doc(db, 'coachSessions', uid)).catch((e) => console.error('[deleteAccount] step5 coachSessions doc:', e));
      await deleteSubcollection(`coachLibrary/${uid}/sessions`);
      await deleteDoc(doc(db, 'coachLibrary', uid)).catch(() => {});
      if (coachCode) await deleteDoc(doc(db, 'coachCodes', coachCode.toUpperCase())).catch((e) => console.error('[deleteAccount] step5 coachCode:', e));
    } catch (e) { console.error('[deleteAccount] step5 coach data:', e); }
  }

  // 6. Données élève
  if (isStudent) {
    try {
      if (userData?.coachUid) {
        await deleteDoc(doc(db, 'coachStudents', userData.coachUid, 'students', uid)).catch((e) => console.error('[deleteAccount] step6 coachStudents entry:', e));
      }
      await deleteDoc(doc(db, 'studentTraining', uid)).catch((e) => console.error('[deleteAccount] step6 studentTraining:', e));
    } catch (e) { console.error('[deleteAccount] step6 student data:', e); }
  }

  // 7. Conversations privées (chats)
  const chatsSnap = await getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', uid))).catch((e) => { console.error('[deleteAccount] step7 chats query:', e); return null; });
  for (const chatDoc of chatsSnap?.docs ?? []) {
    await deleteSubcollection(`chats/${chatDoc.id}/messages`);
    await deleteDoc(chatDoc.ref).catch((e) => console.error('[deleteAccount] step7 chat delete:', e));
  }

  // 8. Nettoyer les arrays dans les docs des autres utilisateurs
  const friends: string[] = userData?.friends ?? [];
  const following: string[] = userData?.following ?? [];
  const followers: string[] = userData?.followers ?? [];
  const blockedUsers: string[] = userData?.blockedUsers ?? [];
  const blockedBy: string[] = userData?.blockedBy ?? [];
  const allOthers = [...new Set([...friends, ...following, ...followers, ...blockedUsers, ...blockedBy])];
  for (const otherId of allOthers) {
    await updateDoc(doc(db, 'users', otherId), {
      friends: arrayRemove(uid),
      following: arrayRemove(uid),
      followers: arrayRemove(uid),
      friendRequests: arrayRemove(uid),
      blockedUsers: arrayRemove(uid),
      blockedBy: arrayRemove(uid),
    }).catch((e) => console.error(`[deleteAccount] step8 update user ${otherId}:`, e));
  }

  // 9. Commentaires laissés sur les posts des autres
  // Lecture de users/{uid}/sentComments — sous-collection directe, aucun index requis
  try {
    const sentCommentsSnap = await getDocs(collection(db, 'users', uid, 'sentComments'));
    const seenPostIds = new Set<string>();
    for (const entry of sentCommentsSnap.docs) {
      const postId: string = entry.data().postId;
      if (!postId || seenPostIds.has(postId)) continue;
      seenPostIds.add(postId);
      const myComments = await getDocs(
        query(collection(db, 'posts', postId, 'comments'), where('uid', '==', uid))
      );
      if (!myComments.empty) {
        const batch = writeBatch(db);
        myComments.docs.forEach((d) => batch.delete(d.ref));
        batch.update(doc(db, 'posts', postId), { commentCount: increment(-myComments.size) });
        await batch.commit();
      }
    }
    // Supprimer la sous-collection sentComments elle-même
    if (!sentCommentsSnap.empty) {
      const batch = writeBatch(db);
      sentCommentsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (e) {
    console.error('[deleteAccount] sentComments deletion failed:', e);
  }

  // 10 + 11. Likes + notifications de like (query unique avant suppression)
  const likedPostsSnap = await getDocs(query(collection(db, 'posts'), where('likes', 'array-contains', uid))).catch(() => null);

  // Supprimer les likes
  try {
    if (likedPostsSnap && !likedPostsSnap.empty) {
      const batch = writeBatch(db);
      likedPostsSnap.docs.forEach((d) => batch.update(d.ref, { likes: arrayRemove(uid) }));
      await batch.commit();
    }
  } catch (e) { console.error('[deleteAccount] step10 likes removal:', e); }

  // 11. Notifications envoyées chez les autres — IDs déterministes, aucun index requis
  try {
    const notifDeletes: Promise<void>[] = [];

    // like_{uid}_{postId} — utilise la query faite avant la suppression des likes
    for (const postDoc of likedPostsSnap?.docs ?? []) {
      const postOwner = postDoc.data()?.uid;
      if (postOwner && postOwner !== uid) {
        notifDeletes.push(deleteDoc(doc(db, 'notifications', postOwner, 'items', `like_${uid}_${postDoc.id}`)).catch(() => {}));
      }
    }

    // comment_{uid}_{postId} — on lit users/{uid}/sentComments
    const sentCommentsSnap2 = await getDocs(collection(db, 'users', uid, 'sentComments')).catch(() => null);
    const seenForNotif = new Set<string>();
    for (const entry of sentCommentsSnap2?.docs ?? []) {
      const postId: string = entry.data().postId;
      if (!postId || seenForNotif.has(postId)) continue;
      seenForNotif.add(postId);
      const postSnap = await getDoc(doc(db, 'posts', postId)).catch(() => null);
      const postOwner = postSnap?.data()?.uid;
      if (postOwner && postOwner !== uid) {
        notifDeletes.push(deleteDoc(doc(db, 'notifications', postOwner, 'items', `comment_${uid}_${postId}`)).catch(() => {}));
      }
    }

    // follow_{uid} et friendRequest_{uid}
    for (const otherId of allOthers) {
      notifDeletes.push(deleteDoc(doc(db, 'notifications', otherId, 'items', `follow_${uid}`)).catch(() => {}));
      notifDeletes.push(deleteDoc(doc(db, 'notifications', otherId, 'items', `friendRequest_${uid}`)).catch(() => {}));
    }

    // Notifications coaching
    if (isCoach) {
      const studentsSnap2 = await getDocs(collection(db, 'coachStudents', uid, 'students')).catch(() => null);
      for (const s of studentsSnap2?.docs ?? []) {
        notifDeletes.push(deleteDoc(doc(db, 'notifications', s.id, 'items', `coaching_stopped_coach_${uid}`)).catch(() => {}));
        notifDeletes.push(deleteDoc(doc(db, 'notifications', s.id, 'items', `training_plan_updated_${uid}`)).catch(() => {}));
      }
    }
    if (isStudent && userData?.coachUid) {
      notifDeletes.push(deleteDoc(doc(db, 'notifications', userData.coachUid, 'items', `coaching_stopped_${uid}`)).catch(() => {}));
    }

    await Promise.all(notifDeletes);
  } catch (e) {
    console.error('[deleteAccount] notifications cleanup failed:', e);
  }

  // 12. Signalements (reporter ou signalé)
  try {
    const [reportedByMe, reportedMe] = await Promise.all([
      getDocs(query(collection(db, 'reports'), where('reporterUid', '==', uid))),
      getDocs(query(collection(db, 'reports'), where('reportedUid', '==', uid))),
    ]);
    const allReports = [...reportedByMe.docs, ...reportedMe.docs];
    if (allReports.length > 0) {
      const batch = writeBatch(db);
      allReports.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (e) { console.error('[deleteAccount] step12 reports:', e); }

  // 13. Club — retrait ou dissolution + messages du club
  try {
    // Requêter les clubs où l'uid est membre OU en demande pending
    const [clubAsMember, clubAsPending] = await Promise.all([
      getDocs(query(collection(db, 'clubs'), where('memberIds', 'array-contains', uid))),
      getDocs(query(collection(db, 'clubs'), where('pendingRequests', 'array-contains', uid))),
    ]);
    const seenClubIds = new Set<string>();
    const clubSnap = { docs: [...clubAsMember.docs, ...clubAsPending.docs].filter((d) => {
      if (seenClubIds.has(d.id)) return false;
      seenClubIds.add(d.id);
      return true;
    }) };
    for (const clubDoc of clubSnap.docs) {
      const club = clubDoc.data();
      if (club.ownerId === uid) {
        // Owner → dissoudre le club entièrement
        await deleteSubcollection(`clubs/${clubDoc.id}/notifications`);
        await deleteSubcollection(`clubs/${clubDoc.id}/messages`);
        await deleteDoc(clubDoc.ref);
      } else {
        // Membre/admin/pending → retrait propre
        const isMemberOfClub = (club.memberIds ?? []).includes(uid);
        await updateDoc(clubDoc.ref, {
          memberIds: arrayRemove(uid),
          adminIds: arrayRemove(uid),
          pendingRequests: arrayRemove(uid),
          ...(isMemberOfClub ? { memberCount: increment(-1) } : {}),
        }).catch(() => {});
        // Supprimer tous les messages envoyés par ce membre dans le chat
        const clubMsgsSnap = await getDocs(
          query(collection(db, 'clubs', clubDoc.id, 'messages'), where('uid', '==', uid))
        ).catch(() => null);
        if (clubMsgsSnap && !clubMsgsSnap.empty) {
          const batch = writeBatch(db);
          clubMsgsSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
        // Supprimer les notifications du club envoyées par ce membre
        const clubNotifsSnap = await getDocs(
          query(collection(db, 'clubs', clubDoc.id, 'notifications'), where('fromUid', '==', uid))
        ).catch(() => null);
        if (clubNotifsSnap && !clubNotifsSnap.empty) {
          const batch = writeBatch(db);
          clubNotifsSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
    }

    // GoshOffs impliquant son club (tous statuts)
    const clubIds = clubSnap.docs.map((d) => d.id);
    for (const clubId of clubIds) {
      const [asC, asD] = await Promise.all([
        getDocs(query(collection(db, 'goshoffs'), where('challengerClubId', '==', clubId))),
        getDocs(query(collection(db, 'goshoffs'), where('challengedClubId', '==', clubId))),
      ]);
      const allGoshOffs = [...asC.docs, ...asD.docs];
      if (allGoshOffs.length > 0) {
        const batch = writeBatch(db);
        allGoshOffs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
  } catch (e) { console.error('[deleteAccount] step13 clubs:', e); }

  // 14. Sous-collection appState (état local Firestore)
  await deleteSubcollection(`users/${uid}/appState`);

  // 14b. Logs de performances (workoutLogs), plans d'entraînement (training), repas
  await deleteSubcollection(`users/${uid}/workoutLogs`);
  await deleteSubcollection(`users/${uid}/repas`);
  try {
    const trainingSnap = await getDocs(collection(db, 'users', uid, 'training'));
    if (!trainingSnap.empty) {
      const batch = writeBatch(db);
      trainingSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (e) { console.error('[deleteAccount] step14b training:', e); }

  // 15. Doc utilisateur principal
  await deleteDoc(doc(db, 'users', uid)).catch((e) => console.error('[deleteAccount] step15 user doc:', e));

  // 16. Firebase Storage : avatars + posts médias
  await Promise.all([
    deleteStorageFolder(`avatars/${uid}`),
    deleteStorageFolder(`posts/${uid}`),
  ]);

  // 17. AsyncStorage local
  await AsyncStorage.clear();

  // 18. Supprimer le compte Firebase Auth (en dernier)
  await deleteUser(user);
}
