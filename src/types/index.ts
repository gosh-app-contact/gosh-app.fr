export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
export type Phase =
  | 'pre-preparation'
  | 'deficit-down'
  | 'deficit-up'
  | 'reverse-diet'
  | 'bulk';
export type Sex = 'male' | 'female';

export interface Profile {
  id: string;
  name: string;
  photo?: string; // URI locale
  age: number;
  birthdate?: string; // format ISO YYYY-MM-DD
  sex: Sex;
  height: number; // cm
  weight: number; // kg (synced with weightHistory)
  activityLevel: ActivityLevel;
  phase: Phase;
  stepGoal: number;
  calorieGoal: number;
  calorieGoalManual: boolean;
  notificationsEnabled: {
    weigh: boolean;
    steps: boolean;
    stagnation: boolean;
  };
  weightHistory: WeightEntry[];
  calorieHistory: CalorieAdjustment[];
  pendingAdjustment: {
    suggestedCalories: number;
    detectedAt: string;
  } | null;
  lastAdjustmentDate: string | null;
  knownMaintenance?: number; // kcal — maintenance réelle connue, overrides TDEE estimé
  phaseChangedAt?: string;       // ISO date du dernier changement de phase
  phaseAlertSentAt?: string;     // ISO date de l'envoi de la notif J+5
  phaseAlert2SentAt?: string;    // ISO date de l'envoi de la notif J+10
  bulkStartedAt?: string;        // ISO date du début du bulk (pour J+30/J+60)
  pendingPhaseChange?: {
    suggestedPhases: Phase[];
    messageType: 'maintenance-reached' | 'deficit-relapse' | 'deficit-up-rising' | 'reverse-maintenance' | 'bulk-too-fast';
    detectedAt: string;
  } | null;
}

export interface WeightEntry {
  date: string; // ISO date YYYY-MM-DD
  weight: number; // kg
}

export interface CalorieAdjustment {
  date: string;
  oldCalories: number;
  newCalories: number;
  reason: string;
}

export interface AppState {
  profiles: Profile[];
  activeProfileId: string;
  onboardingComplete?: boolean;
}
