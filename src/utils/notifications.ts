import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function saveFcmToken(uid: string): Promise<void> {
  if (!Device.isDevice) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  try {
    const { data: fcmToken } = await Notifications.getDevicePushTokenAsync();
    await updateDoc(doc(db, 'users', uid), { fcmToken });
  } catch (e) {
    console.warn('[saveFcmToken] failed:', e);
  }
}

export async function scheduleWeighReminder(enabled: boolean): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('weigh-reminder').catch(() => {});
  if (!enabled) return;
  await Notifications.scheduleNotificationAsync({
    identifier: 'weigh-reminder',
    content: {
      title: '⚖️ Pesée du matin',
      body: "N'oublie pas de te peser à jeun !",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 8,
      minute: 0,
    },
  });
}

export async function sendStepsAchievedNotification(steps: number): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🎯 Objectif steps atteint !',
      body: `${steps.toLocaleString()} pas aujourd'hui. Bravo !`,
    },
    trigger: null,
  });
}

export async function sendStagnationNotification(suggestedCalories: number, delta: number): Promise<void> {
  const sign = delta > 0 ? '+' : '';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Stagnation détectée',
      body: `Ton poids stagne depuis 5 jours. Objectif suggéré : ${suggestedCalories} kcal (${sign}${delta}). Ouvre l'app pour confirmer.`,
      categoryIdentifier: 'stagnation',
    },
    trigger: null,
  });
}

export async function scheduleWeeklyPlanningReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('weekly-planning').catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: 'weekly-planning',
    content: {
      title: '📅 Planifie ta semaine !',
      body: "N'oublie pas de programmer tes trainings pour la semaine. Lâche pas le rythme 💪",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1, // Dimanche (1=Dimanche dans l'API Expo)
      hour: 19,
      minute: 0,
    },
  });
}

export async function scheduleStreakDangerReminder(streak: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('streak-danger').catch(() => {});
  if (streak === 0) return;
  await Notifications.scheduleNotificationAsync({
    identifier: 'streak-danger',
    content: {
      title: 'Ta streak est en danger',
      body: `${streak} jour${streak > 1 ? 's' : ''} de streak — ouvre Gosh avant minuit pour ne pas tout perdre.`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 20,
      minute: 0,
    },
  });
}

export async function cancelStreakDangerReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('streak-danger').catch(() => {});
}

export async function sendPhaseAlert1(messageType: string): Promise<void> {
  const messages: Record<string, { title: string; body: string }> = {
    'maintenance-reached': { title: '📈 Ton poids remonte', body: 'Tu as trouvé ta maintenance. Déficit ou bulk ?' },
    'deficit-relapse':     { title: '📉 Ton poids ne bouge plus', body: 'Il est peut-être temps de remonter les calories.' },
    'deficit-up-rising':   { title: '📈 Ton poids remonte', body: "C'est le signe de relancer un vrai déficit." },
    'reverse-maintenance': { title: '🔄 Maintenance retrouvée', body: 'Prêt pour la prise de masse ?' },
    'bulk-too-fast':       { title: '⚠️ Tu prends du poids trop vite', body: 'Attention à ta composition corporelle.' },
  };
  const msg = messages[messageType];
  if (!msg) return;
  await Notifications.cancelScheduledNotificationAsync('phase-alert-1').catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: 'phase-alert-1',
    content: { title: msg.title, body: msg.body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 * 24 * 3600, repeats: false },
  });
}

export async function sendPhaseAlert2(messageType: string): Promise<void> {
  const messages: Record<string, { title: string; body: string }> = {
    'maintenance-reached': { title: '⏳ Tu es au-dessus de ta maintenance', body: 'Passe en déficit ou bulk pour avancer.' },
    'deficit-relapse':     { title: '⏳ Toujours en stagnation', body: 'Passe en Déficit ↑ ?' },
    'deficit-up-rising':   { title: '⏳ Ton poids remonte depuis 10 jours', body: 'Retour en Déficit ↓ ?' },
    'reverse-maintenance': { title: '⏳ Tu es en maintenance depuis 10 jours', body: 'Passe en Bulk ?' },
    'bulk-too-fast':       { title: '⏳ Tu prends toujours du poids trop vite', body: 'Pense à passer en déficit pour protéger ta compo.' },
  };
  const msg = messages[messageType];
  if (!msg) return;
  await Notifications.cancelScheduledNotificationAsync('phase-alert-2').catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: 'phase-alert-2',
    content: { title: msg.title, body: msg.body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10 * 24 * 3600, repeats: false },
  });
}

export async function scheduleBulkReminders(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('bulk-reminder-30').catch(() => {});
  await Notifications.cancelScheduledNotificationAsync('bulk-reminder-60').catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: 'bulk-reminder-30',
    content: { title: '💪 1 mois de bulk', body: 'Vérifie ta composition corporelle.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 30 * 24 * 3600, repeats: false },
  });
  await Notifications.scheduleNotificationAsync({
    identifier: 'bulk-reminder-60',
    content: { title: '🔍 2 mois de bulk', body: 'Tu envisages un déficit ?' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 60 * 24 * 3600, repeats: false },
  });
}

export async function cancelPhaseAlert1(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('phase-alert-1').catch(() => {});
}

export async function cancelPhaseAlerts(): Promise<void> {
  await Promise.all([
    Notifications.cancelScheduledNotificationAsync('phase-alert-1').catch(() => {}),
    Notifications.cancelScheduledNotificationAsync('phase-alert-2').catch(() => {}),
    Notifications.cancelScheduledNotificationAsync('bulk-reminder-30').catch(() => {}),
    Notifications.cancelScheduledNotificationAsync('bulk-reminder-60').catch(() => {}),
  ]);
}

export async function setupNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync('stagnation', [
    { identifier: 'confirm', buttonTitle: 'Confirmer', options: { opensAppToForeground: true } },
    { identifier: 'refuse', buttonTitle: 'Refuser', options: { opensAppToForeground: false, isDestructive: true } },
  ]);
}
