import { AppState, Phase, Profile } from '../types';
import { getPhaseAdjustment } from './calculations';

const STAGNATION_THRESHOLD = 0.3; // kg — variation max considérée comme stagnation
const MOVEMENT_THRESHOLD = 0.3;   // kg — variation min pour confirmer une vraie hausse/baisse
const BULK_FAST_THRESHOLD = 0.5;  // kg/4 semaines — prise trop rapide en bulk
const COOLDOWN_DAYS = 5;          // jours entre deux ajustements
const SILENCE_DAYS = 10;          // jours après lesquels on ne relance plus

export function detectWeightStatus(profile: Profile): {
  stagnating: boolean;
  weightDropping: boolean;
  weightRising: boolean;
  avgWeight: number;
} {
  const history = profile.weightHistory ?? [];
  if (history.length < 5) return { stagnating: false, weightDropping: false, weightRising: false, avgWeight: 0 };

  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const recent = sorted.slice(0, 5);

  const avg = recent.reduce((s, e) => s + e.weight, 0) / recent.length;
  const oldest = recent[recent.length - 1].weight;
  const newest = recent[0].weight;
  const variation = Math.abs(newest - oldest);

  const stagnating = variation < STAGNATION_THRESHOLD;
  const weightDropping = newest < oldest - MOVEMENT_THRESHOLD;
  const weightRising = newest > oldest + MOVEMENT_THRESHOLD;

  return { stagnating, weightDropping, weightRising, avgWeight: avg };
}

export function isBulkTooFast(profile: Profile): boolean {
  const history = profile.weightHistory ?? [];
  if (history.length < 2) return false;
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const newest = sorted[0];
  const cutoff = new Date(newest.date);
  cutoff.setDate(cutoff.getDate() - 28);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const monthAgo = sorted.find((e) => e.date <= cutoffStr);
  if (!monthAgo) return false;
  return newest.weight - monthAgo.weight > BULK_FAST_THRESHOLD;
}

export function canTriggerAdjustment(profile: Profile): boolean {
  if (!profile.lastAdjustmentDate) return true;
  const last = new Date(profile.lastAdjustmentDate);
  const now = new Date();
  const diff = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= COOLDOWN_DAYS;
}

export function isPastSilenceWindow(profile: Profile): boolean {
  if (!profile.phaseAlert2SentAt) return false;
  const sent = new Date(profile.phaseAlert2SentAt);
  const now = new Date();
  const diff = (now.getTime() - sent.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0; // J+10 passé → silence
}

export function isInAlertWindow(profile: Profile): boolean {
  // Toujours dans la fenêtre J+0 → J+10 depuis le changement de phase
  if (profile.phaseAlert2SentAt) return false; // J+10 déjà envoyé → silence
  return true;
}

// Retourne l'ajustement calorique OU la suggestion de changement de phase
export type PhaseAction =
  | { kind: 'calorie'; delta: number }
  | { kind: 'phase-change'; suggestedPhases: Phase[]; messageType: 'maintenance-reached' | 'deficit-relapse' | 'deficit-up-rising' | 'reverse-maintenance' | 'bulk-too-fast' }
  | null;

export function computePhaseAction(state: AppState): PhaseAction {
  const profile = state.profiles.find((p) => p.id === state.activeProfileId);
  if (!profile) return null;
  if (isPastSilenceWindow(profile)) return null;
  if (profile.pendingPhaseChange) return null; // box déjà affichée

  const { stagnating, weightDropping, weightRising } = detectWeightStatus(profile);
  const phase = profile.phase;

  switch (phase) {
    case 'pre-preparation':
      if (weightRising) return { kind: 'phase-change', suggestedPhases: ['deficit-down', 'bulk'], messageType: 'maintenance-reached' };
      if (stagnating && canTriggerAdjustment(profile)) return { kind: 'calorie', delta: 200 };
      return null;

    case 'deficit-down':
      if (stagnating) {
        // Récidive : ajustement déjà fait récemment
        const isRelapse = profile.lastAdjustmentDate
          ? (new Date().getTime() - new Date(profile.lastAdjustmentDate).getTime()) / (1000 * 60 * 60 * 24) < 10
          : false;
        if (isRelapse) return { kind: 'phase-change', suggestedPhases: ['deficit-up'], messageType: 'deficit-relapse' };
        if (canTriggerAdjustment(profile)) return { kind: 'calorie', delta: -200 };
      }
      return null;

    case 'deficit-up':
      // Si maintenance connue et atteinte : remontée terminée, suggérer bulk
      if (profile.knownMaintenance && profile.calorieGoal >= profile.knownMaintenance) {
        return { kind: 'phase-change', suggestedPhases: ['bulk'], messageType: 'reverse-maintenance' };
      }
      // Fallback : poids qui remonte = retour en déficit ↓
      if (weightRising) return { kind: 'phase-change', suggestedPhases: ['deficit-down'], messageType: 'deficit-up-rising' };
      if (stagnating && canTriggerAdjustment(profile)) return { kind: 'calorie', delta: 200 };
      return null;

    case 'reverse-diet':
      // Si maintenance connue : signal de sortie basé sur les calories (plus précis que le poids)
      if (profile.knownMaintenance && profile.calorieGoal >= profile.knownMaintenance) {
        return { kind: 'phase-change', suggestedPhases: ['bulk'], messageType: 'reverse-maintenance' };
      }
      // Fallback : détection par le poids si maintenance inconnue
      if (!profile.knownMaintenance && weightRising) return { kind: 'phase-change', suggestedPhases: ['bulk'], messageType: 'reverse-maintenance' };
      if (weightDropping && canTriggerAdjustment(profile)) return { kind: 'calorie', delta: 200 };
      return null;

    case 'bulk':
      if (isBulkTooFast(profile)) return { kind: 'phase-change', suggestedPhases: ['deficit-down'], messageType: 'bulk-too-fast' };
      if (weightDropping && canTriggerAdjustment(profile)) return { kind: 'calorie', delta: 200 };
      return null;

    default:
      return null;
  }
}

// Gardé pour compatibilité avec l'ancien code
export function detectStagnation(profile: Profile) {
  const { stagnating, weightDropping, avgWeight } = detectWeightStatus(profile);
  return { stagnating, weightDropping, avgWeight };
}

export function computeSuggestedAdjustment(state: AppState): number | null {
  const action = computePhaseAction(state);
  if (action?.kind === 'calorie') return action.delta;
  return null;
}
