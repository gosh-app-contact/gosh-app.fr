import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrainingState, MuscleConfig, ALL_MUSCLES } from '../types/training';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let _uid: string | null = null;
export function setTrainingStorageUid(uid: string | null) { _uid = uid; }

function key(profileId: string) {
  if (!_uid) throw new Error('Training storage UID not set');
  return `fluide_training_state_${_uid}_${profileId}`;
}

function firestoreRef(profileId: string) {
  if (!_uid) throw new Error('Training storage UID not set');
  return doc(db, 'users', _uid, 'training', profileId);
}

function getMondayOfCurrentWeek(): string {
  const today = new Date();
  const day = today.getDay(); // jour local
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  // Utiliser les composantes locales — toISOString() retourne UTC et cause des décalages en UTC+2
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const defaultMuscleConfigs: MuscleConfig[] = ALL_MUSCLES.map((m) => ({
  muscle: m,
  category: 'secondaire',
}));

export function defaultTrainingState(): TrainingState {
  return {
    muscleConfigs: defaultMuscleConfigs.map((c) => ({ ...c })),
    sessions: [],
    schedule: [],
    restDays: [],
    weekStartDate: getMondayOfCurrentWeek(),
  };
}

function applyWeekReset(saved: TrainingState): TrainingState {
  const currentMonday = getMondayOfCurrentWeek();
  if (saved.weekStartDate !== currentMonday) {
    return { ...saved, schedule: [], restDays: [], weekStartDate: currentMonday };
  }
  return { ...defaultTrainingState(), ...saved };
}

export async function loadTrainingState(profileId: string): Promise<TrainingState> {
  try {
    // 1. Migration: ancienne clé globale (une seule fois)
    const legacyRaw = await AsyncStorage.getItem('fluide_training_state');
    if (legacyRaw) {
      const saved: TrainingState = JSON.parse(legacyRaw);
      const state = applyWeekReset(saved);
      await AsyncStorage.setItem(key(profileId), JSON.stringify(state));
      await AsyncStorage.removeItem('fluide_training_state').catch(() => {});
      return state;
    }

    // 2. Lire AsyncStorage et Firestore en parallèle pour choisir la source la plus récente
    const [localRaw, snap] = await Promise.all([
      AsyncStorage.getItem(key(profileId)),
      getDoc(firestoreRef(profileId)).catch(() => null),
    ]);

    const localData: TrainingState | null = localRaw ? JSON.parse(localRaw) : null;
    const remoteData: TrainingState | null = snap?.exists() ? (snap.data() as TrainingState) : null;

    let best: TrainingState | null = null;
    if (localData && remoteData) {
      // Prendre la version la plus récente pour éviter les collisions multi-device
      best = (remoteData.lastModified ?? 0) > (localData.lastModified ?? 0) ? remoteData : localData;
    } else {
      best = localData ?? remoteData;
    }

    if (best) {
      const state = applyWeekReset(best);
      // Toujours resynchroniser les deux sources avec la version gagnante
      AsyncStorage.setItem(key(profileId), JSON.stringify(state)).catch(() => {});
      // Sync Firestore à chaque load — garantit la survie après désinstallation
      setDoc(firestoreRef(profileId), state).catch(() => {});
      return state;
    }

    return defaultTrainingState();
  } catch {
    return defaultTrainingState();
  }
}

export async function saveTrainingState(state: TrainingState, profileId: string, critical = false): Promise<void> {
  const stamped: TrainingState = { ...state, lastModified: Date.now() };
  // Écriture locale immédiate
  await AsyncStorage.setItem(key(profileId), JSON.stringify(stamped));
  // Sync Firestore — attendu si critique (validation séance), sinon background
  if (critical) {
    await setDoc(firestoreRef(profileId), stamped).catch(() => {});
  } else {
    setDoc(firestoreRef(profileId), stamped).catch(() => {});
  }
}
