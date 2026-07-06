import { ActivityLevel, Phase, Profile } from '../types';

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
};

export function calculateBMR(profile: Profile): number {
  const { weight, height, age, sex } = profile;
  if (sex === 'male') {
    return 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age;
  }
  return 447.593 + 9.247 * weight + 3.098 * height - 4.330 * age;
}

export function calculateTDEE(profile: Profile): number {
  return Math.round(calculateBMR(profile) * ACTIVITY_FACTORS[profile.activityLevel]);
}

export function getEffectiveMaintenance(profile: Profile): number {
  return profile.knownMaintenance ?? calculateTDEE(profile);
}

export function calculateCalorieGoal(profile: Profile): number {
  if (profile.calorieGoalManual) return profile.calorieGoal;
  return getEffectiveMaintenance(profile);
}

export interface Macros {
  proteins: number; // g
  fats: number; // g
  carbs: number; // g
  fibers: number; // g
  proteinKcal: number;
  fatKcal: number;
  carbKcal: number;
}

export function calculateMacros(weight: number, calorieGoal: number): Macros {
  const proteins = Math.round(2.2 * weight);
  const fats = Math.round(1.0 * weight);
  const proteinKcal = proteins * 4;
  const fatKcal = fats * 9;
  const remaining = calorieGoal - proteinKcal - fatKcal;
  const carbs = Math.max(0, Math.round(remaining / 4));
  const carbKcal = carbs * 4;
  const fibers = Math.round((calorieGoal / 1000) * 15);
  return { proteins, fats, carbs, fibers, proteinKcal, fatKcal, carbKcal };
}

export function getPhaseAdjustment(phase: Phase, isStagnating: boolean, isWeightDropping: boolean): number | null {
  switch (phase) {
    case 'pre-preparation':
      return isStagnating ? 200 : null;
    case 'deficit-down':
      return isStagnating ? -200 : null;
    case 'deficit-up':
      return isStagnating ? 200 : null;
    case 'reverse-diet':
      if (isWeightDropping) return 200;
      return null; // stagnation → do nothing
    case 'bulk':
      if (isWeightDropping) return 200;
      return null; // stagnation → maintain
    default:
      return null;
  }
}

export const PHASE_LABELS: Record<Phase, string> = {
  'pre-preparation': 'Préparation',
  'deficit-down': 'Déficit ↓',
  'deficit-up': 'Déficit ↑',
  'reverse-diet': 'Reverse diet',
  bulk: 'Bulk',
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sédentaire',
  light: 'Légère',
  moderate: 'Modérée',
  active: 'Élevée',
  athlete: 'Athlète',
};

// Objectif de pas recommandé par niveau d'activité
export const STEP_GOAL_BY_ACTIVITY: Record<ActivityLevel, number> = {
  sedentary: 2000,
  light: 5500,
  moderate: 10000,
  active: 15000,
  athlete: 20000,
};
