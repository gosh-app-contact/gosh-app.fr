import { loadState } from './storage';
import { loadTrainingState } from './trainingStorage';
import { loadRepasState } from './repasStorage';
import { computeNutrition } from '../types/repas';
import { getMyAccountType, loadStudentTrainingPlan } from './coachStorage';
import { auth } from './firebase';

// Cache module-level préchargé pendant l'intro
export type PreloadedData = {
  state: any;
  trainingState: any;
  caloriesConsumed: number;
  activeProfile: any;
};

let cache: PreloadedData | null = null;
let loading = false;

export async function preloadHomeData(): Promise<void> {
  if (cache || loading) return;
  loading = true;
  try {
    const s = await loadState();
    if (!s) { loading = false; return; }
    const profileId = s.activeProfileId;
    const accountType = await getMyAccountType();
    const uid = auth.currentUser?.uid;
    const [t, rs] = await Promise.all([
      accountType === 'student' && uid ? loadStudentTrainingPlan(uid) : loadTrainingState(profileId),
      loadRepasState(profileId),
    ]);
    const today = new Date().toISOString().split('T')[0];
    const consumed = rs.entries
      .filter((e: any) => e.date === today)
      .reduce((sum: number, e: any) => sum + computeNutrition(e.product, e.quantity).kcal, 0);
    const activeProfile = s.profiles.find((p: any) => p.id === profileId) ?? null;
    cache = { state: s, trainingState: t, caloriesConsumed: Math.round(consumed), activeProfile };
  } catch {}
  loading = false;
}

export function getPreloadedData(): PreloadedData | null {
  return cache;
}

export function clearPreloadedData() {
  cache = null;
}
