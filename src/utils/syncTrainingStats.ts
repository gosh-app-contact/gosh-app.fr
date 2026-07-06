import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getCurrentUid } from './currentUser';
import { TrainingState } from '../types/training';

function getMondayOfCurrentWeek(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

function getPreviousMonday(isoMonday: string): string {
  const d = new Date(isoMonday);
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

export async function syncTrainingStats(
  state: TrainingState,
  prevStats?: Record<string, any>,
  _sessionJustCompleted = false,
): Promise<void> {
  const uid = getCurrentUid();
  if (!uid) return;

  const weeklyDone = state.schedule.filter((s) => s.completed).length;
  const weeklyPlanned = state.schedule.length;
  const currentMonday = getMondayOfCurrentWeek();
  const previousMonday = getPreviousMonday(currentMonday);

  const lastCompletedWeek: string | null = prevStats?.lastCompletedWeek ?? null;

  // Semaine complète = toutes les séances prévues sont validées
  const weekComplete = weeklyPlanned > 0 && weeklyDone >= weeklyPlanned;

  // La semaine courante a déjà été comptée ?
  const alreadyCountedThisWeek = lastCompletedWeek === currentMonday;

  let streak: number = prevStats?.streak ?? 0;

  if (weekComplete && !alreadyCountedThisWeek) {
    // Semaine complète, pas encore comptée → incrémenter
    if (!lastCompletedWeek) {
      streak = 1;
    } else if (lastCompletedWeek === previousMonday) {
      // Semaine précédente complétée → continuité de streak
      streak = streak + 1;
    } else {
      // Trou dans la série
      streak = 1;
    }

    await setDoc(
      doc(db, 'users', uid),
      { trainingStats: { weeklyDone, weeklyPlanned, streak, lastCompletedWeek: currentMonday } },
      { merge: true },
    );
    return;
  }

  // Semaine incomplète ou déjà comptée
  // Ne jamais écraser le streak si on est en début de nouvelle semaine (plan pas encore configuré)
  if (weeklyPlanned === 0) {
    // Début de semaine : juste mettre à jour les compteurs, ne pas toucher au streak
    // Vérifier si le streak doit rester ou reset (semaine précédente ratée ?)
    let newStreak = streak;
    let newLastCompleted = lastCompletedWeek;

    if (lastCompletedWeek && lastCompletedWeek !== currentMonday && lastCompletedWeek !== previousMonday) {
      // La dernière semaine complétée n'est ni cette semaine ni la semaine précédente → trou → reset
      newStreak = 0;
      newLastCompleted = null;
    }

    await setDoc(
      doc(db, 'users', uid),
      { trainingStats: { weeklyDone: 0, weeklyPlanned: 0, streak: newStreak, lastCompletedWeek: newLastCompleted } },
      { merge: true },
    );
    return;
  }

  // Plan configuré mais semaine incomplète : écrire sans toucher au streak
  // (le streak ne se perd pas en cours de semaine)
  await setDoc(
    doc(db, 'users', uid),
    { trainingStats: { weeklyDone, weeklyPlanned, streak, lastCompletedWeek } },
    { merge: true },
  );
}
