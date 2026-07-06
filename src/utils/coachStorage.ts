import { db, auth } from './firebase';
import {
  doc, getDoc, setDoc, updateDoc, collection,
  query, where, getDocs, onSnapshot, orderBy, Unsubscribe,
  deleteDoc, addDoc, arrayUnion, arrayRemove, deleteField,
  runTransaction, writeBatch,
} from 'firebase/firestore';
import { AccountType, CoachRequest, StudentSummary, buildCoachCode } from '../types/coach';
import { WorkoutSession } from '../types/training';

// ─── Read account type ─────────────────────────────────────────────────────────

export async function getAccountType(uid: string): Promise<AccountType> {
  const snap = await getDoc(doc(db, 'users', uid));
  return (snap.data()?.accountType as AccountType) ?? 'standard';
}

export async function getMyAccountType(): Promise<AccountType> {
  const uid = auth.currentUser?.uid;
  if (!uid) return 'standard';
  return getAccountType(uid);
}

// ─── Coach: verify one-time code (lecture seule, pour afficher feedback avant soumission) ───

export async function verifyAndConsumeCoachCode(code: string): Promise<{ valid: boolean; reason?: string }> {
  const codeRef = doc(db, 'coachCodes', code.trim().toUpperCase());
  const snap = await getDoc(codeRef);
  if (!snap.exists()) return { valid: false, reason: 'Code invalide.' };
  if (snap.data().used) return { valid: false, reason: 'Ce code a déjà été utilisé.' };
  return { valid: true };
}

// ─── Coach: set up coach account (atomique : consume code + upgrade account) ──

export async function setupCoachAccount(uid: string, pseudo: string, secretCode: string): Promise<void> {
  const coachCode = buildCoachCode(pseudo);
  const codeRef = doc(db, 'coachCodes', secretCode.trim().toUpperCase());
  const userRef = doc(db, 'users', uid);

  await runTransaction(db, async (tx) => {
    const codeSnap = await tx.get(codeRef);
    if (!codeSnap.exists()) throw new Error('Code invalide.');
    if (codeSnap.data().used) throw new Error('Ce code a déjà été utilisé.');
    tx.update(codeRef, { used: true, usedBy: uid, usedAt: Date.now() });
    tx.update(userRef, { accountType: 'coach', coachCode });
  });
}

// ─── Student: find coach by code ───────────────────────────────────────────────

export async function findCoachByCode(input: string): Promise<{ uid: string; pseudo: string; firstName?: string; photoUrl?: string } | null> {
  const normalized = input.toLowerCase().trim();
  const snap = await getDocs(query(
    collection(db, 'users'),
    where('coachCode', '==', normalized),
    where('accountType', '==', 'coach'),
  ));
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return { uid: snap.docs[0].id, pseudo: data.pseudo, firstName: data.prenom ?? data.firstName, photoUrl: data.photoUrl };
}

// ─── Student: send coach request ───────────────────────────────────────────────

export async function sendCoachRequest(studentUid: string, studentPseudo: string, studentPhotoUrl: string | undefined, coachUid: string, coachCode: string): Promise<string> {
  // ID déterministe student+coach pour garantir l'unicité sans query
  const requestId = `${studentUid}_${coachUid}`;
  const reqRef = doc(db, 'coachRequests', requestId);
  const studentRef = doc(db, 'users', studentUid);
  const notifRef = doc(db, 'notifications', coachUid, 'items', `coach_request_${studentUid}`);

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(reqRef);
    if (existing.exists() && existing.data().status === 'pending') return; // idempotent

    tx.set(reqRef, {
      studentUid,
      studentPseudo,
      studentPhotoUrl: studentPhotoUrl ?? '',
      coachUid,
      coachCode,
      status: 'pending',
      createdAt: Date.now(),
    });
    tx.update(studentRef, {
      coachUid,
      coachCode,
      coachStatus: 'pending',
      coachRequestId: requestId,
    });
    tx.set(notifRef, {
      type: 'coach_request',
      fromUid: studentUid,
      fromPseudo: studentPseudo,
      fromPhoto: studentPhotoUrl ?? '',
      requestId,
      read: false,
      createdAt: Date.now(),
    });
  });

  return requestId;
}

// ─── Coach: accept / reject request ────────────────────────────────────────────

export async function acceptCoachRequest(requestId: string): Promise<void> {
  const reqRef = doc(db, 'coachRequests', requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) return;
  const { studentUid, coachUid, studentPseudo, studentPhotoUrl } = reqSnap.data();

  const coachSnap = await getDoc(doc(db, 'users', coachUid));
  const coachData = coachSnap.data();

  const batch = writeBatch(db);
  batch.update(reqRef, { status: 'accepted' });
  batch.update(doc(db, 'users', studentUid), { accountType: 'student', coachStatus: 'accepted', friends: arrayUnion(coachUid), friendRequests: arrayRemove(coachUid) });
  batch.update(doc(db, 'users', coachUid), { friends: arrayUnion(studentUid), friendRequests: arrayRemove(studentUid) });
  batch.set(doc(db, 'coachStudents', coachUid, 'students', studentUid), {
    uid: studentUid,
    pseudo: studentPseudo,
    photoUrl: studentPhotoUrl ?? '',
    coachStatus: 'accepted',
    joinedAt: Date.now(),
  });
  batch.set(doc(db, 'notifications', studentUid, 'items', `coach_accepted_${coachUid}`), {
    type: 'coach_accepted',
    fromUid: coachUid,
    fromPseudo: coachData?.prenom ?? coachData?.pseudo ?? 'Ton coach',
    fromPhoto: coachData?.photoUrl ?? '',
    read: false,
    createdAt: Date.now(),
  });
  await batch.commit();
}

export async function rejectCoachRequest(requestId: string): Promise<void> {
  const reqRef = doc(db, 'coachRequests', requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) return;
  const { studentUid, coachUid } = reqSnap.data();

  const coachSnap = await getDoc(doc(db, 'users', coachUid));
  const coachData = coachSnap.data();

  const batch = writeBatch(db);
  batch.update(reqRef, { status: 'rejected' });
  batch.update(doc(db, 'users', studentUid), {
    coachStatus: deleteField(),
    coachUid: deleteField(),
    coachCode: deleteField(),
    coachRequestId: deleteField(),
  });
  batch.set(doc(db, 'notifications', studentUid, 'items', `coach_rejected_${coachUid}`), {
    type: 'coach_rejected',
    fromUid: coachUid,
    fromPseudo: coachData?.prenom ?? coachData?.pseudo ?? 'Ton coach',
    fromPhoto: coachData?.photoUrl ?? '',
    read: false,
    createdAt: Date.now(),
  });
  batch.delete(doc(db, 'notifications', coachUid, 'items', `coach_request_${studentUid}`));
  await batch.commit();
}

// ─── Coach: listen to pending requests ─────────────────────────────────────────

export function subscribeCoachRequests(coachUid: string, onChange: (requests: CoachRequest[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'coachRequests'),
    where('coachUid', '==', coachUid),
    where('status', '==', 'pending'),
  );
  return onSnapshot(q, (snap) => {
    const requests: CoachRequest[] = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as CoachRequest))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    onChange(requests);
  });
}

// ─── Coach: listen to students list ────────────────────────────────────────────

export function subscribeStudents(coachUid: string, onChange: (students: StudentSummary[]) => void): Unsubscribe {
  const q = query(collection(db, 'coachStudents', coachUid, 'students'), orderBy('joinedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const students: StudentSummary[] = snap.docs.map((d) => d.data() as StudentSummary);
    onChange(students);
  });
}

// ─── Coach: save training plan for a student ───────────────────────────────────

export async function saveStudentTrainingPlan(coachUid: string, studentUid: string, trainingState: any): Promise<void> {
  const { sentAt, ...rest } = trainingState;
  const ref = doc(db, 'studentTraining', studentUid);
  if (sentAt != null) {
    // Écrire avec sentAt (validation du planning)
    await setDoc(ref, { ...rest, sentAt, coachUid, updatedAt: Date.now() });
  } else {
    // Écrire sans sentAt puis le supprimer (modification du planning)
    await setDoc(ref, { ...rest, coachUid, updatedAt: Date.now() });
    await updateDoc(ref, { sentAt: deleteField() });
  }
}

// ─── Student: load training plan from coach ────────────────────────────────────

export async function loadStudentTrainingPlan(studentUid: string): Promise<any | null> {
  const snap = await getDoc(doc(db, 'studentTraining', studentUid));
  if (!snap.exists()) return null;
  return snap.data();
}

// ─── Migration: ajouter amis mutuels pour toutes les paires coach-élève acceptées ──

export async function migrateCoachStudentFriends(): Promise<void> {
  const snap = await getDocs(query(collection(db, 'coachRequests'), where('status', '==', 'accepted')));
  await Promise.all(snap.docs.map(async (d) => {
    const { coachUid, studentUid } = d.data();
    if (!coachUid || !studentUid) return;
    await Promise.all([
      updateDoc(doc(db, 'users', coachUid), { friends: arrayUnion(studentUid) }),
      updateDoc(doc(db, 'users', studentUid), { friends: arrayUnion(coachUid) }),
    ]);
  }));
}

export function subscribeStudentTrainingPlan(studentUid: string, onChange: (plan: any | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'studentTraining', studentUid), (snap) => {
    onChange(snap.exists() ? snap.data() : null);
  });
}

// ─── Coach planning ────────────────────────────────────────────────────────────

export type CoachScheduleItem = {
  id: string;
  studentUid?: string;       // undefined = créneau manuel
  studentPseudo: string;
  sessionName: string;
  time: string;              // "HH:MM"
  dayOfWeek: number;         // 0=Lundi … 6=Dimanche
  isManual: boolean;
  location?: string;
};

export type ManualSession = {
  id: string;
  label: string;             // ex: "John - cours particulier"
  time: string;
  dayOfWeek: number;
  location?: string;         // ex: "Salle Nantes Centre"
  studentUid?: string;       // uid de l'élève app associé (optionnel)
};

/** Charge uniquement les créneaux manuels du coach */
export async function loadCoachWeekSchedule(coachUid: string): Promise<CoachScheduleItem[]> {
  const items: CoachScheduleItem[] = [];

  // Créneaux manuels uniquement
  const manualSnap = await getDocs(collection(db, 'coachSessions', coachUid, 'items'));
  manualSnap.docs.forEach((d) => {
    const m = d.data() as ManualSession;
    items.push({
      id: m.id,
      studentUid: m.studentUid,
      studentPseudo: m.label,
      sessionName: '',
      time: m.time,
      dayOfWeek: m.dayOfWeek,
      isManual: true,
      location: m.location,
    });
  });

  return items.sort((a, b) => a.time.localeCompare(b.time));
}

export async function addManualCoachSession(coachUid: string, session: Omit<ManualSession, 'id'>): Promise<void> {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const data: Record<string, any> = { id, label: session.label, time: session.time, dayOfWeek: session.dayOfWeek };
  if (session.location) data.location = session.location;
  if (session.studentUid) data.studentUid = session.studentUid;
  await setDoc(doc(db, 'coachSessions', coachUid, 'items', id), data);
}

export async function deleteManualCoachSession(coachUid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'coachSessions', coachUid, 'items', id));
}

// ─── Coach: session library (coachLibrary/{coachUid}/sessions) ────────────────

export async function loadCoachLibrarySessions(coachUid: string): Promise<WorkoutSession[]> {
  const snap = await getDocs(collection(db, 'coachLibrary', coachUid, 'sessions'));
  return snap.docs.map((d) => d.data() as WorkoutSession);
}

export async function saveCoachLibrarySession(coachUid: string, session: WorkoutSession): Promise<void> {
  await setDoc(doc(db, 'coachLibrary', coachUid, 'sessions', session.id), session);
}

export async function deleteCoachLibrarySession(coachUid: string, sessionId: string): Promise<void> {
  await deleteDoc(doc(db, 'coachLibrary', coachUid, 'sessions', sessionId));
}

export function subscribeCoachLibrarySessions(coachUid: string, onChange: (sessions: WorkoutSession[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'coachLibrary', coachUid, 'sessions'), (snap) => {
    onChange(snap.docs.map((d) => d.data() as WorkoutSession));
  });
}

// ─── Coach: update note on a scheduled session ────────────────────────────────

export async function updateScheduledSessionNote(studentUid: string, scId: string, note: string): Promise<void> {
  const ref = doc(db, 'studentTraining', studentUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const schedule = (data.schedule ?? []).map((s: any) => {
    if (s.id !== scId) return s;
    if (!note.trim()) {
      const { coachNote, ...rest } = s;
      return rest;
    }
    return { ...s, coachNote: note.trim() };
  });
  await updateDoc(ref, { schedule });
}

// ─── Student: toggle scheduled session completion ─────────────────────────────

export async function toggleStudentScheduleItem(studentUid: string, scheduleId: string, completed: boolean): Promise<void> {
  const ref = doc(db, 'studentTraining', studentUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const schedule = (data.schedule ?? []).map((s: any) =>
    s.id === scheduleId ? { ...s, completed } : s
  );
  await updateDoc(ref, { schedule });
}

// ─── Student: cancel pending request ──────────────────────────────────────────

export async function cancelCoachRequest(studentUid: string): Promise<void> {
  const studentSnap = await getDoc(doc(db, 'users', studentUid));
  const data = studentSnap.data();
  const coachRequestId = data?.coachRequestId;
  const coachUid = data?.coachUid;
  await Promise.all([
    coachRequestId ? deleteDoc(doc(db, 'coachRequests', coachRequestId)) : Promise.resolve(),
    // Supprimer la notif chez le coach
    coachUid ? deleteDoc(doc(db, 'notifications', coachUid, 'items', `coach_request_${studentUid}`)).catch(() => {}) : Promise.resolve(),
    updateDoc(doc(db, 'users', studentUid), {
      coachUid: deleteField(),
      coachCode: deleteField(),
      coachStatus: deleteField(),
      coachRequestId: deleteField(),
    }),
  ]);
}

// ─── Student: stop coaching ────────────────────────────────────────────────────

export async function stopCoaching(studentUid: string, coachUid: string): Promise<void> {
  // Supprimer la demande de coaching — par ID direct si possible, sinon query
  const studentSnap = await getDoc(doc(db, 'users', studentUid));
  const coachRequestId = studentSnap.data()?.coachRequestId;
  const deleteReqOps = coachRequestId
    ? [deleteDoc(doc(db, 'coachRequests', coachRequestId))]
    : await getDocs(query(
        collection(db, 'coachRequests'),
        where('studentUid', '==', studentUid),
        where('coachUid', '==', coachUid),
      )).then((snap) => snap.docs.map((d) => deleteDoc(d.ref)));

  await Promise.all([
    ...deleteReqOps,
    // Supprimer le plan de training assigné par le coach
    deleteDoc(doc(db, 'studentTraining', studentUid)),
    // Supprimer l'élève de la liste du coach
    deleteDoc(doc(db, 'coachStudents', coachUid, 'students', studentUid)),
    // Repasser l'élève en compte standard
    updateDoc(doc(db, 'users', studentUid), {
      accountType: 'standard',
      coachUid: deleteField(),
      coachStatus: deleteField(),
      coachRequestId: deleteField(),
    }),
    // Nettoyer uniquement les demandes d'ami croisées — l'amitié reste intacte
    updateDoc(doc(db, 'users', coachUid), { friendRequests: arrayRemove(studentUid) }),
    updateDoc(doc(db, 'users', studentUid), { friendRequests: arrayRemove(coachUid) }),
    // Notifier le coach — ID déterministe pour éviter les doublons
    setDoc(doc(db, 'notifications', coachUid, 'items', `coaching_stopped_${studentUid}`), {
      type: 'coaching_stopped',
      fromUid: studentUid,
      message: `${studentSnap.data()?.prenom ?? studentSnap.data()?.pseudo ?? 'Un élève'} a arrêté le coaching.`,
      read: false,
      createdAt: Date.now(),
    }),
  ]);
}
