import * as Calendar from 'expo-calendar/legacy';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { DAY_LABELS } from '../types/training';

async function getOrCreateCalendar(): Promise<string | null> {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') return null;

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const existing = calendars.find((c) => c.title === 'Gosh Training');
    if (existing) return existing.id;

    const defaultCalendarSource =
      Platform.OS === 'ios'
        ? calendars.find((c) => c.source?.name === 'iCloud') ?? calendars[0]
        : { isLocalAccount: true, name: 'Gosh', type: 'LOCAL' };

    const calId = await Calendar.createCalendarAsync({
      title: 'Gosh Training',
      color: '#FF6B35',
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: (defaultCalendarSource as any)?.source?.id,
      source: (defaultCalendarSource as any)?.source,
      name: 'fluideTraining',
      ownerAccount: 'personal',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
    return calId;
  } catch {
    return null;
  }
}

export async function addSessionToCalendar(
  sessionName: string,
  dayOfWeek: number, // 0=Lundi
  time: string,      // "HH:MM"
  weekStartDate: string,
): Promise<string | undefined> {
  const calId = await getOrCreateCalendar();
  if (!calId) return undefined;

  try {
    const [h, m] = time.split(':').map(Number);
    const monday = new Date(weekStartDate);
    const eventDate = new Date(monday);
    eventDate.setDate(monday.getDate() + dayOfWeek);
    eventDate.setHours(h, m, 0, 0);

    const endDate = new Date(eventDate);
    endDate.setHours(h + 1, m, 0, 0);

    const eventId = await Calendar.createEventAsync(calId, {
      title: `💪 ${sessionName}`,
      startDate: eventDate,
      endDate,
      notes: 'RIR 1-2 reps — Gosh Training',
      alarms: [{ relativeOffset: -15 }],
    });
    return eventId;
  } catch {
    return undefined;
  }
}

export async function removeCalendarEvent(eventId: string): Promise<void> {
  try {
    await Calendar.deleteEventAsync(eventId);
  } catch {}
}

export async function sendSessionCompletedNotification(sessionName: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔥 Séance terminée !',
      body: `${sessionName} — Objectif atteint. Repos mérité, récupère bien 💪`,
      sound: true,
    },
    trigger: null,
  });
}

export async function sendVolumeWarningNotification(muscleName: string, sets: number, max: number): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚠️ Volume trop élevé',
      body: `${muscleName} : ${sets} séries planifiées cette semaine (max ${max}). Pense à ajuster.`,
      sound: true,
    },
    trigger: null,
  });
}

export async function scheduleSessionReminder(
  sessionName: string,
  dayOfWeek: number,
  time: string,
  weekStartDate: string,
): Promise<void> {
  const [h, m] = time.split(':').map(Number);
  const monday = new Date(weekStartDate);
  const reminderDate = new Date(monday);
  reminderDate.setDate(monday.getDate() + dayOfWeek);
  reminderDate.setHours(h, m, 0, 0);

  if (reminderDate <= new Date()) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `💪 Séance ${sessionName}`,
      body: `C'est l'heure de t'entraîner — RIR 1-2 reps. Allez !`,
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate },
  });
}
