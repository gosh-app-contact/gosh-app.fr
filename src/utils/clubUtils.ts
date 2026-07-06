import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove,
  writeBatch, increment, runTransaction,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { uploadImage } from './uploadImage';

export const CLUB_CATEGORIES = ['Musculation', 'Running', 'Nutrition', 'Crossfit', 'Hyrox'] as const;
export type ClubCategory = typeof CLUB_CATEGORIES[number];

function getCurrentWeekStart(): string {
  const today = new Date();
  const day = today.getDay(); // 0=dim, 1=lun, ..., 6=sam
  // Dimanche → prochain lundi (+1). Lundi→Sam → lundi courant.
  const diff = day === 0 ? 1 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type Club = {
  id: string;
  name: string;
  description: string;
  category: ClubCategory;
  photoUrl: string;
  ownerId: string;
  adminIds: string[];
  memberIds: string[];
  memberCount: number;
  pendingRequests: string[];
  pinnedMessageId: string | null;
  createdAt: any;
  weeklyScore: number;   // points d'activité cumulés sur la semaine courante
  weekStart: string;     // YYYY-MM-DD du lundi courant (date locale)
  bannerUrl?: string;    // image de bannière (optionnelle)
  goshOffEnabled?: boolean; // club visible dans "prêts à relever le défi"
};

export type ClubNotif = {
  id: string;
  type: 'request' | 'accepted' | 'excluded' | 'club_deleted' | 'promoted';
  clubId: string;
  clubName: string;
  fromUid?: string;
  fromPseudo?: string;
  toUid: string;
  read: boolean;
  createdAt: any;
};

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createClub(params: {
  name: string;
  description: string;
  category: ClubCategory;
  photoUri: string | null;
  bannerUri?: string | null;
}): Promise<string> {
  const me = auth.currentUser;
  if (!me) throw new Error('Non connecté');

  const meSnap = await getDoc(doc(db, 'users', me.uid));
  if (meSnap.data()?.accountType === 'coach') throw new Error('Les comptes coach ne peuvent pas créer de club.');

  const memberSnap = await getDocs(query(collection(db, 'clubs'), where('memberIds', 'array-contains', me.uid)));
  if (!memberSnap.empty) throw new Error('Tu es déjà membre d\'un club. Quitte-le avant d\'en créer un nouveau.');

  const nameSnap = await getDocs(query(collection(db, 'clubs'), where('name', '==', params.name.trim())));
  if (!nameSnap.empty) throw new Error('Ce nom de club est déjà pris.');

  let photoUrl = '';
  if (params.photoUri) photoUrl = await uploadImage(params.photoUri, 'clubs');
  let bannerUrl = '';
  if (params.bannerUri) bannerUrl = await uploadImage(params.bannerUri, 'clubs');

  const ref = await addDoc(collection(db, 'clubs'), {
    name: params.name.trim(),
    description: params.description.trim(),
    category: params.category,
    photoUrl,
    bannerUrl,
    ownerId: me.uid,
    adminIds: [me.uid],
    memberIds: [me.uid],
    memberCount: 1,
    pendingRequests: [],
    pinnedMessageId: null,
    createdAt: serverTimestamp(),
    weeklyScore: 0,
    weekStart: getCurrentWeekStart(),
  });

  return ref.id;
}

// ─── Join request ─────────────────────────────────────────────────────────────

export async function sendJoinRequest(clubId: string): Promise<void> {
  const me = auth.currentUser;
  if (!me) return;
  const meSnap = await getDoc(doc(db, 'users', me.uid));
  if (meSnap.data()?.accountType === 'coach') throw new Error('Les comptes coach ne peuvent pas rejoindre de club.');
  const memberSnap = await getDocs(query(collection(db, 'clubs'), where('memberIds', 'array-contains', me.uid)));
  if (!memberSnap.empty) throw new Error('Tu es déjà membre d\'un club. Quitte-le avant d\'en rejoindre un autre.');
  await updateDoc(doc(db, 'clubs', clubId), {
    pendingRequests: arrayUnion(me.uid),
  });
  const club = (await getDoc(doc(db, 'clubs', clubId))).data() as Club;
  const mySnap = await getDoc(doc(db, 'users', me.uid));
  const myPseudo = mySnap.data()?.pseudo ?? '';
  const admins: string[] = [...(club.adminIds ?? []), club.ownerId];
  await Promise.all(admins.filter((uid) => uid !== me.uid).map((uid) =>
    addDoc(collection(db, 'clubs', clubId, 'notifications'), {
      type: 'request',
      clubId,
      clubName: club.name,
      fromUid: me.uid,
      fromPseudo: myPseudo,
      toUid: uid,
      read: false,
      createdAt: serverTimestamp(),
    })
  ));
}

export async function cancelJoinRequest(clubId: string): Promise<void> {
  const me = auth.currentUser;
  if (!me) return;
  await updateDoc(doc(db, 'clubs', clubId), {
    pendingRequests: arrayRemove(me.uid),
  });
}

// ─── Accept / Refuse ──────────────────────────────────────────────────────────

export async function acceptRequest(clubId: string, uid: string): Promise<void> {
  const club = (await getDoc(doc(db, 'clubs', clubId))).data() as Club;
  if ((club.memberIds ?? []).length >= 50) throw new Error('Le club est complet (50 membres max).');
  await updateDoc(doc(db, 'clubs', clubId), {
    pendingRequests: arrayRemove(uid),
    memberIds: arrayUnion(uid),
    memberCount: increment(1),
  });
  await addDoc(collection(db, 'clubs', clubId, 'notifications'), {
    type: 'accepted',
    clubId,
    clubName: club.name,
    toUid: uid,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function refuseRequest(clubId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId), {
    pendingRequests: arrayRemove(uid),
  });
}

// ─── Leave ────────────────────────────────────────────────────────────────────

export async function leaveClub(clubId: string): Promise<void> {
  const me = auth.currentUser;
  if (!me) return;
  const club = (await getDoc(doc(db, 'clubs', clubId))).data() as Club;
  if (club.ownerId === me.uid) throw new Error('owner_must_transfer');
  const batch = writeBatch(db);
  batch.update(doc(db, 'clubs', clubId), {
    memberIds: arrayRemove(me.uid),
    adminIds: arrayRemove(me.uid),
    memberCount: increment(-1),
  });
  await batch.commit();
}

// ─── Kick ─────────────────────────────────────────────────────────────────────

export async function kickMember(clubId: string, uid: string): Promise<void> {
  const club = (await getDoc(doc(db, 'clubs', clubId))).data() as Club;
  await updateDoc(doc(db, 'clubs', clubId), {
    memberIds: arrayRemove(uid),
    adminIds: arrayRemove(uid),
    memberCount: increment(-1),
  });
  await addDoc(collection(db, 'clubs', clubId, 'notifications'), {
    type: 'excluded',
    clubId,
    clubName: club.name,
    toUid: uid,
    read: false,
    createdAt: serverTimestamp(),
  });
}

// ─── Promote / Demote ─────────────────────────────────────────────────────────

export async function promoteToAdmin(clubId: string, uid: string): Promise<void> {
  const club = (await getDoc(doc(db, 'clubs', clubId))).data() as Club;
  await updateDoc(doc(db, 'clubs', clubId), { adminIds: arrayUnion(uid) });
  await addDoc(collection(db, 'clubs', clubId, 'notifications'), {
    type: 'promoted',
    clubId,
    clubName: club.name,
    toUid: uid,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function demoteAdmin(clubId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId), { adminIds: arrayRemove(uid) });
}

// ─── Transfer ownership ───────────────────────────────────────────────────────

export async function transferOwnership(clubId: string, newOwnerUid: string): Promise<void> {
  const me = auth.currentUser;
  if (!me) return;
  await updateDoc(doc(db, 'clubs', clubId), {
    ownerId: newOwnerUid,
    adminIds: arrayUnion(newOwnerUid),
  });
}

// ─── Kick owner by super admin (auto-transfer or delete) ─────────────────────

export async function kickOwnerByAdmin(clubId: string): Promise<'transferred' | 'deleted'> {
  const snap = await getDoc(doc(db, 'clubs', clubId));
  const club = snap.data() as Club;
  const memberIds: string[] = club.memberIds ?? [];
  const adminIds: string[] = club.adminIds ?? [];
  const ownerId = club.ownerId;

  // Autres membres disponibles (hors propriétaire)
  const others = memberIds.filter((uid) => uid !== ownerId);

  if (others.length === 0) {
    // Seul membre → supprimer le club
    await deleteDoc(doc(db, 'clubs', clubId));
    return 'deleted';
  }

  // Choisir le nouveau propriétaire : priorité aux admins, sinon premier membre
  const newOwner = adminIds.find((uid) => uid !== ownerId) ?? others[0];

  await updateDoc(doc(db, 'clubs', clubId), {
    ownerId: newOwner,
    memberIds: arrayRemove(ownerId),
    adminIds: arrayRemove(ownerId),
    memberCount: increment(-1),
  });

  // Notifier le nouveau propriétaire
  await addDoc(collection(db, 'clubs', clubId, 'notifications'), {
    type: 'ownership_transferred',
    clubId,
    clubName: club.name,
    toUid: newOwner,
    read: false,
    createdAt: serverTimestamp(),
  });

  return 'transferred';
}

// ─── Delete club ──────────────────────────────────────────────────────────────

export async function deleteClub(clubId: string): Promise<void> {
  const club = (await getDoc(doc(db, 'clubs', clubId))).data() as Club;
  const members = club.memberIds ?? [];

  // Annuler proprement tous les GoshOffs actifs ou en attente impliquant ce club
  const [asChallenger, asChallengee] = await Promise.all([
    getDocs(query(collection(db, 'goshoffs'), where('challengerClubId', '==', clubId), where('status', 'in', ['pending', 'active']))),
    getDocs(query(collection(db, 'goshoffs'), where('challengedClubId', '==', clubId), where('status', 'in', ['pending', 'active']))),
  ]);
  const goshOffDocs = [...asChallenger.docs, ...asChallengee.docs];
  await Promise.all(
    goshOffDocs.map((d) =>
      updateDoc(d.ref, {
        status: 'cancelled',
        winnerId: null,
        cancelledReason: 'club_deleted',
        cancelledAt: serverTimestamp(),
      })
    )
  );

  // Notifier les membres
  const notifPromises = members
    .filter((uid) => uid !== club.ownerId)
    .map((uid) =>
      addDoc(collection(db, 'clubs', clubId, 'notifications'), {
        type: 'club_deleted',
        clubId,
        clubName: club.name,
        toUid: uid,
        read: false,
        createdAt: serverTimestamp(),
      })
    );
  await Promise.all(notifPromises);
  await deleteDoc(doc(db, 'clubs', clubId));
}

// ─── Modifier le club ─────────────────────────────────────────────────────────

export async function updateClub(clubId: string, params: {
  name?: string;
  description?: string;
  category?: ClubCategory;
  photoUrl?: string;
  bannerUrl?: string;
  goshOffEnabled?: boolean;
}): Promise<void> {
  const patch: Record<string, any> = {};
  if (params.name !== undefined) patch.name = params.name.trim();
  if (params.description !== undefined) patch.description = params.description.trim();
  if (params.category !== undefined) patch.category = params.category;
  if (params.photoUrl !== undefined) patch.photoUrl = params.photoUrl;
  if (params.bannerUrl !== undefined) patch.bannerUrl = params.bannerUrl;
  if (params.goshOffEnabled !== undefined) patch.goshOffEnabled = params.goshOffEnabled;
  await updateDoc(doc(db, 'clubs', clubId), patch);
}

// ─── Pin message ──────────────────────────────────────────────────────────────

export async function pinMessage(clubId: string, messageId: string | null): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId), { pinnedMessageId: messageId });
}

// ─── Fetch featured club ──────────────────────────────────────────────────────

export async function fetchFeaturedClub(): Promise<Club | null> {
  const snap = await getDocs(
    query(collection(db, 'clubs'), where('weeklyScore', '>', 0), orderBy('weeklyScore', 'desc'), limit(20))
  );
  if (snap.empty) return null;
  const clubs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Club));
  clubs.sort((a, b) => (b.weeklyScore / Math.max(b.memberCount, 1)) - (a.weeklyScore / Math.max(a.memberCount, 1)));
  return clubs[0];
}

// ─── Activity score ───────────────────────────────────────────────────────────

// Retourne la date du jour en "YYYY-MM-DD" heure locale
function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Valide une séance et attribue +10 pts au club + GoshOff — limité à une seule fois par jour.
// Stocke la date dans users/{uid}.lastSessionPointsDate pour éviter les abus.
export async function addDailySessionPoints(uid: string): Promise<void> {
  try {
    const today = todayString();
    const userRef = doc(db, 'users', uid);

    // Transaction atomique : vérifie ET met à jour en un seul aller-retour
    // → impossible d'attribuer deux fois les points même si deux appareils terminent en même temps
    let shouldAddPoints = false;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (snap.data()?.lastSessionPointsDate === today) return;
      tx.update(userRef, { lastSessionPointsDate: today });
      shouldAddPoints = true;
    });

    if (shouldAddPoints) await addClubActivityPoints(uid, 10);
  } catch (e) { console.error('[addDailySessionPoints]', e); }
}

// Ajoute des points d'activité au club d'un membre
// points : +10 séance validée, +2 streak quotidien
export async function addClubActivityPoints(uid: string, points: number): Promise<void> {
  try {
    const snap = await getDocs(
      query(collection(db, 'clubs'), where('memberIds', 'array-contains', uid), limit(1))
    );
    if (snap.empty) return;
    const clubDoc = snap.docs[0];
    const club = clubDoc.data() as Club;
    const weekStart = getCurrentWeekStart();

    if (!club.weekStart || club.weekStart !== weekStart) {
      await updateDoc(clubDoc.ref, { weeklyScore: points, weekStart });
    } else {
      await updateDoc(clubDoc.ref, { weeklyScore: increment(points) });
    }
  } catch (e) { console.error('[addClubActivityPoints]', e); }
}

// ─── GoshOff ──────────────────────────────────────────────────────────────────

export const GOSHOFF_EXERCISES: { slug: string; name: string }[] = [
  { slug: 'squat-barre', name: 'Squat barre' },
  { slug: 'deadlift', name: 'Deadlift' },
  { slug: 'bench-press', name: 'Bench press' },
  { slug: 'rowing-barre', name: 'Rowing barre' },
  { slug: 'hip-thrust-barre', name: 'Hip thrust barre' },
  { slug: 'romanian-deadlift', name: 'Romanian deadlift' },
  { slug: 'front-squat', name: 'Front squat' },
];

export type GoshOffPR = {
  uid: string;
  pseudo: string;
  photoUrl?: string;
  exerciseSlug: string;
  exerciseName: string;
  weight: number; // kg, 1RM
  submittedAt: number;
};

export type GoshOff = {
  id: string;
  challengerClubId: string;
  challengerClubName: string;
  challengerClubPhoto: string;
  challengedClubId: string;
  challengedClubName: string;
  challengedClubPhoto: string;
  status: 'pending' | 'active' | 'finished';
  weekStart: string;
  weekEnd: string; // samedi de la semaine (clôture automatique)
  exercises: { slug: string; name: string }[]; // 3 exercices tirés aléatoirement
  challengerTonnage: number; // somme des PRs (kg) soumis par les membres challenger
  challengedTonnage: number;
  challengerMemberCount: number;
  challengedMemberCount: number;
  prs: Record<string, GoshOffPR>; // clé = `${uid}_${exerciseSlug}`
  winnerId: string | null; // clubId du gagnant
  createdAt: any;
  createdBy: string;
};

function getWeekEnd(weekStart: string): string {
  // weekStart = lundi → weekEnd = samedi (+5 jours)
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 5);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function launchGoshOff(
  challengerClubId: string,
  challengedClubId: string,
  predrawnExercises?: { slug: string; name: string }[],
): Promise<string> {
  const me = auth.currentUser;
  if (!me) throw new Error('Non connecté');

  const todayDay = new Date().getDay(); // 0 = dimanche
  if (todayDay !== 0) throw new Error('Les GoshOffs ne peuvent être lancés que le dimanche.');

  const [cSnap, dSnap] = await Promise.all([
    getDoc(doc(db, 'clubs', challengerClubId)),
    getDoc(doc(db, 'clubs', challengedClubId)),
  ]);
  if (!cSnap.exists() || !dSnap.exists()) throw new Error('Club introuvable');

  const challenger = { id: cSnap.id, ...cSnap.data() } as Club;
  const challenged = { id: dSnap.id, ...dSnap.data() } as Club;

  const [challengerAsC, challengerAsD, challengedAsC, challengedAsD] = await Promise.all([
    getDocs(query(collection(db, 'goshoffs'), where('challengerClubId', '==', challengerClubId), where('status', 'in', ['pending', 'active']))),
    getDocs(query(collection(db, 'goshoffs'), where('challengedClubId', '==', challengerClubId), where('status', 'in', ['pending', 'active']))),
    getDocs(query(collection(db, 'goshoffs'), where('challengerClubId', '==', challengedClubId), where('status', 'in', ['pending', 'active']))),
    getDocs(query(collection(db, 'goshoffs'), where('challengedClubId', '==', challengedClubId), where('status', 'in', ['pending', 'active']))),
  ]);
  if (!challengerAsC.empty || !challengerAsD.empty)
    throw new Error('Ton club participe déjà à un GoshOff cette semaine.');
  if (!challengedAsC.empty || !challengedAsD.empty)
    throw new Error('Ce club participe déjà à un GoshOff cette semaine.');

  const exercises = predrawnExercises ?? [...GOSHOFF_EXERCISES].sort(() => Math.random() - 0.5).slice(0, 3);

  const weekStart = getCurrentWeekStart();
  const ref = await addDoc(collection(db, 'goshoffs'), {
    challengerClubId,
    challengerClubName: challenger.name,
    challengerClubPhoto: challenger.photoUrl ?? '',
    challengedClubId,
    challengedClubName: challenged.name,
    challengedClubPhoto: challenged.photoUrl ?? '',
    status: 'pending',
    weekStart,
    weekEnd: getWeekEnd(weekStart),
    exercises,
    challengerTonnage: 0,
    challengedTonnage: 0,
    challengerMemberCount: (challenger.memberIds ?? []).length,
    challengedMemberCount: (challenged.memberIds ?? []).length,
    prs: {},
    winnerId: null,
    createdAt: serverTimestamp(),
    createdBy: me.uid,
  });
  return ref.id;
}

export async function acceptGoshOff(goshOffId: string): Promise<void> {
  await updateDoc(doc(db, 'goshoffs', goshOffId), { status: 'active' });
}

export async function refuseGoshOff(goshOffId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'goshoffs', goshOffId));
  if (!snap.exists()) return;
  const g = snap.data() as GoshOff;

  await updateDoc(snap.ref, {
    status: 'cancelled',
    winnerId: null,
    cancelledReason: 'refused',
    cancelledAt: serverTimestamp(),
  });

  // Notifier l'owner + admins du club challenger
  const clubSnap = await getDoc(doc(db, 'clubs', g.challengerClubId));
  if (clubSnap.exists()) {
    const club = clubSnap.data() as Club;
    const toNotify = Array.from(new Set([club.ownerId, ...(club.adminIds ?? [])]));
    await Promise.all(
      toNotify.map((uid) =>
        addDoc(collection(db, 'clubs', g.challengerClubId, 'notifications'), {
          type: 'goshoff_refused',
          goshOffId,
          challengedClubName: g.challengedClubName,
          toUid: uid,
          read: false,
          createdAt: serverTimestamp(),
        })
      )
    );
  }
}

// Soumet le PR (1RM en kg) d'un membre pour un exercice du GoshOff.
// Une seule soumission par membre par exercice — rejetée si déjà existante.
export async function submitGoshOffPR(
  goshOffId: string,
  exerciseSlug: string,
  exerciseName: string,
  weight: number,
): Promise<void> {
  const me = auth.currentUser;
  if (!me) throw new Error('Non connecté');

  const goshOffRef = doc(db, 'goshoffs', goshOffId);
  const userSnap = await getDoc(doc(db, 'users', me.uid));
  const userData = userSnap.data() ?? {};
  const pseudo = userData.pseudo ?? userData.prenom ?? 'Anonyme';
  const photoUrl = userData.photoUrl ?? '';

  const prKey = `${me.uid}_${exerciseSlug}`;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(goshOffRef);
    if (!snap.exists()) throw new Error('GoshOff introuvable');
    const g = snap.data() as GoshOff;

    if (g.status !== 'active') throw new Error('Ce GoshOff n\'est pas actif.');
    if (g.prs?.[prKey]) throw new Error('Tu as déjà soumis un PR pour cet exercice.');

    const isChallenger = g.challengerClubId === await getMemberClubId(me.uid);
    const tonnageField = isChallenger ? 'challengerTonnage' : 'challengedTonnage';

    tx.update(goshOffRef, {
      [`prs.${prKey}`]: {
        uid: me.uid,
        pseudo,
        photoUrl,
        exerciseSlug,
        exerciseName,
        weight,
        submittedAt: Date.now(),
      },
      [tonnageField]: increment(weight),
    });
  });
}

async function getMemberClubId(uid: string): Promise<string> {
  const snap = await getDocs(query(collection(db, 'clubs'), where('memberIds', 'array-contains', uid), limit(1)));
  if (snap.empty) throw new Error('Aucun club trouvé');
  return snap.docs[0].id;
}

// Clôture un GoshOff si weekEnd est dépassé — appelé côté client au chargement.
export async function closeGoshOffIfExpired(goshOff: GoshOff): Promise<GoshOff> {
  const today = new Date().toISOString().split('T')[0];
  if (goshOff.status !== 'active' || goshOff.weekEnd >= today) return goshOff;

  const winnerId = goshOff.challengerTonnage >= goshOff.challengedTonnage
    ? goshOff.challengerClubId
    : goshOff.challengedClubId;

  await updateDoc(doc(db, 'goshoffs', goshOff.id), { status: 'finished', winnerId });
  return { ...goshOff, status: 'finished', winnerId };
}

export async function fetchMyGoshOffs(clubId: string): Promise<GoshOff[]> {
  const [asChallenger, asChallenged] = await Promise.all([
    getDocs(query(collection(db, 'goshoffs'), where('challengerClubId', '==', clubId), limit(20))),
    getDocs(query(collection(db, 'goshoffs'), where('challengedClubId', '==', clubId), limit(20))),
  ]);
  const all = [...asChallenger.docs, ...asChallenged.docs]
    .map((d) => ({ id: d.id, ...d.data() } as GoshOff))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  return all;
}

export async function fetchGoshOffReadyClubs(): Promise<Club[]> {
  const snap = await getDocs(query(
    collection(db, 'clubs'),
    where('goshOffEnabled', '==', true),
    limit(30),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Club));
}

export async function fetchActiveGoshOffs(): Promise<GoshOff[]> {
  const snap = await getDocs(query(
    collection(db, 'goshoffs'),
    where('status', 'in', ['pending', 'active']),
    limit(20),
  ));
  const goshoffs = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as GoshOff))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

  // Enrichir les photos manquantes depuis les docs clubs
  const enriched = await Promise.all(goshoffs.map(async (g) => {
    let updated = { ...g };
    if (!g.challengerClubPhoto || !g.challengedClubPhoto) {
      try {
        const [cSnap, dSnap] = await Promise.all([
          !g.challengerClubPhoto ? getDoc(doc(db, 'clubs', g.challengerClubId)) : Promise.resolve(null),
          !g.challengedClubPhoto ? getDoc(doc(db, 'clubs', g.challengedClubId)) : Promise.resolve(null),
        ]);
        if (cSnap?.exists()) updated.challengerClubPhoto = cSnap.data()?.photoUrl ?? '';
        if (dSnap?.exists()) updated.challengedClubPhoto = dSnap.data()?.photoUrl ?? '';
      } catch {}
    }
    return updated;
  }));
  return enriched;
}

// ─── Search clubs ─────────────────────────────────────────────────────────────

export async function searchClubs(term: string, category?: ClubCategory): Promise<Club[]> {
  // Sans orderBy sur weeklyScore pour récupérer TOUS les clubs (même sans le champ)
  const q = category
    ? query(collection(db, 'clubs'), where('category', '==', category), limit(200))
    : query(collection(db, 'clubs'), limit(200));
  const snap = await getDocs(q);
  const clubs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Club));
  // Trier par score moyen par membre (équitable entre petits et grands clubs)
  const sorted = clubs.sort((a, b) => {
    const scoreA = (a.weeklyScore ?? 0) / Math.max(a.memberCount, 1);
    const scoreB = (b.weeklyScore ?? 0) / Math.max(b.memberCount, 1);
    return scoreB - scoreA;
  });
  if (!term.trim()) return sorted;
  const lower = term.toLowerCase();
  return sorted.filter((c) => c.name.toLowerCase().includes(lower));
}
