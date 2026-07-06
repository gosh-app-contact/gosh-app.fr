export type SetMode = 'sets' | '1rm';

export type LoggedSet = {
  reps: number;
  kg: number;
  done: boolean;
};

export type LoggedExercise = {
  exerciseSlug: string;
  exerciseName: string;
  mode: SetMode;
  // mode 'sets' → sets rempli
  sets: LoggedSet[];
  // mode '1rm' → un seul kg, reps = 1 implicite
  oneRmKg?: number;
};

export type WorkoutLog = {
  id: string;
  sessionId: string;       // référence à WorkoutSession.id
  sessionName: string;
  scheduledId: string;     // référence à ScheduledSession.id
  date: string;            // YYYY-MM-DD heure Paris
  completedAt: number;     // timestamp ms
  duration: number;        // durée en ms (startTime → completedAt)
  exercises: LoggedExercise[];
};
