export type MuscleGroup =
  | 'pecs'
  | 'dos'
  | 'epaules'
  | 'biceps'
  | 'triceps'
  | 'avant-bras'
  | 'quadriceps'
  | 'ischios'
  | 'fessiers'
  | 'mollets'
  | 'abdos'
  | 'lombaires'
  | 'trapezes';

export type MuscleCategory = 'prioritaire' | 'secondaire' | 'maintien';

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  pecs: 'Pecs',
  dos: 'Dos',
  epaules: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  'avant-bras': 'Avant-bras',
  quadriceps: 'Quadriceps',
  ischios: 'Ischios',
  fessiers: 'Fessiers',
  mollets: 'Mollets',
  abdos: 'Abdos',
  lombaires: 'Lombaires',
  trapezes: 'Trapèzes',
};

export const ALL_MUSCLES: MuscleGroup[] = [
  'pecs', 'dos', 'epaules', 'biceps', 'triceps', 'avant-bras',
  'quadriceps', 'ischios', 'fessiers', 'mollets', 'abdos', 'lombaires', 'trapezes',
];

export const CATEGORY_COLORS: Record<MuscleCategory, string> = {
  prioritaire: '#EF4444',
  secondaire: '#F59E0B',
  maintien: '#4CAF50',
};

export const CATEGORY_LABELS: Record<MuscleCategory, string> = {
  prioritaire: 'Prioritaire',
  secondaire: 'Secondaire',
  maintien: 'Maintien',
};

export const SETS_TARGET: Record<MuscleCategory, { min: number; max: number }> = {
  prioritaire: { min: 12, max: 20 },
  secondaire: { min: 6, max: 12 },
  maintien: { min: 3, max: 5 },
};

export const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export interface Exercise {
  id: string;
  slug: string;   // slug canonique de la bibliothèque
  name: string;
  muscle: MuscleGroup;
  sets: number;  // 1-10
  reps: number;  // 6-15
}

export interface WorkoutSession {
  id: string;
  name: string;
  exercises: Exercise[];
}

// dayOfWeek: 0=Lundi … 6=Dimanche
export interface ScheduledSession {
  id: string;
  sessionId: string;
  dayOfWeek: number;
  time: string; // "HH:MM"
  completed: boolean;
  calendarEventId?: string;
  coachNote?: string; // note du coach visible par l'élève
}

export interface MuscleConfig {
  muscle: MuscleGroup;
  category: MuscleCategory;
}

export interface TrainingState {
  muscleConfigs: MuscleConfig[];
  sessions: WorkoutSession[];
  schedule: ScheduledSession[];
  restDays: number[]; // dayOfWeek[] marqués comme repos (0=Lundi … 6=Dimanche)
  weekStartDate: string; // ISO date du lundi courant YYYY-MM-DD
  sentAt?: number; // timestamp d'envoi du planning par le coach
  lastModified?: number; // timestamp (ms) de la dernière sauvegarde — départage multi-device
}
