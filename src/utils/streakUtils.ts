import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type StreakData = {
  current: number;
  longest: number;
  lastLoginDate: string;
  badges: string[];
  freezeUsedThisWeek: boolean;
  freezeWeek: string;
};

export type StreakMilestone = {
  days: number;
  label: string;
  icon: string;
  color: string;
};

export const STREAK_MILESTONES: StreakMilestone[] = [
  { days: 7,   label: 'Semaine parfaite', icon: 'flame',        color: '#FF6B35' },
  { days: 30,  label: 'Mois de feu',      icon: 'trophy',       color: '#FFB800' },
  { days: 100, label: 'Centurion',         icon: 'medal',        color: '#A855F7' },
  { days: 365, label: 'Légende',           icon: 'star',         color: '#EC4899' },
];

export type StreakLevelInfo = {
  iconName: string;
  iconColor: string;
  bgColor: string;
  glowColor: string;
  iconSize: number;
  label: string;
};

export function getStreakLevel(streak: number): StreakLevelInfo {
  if (streak === 0)   return { iconName: 'flame-outline', iconColor: '#888',    bgColor: '#88888818', glowColor: 'transparent', iconSize: 44, label: 'Inactif' };
  if (streak < 7)     return { iconName: 'flame',          iconColor: '#FF6B35', bgColor: '#FF6B3520', glowColor: '#FF6B3440',   iconSize: 44, label: 'Débutant' };
  if (streak < 30)    return { iconName: 'flame',          iconColor: '#FF8C00', bgColor: '#FF8C0025', glowColor: '#FF8C0050',   iconSize: 44, label: 'Semaine parfaite' };
  if (streak < 100)   return { iconName: 'flame',          iconColor: '#FFB800', bgColor: '#FFB80025', glowColor: '#FFB80055',   iconSize: 44, label: 'Mois de feu' };
  if (streak < 365)   return { iconName: 'flame',          iconColor: '#A855F7', bgColor: '#A855F725', glowColor: '#A855F755',   iconSize: 44, label: 'Centurion' };
  return                { iconName: 'flame',               iconColor: '#EC4899', bgColor: '#EC489925', glowColor: '#EC489955',   iconSize: 44, label: 'Légende' };
}

export function getEarnedBadges(streak: number): StreakMilestone[] {
  return STREAK_MILESTONES.filter((m) => streak >= m.days);
}

export function getNextMilestone(streak: number): StreakMilestone | null {
  return STREAK_MILESTONES.find((m) => streak < m.days) ?? null;
}

function getTodayString(): string {
  return new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('/').reverse().join('-'); // YYYY-MM-DD en heure de Paris
}

function getWeekString(): string {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('/').reverse().join('-'); // lundi de la semaine courante, heure de Paris
}

function daysBetween(a: string, b: string): number {
  const msA = new Date(a).getTime();
  const msB = new Date(b).getTime();
  return Math.round(Math.abs(msB - msA) / (1000 * 60 * 60 * 24));
}

export async function updateLoginStreak(uid: string): Promise<{ streakData: StreakData; newBadges: StreakMilestone[] }> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const data = snap.data() ?? {};

  const existing: StreakData = data.loginStreak ?? {
    current: 0,
    longest: 0,
    lastLoginDate: '',
    badges: [],
    freezeUsedThisWeek: false,
    freezeWeek: '',
  };

  const today = getTodayString();

  // Déjà connecté aujourd'hui — rien à faire
  if (existing.lastLoginDate === today) {
    return { streakData: existing, newBadges: [] };
  }

  const previousBadges = new Set(existing.badges);
  let newCurrent = existing.current;

  if (!existing.lastLoginDate) {
    // Première connexion
    newCurrent = 1;
  } else {
    const diff = daysBetween(existing.lastLoginDate, today);
    if (diff === 1) {
      // Connexion consécutive
      newCurrent = existing.current + 1;
    } else if (diff === 2 && !existing.freezeUsedThisWeek) {
      // Raté hier — on utilise le freeze automatiquement
      newCurrent = existing.current + 1;
    } else {
      // Série perdue
      newCurrent = 1;
    }
  }

  const newLongest = Math.max(existing.longest, newCurrent);
  const currentWeek = getWeekString();
  const freezeUsedThisWeek = existing.freezeWeek === currentWeek ? existing.freezeUsedThisWeek : false;
  const usedFreeze = existing.lastLoginDate && daysBetween(existing.lastLoginDate, today) === 2 && !freezeUsedThisWeek;

  const earnedBadgeKeys = STREAK_MILESTONES
    .filter((m) => newCurrent >= m.days)
    .map((m) => String(m.days));

  const newBadgeKeys = earnedBadgeKeys.filter((k) => !previousBadges.has(k));
  const newBadges = STREAK_MILESTONES.filter((m) => newBadgeKeys.includes(String(m.days)));

  const updated: StreakData = {
    current: newCurrent,
    longest: newLongest,
    lastLoginDate: today,
    badges: earnedBadgeKeys,
    freezeUsedThisWeek: usedFreeze ? true : freezeUsedThisWeek,
    freezeWeek: usedFreeze ? currentWeek : (existing.freezeWeek || currentWeek),
  };

  await updateDoc(ref, { loginStreak: updated }).catch(async () => {
    await setDoc(ref, { loginStreak: updated }, { merge: true });
  });

  // +2 pts au club pour le streak maintenu (connexion du jour)
  if (newCurrent > existing.current) {
    const { addClubActivityPoints } = await import('./clubUtils');
    addClubActivityPoints(uid, 2).catch(() => {});
  }

  return { streakData: updated, newBadges };
}
