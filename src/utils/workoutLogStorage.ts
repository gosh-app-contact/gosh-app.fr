import {
  collection, doc, addDoc, getDocs, query,
  orderBy, where, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { WorkoutLog, LoggedExercise } from '../types/workoutLog';

function logsRef(uid: string) {
  return collection(db, 'users', uid, 'workoutLogs');
}

export async function saveWorkoutLog(uid: string, log: Omit<WorkoutLog, 'id'>): Promise<string> {
  const ref = await addDoc(logsRef(uid), {
    ...log,
    completedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getWorkoutLogs(uid: string, limitCount = 100): Promise<WorkoutLog[]> {
  const snap = await getDocs(
    query(logsRef(uid), orderBy('completedAt', 'desc'))
  );
  return snap.docs.slice(0, limitCount).map((d) => {
    const data = d.data();
    return {
      ...data,
      id: d.id,
      completedAt: data.completedAt instanceof Timestamp
        ? data.completedAt.toMillis()
        : data.completedAt ?? 0,
    } as WorkoutLog;
  });
}

// Historique d'un exercice spécifique (toutes séances confondues)
export async function getExerciseHistory(
  uid: string,
  exerciseSlug: string,
): Promise<{ date: string; log: LoggedExercise; sessionName: string }[]> {
  const snap = await getDocs(
    query(logsRef(uid), orderBy('completedAt', 'asc'))
  );
  const results: { date: string; log: LoggedExercise; sessionName: string }[] = [];
  snap.docs.forEach((d) => {
    const data = d.data() as WorkoutLog;
    const found = (data.exercises ?? []).find((e) => e.exerciseSlug === exerciseSlug);
    if (found) {
      results.push({ date: data.date, log: found, sessionName: data.sessionName });
    }
  });
  return results;
}

// Volume total d'une séance (séries × reps × kg) pour le mode sets
export function computeVolume(exercises: LoggedExercise[]): number {
  return exercises.reduce((total, ex) => {
    if (ex.mode === '1rm') return total;
    return total + ex.sets.filter((s) => s.done).reduce((v, s) => v + s.reps * s.kg, 0);
  }, 0);
}

// Charge max d'un exercice sur une entrée historique
export function computeMaxKg(log: LoggedExercise): number {
  if (log.mode === '1rm') return log.oneRmKg ?? 0;
  const done = log.sets.filter((s) => s.done);
  if (done.length === 0) return 0;
  return Math.max(...done.map((s) => s.kg));
}
