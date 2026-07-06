import { Pedometer } from 'expo-sensors';

export async function initHealthKit(): Promise<boolean> {
  const { granted } = await Pedometer.requestPermissionsAsync();
  return granted;
}

export async function getTodaySteps(): Promise<number> {
  const { status } = await Pedometer.getPermissionsAsync();
  if (status !== 'granted') return 0;
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  try {
    const result = await Pedometer.getStepCountAsync(start, now);
    return result.steps;
  } catch {
    return 0;
  }
}

export function watchSteps(onUpdate: (steps: number) => void): () => void {
  let base = 0;
  let sub: { remove: () => void } | null = null;

  getTodaySteps().then((initial) => {
    base = initial;
    onUpdate(initial);
    sub = Pedometer.watchStepCount((result) => {
      onUpdate(base + result.steps);
    });
  });

  return () => sub?.remove();
}

export async function getTodayWeight(): Promise<number | null> {
  return null;
}

export async function getWeightHistory(): Promise<{ date: string; weight: number }[]> {
  return [];
}
