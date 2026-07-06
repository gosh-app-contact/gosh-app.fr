import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (uid: string) => `fluide_onboarding_done_${uid}`;

export async function setOnboardingDone(uid: string): Promise<void> {
  await AsyncStorage.setItem(key(uid), '1');
}

export async function isOnboardingDone(uid: string): Promise<boolean> {
  const val = await AsyncStorage.getItem(key(uid));
  return val === '1';
}
