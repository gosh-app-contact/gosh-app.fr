import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { MealEntry, RepasState } from '../types/repas';
import { db } from './firebase';

let _uid: string | null = null;
export function setRepasStorageUid(uid: string | null) { _uid = uid; }

function key(profileId: string) {
  if (!_uid) throw new Error('Repas storage UID not set');
  return `fluide_repas_${_uid}_${profileId}`;
}

function firestoreRef(profileId: string) {
  if (!_uid) throw new Error('Repas storage UID not set');
  return doc(db, 'users', _uid, 'repas', profileId);
}

const defaultState: RepasState = { entries: [], customProducts: [] };

export async function loadRepasState(profileId: string): Promise<RepasState> {
  try {
    // 1. AsyncStorage d'abord (rapide)
    const raw = await AsyncStorage.getItem(key(profileId));
    if (raw) {
      const state = { ...defaultState, ...JSON.parse(raw) } as RepasState;
      // Sync vers Firestore à chaque load — garantit la survie après désinstallation
      setDoc(firestoreRef(profileId), JSON.parse(JSON.stringify(state))).catch(() => {});
      return state;
    }

    // 2. Fallback Firestore si AsyncStorage vide (ex : après réinstallation)
    const snap = await getDoc(firestoreRef(profileId));
    if (snap.exists()) {
      const state = { ...defaultState, ...snap.data() } as RepasState;
      AsyncStorage.setItem(key(profileId), JSON.stringify(state)).catch(() => {});
      return state;
    }

    return defaultState;
  } catch {
    return defaultState;
  }
}

export async function saveRepasState(state: RepasState, profileId: string): Promise<void> {
  await AsyncStorage.setItem(key(profileId), JSON.stringify(state));
const clean = JSON.parse(JSON.stringify(state));
setDoc(firestoreRef(profileId), clean).catch(() => {});

}

export async function addMealEntry(state: RepasState, entry: MealEntry, profileId: string): Promise<RepasState> {
  const next = { ...state, entries: [...state.entries, entry] };
  await saveRepasState(next, profileId);
  return next;
}

export async function removeMealEntry(state: RepasState, entryId: string, profileId: string): Promise<RepasState> {
  const next = { ...state, entries: state.entries.filter((e) => e.id !== entryId) };
  await saveRepasState(next, profileId);
  return next;
}
