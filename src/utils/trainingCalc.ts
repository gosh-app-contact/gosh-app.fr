import { TrainingState, MuscleGroup, MuscleCategory, SETS_TARGET, MuscleConfig } from '../types/training';

export interface MuscleVolume {
  muscle: MuscleGroup;
  category: MuscleCategory;
  totalSets: number;
  completedSets: number;
  target: { min: number; max: number };
  overTarget: boolean;
}

export function computeWeeklyVolume(state: TrainingState): MuscleVolume[] {
  const categoryMap = new Map<MuscleGroup, MuscleCategory>();
  for (const mc of state.muscleConfigs) {
    categoryMap.set(mc.muscle, mc.category);
  }

  const totalSetsMap = new Map<MuscleGroup, number>();
  const completedSetsMap = new Map<MuscleGroup, number>();

  for (const scheduled of state.schedule) {
    const session = state.sessions.find((s) => s.id === scheduled.sessionId);
    if (!session) continue;
    for (const ex of session.exercises) {
      totalSetsMap.set(ex.muscle, (totalSetsMap.get(ex.muscle) ?? 0) + ex.sets);
      if (scheduled.completed) {
        completedSetsMap.set(ex.muscle, (completedSetsMap.get(ex.muscle) ?? 0) + ex.sets);
      }
    }
  }

  return state.muscleConfigs.map((mc) => {
    const target = SETS_TARGET[mc.category];
    const totalSets = totalSetsMap.get(mc.muscle) ?? 0;
    const completedSets = completedSetsMap.get(mc.muscle) ?? 0;
    return {
      muscle: mc.muscle,
      category: mc.category,
      totalSets,
      completedSets,
      target,
      overTarget: totalSets > target.max,
    };
  });
}

export function getMusclesOverTarget(state: TrainingState): MuscleVolume[] {
  return computeWeeklyVolume(state).filter((v) => v.overTarget);
}
