import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Profile, WeightEntry, CalorieAdjustment } from '../types';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Firestore rejette les valeurs `undefined` — on les supprime récursivement avant tout setDoc
function stripUndefined(obj: any): any {
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    );
  }
  return obj;
}

let _uid: string | null = null;

export function setStorageUid(uid: string | null) {
  _uid = uid;
}

function getKey() {
  if (!_uid) throw new Error('Storage UID not set');
  return `fluide_app_state_${_uid}`;
}

function firestoreRef() {
  if (!_uid) throw new Error('Storage UID not set');
  return doc(db, 'users', _uid, 'appState', 'main');
}

export const emptyProfileData = () => ({
  weightHistory: [] as WeightEntry[],
  calorieHistory: [] as CalorieAdjustment[],
  pendingAdjustment: null,
  lastAdjustmentDate: null,
});

const defaultProfile: Profile = {
  id: '1',
  name: 'Thomas',
  age: 25,
  sex: 'male',
  height: 175,
  weight: 75,
  activityLevel: 'moderate',
  phase: 'deficit-down',
  stepGoal: 10000,
  calorieGoal: 2000,
  calorieGoalManual: false,
  notificationsEnabled: { weigh: true, steps: true, stagnation: true },
  ...emptyProfileData(),
};

const defaultState: AppState = {
  profiles: [defaultProfile],
  activeProfileId: '1',
};

// Migration: si l'ancien format a weightHistory au niveau AppState, on la migre dans le profil actif
function migrate(raw: any): AppState {
  const hasProfiles = Array.isArray(raw.profiles) && raw.profiles.length > 0;
  const state: AppState = { profiles: raw.profiles ?? defaultState.profiles, activeProfileId: raw.activeProfileId ?? '1', onboardingComplete: raw.onboardingComplete ?? hasProfiles };

  // S'assurer que chaque profil a ses champs de données
  state.profiles = state.profiles.map((p: any) => ({
    ...emptyProfileData(),
    ...p,
  }));

  // Migration des données globales vers le profil actif
  if (raw.weightHistory || raw.calorieHistory) {
    state.profiles = state.profiles.map((p) => {
      if (p.id !== state.activeProfileId) return p;
      return {
        ...p,
        weightHistory: (p.weightHistory?.length ? p.weightHistory : raw.weightHistory) ?? [],
        calorieHistory: (p.calorieHistory?.length ? p.calorieHistory : raw.calorieHistory) ?? [],
        pendingAdjustment: p.pendingAdjustment ?? raw.pendingAdjustment ?? null,
        lastAdjustmentDate: p.lastAdjustmentDate ?? raw.lastAdjustmentDate ?? null,
      };
    });
  }

  return state;
}

export async function loadState(): Promise<AppState | null> {
  try {
    // 1. AsyncStorage d'abord (rapide)
    const raw = await AsyncStorage.getItem(getKey());
    if (raw) {
      const state = migrate(JSON.parse(raw));
      // Sync vers Firestore à chaque load — garantit la survie après désinstallation
      // même si un write précédent a échoué hors ligne
      setDoc(firestoreRef(), stripUndefined(state)).catch(() => {});
      return state;
    }

    // 2. Fallback Firestore si AsyncStorage vide (ex : après réinstallation)
    const snap = await getDoc(firestoreRef());
    if (snap.exists()) {
      const state = migrate(snap.data());
      AsyncStorage.setItem(getKey(), JSON.stringify(state)).catch(() => {});
      return state;
    }

    return null;
  } catch {
    return null;
  }
}

export function createInitialState(pseudo: string, age: number, sex: 'male' | 'female', height: number, weight: number, activityLevel: import('../types').ActivityLevel, phase: import('../types').Phase): AppState {
  const profile: Profile = {
    id: '1',
    name: pseudo,
    age,
    sex,
    height,
    weight,
    activityLevel,
    phase,
    stepGoal: 10000,
    calorieGoal: 2000,
    calorieGoalManual: false,
    notificationsEnabled: { weigh: true, steps: true, stagnation: true },
    ...emptyProfileData(),
  };
  return { profiles: [profile], activeProfileId: '1', onboardingComplete: true };
}

export async function saveState(state: AppState): Promise<void> {
  await AsyncStorage.setItem(getKey(), JSON.stringify(state));
  setDoc(firestoreRef(), stripUndefined(state)).catch(() => {});
}

export async function updateProfile(state: AppState, profile: Profile): Promise<AppState> {
  const next = { ...state, profiles: state.profiles.map((p) => (p.id === profile.id ? profile : p)) };
  await saveState(next);
  return next;
}

export function getActiveProfile(state: AppState): Profile {
  return state.profiles.find((p) => p.id === state.activeProfileId)!;
}

export async function addWeightEntry(state: AppState, entry: WeightEntry): Promise<AppState> {
  const profile = getActiveProfile(state);
  const filtered = (profile.weightHistory ?? []).filter((w) => w.date !== entry.date);
  const updatedProfile = {
    ...profile,
    weightHistory: [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date)),
  };
  return updateProfile(state, updatedProfile);
}
