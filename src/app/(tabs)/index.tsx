import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import Button from '../../components/Button';
import CalorieArc from '../../components/CalorieArc';
import CircularProgress from '../../components/CircularProgress';
import FlameIcon from '../../components/FlameIcon';
import PulsingLoader from '../../components/PulsingLoader';
import SessionDetailModal from '../../components/SessionDetailModal';
import { radius, spacing, useColors } from '../../constants/theme';
import { AppState } from '../../types';
import { AccountType } from '../../types/coach';
import { computeNutrition } from '../../types/repas';
import { MUSCLE_LABELS, TrainingState, WorkoutSession } from '../../types/training';
import { calculateCalorieGoal, getEffectiveMaintenance, PHASE_LABELS } from '../../utils/calculations';
import { auth, db } from '../../utils/firebase';
import { initHealthKit, watchSteps } from '../../utils/healthKit';
import { sendStagnationNotification, sendStepsAchievedNotification } from '../../utils/notifications';
import { clearPreloadedData, getPreloadedData } from '../../utils/preloadCache';
import { loadRepasState, setRepasStorageUid } from '../../utils/repasStorage';
import { computePhaseAction } from '../../utils/stagnation';
import { addWeightEntry, loadState, saveState, setStorageUid } from '../../utils/storage';
import { getEarnedBadges, getNextMilestone, getStreakLevel, type StreakData } from '../../utils/streakUtils';
import { loadTrainingState, setTrainingStorageUid } from '../../utils/trainingStorage';

const SCREEN_W = Dimensions.get('window').width;

function DumbbellIcon({ size = 20, color }: { size?: number; color?: string }) {
  const c = useColors();
  return <Ionicons name="barbell" size={size} color={color ?? c.accent} />;
}

function ClockIcon({ size = 13, color }: { size?: number; color?: string }) {
  const c = useColors();
  return <Ionicons name="time-outline" size={size} color={color ?? c.textSecondary} />;
}

function ScaleIcon({ size = 16, color }: { size?: number; color?: string }) {
  const c = useColors();
  return <Ionicons name="scale-outline" size={size} color={color ?? c.accent} />;
}

function CheckIcon({ size = 16, color }: { size?: number; color?: string }) {
  const c = useColors();
  return <Ionicons name="checkmark" size={size} color={color ?? c.accent} />;
}

function BedIcon({ size = 20, color }: { size?: number; color?: string }) {
  const c = useColors();
  return <Ionicons name="bed-outline" size={size} color={color ?? c.textSecondary} />;
}

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<AppState | null>(null);
  const [trainingState, setTrainingState] = useState<TrainingState | null>(null);
  const [headerPhoto, setHeaderPhoto] = useState<string | null>(null);
  const [headerInitial, setHeaderInitial] = useState('?');
  const [caloriesConsumed, setCaloriesConsumed] = useState(0);
  const [detailSession, setDetailSession] = useState<{ session: WorkoutSession; time: string } | null>(null);
  const [showWeightEdit, setShowWeightEdit] = useState(false);
  const [editWeightInput, setEditWeightInput] = useState('');
  const [steps, setSteps] = useState(0);
  // Si des données sont préchargées pendant l'intro, pas de spinner initial
  const [loading, setLoading] = useState(() => getPreloadedData() === null);
  const [weightInput, setWeightInput] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);
  const [trainingStreak, setTrainingStreak] = useState(0);
  const [loginStreak, setLoginStreak] = useState<StreakData | null>(null);
  const [accountType, setAccountType] = useState<AccountType>('standard');
  const [featuredClub, setFeaturedClub] = useState<any>(null);
  const [myClubId, setMyClubId] = useState<string | null>(null);
  const [myClubPhoto, setMyClubPhoto] = useState<string | null>(null);
  const [myClubRank, setMyClubRank] = useState<1 | 2 | 3 | null>(null);
  const [clubNotifCount, setClubNotifCount] = useState(0);
  const [standardCoachStatus, setStandardCoachStatus] = useState<'none' | 'pending' | 'accepted' | null>(null);
  const [standardCoachName, setStandardCoachName] = useState<string | null>(null);
  const [coachSchedule, setCoachSchedule] = useState<import('../../utils/coachStorage').CoachScheduleItem[]>([]);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualLabel, setManualLabel] = useState('');
  const [manualTime, setManualTime] = useState('09:00');
  const [manualDay, setManualDay] = useState(0);
  const [manualLocation, setManualLocation] = useState('');
  const [manualStudentUid, setManualStudentUid] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [coachStudentsList, setCoachStudentsList] = useState<{ uid: string; pseudo: string; photoUrl?: string }[]>([]);
  const [sessionDetail, setSessionDetail] = useState<import('../../utils/coachStorage').CoachScheduleItem | null>(null);
  const [savingManual, setSavingManual] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempTime, setTempTime] = useState('09:00');
  const [editingManualId, setEditingManualId] = useState<string | null>(null);
  const [planUpdated, setPlanUpdated] = useState(false);
  const [coachCalorieGoal, setCoachCalorieGoal] = useState<number | null>(null);
  const [coachMacros, setCoachMacros] = useState<{ proteins: number; fats: number; carbs: number } | null>(null);
  const _jsDay = new Date().getDay();
  const todayIdx = _jsDay === 0 ? 6 : _jsDay - 1;
  const [selectedDayIdx, setSelectedDayIdx] = useState(todayIdx);
  const [studentCompletions, setStudentCompletions] = useState<{ uid: string; pseudo: string; photoUrl?: string; done: number; total: number }[]>([]);
  const [weekTonnage, setWeekTonnage] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [lastWeekTonnage, setLastWeekTonnage] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [sharingTonnage, setSharingTonnage] = useState(false);
  const [showShareTonnageModal, setShowShareTonnageModal] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(auth.currentUser?.uid ?? null);

  // Écoute l'état auth + streak + coachStatus en temps réel
  useEffect(() => {
    let unsubSnap: (() => void) | null = null;
    const unsubAuth = auth.onAuthStateChanged(async (user) => {
      unsubSnap?.();
      unsubSnap = null;
      setCurrentUid(user?.uid ?? null);
      if (!user) return;
      const { getMyAccountType } = await import('../../utils/coachStorage');
      const type = await getMyAccountType();
      if (type === 'coach') return;
      unsubSnap = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
        const data = snap.data();
        setTrainingStreak(data?.trainingStats?.streak ?? 0);
        if (data?.loginStreak) setLoginStreak(data.loginStreak);
        const isCoachManaged = !!data?.nutritionCoachEnabled && !!data?.calorieGoalManual;
        setCoachCalorieGoal(isCoachManaged && data?.calorieGoal ? data.calorieGoal : null);
        setCoachMacros(isCoachManaged && data?.coachMacroManual && data?.coachMacroProteins != null
          ? { proteins: data.coachMacroProteins, fats: data.coachMacroFats, carbs: data.coachMacroCarbs }
          : null);
        if (type === 'standard') {
          const status = data?.coachStatus ?? null;
          setStandardCoachStatus(status === 'pending' ? 'pending' : status === 'accepted' ? 'accepted' : 'none');
          if (status === 'pending' && data?.coachUid) {
            try {
              const { getDoc: fgetDoc, doc: fdoc } = await import('firebase/firestore');
              const { db: fdb } = await import('../../utils/firebase');
              const coachSnap = await fgetDoc(fdoc(fdb, 'users', data.coachUid));
              setStandardCoachName(coachSnap.data()?.prenom ?? coachSnap.data()?.pseudo ?? null);
            } catch { setStandardCoachName(null); }
          } else {
            setStandardCoachName(null);
          }
        }
      }, () => {});
    });
    return () => { unsubAuth(); unsubSnap?.(); };
  }, []);

  // Badge "mise à jour du plan" pour les élèves
  useEffect(() => {
    if (!currentUid || accountType !== 'student') return;
    const q = query(
      collection(db, 'notifications', currentUid, 'items'),
      where('type', '==', 'training_plan_updated'),
      where('read', '==', false),
    );
    const unsub = onSnapshot(q, (snap) => setPlanUpdated(!snap.empty), () => {});
    return unsub;
  }, [accountType, currentUid]);

  useEffect(() => {
    if (accountType === 'banned' || !currentUid) return;

    // Featured club (#1 au classement weeklyScore) en temps réel
    const qFeatured = query(collection(db, 'clubs'), where('weeklyScore', '>', 0), orderBy('weeklyScore', 'desc'), limit(20));
    const unsubFeatured = onSnapshot(qFeatured, (snap) => {
      if (!snap.empty) {
        const clubs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
        clubs.sort((a, b) => ((b.weeklyScore ?? 0) / Math.max(b.memberCount, 1)) - ((a.weeklyScore ?? 0) / Math.max(a.memberCount, 1)));
        setFeaturedClub(clubs[0]);
      } else {
        setFeaturedClub(null);
      }
    }, () => {});

    // Club de l'utilisateur + calcul de son rang
    const q2 = query(collection(db, 'clubs'), where('memberIds', 'array-contains', currentUid));
    import('firebase/firestore').then(({ getDocs: gd }) => {
      gd(q2).then(async (snap) => {
        if (snap.empty) return;
        const clubId = snap.docs[0].id;
        const clubData = snap.docs[0].data();
        setMyClubId(clubId);
        setMyClubPhoto(clubData?.photoUrl ?? null);
        // Rang dans le classement weeklyScore
        const top3 = await gd(query(collection(db, 'clubs'), where('weeklyScore', '>', 0), orderBy('weeklyScore', 'desc'), limit(20)));
        const ranked = top3.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
        ranked.sort((a, b) => ((b.weeklyScore ?? 0) / Math.max(b.memberCount, 1)) - ((a.weeklyScore ?? 0) / Math.max(a.memberCount, 1)));
        const idx = ranked.findIndex((d) => d.id === clubId);
        setMyClubRank(idx === 0 ? 1 : idx === 1 ? 2 : idx === 2 ? 3 : null);
      }).catch(() => {});
    });

    return unsubFeatured;
  }, [accountType, currentUid]);

  useEffect(() => {
    if (!myClubId || accountType === 'banned' || !currentUid) return;
    // Club notif count — requires composite index on notifications subcollection
    let unsub: (() => void) | undefined;
    try {
      const q2 = query(
        collection(db, 'clubs', myClubId, 'notifications'),
        where('toUid', '==', currentUid),
        where('read', '==', false),
      );
      unsub = onSnapshot(q2, (snap) => setClubNotifCount(snap.size), () => {});
    } catch {}
    return () => unsub?.();
  }, [myClubId, accountType, currentUid]);

  const markPlanUpdatedRead = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const q = query(
        collection(db, 'notifications', uid, 'items'),
        where('type', '==', 'training_plan_updated'),
        where('read', '==', false),
      );
      const { getDocs } = await import('firebase/firestore');
      const snap = await getDocs(q);
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
      await batch.commit();
      setPlanUpdated(false);
    } catch {}
  };

  const load = useCallback(async () => {
    try {
    // Garantit que les 3 UIDs sont set avant tout accès storage (race condition auth → /(tabs))
    const currentUid = auth.currentUser?.uid ?? null;
    setState(null); // évite le flash de données de l'ancien user
    setStorageUid(currentUid);
    setTrainingStorageUid(currentUid);
    setRepasStorageUid(currentUid);
    const preloaded = getPreloadedData();
    if (preloaded) {
      // Première ouverture : données précachées pendant l'intro → 0 spinner
      setState(preloaded.state);
      setTrainingState(preloaded.trainingState);
      setCaloriesConsumed(preloaded.caloriesConsumed);
      const p = preloaded.activeProfile;
      if (p) { setHeaderPhoto(p.photo ?? null); setHeaderInitial(p.name?.[0]?.toUpperCase() ?? '?'); }
      clearPreloadedData();
      // Charger accountType + planning coach même sur le chemin preloaded
      const { getMyAccountType, loadCoachWeekSchedule } = await import('../../utils/coachStorage');
      const type = await getMyAccountType();
      setAccountType(type);
      const uid2 = auth.currentUser?.uid;
      if (type === 'coach' && uid2) {
        loadCoachWeekSchedule(uid2).then(setCoachSchedule).catch(() => {});
        const { getDocs, collection: col } = await import('firebase/firestore');
        const { db: fdb } = await import('../../utils/firebase');
        getDocs(col(fdb, 'coachStudents', uid2, 'students')).then((snap) => {
          setCoachStudentsList(snap.docs.map((d) => ({ uid: d.id, pseudo: (d.data() as any).pseudo, photoUrl: (d.data() as any).photoUrl })));
        }).catch(() => {});
      }
      setLoading(false);
      initHealthKit().catch(() => {});
    } else {
      // Revisites ou premier chargement post-onboarding (ou changement de compte)
      let s = await loadState();
      if (!s) {
        // Pas de state local → reconstruction depuis Firestore (changement de compte / nouvel appareil)
        const uid2 = auth.currentUser?.uid;
        if (uid2) {
          try {
            const { doc: fsDoc, getDoc: fsGet } = await import('firebase/firestore');
            const { db: fdb } = await import('../../utils/firebase');
            const snap = await fsGet(fsDoc(fdb, 'users', uid2));
            const udata = snap.data() ?? {};
            if (udata.onboardingComplete === true) {
              const { createInitialState, saveState: ss } = await import('../../utils/storage');
              s = createInitialState(
                udata.pseudo ?? udata.prenom ?? '',
                udata.age ?? 25,
                udata.sex ?? 'male',
                udata.height ?? 175,
                udata.weight ?? 75,
                udata.activityLevel ?? 'moderate',
                udata.phase ?? 'maintenance',
              );
              s.onboardingComplete = true;
              if (udata.birthdate) s.profiles[0].birthdate = udata.birthdate;
              await ss(s);
            }
          } catch {}
        }
        if (!s) { setLoading(false); return; }  // Pas de données → écran vide (pas de redirect)
      }
      setState(s);
      const activeProfileId = s.activeProfileId;
      const p = s.profiles.find((x: any) => x.id === activeProfileId);
      if (p) {
        setHeaderPhoto(p.photo ?? null);
        setHeaderInitial(p.name?.[0]?.toUpperCase() ?? '?');
        // Sync profil physique vers Firestore pour que le coach puisse le lire
        const uid = auth.currentUser?.uid;
        if (uid && p.height && p.weight && p.age && p.sex) {
          const { doc: fsDoc, updateDoc: fsUpdate, getDoc: fsGet } = await import('firebase/firestore');
          const { db: fdb } = await import('../../utils/firebase');
          // Lire Firestore avant d'écrire pour ne pas écraser l'objectif fixé par le coach
          const userSnap = await fsGet(fsDoc(fdb, 'users', uid)).catch(() => null);
          const udata = userSnap?.data() ?? {};
          const coachManaged = !!udata.nutritionCoachEnabled && !!udata.calorieGoalManual;
          const patch: Record<string, any> = {
            height: p.height,
            weight: p.weight,
            age: p.age,
            sex: p.sex,
            activityLevel: p.activityLevel ?? 'moderate',
            phase: p.phase ?? 'maintenance',
          };
          if (p.birthdate) patch.birthdate = p.birthdate;
          // Ne pas écraser calorieGoal/calorieGoalManual si le coach les gère
          if (!coachManaged) {
            patch.calorieGoalManual = p.calorieGoalManual ?? false;
            if (p.calorieGoal) patch.calorieGoal = p.calorieGoal;
          } else {
            // Synchroniser la valeur du coach vers le local state
            const profiles = s!.profiles.map((pr: any) =>
              pr.id === s!.activeProfileId
                ? { ...pr, calorieGoalManual: true, calorieGoal: udata.calorieGoal }
                : pr
            );
            const nextS = { ...s!, profiles };
            s = nextS;
            setState(nextS);
            const { saveState: ss } = await import('../../utils/storage');
            ss(nextS).catch(() => {});
          }
          fsUpdate(fsDoc(fdb, 'users', uid), patch).catch(() => {});
        }
      }
      const { getMyAccountType, loadStudentTrainingPlan, loadCoachWeekSchedule } = await import('../../utils/coachStorage');
      const accountType = await getMyAccountType();
      setAccountType(accountType);
      const uid = auth.currentUser?.uid;
      const [t, rs] = await Promise.all([
        accountType === 'student' && uid
          ? loadStudentTrainingPlan(uid)
          : loadTrainingState(s.activeProfileId),
        loadRepasState(s.activeProfileId),
      ]);
      if (accountType === 'coach' && uid) {
        loadCoachWeekSchedule(uid).then(setCoachSchedule).catch(() => {});
        const { getDocs, collection: col } = await import('firebase/firestore');
        const { db: fdb } = await import('../../utils/firebase');
        getDocs(col(fdb, 'coachStudents', uid, 'students')).then((snap) => {
          setCoachStudentsList(snap.docs.map((d) => ({ uid: d.id, pseudo: (d.data() as any).pseudo, photoUrl: (d.data() as any).photoUrl })));
        }).catch(() => {});
      }
      // Sync historique poids 90j vers Firestore (lisible par le coach)
      if (accountType === 'student' && uid) {
        const activeP = s.profiles.find((p: any) => p.id === s.activeProfileId);
        if (activeP?.weightHistory?.length) {
          const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
          const cutoffStr = cutoff.toISOString().slice(0, 10);
          const weightHistory90 = (activeP.weightHistory as any[])
            .filter((e) => e.date >= cutoffStr)
            .map((e) => ({ date: e.date, weight: e.weight }));
          updateDoc(doc(db, 'users', uid), { weightHistory90 }).catch(() => {});
        }
      }

      setTrainingState(t);
      const today = new Date().toISOString().split('T')[0];
      const consumed = rs.entries
        .filter((e) => e.date === today)
        .reduce((sum, e) => sum + computeNutrition(e.product, e.quantity).kcal, 0);
      setCaloriesConsumed(Math.round(consumed));
      setLoading(false);
    }
    } catch (e: any) {
      console.error('[home] load error:', e?.message ?? e);
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const unsubSteps = accountType !== 'coach' ? watchSteps(setSteps) : () => {};
    return unsubSteps;
  }, [load]));

  useFocusEffect(useCallback(() => {
    if (accountType !== 'coach') return;
    const uid2 = auth.currentUser?.uid;
    if (!uid2) return;
    let cancelled = false;
    (async () => {
      try {
        const { getDocs, collection: col, doc: fdoc, getDoc } = await import('firebase/firestore');
        const { db: fdb } = await import('../../utils/firebase');
        const studentsSnap = await getDocs(col(fdb, 'coachStudents', uid2, 'students'));
        const results = await Promise.all(
          studentsSnap.docs.map(async (d) => {
            const s = d.data() as any;
            try {
              const planSnap = await getDoc(fdoc(fdb, 'studentTraining', d.id));
              const plan = planSnap.data();
              const schedule: any[] = plan?.schedule ?? [];
              const total = schedule.length;
              const done = schedule.filter((sc: any) => sc.completed === true).length;
              return { uid: d.id, pseudo: s.pseudo ?? '?', photoUrl: s.photoUrl, done, total };
            } catch {
              return { uid: d.id, pseudo: s.pseudo ?? '?', photoUrl: s.photoUrl, done: 0, total: 0 };
            }
          })
        );
        if (!cancelled) setStudentCompletions(results);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [accountType]));

  // Tonnage hebdomadaire — semaine courante + semaine précédente
  useFocusEffect(useCallback(() => {
    if (accountType === 'coach') return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const { getDocs, collection: col, query: q, where: wh } = await import('firebase/firestore');
        const { db: fdb } = await import('../../utils/firebase');
        const { computeVolume } = await import('../../utils/workoutLogStorage');

        // Lundi de la semaine courante
        const now = new Date();
        const jsDay = now.getDay(); // 0=dim
        const diffToMon = jsDay === 0 ? -6 : 1 - jsDay;
        const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(now.getDate() + diffToMon);
        const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7);
        const toDateStr = (d: Date) => d.toISOString().split('T')[0];
        const monStr = toDateStr(monday);
        const lastMonStr = toDateStr(lastMonday);
        const lastSunStr = toDateStr(new Date(monday.getTime() - 1));

        const snap = await getDocs(q(
          col(fdb, 'users', uid, 'workoutLogs'),
          wh('date', '>=', lastMonStr),
          wh('date', '<=', toDateStr(new Date(monday.getTime() + 6 * 86400000)))
        ));

        const curr = [0, 0, 0, 0, 0, 0, 0];
        const prev = [0, 0, 0, 0, 0, 0, 0];
        snap.docs.forEach((d) => {
          const log = d.data() as any;
          const dateStr: string = log.date;
          const vol = computeVolume(log.exercises ?? []);
          if (dateStr >= monStr) {
            const dayIdx = (new Date(dateStr).getDay() + 6) % 7; // lun=0
            curr[dayIdx] = (curr[dayIdx] ?? 0) + vol;
          } else if (dateStr >= lastMonStr && dateStr <= lastSunStr) {
            const dayIdx = (new Date(dateStr).getDay() + 6) % 7;
            prev[dayIdx] = (prev[dayIdx] ?? 0) + vol;
          }
        });
        if (!cancelled) { setWeekTonnage(curr); setLastWeekTonnage(prev); }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [accountType]));

  const activeProfile = state?.profiles.find((p) => p.id === state.activeProfileId);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayEntry = activeProfile?.weightHistory?.find((w) => w.date === todayStr);

  // Dernier poids enregistré (aujourd'hui ou antérieur)
  const lastWeightEntry = activeProfile?.weightHistory
    ?.slice()
    .sort((a, b) => (a.date > b.date ? -1 : 1))[0] ?? null;
  const displayWeight = todayEntry ?? lastWeightEntry;

  const updateActiveProfile = (partial: Partial<typeof activeProfile>) => {
    if (!state || !activeProfile) return state!;
    const updated = { ...activeProfile, ...partial };
    return { ...state, profiles: state.profiles.map((p) => p.id === updated.id ? updated : p) };
  };

  const saveWeight = async () => {
    const val = parseFloat(weightInput.replace(',', '.'));
    if (!state || !activeProfile || isNaN(val) || val < 20 || val > 300) return;
    setSavingWeight(true);
    try {
      const withWeight = await addWeightEntry(state, { date: todayStr, weight: val });
      const next = {
        ...withWeight,
        profiles: withWeight.profiles.map((p) =>
          p.id === withWeight.activeProfileId ? { ...p, weight: val } : p
        ),
      };
      const action = computePhaseAction(next);
      const profile = next.profiles.find((p) => p.id === next.activeProfileId);
      if (action && profile) {
        const now = new Date().toISOString();
        if (action.kind === 'calorie' && !profile.pendingAdjustment) {
          const suggested = calculateCalorieGoal(profile) + action.delta;
          const updatedProfile = { ...profile, pendingAdjustment: { suggestedCalories: suggested, detectedAt: now } };
          const withPending = { ...next, profiles: next.profiles.map((p) => p.id === updatedProfile.id ? updatedProfile : p) };
          await saveState(withPending);
          setState(withPending);
          if (profile.notificationsEnabled.stagnation) sendStagnationNotification(suggested, action.delta);
        } else if (action.kind === 'phase-change' && !profile.pendingPhaseChange) {
          const updatedProfile = {
            ...profile,
            pendingPhaseChange: { suggestedPhases: action.suggestedPhases, messageType: action.messageType, detectedAt: now },
            phaseAlertSentAt: now,
          };
          const withPending = { ...next, profiles: next.profiles.map((p) => p.id === updatedProfile.id ? updatedProfile : p) };
          await saveState(withPending);
          setState(withPending);
          if (profile.notificationsEnabled.stagnation) {
            const { sendPhaseAlert1, sendPhaseAlert2 } = await import('../../utils/notifications');
            await sendPhaseAlert1(action.messageType);
            await sendPhaseAlert2(action.messageType);
          }
          if (action.messageType === 'bulk-too-fast') {
            // Pas de J+5/J+10 pour bulk-too-fast, juste l'alerte immédiate
          }
        } else {
          await saveState(next);
          setState(next);
        }
      } else {
        await saveState(next);
        setState(next);
      }
      const uid = auth.currentUser?.uid;
      if (uid && accountType === 'student') {
        const updatedProfile = next.profiles.find((p: any) => p.id === next.activeProfileId);
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const weightHistory90 = (updatedProfile?.weightHistory ?? [])
          .filter((e: any) => e.date >= cutoffStr)
          .map((e: any) => ({ date: e.date, weight: e.weight }));
        updateDoc(doc(db, 'users', uid), { weight: val, weightHistory90 }).catch(() => {});
      }
      setWeightInput('');
    } catch { Alert.alert('Erreur', 'Impossible d\'enregistrer le poids.'); }
    finally { setSavingWeight(false); }
  };

  const confirmAdjustment = async () => {
    if (!state || !activeProfile || !activeProfile.pendingAdjustment) return;
    const updated = {
      ...activeProfile,
      calorieGoal: activeProfile.pendingAdjustment.suggestedCalories,
      calorieGoalManual: true,
      pendingAdjustment: null,
      lastAdjustmentDate: todayStr,
      calorieHistory: [...(activeProfile.calorieHistory ?? []), {
        date: todayStr,
        oldCalories: calculateCalorieGoal(activeProfile),
        newCalories: activeProfile.pendingAdjustment.suggestedCalories,
        reason: 'Stagnation 72h',
      }],
    };
    const next = { ...state, profiles: state.profiles.map((p) => p.id === updated.id ? updated : p) };
    await saveState(next);
    setState(next);
  };

  const refuseAdjustment = async () => {
    if (!state || !activeProfile) return;
    const updated = { ...activeProfile, pendingAdjustment: null, lastAdjustmentDate: todayStr };
    const next = { ...state, profiles: state.profiles.map((p) => p.id === updated.id ? updated : p) };
    await saveState(next);
    setState(next);
  };

  const confirmPhaseChange = async (newPhase: import('../../types').Phase) => {
    if (!state || !activeProfile) return;
    const now = new Date().toISOString();
    // Si on quitte la Préparation via alerte maintenance-reached :
    // le poids monte À calorieGoal → la vraie maintenance est le palier d'AVANT (+200 déclenché la montée)
    const isLeavingPrep = activeProfile.phase === 'pre-preparation' && !activeProfile.knownMaintenance;
    const maintenanceReached = activeProfile.pendingPhaseChange?.messageType === 'maintenance-reached';
    const autoKnownMaintenance = isLeavingPrep
      ? (maintenanceReached ? activeProfile.calorieGoal - 200 : activeProfile.calorieGoal)
      : activeProfile.knownMaintenance;
    const effectiveMaintenance = autoKnownMaintenance ?? getEffectiveMaintenance(activeProfile);
    const updated = {
      ...activeProfile,
      phase: newPhase,
      pendingPhaseChange: null,
      phaseChangedAt: now,
      phaseAlertSentAt: undefined,
      phaseAlert2SentAt: undefined,
      bulkStartedAt: newPhase === 'bulk' ? now : activeProfile.bulkStartedAt,
      knownMaintenance: autoKnownMaintenance,
      // Repart de la maintenance comme baseline pour la nouvelle phase (sauf si objectif manuel actif)
      calorieGoal: activeProfile.calorieGoalManual ? activeProfile.calorieGoal : effectiveMaintenance,
    };
    const next = { ...state, profiles: state.profiles.map((p) => p.id === updated.id ? updated : p) };
    await saveState(next);
    setState(next);
    const { cancelPhaseAlerts, scheduleBulkReminders } = await import('../../utils/notifications');
    await cancelPhaseAlerts();
    if (newPhase === 'bulk') await scheduleBulkReminders();
  };

  const refusePhaseChange = async () => {
    if (!state || !activeProfile) return;
    const updated = { ...activeProfile, pendingPhaseChange: null, phaseAlert2SentAt: new Date().toISOString() };
    const next = { ...state, profiles: state.profiles.map((p) => p.id === updated.id ? updated : p) };
    await saveState(next);
    setState(next);
    // Annule J+5 (boîte déjà traitée) mais garde J+10 comme dernier rappel avant silence
    const { cancelPhaseAlert1 } = await import('../../utils/notifications');
    await cancelPhaseAlert1();
  };

  React.useEffect(() => {
    if (!activeProfile || steps === 0 || accountType === 'coach') return;
    if (steps >= activeProfile.stepGoal && activeProfile.notificationsEnabled.steps) {
      const today = new Date().toISOString().slice(0, 10);
      const key = `steps_notif_sent_${today}`;
      AsyncStorage.getItem(key).then((val) => {
        if (!val) {
          sendStepsAchievedNotification(steps);
          AsyncStorage.setItem(key, '1');
        }
      });
    }
  }, [steps]);

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: 16, paddingBottom: 160 },

    // Header
    greetingRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingTop: spacing.md },
    greeting: { color: colors.text, fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
    dateLabel: { color: colors.textSecondary, fontSize: 13, marginTop: 3, textTransform: 'capitalize' as const },
    objectifBadge: { backgroundColor: colors.accent, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
    objectifText: { color: '#fff', fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.3 },

    // Section labels
    sectionLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 1.2, marginBottom: -4 },

    // Alert
    alertCard: { backgroundColor: colors.accent + '12', borderRadius: 20, padding: spacing.md, borderWidth: 1.5, borderColor: colors.accent + '60' },
    alertTitle: { color: colors.accent, fontSize: 14, fontWeight: '800' as const, marginBottom: 6 },
    alertBody: { color: colors.text, fontSize: 14, lineHeight: 20 },
    alertHighlight: { color: colors.accent, fontWeight: '700' as const },
    alertButtons: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.md },
    alertBtn: { flex: 1, padding: spacing.sm, borderRadius: radius.sm, alignItems: 'center' as const },
    alertBtnConfirm: { backgroundColor: colors.accent },
    alertBtnRefuse: { backgroundColor: colors.card },
    alertBtnText: { color: colors.text, fontWeight: '600' as const, fontSize: 14 },

    // Hero calories
    arcCard: {
      backgroundColor: colors.accent + '0E',
      borderRadius: 24, paddingTop: 24, paddingBottom: 18,
      alignItems: 'center' as const, gap: 4,
      borderWidth: 1.5, borderColor: colors.accent + '35',
      shadowColor: colors.accent, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
    },
    tdeeNote: { color: colors.textSecondary, fontSize: 12 },
    calorieCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' as const },
    calorieLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' as const, marginBottom: spacing.sm },
    calorieValue: { color: colors.accent, fontSize: 72, fontWeight: '800' as const, lineHeight: 80 },
    calorieUnit: { color: colors.textSecondary, fontSize: 18, fontWeight: '600' as const },

    // Bulles caloriques
    bubblesCard: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: spacing.md, paddingVertical: 12, gap: 8 },
    bubblesLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' as const },
    bubblesRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
    bubble: { flex: 1, height: 5, borderRadius: 2.5, backgroundColor: colors.surface },
    bubbleFilled: { backgroundColor: colors.accentGreen },
    bubbleCheck: { color: colors.text, fontSize: 16, fontWeight: '800' as const },
    bubblesCycle: { color: colors.textSecondary, fontSize: 11, marginLeft: 4 },

    // Streak
    streakCard: {
      borderRadius: 20, padding: spacing.md,
      flexDirection: 'column' as const, gap: 10,
      backgroundColor: colors.accent + '18', borderWidth: 1, borderColor: colors.accent + '55',
      shadowColor: colors.accent, shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    },
    streakCardOff: { backgroundColor: colors.card, borderColor: colors.border, shadowOpacity: 0 },
    streakFlame: { fontSize: 36 },
    streakValue: { color: colors.text, fontSize: 16, fontWeight: '800' as const },
    streakSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 17 },

    // Row stats (pas + poids)
    row: { flexDirection: 'row' as const, gap: 12 },
    card: {
      backgroundColor: colors.card, borderRadius: 20, padding: spacing.md, gap: spacing.sm,
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    },
    cardTitle: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.8 },
    cardSub: { color: colors.textSecondary, fontSize: 12, marginTop: spacing.xs },
    weightValue: { color: colors.text, fontSize: 40, fontWeight: '800' as const, lineHeight: 44 },
    weightUnit: { color: colors.textSecondary, fontSize: 15 },
    noData: { color: colors.textSecondary, fontSize: 36, fontWeight: '300' as const },

    // Training
    trainingCard: {
      backgroundColor: colors.card, borderRadius: 20, overflow: 'hidden' as const,
      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    },
    trainingCardInner: { padding: spacing.md, gap: spacing.sm },
    trainingTitle: { color: colors.text, fontSize: 15, fontWeight: '800' as const },
    trainingCountBadge: { backgroundColor: colors.accentGreen + '22', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
    trainingCountText: { color: colors.accentGreen, fontSize: 11, fontWeight: '700' as const },
    restText: { color: colors.textSecondary, fontSize: 14, fontStyle: 'italic' as const },
    trainingItem: { backgroundColor: colors.bg, borderRadius: radius.sm, paddingVertical: 14, paddingHorizontal: spacing.md, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.accent },
    trainingItemDone: { borderLeftColor: colors.accentGreen, opacity: 0.7 },
    trainingName: { color: colors.text, fontSize: 14, fontWeight: '700' as const },
    trainingMuscles: { color: colors.textSecondary, fontSize: 12 },
    trainingTime: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
    trainingDoneBadge: { color: colors.accentGreen, fontSize: 12, fontWeight: '700' as const },
    trainingPending: { color: colors.accent, fontSize: 12, fontWeight: '600' as const },

    // Saisie poids
    weightInputCard: {
      backgroundColor: colors.card, borderRadius: 20, padding: spacing.md, gap: spacing.sm,
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    },
    weightInputCardDone: { opacity: 0.5 },
    weightInputTitle: { color: colors.text, fontSize: 14, fontWeight: '600' as const },
    weightInputRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
    weightInput: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text, fontSize: 18, borderWidth: 1, borderColor: colors.border },
    weightInputDisabled: { color: colors.textSecondary, backgroundColor: colors.border + '44' },
    weightInputUnit: { color: colors.textSecondary, fontSize: 14 },
    weightSaveBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    weightSaveBtnText: { color: '#fff', fontWeight: '700' as const, fontSize: 14 },

    // Modaux
    editLink: { backgroundColor: colors.accent, paddingVertical: 10, borderRadius: radius.sm, marginTop: spacing.sm, alignSelf: 'stretch' as const, alignItems: 'center' as const },
    editLinkText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' as const },
    editModalOverlay: { flex: 1, backgroundColor: '#000000BB', justifyContent: 'center' as const, alignItems: 'center' as const, padding: spacing.xl },
    editModalCard: { backgroundColor: colors.card, borderRadius: 24, padding: spacing.xl, width: '100%', gap: spacing.md },
    editModalTitle: { color: colors.text, fontSize: 17, fontWeight: '800' as const, textAlign: 'center' as const },
    editModalSub: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' as const },
    editModalInput: { backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.accent, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, color: colors.text, fontSize: 28, fontWeight: '800' as const, textAlign: 'center' as const, minWidth: 120 },
    editModalBtnPrimary: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.sm, padding: spacing.md, alignItems: 'center' as const },
    editModalBtnSecondary: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.md, alignItems: 'center' as const, borderWidth: 1, borderColor: colors.border },
  }), [colors]);

  // Bulles caloriques — jours depuis le dernier changement calorique
  // Doit être avant tout return conditionnel (règle des hooks)
  const daysAtCurrentCalories = useMemo(() => {
    const history = activeProfile?.calorieHistory ?? [];
    if (history.length === 0) return 0;
    const lastChange = history[history.length - 1];
    const diffMs = new Date(todayStr).getTime() - new Date(lastChange.date).getTime();
    return Math.max(0, Math.floor(diffMs / 86400000));
  }, [activeProfile?.calorieHistory, todayStr]);

  if (loading || !state || !activeProfile) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <PulsingLoader size={52} />
      </View>
    );
  }

  const calorieGoal = coachMacros
    ? Math.round(coachMacros.proteins * 4 + coachMacros.fats * 9 + coachMacros.carbs * 4)
    : coachCalorieGoal ?? calculateCalorieGoal(activeProfile);
  const stepProgress = Math.min(1, steps / activeProfile.stepGoal);

  const streak = trainingStreak;
  const calorieBubbleFilled = daysAtCurrentCalories % 5 || (daysAtCurrentCalories > 0 && daysAtCurrentCalories % 5 === 0 ? 5 : 0);
  const showCalorieBubbles = (activeProfile?.calorieHistory ?? []).length > 0;

  // Compteur training semaine
  const weekTrainingCount = (() => {
    if (!trainingState) return { done: 0, total: 0 };
    const total = trainingState.schedule.length;
    const done = trainingState.schedule.filter((s) => s.completed).length;
    return { done, total };
  })();

  // Training du jour (0=Lundi … 6=Dimanche, JS getDay 0=Dim donc on ajuste)
  const jsDay = new Date().getDay(); // 0=Sun
  const todayDayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
  const todaySessions = trainingState
    ? trainingState.schedule
        .filter((s) => s.dayOfWeek === todayDayOfWeek)
        .map((s) => ({
          scheduled: s,
          session: trainingState.sessions.find((ws) => ws.id === s.sessionId),
        }))
        .filter((x) => x.session)
    : [];
  const isRestDay = trainingState
    ? (trainingState.restDays ?? []).includes(todayDayOfWeek)
    : false;

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* ── Background — source unique de lumière + logo fantôme ── */}

        {/* Logo watermark : ancré en bas à droite, hors contenu principal */}
        <ExpoImage
          source={require('../../../assets/images/icon.png')}
          style={{
            position: 'absolute',
            width: SCREEN_W * 0.58,
            height: SCREEN_W * 0.58,
            bottom: 80,
            right: -SCREEN_W * 0.08,
            opacity: 0.032,
          }}
          contentFit="contain"
          pointerEvents="none"
        />

        {/* Deux blobs seulement — coin supérieur droit hors écran + coin inférieur gauche */}
        <Svg
          width={SCREEN_W}
          height={2400}
          viewBox={`0 0 ${SCREEN_W} 2400`}
          style={{ position: 'absolute', top: 0, left: 0 }}
          pointerEvents="none"
        >
          {/* Source de lumière — hors écran haut-droite, seul le halo déborde */}
          <Circle cx={SCREEN_W * 1.15} cy={-80} r={SCREEN_W * 0.95} fill={colors.accent} opacity={0.08} />
          {/* Contrepoids doux — bas-gauche hors écran */}
          <Circle cx={SCREEN_W * -0.12} cy={2250} r={SCREEN_W * 0.65} fill={colors.accent} opacity={0.045} />
        </Svg>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Header scrollable */}
          <View style={styles.greetingRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 5 }}>Accueil</Text>
              <Text style={styles.greeting}>Bonjour, {activeProfile.name} </Text>
              <Text style={styles.dateLabel}>
                {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {accountType !== 'coach' && (
                <View style={styles.objectifBadge}>
                  <Text style={styles.objectifText}>{PHASE_LABELS[activeProfile.phase]}</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => (router as any).push('/profil-modal')} activeOpacity={0.8}>
                {headerPhoto ? (
                  <ExpoImage source={{ uri: headerPhoto }} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2.5, borderColor: colors.accent }} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 2.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '800' }}>{headerInitial}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Alerte ajustement */}
          {accountType !== 'coach' && activeProfile.pendingAdjustment && (
            <View style={styles.alertCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="stats-chart-outline" size={16} color={colors.accent} />
                  <Text style={styles.alertTitle}>Ajustement suggéré</Text>
                </View>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => Alert.alert('Conseil uniquement', 'Ces suggestions sont générées automatiquement à partir de tes données. Elles ne remplacent pas l\'avis d\'un professionnel de santé ou d\'un nutritionniste.')}>
                  <Ionicons name="information-circle-outline" size={17} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.alertBody}>
                Stagnation détectée depuis 5 jours. Nouvel objectif :{' '}
                <Text style={styles.alertHighlight}>{activeProfile.pendingAdjustment!.suggestedCalories} kcal</Text>
              </Text>
              <View style={styles.alertButtons}>
                <Button label="Confirmer" variant="primary" size="sm" style={{ flex: 1 }} onPress={confirmAdjustment} />
                <Button label="Refuser" variant="ghost" size="sm" style={{ flex: 1 }} onPress={refuseAdjustment} />
              </View>
            </View>
          )}

          {/* Alerte changement de phase */}
          {accountType !== 'coach' && activeProfile.pendingPhaseChange && (() => {
            const pc = activeProfile.pendingPhaseChange!;
            const LABELS: Record<string, string> = {
              'maintenance-reached': 'Ton poids remonte',
              'deficit-relapse':     'Stagnation persistante',
              'deficit-up-rising':   'Ton poids remonte',
              'reverse-maintenance': 'Maintenance retrouvée',
              'bulk-too-fast':       'Prise trop rapide',
            };
            const BODIES: Record<string, string> = {
              'maintenance-reached': `Ton poids monte à ${activeProfile.calorieGoal} kcal — ta maintenance est estimée à ${activeProfile.calorieGoal - 200} kcal. Choisis ta prochaine phase.`,
              'deficit-relapse':     'Tu stagnes malgré le déficit. Remonte les calories ?',
              'deficit-up-rising':   'Ton poids remonte. Il est temps de relancer le déficit.',
              'reverse-maintenance': 'Tu as retrouvé ta maintenance. Prêt pour la prise de masse ?',
              'bulk-too-fast':       'Tu prends du poids trop vite. Pense à ta composition corporelle.',
            };
            const PHASE_LABELS: Record<string, string> = {
              'deficit-down': 'Déficit ↓',
              'deficit-up': 'Déficit ↑',
              'bulk': 'Bulk',
            };
            return (
              <View style={[styles.alertCard, { borderColor: colors.warning + '40', borderWidth: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="swap-horizontal-outline" size={16} color={colors.warning} />
                    <Text style={[styles.alertTitle, { color: colors.warning }]}>{LABELS[pc.messageType] ?? 'Suggestion'}</Text>
                  </View>
                  <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => Alert.alert('Conseil uniquement', 'Ces suggestions sont générées automatiquement à partir de tes données. Elles ne remplacent pas l\'avis d\'un professionnel de santé ou d\'un nutritionniste.')}>
                    <Ionicons name="information-circle-outline" size={17} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.alertBody}>{BODIES[pc.messageType]}</Text>
                <View style={styles.alertButtons}>
                  {pc.suggestedPhases.map((ph) => (
                    <Button
                      key={ph}
                      label={PHASE_LABELS[ph] ?? ph}
                      variant="primary"
                      size="sm"
                      style={{ flex: 1 }}
                      onPress={() => confirmPhaseChange(ph)}
                    />
                  ))}
                  <Button label="Rester" variant="ghost" size="sm" style={{ flex: 1 }} onPress={refusePhaseChange} />
                </View>
              </View>
            );
          })()}

          {/* Arc calories — objectif + consommé fusionnés */}
          {accountType !== 'coach' && <View style={styles.arcCard}>
            <Text style={{ position: 'absolute', top: 14, left: 18, color: colors.accent, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Calories</Text>
            <TouchableOpacity
              onPress={() => Alert.alert('Information', 'Les apports caloriques affichés sont indicatifs et calculés sur la base des données que tu as renseignées. Ils ne remplacent pas l\'avis d\'un professionnel de santé ou d\'un nutritionniste.', [{ text: 'OK' }])}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <CalorieArc consumed={caloriesConsumed} goal={calorieGoal} size={220} />
            <Text style={styles.tdeeNote}>{activeProfile.knownMaintenance ? 'Maintenance connue' : 'TDEE estimé'} : {getEffectiveMaintenance(activeProfile)} kcal</Text>
          </View>}

          {/* Bulles — jours consécutifs à cette cible calorique */}
          {accountType !== 'coach' && showCalorieBubbles && (
            <View style={styles.bubblesCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.bubblesLabel}>Objectif calorique</Text>
                <Text style={[styles.bubblesLabel, { color: calorieBubbleFilled > 0 ? colors.accentGreen : colors.textSecondary }]}>
                  {daysAtCurrentCalories}j à {calorieGoal} kcal
                  {daysAtCurrentCalories > 0 ? `  ·  Cycle ${Math.floor(daysAtCurrentCalories / 5) + 1}` : ''}
                </Text>
              </View>
              <View style={styles.bubblesRow}>
                {[0, 1, 2, 3, 4].map((i) => {
                  const filled = i < calorieBubbleFilled;
                  return <View key={i} style={[styles.bubble, filled && styles.bubbleFilled]} />;
                })}
              </View>
            </View>
          )}

          {/* Streak connexion quotidien — masqué pour les coachs */}
          {accountType !== 'coach' && (() => {
            const s = loginStreak?.current ?? 0;
            const lvl = getStreakLevel(s);
            const earnedBadges = getEarnedBadges(s);
            const next = getNextMilestone(s);
            const progressPct = next ? Math.min(1, s / next.days) : 1;
            return (
              <View style={[styles.streakCard, s === 0 && styles.streakCardOff]}>
                {/* Ligne principale */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <FlameIcon size={lvl.iconSize} color={lvl.iconColor} glowColor={lvl.glowColor} active={s >= 7} />
                  <View style={{ flex: 1 }}>
                    {s === 0 ? (
                      <>
                        <Text style={styles.streakValue}>Commence ta streak</Text>
                        <Text style={styles.streakSub}>Ouvre Gosh chaque jour pour maintenir ta série.</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.streakValue}>{s} jour{s > 1 ? 's' : ''} de streak</Text>
                        <Text style={styles.streakSub}>
                          {next ? `Encore ${next.days - s} jour${next.days - s > 1 ? 's' : ''} pour "${next.label}"` : 'Tu as débloqué tous les paliers !'}
                        </Text>
                      </>
                    )}
                  </View>
                  {s > 0 && (
                    <View style={{ backgroundColor: lvl.bgColor, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 }}>
                      <Text style={{ color: lvl.iconColor, fontSize: 13, fontWeight: '800' }}>{s}</Text>
                    </View>
                  )}
                </View>

                {/* Barre de progression vers le prochain palier */}
                {s > 0 && next && (
                  <View style={{ gap: 5 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{next.label}</Text>
                      <Text style={{ color: lvl.iconColor, fontSize: 11, fontWeight: '700' }}>{s} / {next.days} j</Text>
                    </View>
                    <View style={{ height: 4, backgroundColor: colors.surface, borderRadius: 2, overflow: 'hidden' }}>
                      <View style={{ height: 4, width: `${progressPct * 100}%`, backgroundColor: lvl.iconColor, borderRadius: 2 }} />
                    </View>
                  </View>
                )}

                {/* Badges débloqués */}
                {earnedBadges.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {earnedBadges.map((b) => (
                      <View key={b.days} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: b.color + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                        <Ionicons name={b.icon as any} size={12} color={b.color} />
                        <Text style={{ color: b.color, fontSize: 11, fontWeight: '700' }}>{b.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })()}

          {/* Box coaching — comptes standard uniquement */}
          {accountType === 'standard' && standardCoachStatus !== null && (() => {
            if (standardCoachStatus === 'none') {
              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => (router as any).push('/find-coach')}
                  style={{ backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}
                >
                  <View style={{ height: 3, backgroundColor: colors.accent }} />
                  <View style={{ padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent + '15', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="person-add-outline" size={22} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Trouver un coach</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 }}>Suivi personnalisé · Planning · Objectifs</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.accent} />
                  </View>
                </TouchableOpacity>
              );
            }
            if (standardCoachStatus === 'pending') {
              return (
                <View style={{ backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.accent + '33' }}>
                  <View style={{ height: 3, backgroundColor: colors.accent }} />
                  <View style={{ padding: spacing.md, gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="hourglass-outline" size={22} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Demande de coaching envoyée</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3 }}>
                          {standardCoachName ? `En attente de ${standardCoachName}` : 'En attente d\'acceptation'}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: colors.accent + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                        <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800' }}>EN COURS</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {['Le coach examine ta demande', 'Tu recevras une notification'].map((tip, i) => (
                        <View key={i} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name={i === 0 ? 'eye-outline' : 'notifications-outline'} size={13} color={colors.accent + 'AA'} />
                          <Text style={{ color: colors.textSecondary, fontSize: 11, flex: 1, lineHeight: 15 }}>{tip}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              );
            }
            return null;
          })()}

          {/* Poids + Steps */}
          {accountType !== 'coach' && <View style={styles.row}>
            <View style={[styles.card, { flex: 1, alignItems: 'center', paddingVertical: 18 }]}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: (stepProgress >= 1 ? colors.accentGreen : colors.accent) + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Ionicons name="footsteps-outline" size={18} color={stepProgress >= 1 ? colors.accentGreen : colors.accent} />
              </View>
              <Text style={styles.cardTitle}>Pas aujourd'hui</Text>
              <CircularProgress
                progress={stepProgress}
                size={100}
                strokeWidth={9}
                color={stepProgress >= 1 ? colors.accentGreen : colors.accent}
                label={steps.toLocaleString()}
                sublabel={`/ ${activeProfile.stepGoal.toLocaleString()}`}
              />
              <Text style={[styles.cardSub, { marginTop: 6 }]}>{Math.round(stepProgress * 100)}%</Text>
            </View>

            <View style={[styles.card, { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 18 }]}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Ionicons name="scale-outline" size={18} color={colors.accent} />
              </View>
              <Text style={styles.cardTitle}>Poids</Text>
              {displayWeight ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginTop: 4 }}>
                    <Text style={styles.weightValue}>{displayWeight.weight.toFixed(1)}</Text>
                    <Text style={[styles.weightUnit, { marginBottom: 5 }]}>kg</Text>
                  </View>
                  <Button
                    label="Modifier"
                    variant="secondary"
                    size="sm"
                    style={{ marginTop: 8, alignSelf: 'center' }}
                    onPress={() => { setEditWeightInput(String(displayWeight.weight)); setShowWeightEdit(true); }}
                  />
                </>
              ) : (
                <Text style={styles.noData}>–</Text>
              )}
            </View>
          </View>}

          {/* ── COACH HOME ── */}
          {accountType === 'coach' && (() => {
            const todayItems = coachSchedule.filter((i) => i.dayOfWeek === todayIdx);
            return (
              <>
                {/* Hero stats */}
                <Text style={styles.sectionLabel}>Coup d'œil</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 6 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="people-outline" size={17} color={colors.accent} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 }}>{studentCompletions.length}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>élève{studentCompletions.length !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 6 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="calendar-outline" size={17} color={colors.accent} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 }}>{todayItems.length}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>coaching{todayItems.length !== 1 ? 's' : ''} aujourd'hui</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 6 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="checkmark-done-outline" size={17} color={colors.accent} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 }}>
                      {studentCompletions.reduce((s, e) => s + e.done, 0)}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>séances faites</Text>
                  </View>
                </View>
              </>
            );
          })()}

          {/* ── Section label ── */}
          <Text style={styles.sectionLabel}>{accountType === 'coach' ? 'Planning' : 'Entraînement'}</Text>

          {/* Planning coach ou Training du jour */}
          {accountType === 'coach' ? (() => {
            const DAY_LABELS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
            const DAY_LABELS_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
            const dayItems = coachSchedule.filter((i) => i.dayOfWeek === selectedDayIdx)
              .sort((a, b) => a.time.localeCompare(b.time));

            return (
              <View style={{ backgroundColor: colors.card, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
                <View style={{ height: 3, backgroundColor: colors.accent }} />
                <View style={{ padding: spacing.lg, gap: 20 }}>

                {/* ── Header ── */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900', letterSpacing: -0.3 }}>Planning</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {coachSchedule.length} coaching{coachSchedule.length !== 1 ? 's' : ''} cette semaine
                    </Text>
                  </View>
                  <View style={{ backgroundColor: colors.accent + '15', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '800' }}>
                      {DAY_LABELS_FULL[todayIdx].slice(0, 3)}. — aujourd'hui
                    </Text>
                  </View>
                </View>

                {/* ── Grille jours pleine largeur ── */}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {DAY_LABELS_SHORT.map((d, idx) => {
                    const count = coachSchedule.filter((i) => i.dayOfWeek === idx).length;
                    const isToday = idx === todayIdx;
                    const isSelected = idx === selectedDayIdx;
                    return (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => setSelectedDayIdx(idx)}
                        activeOpacity={0.7}
                        style={{ flex: 1, alignItems: 'center', gap: 6 }}
                      >
                        <View style={{
                          width: '100%', aspectRatio: 1, borderRadius: 12,
                          backgroundColor: isSelected ? colors.accent : isToday ? colors.accent + '18' : colors.surface,
                          alignItems: 'center', justifyContent: 'center',
                          borderWidth: isToday && !isSelected ? 1.5 : 0,
                          borderColor: colors.accent,
                        }}>
                          <Text style={{ color: isSelected ? '#fff' : isToday ? colors.accent : colors.textSecondary, fontSize: 13, fontWeight: '800' }}>{d}</Text>
                        </View>
                        <View style={{
                          width: 5, height: 5, borderRadius: 3,
                          backgroundColor: count > 0 ? (isSelected ? colors.accent : colors.textSecondary + '66') : 'transparent',
                        }} />
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ── Label jour sélectionné ── */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>
                    {DAY_LABELS_FULL[selectedDayIdx]}
                  </Text>
                  {selectedDayIdx === todayIdx && (
                    <View style={{ backgroundColor: colors.accent + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>Aujourd'hui</Text>
                    </View>
                  )}
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 'auto' as any }}>
                    {dayItems.length} coaching{dayItems.length !== 1 ? 's' : ''}
                  </Text>
                </View>

                {/* ── Créneaux du jour ── */}
                {dayItems.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                      <BedIcon size={22} color={colors.textSecondary} />
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Jour libre</Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {dayItems.map((item) => {
                      const isLinked = !!item.studentUid;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          activeOpacity={0.75}
                          onPress={() => setSessionDetail(item)}
                          style={{
                            flexDirection: 'row', alignItems: 'center',
                            backgroundColor: colors.bg,
                            borderRadius: 16,
                            padding: 16,
                            gap: 14,
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: colors.border,
                            borderLeftWidth: 4,
                            borderLeftColor: isLinked ? colors.accent : colors.textSecondary + '44',
                          }}
                        >
                          {/* Heure */}
                          <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '900', minWidth: 48 }}>
                            {item.time}
                          </Text>

                          {/* Infos */}
                          <View style={{ flex: 1, gap: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                                {item.studentPseudo}
                              </Text>
                              {isLinked && (
                                <View style={{ backgroundColor: colors.accent, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 }}>APP</Text>
                                </View>
                              )}
                            </View>
                            {item.sessionName ? (
                              <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>{item.sessionName}</Text>
                            ) : null}
                            {item.location ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
                                <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>{item.location}</Text>
                              </View>
                            ) : null}
                          </View>

                          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* ── Bouton Ajouter ── */}
                <TouchableOpacity
                  onPress={() => { setManualDay(selectedDayIdx); setShowManualModal(true); }}
                  activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 15 }}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Planifier un coaching</Text>
                </TouchableOpacity>

                {/* Modal résumé séance */}
                <Modal visible={!!sessionDetail} transparent animationType="fade" onRequestClose={() => setSessionDetail(null)}>
                  <View style={{ flex: 1, backgroundColor: '#00000080', justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
                    <View style={{ backgroundColor: colors.card, borderRadius: radius.xl, width: '100%', overflow: 'hidden' }}>
                      {sessionDetail && (() => {
                        const linked = sessionDetail.studentUid ? coachStudentsList.find((s) => s.uid === sessionDetail.studentUid) : null;
                        const DAY_LABELS_FULL_LOCAL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
                        return (
                          <>
                            {/* Header coloré */}
                            <View style={{ backgroundColor: linked ? colors.accent : colors.surface, padding: spacing.lg, paddingBottom: spacing.md }}>
                              <Text style={{ color: linked ? '#fff' : colors.text, fontSize: 20, fontWeight: '800' }}>{sessionDetail.studentPseudo}</Text>
                              <Text style={{ color: linked ? '#ffffff99' : colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                                {DAY_LABELS_FULL_LOCAL[sessionDetail.dayOfWeek]} · {sessionDetail.time}
                              </Text>
                            </View>

                            {/* Infos */}
                            <View style={{ padding: spacing.lg, gap: spacing.md }}>

                              {/* Élève app */}
                              {linked && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                  {linked.photoUrl?.startsWith('http') ? (
                                    <ExpoImage source={{ uri: linked.photoUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
                                  ) : (
                                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                                      <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 16 }}>{linked.pseudo[0]?.toUpperCase()}</Text>
                                    </View>
                                  )}
                                  <View>
                                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' as const }}>Élève app</Text>
                                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>@{linked.pseudo}</Text>
                                  </View>
                                  <View style={{ marginLeft: 'auto' as any, backgroundColor: colors.accent + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.accent }}>
                                    <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800' }}>APP</Text>
                                  </View>
                                </View>
                              )}

                              {/* Nom séance */}
                              {sessionDetail.sessionName ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                  <Ionicons name="barbell-outline" size={20} color={colors.accent} />
                                  <View>
                                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' as const }}>Séance</Text>
                                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>{sessionDetail.sessionName}</Text>
                                  </View>
                                </View>
                              ) : null}

                              {/* Lieu */}
                              {sessionDetail.location ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                  <Ionicons name="location-outline" size={20} color={colors.accent} />
                                  <View>
                                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' as const }}>Lieu</Text>
                                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>{sessionDetail.location}</Text>
                                  </View>
                                </View>
                              ) : null}

                              {/* Heure */}
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Ionicons name="time-outline" size={20} color={colors.accent} />
                                <View>
                                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' as const }}>Heure</Text>
                                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>{sessionDetail.time}</Text>
                                </View>
                              </View>
                            </View>

                            {/* Boutons */}
                            <View style={{ flexDirection: 'row', gap: 10, padding: spacing.md, paddingTop: 0 }}>
                              <Button label="Modifier" variant="secondary" style={{ flex: 1 }} onPress={() => {
                                setSessionDetail(null);
                                setEditingManualId(sessionDetail.id);
                                setManualLabel(sessionDetail.studentPseudo);
                                setManualTime(sessionDetail.time);
                                setManualDay(sessionDetail.dayOfWeek);
                                setManualLocation(sessionDetail.location ?? '');
                                const lnk = sessionDetail.studentUid ? coachStudentsList.find((s) => s.uid === sessionDetail.studentUid) : null;
                                setManualStudentUid(sessionDetail.studentUid ?? null);
                                setStudentSearch(lnk?.pseudo ?? '');
                                setTempTime(sessionDetail.time);
                                setShowManualModal(true);
                              }} />
                              <Button label="Fermer" variant="ghost" style={{ flex: 1 }} onPress={() => setSessionDetail(null)} />
                            </View>
                          </>
                        );
                      })()}
                    </View>
                  </View>
                </Modal>

                {/* Modal ajout créneau — plein écran pageSheet */}
                <Modal visible={showManualModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowManualModal(false); setShowTimePicker(false); setEditingManualId(null); }}>
                  <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

                      {/* ── Header ── */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                        <TouchableOpacity
                          onPress={() => { setShowManualModal(false); setShowTimePicker(false); setEditingManualId(null); }}
                          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Ionicons name="chevron-down" size={22} color={colors.text} />
                        </TouchableOpacity>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>
                            {editingManualId ? 'Modifier le créneau' : 'Nouveau créneau'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          disabled={!manualLabel.trim() || savingManual}
                          onPress={async () => {
                            setSavingManual(true);
                            const uid = auth.currentUser?.uid;
                            if (uid) {
                              const { addManualCoachSession, deleteManualCoachSession, loadCoachWeekSchedule } = await import('../../utils/coachStorage');
                              if (editingManualId) await deleteManualCoachSession(uid, editingManualId);
                              await addManualCoachSession(uid, {
                                label: manualLabel.trim(),
                                time: manualTime,
                                dayOfWeek: manualDay,
                                location: manualLocation.trim() || undefined,
                                studentUid: manualStudentUid ?? undefined,
                              });
                              const updated = await loadCoachWeekSchedule(uid);
                              setCoachSchedule(updated);
                              setSelectedDayIdx(manualDay);
                            }
                            setManualLabel(''); setManualTime('09:00'); setManualDay(todayIdx); setManualLocation('');
                            setManualStudentUid(null); setStudentSearch(''); setShowTimePicker(false); setEditingManualId(null);
                            setSavingManual(false);
                            setShowManualModal(false);
                          }}
                          style={{ height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: manualLabel.trim() ? colors.accent : colors.surface, alignItems: 'center', justifyContent: 'center' }}
                          activeOpacity={0.8}
                        >
                          {savingManual
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={{ color: manualLabel.trim() ? '#fff' : colors.textSecondary, fontSize: 15, fontWeight: '700' }}>
                                {editingManualId ? 'Enregistrer' : 'Ajouter'}
                              </Text>
                          }
                        </TouchableOpacity>
                      </View>

                      <ScrollView
                        contentContainerStyle={{ padding: spacing.md, gap: 20, paddingBottom: 60 }}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                      >

                        {/* ── Associer un élève ── */}
                        {coachStudentsList.length > 0 && (
                          <View style={{ gap: 8 }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>Associer un élève</Text>

                            {manualStudentUid ? (() => {
                              const sel = coachStudentsList.find((s) => s.uid === manualStudentUid);
                              return (
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent + '15', borderRadius: 14, borderWidth: 1.5, borderColor: colors.accent, paddingHorizontal: 14, paddingVertical: 12, gap: 12 }}>
                                  {sel?.photoUrl?.startsWith('http') ? (
                                    <ExpoImage source={{ uri: sel.photoUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
                                  ) : (
                                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
                                      <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 16 }}>{sel?.pseudo?.[0]?.toUpperCase() ?? '?'}</Text>
                                    </View>
                                  )}
                                  <Text style={{ flex: 1, color: colors.text, fontWeight: '700', fontSize: 15 }}>@{sel?.pseudo}</Text>
                                  <TouchableOpacity
                                    onPress={() => { setManualStudentUid(null); setStudentSearch(''); setManualLabel(''); }}
                                    style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    <Ionicons name="close-circle" size={22} color={colors.textSecondary} />
                                  </TouchableOpacity>
                                </View>
                              );
                            })() : (
                              <View style={{ gap: 8 }}>
                                <TextInput
                                  style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, color: colors.text, fontSize: 16, minHeight: 52 }}
                                  placeholder="Rechercher par pseudo…"
                                  placeholderTextColor={colors.textSecondary}
                                  value={studentSearch}
                                  onChangeText={(v) => setStudentSearch(v)}
                                />
                                {studentSearch.length > 0 && (() => {
                                  const matches = coachStudentsList.filter((s) =>
                                    s.pseudo.toLowerCase().includes(studentSearch.toLowerCase())
                                  );
                                  if (matches.length === 0) return (
                                    <Text style={{ color: colors.textSecondary, fontSize: 14, paddingHorizontal: 4 }}>Aucun élève trouvé</Text>
                                  );
                                  return (
                                    <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>
                                      {matches.map((s, i) => (
                                        <TouchableOpacity
                                          key={s.uid}
                                          onPress={() => { setManualStudentUid(s.uid); setStudentSearch(s.pseudo); }}
                                          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12, minHeight: 56, borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border }}
                                        >
                                          {s.photoUrl?.startsWith('http') ? (
                                            <ExpoImage source={{ uri: s.photoUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
                                          ) : (
                                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                                              <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 14 }}>{s.pseudo[0]?.toUpperCase()}</Text>
                                            </View>
                                          )}
                                          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>@{s.pseudo}</Text>
                                        </TouchableOpacity>
                                      ))}
                                    </View>
                                  );
                                })()}
                              </View>
                            )}
                          </View>
                        )}

                        {/* ── Nom de la séance ── */}
                        <View style={{ gap: 8 }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>Nom de la séance</Text>
                          <TextInput
                            style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 16, color: colors.text, fontSize: 16, minHeight: 56 }}
                            placeholder="Ex : Cours particulier, Full body…"
                            placeholderTextColor={colors.textSecondary}
                            value={manualLabel}
                            onChangeText={setManualLabel}
                            returnKeyType="next"
                          />
                        </View>

                        {/* ── Lieu ── */}
                        <View style={{ gap: 8 }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>Lieu</Text>
                          <TextInput
                            style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 16, color: colors.text, fontSize: 16, minHeight: 56 }}
                            placeholder="Salle, adresse…"
                            placeholderTextColor={colors.textSecondary}
                            value={manualLocation}
                            onChangeText={setManualLocation}
                            returnKeyType="done"
                          />
                        </View>

                        {/* ── Jour ── */}
                        <View style={{ gap: 8 }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>Jour</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            {DAY_LABELS_FULL.map((d, idx) => (
                              <TouchableOpacity
                                key={d}
                                onPress={() => setManualDay(idx)}
                                style={{ backgroundColor: manualDay === idx ? colors.accent : colors.card, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: manualDay === idx ? 0 : StyleSheet.hairlineWidth, borderColor: colors.border }}
                              >
                                <Text style={{ color: manualDay === idx ? '#fff' : colors.textSecondary, fontWeight: '700', fontSize: 14 }}>{d}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>

                        {/* ── Heure ── */}
                        <View style={{ gap: 8 }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>Heure</Text>
                          <TouchableOpacity
                            style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 56 }}
                            onPress={() => { Keyboard.dismiss(); setTempTime(manualTime); setShowTimePicker(true); }}
                            activeOpacity={0.7}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="time-outline" size={18} color={colors.accent} />
                              </View>
                              <Text style={{ color: colors.text, fontSize: 16 }}>Heure du cours</Text>
                            </View>
                            <Text style={{ color: colors.accent, fontSize: 17, fontWeight: '800' }}>{manualTime}</Text>
                          </TouchableOpacity>
                        </View>

                      </ScrollView>
                    </KeyboardAvoidingView>

                    {/* ── Picker heure — popup modale style iOS ── */}
                    <Modal visible={showTimePicker} transparent animationType="fade">
                      <View style={{ flex: 1, backgroundColor: '#00000080', justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
                        <View style={{ backgroundColor: colors.card, borderRadius: 24, width: '100%', overflow: 'hidden' }}>
                          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center', paddingTop: spacing.lg, paddingHorizontal: spacing.lg }}>Choisir l'heure</Text>
                          {(() => {
                            const [h, m] = tempTime.split(':').map(Number);
                            const d = new Date(); d.setHours(h || 9, m || 0, 0, 0);
                            const DateTimePicker = require('@react-native-community/datetimepicker').default;
                            return (
                              <DateTimePicker
                                value={d} mode="time" display="spinner" locale="fr-FR" textColor={colors.text}
                                style={{ backgroundColor: colors.card }}
                                onChange={(_: any, date?: Date) => {
                                  if (!date) return;
                                  const hh = String(date.getHours()).padStart(2, '0');
                                  const mm = String(date.getMinutes()).padStart(2, '0');
                                  setTempTime(`${hh}:${mm}`);
                                }}
                              />
                            );
                          })()}
                          <View style={{ flexDirection: 'row', gap: 10, padding: spacing.md }}>
                            <Button label="Annuler" variant="ghost" style={{ flex: 1 }} onPress={() => setShowTimePicker(false)} />
                            <Button label="Confirmer" variant="primary" style={{ flex: 1 }} onPress={() => { setManualTime(tempTime); setShowTimePicker(false); }} />
                          </View>
                        </View>
                      </View>
                    </Modal>
                  </SafeAreaView>
                </Modal>
                </View>
              </View>
            );
          })() : (
          <TouchableOpacity
            activeOpacity={planUpdated && accountType === 'student' ? 0.85 : 1}
            onPress={planUpdated && accountType === 'student' ? markPlanUpdatedRead : undefined}
            style={styles.trainingCard}
          >
            <View style={{ height: 3, backgroundColor: planUpdated && accountType === 'student' ? colors.accent : colors.accentGreen }} />
            <View style={styles.trainingCardInner}>
            {/* Badge mise à jour plan coach */}
            {planUpdated && accountType === 'student' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent + '18', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10, borderWidth: 1, borderColor: colors.accent + '40' }}>
                <Ionicons name="sparkles" size={13} color={colors.accent} />
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700', flex: 1 }}>Ton coach a mis à jour ton programme</Text>
                <Ionicons name="checkmark" size={13} color={colors.accent} />
              </View>
            )}
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="barbell-outline" size={16} color={colors.accent} />
                </View>
                <Text style={styles.trainingTitle}>Training du jour</Text>
              </View>
              {weekTrainingCount.total > 0 && (
                <View style={styles.trainingCountBadge}>
                  <Text style={styles.trainingCountText}>{weekTrainingCount.done}/{weekTrainingCount.total} sem.</Text>
                </View>
              )}
            </View>

            {/* Contenu */}
            {isRestDay ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, borderRadius: radius.sm, padding: spacing.md, marginTop: 4 }}>
                <Ionicons name="moon-outline" size={18} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Journée de récupération</Text>
              </View>
            ) : todaySessions.length === 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, borderRadius: radius.sm, padding: spacing.md, marginTop: 4 }}>
                <Ionicons name="moon-outline" size={18} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Aucune séance prévue</Text>
              </View>
            ) : (
              <View style={{ gap: 8, marginTop: 4 }}>
                {todaySessions.map(({ scheduled, session }) => {
                  const muscles = [...new Set(session!.exercises.map((e) => MUSCLE_LABELS[e.muscle]))];
                  const done = scheduled.completed;
                  return (
                    <View
                      key={scheduled.id}
                      style={{ backgroundColor: colors.bg, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: done ? colors.accentGreen : colors.accent, opacity: done ? 0.75 : 1, overflow: 'hidden' }}
                    >
                      <TouchableOpacity
                        onPress={() => setDetailSession({ session: session!, time: scheduled.time })}
                        activeOpacity={0.75}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{session!.name}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{muscles.join(' · ')}</Text>
                        </View>
                        <Ionicons name={done ? 'checkmark-circle' : 'chevron-forward'} size={18} color={done ? colors.accentGreen : colors.textSecondary} />
                      </TouchableOpacity>
                      {!done && (
                        <TouchableOpacity
                          onPress={() => (router as any).push({ pathname: '/workout-session', params: { scheduledId: scheduled.id, sessionId: session!.id, startTime: Date.now().toString() } })}
                          activeOpacity={0.85}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, paddingVertical: 10 }}
                        >
                          <Ionicons name="play-circle-outline" size={16} color="#fff" />
                          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 }}>Démarrer la séance</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
            </View>
          </TouchableOpacity>
          )}

          {/* ── Mes élèves — coach uniquement ── */}
          {accountType === 'coach' && studentCompletions.length > 0 && (() => {
            const totalDone = studentCompletions.reduce((s, e) => s + e.done, 0);
            const totalPlanned = studentCompletions.reduce((s, e) => s + e.total, 0);
            return (
              <>
                <Text style={styles.sectionLabel}>Mes élèves</Text>
                <View style={{ backgroundColor: colors.card, borderRadius: 20, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                  <View style={{ height: 3, backgroundColor: colors.accent }} />
                  <View style={{ padding: spacing.lg, gap: 16 }}>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Séances cette semaine</Text>
                      <View style={{ backgroundColor: colors.accent + '18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '900' }}>
                          {totalDone}<Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>/{totalPlanned}</Text>
                        </Text>
                      </View>
                    </View>

                    {/* Barre de progression globale */}
                    {totalPlanned > 0 && (
                      <View style={{ height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
                        <View style={{ height: 5, width: `${Math.round((totalDone / totalPlanned) * 100)}%` as any, backgroundColor: colors.accent, borderRadius: 3 }} />
                      </View>
                    )}

                    {/* Liste élèves */}
                    <View style={{ gap: 12 }}>
                      {studentCompletions.map((s) => {
                        const allDone = s.total > 0 && s.done === s.total;
                        const noneDone = s.done === 0 && s.total > 0;
                        const statusColor = allDone ? colors.accentGreen : noneDone ? colors.danger : colors.warning;
                        const statusIcon = allDone ? 'checkmark-circle' : noneDone ? 'close-circle-outline' : 'time-outline';
                        const pct = s.total > 0 ? s.done / s.total : 0;
                        return (
                          <View key={s.uid} style={{ gap: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              {s.photoUrl?.startsWith('http') ? (
                                <ExpoImage source={{ uri: s.photoUrl }} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit="cover" />
                              ) : (
                                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent + '25', alignItems: 'center', justifyContent: 'center' }}>
                                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.accent }}>{s.pseudo[0]?.toUpperCase()}</Text>
                                </View>
                              )}
                              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.text }}>{s.pseudo}</Text>
                              {s.total === 0 ? (
                                <Text style={{ fontSize: 12, color: colors.textSecondary }}>Aucun plan</Text>
                              ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                  <Text style={{ fontSize: 13, fontWeight: '700', color: statusColor }}>{s.done}/{s.total}</Text>
                                  <Ionicons name={statusIcon as any} size={15} color={statusColor} />
                                </View>
                              )}
                            </View>
                            {s.total > 0 && (
                              <View style={{ height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' }}>
                                <View style={{ height: 3, width: `${Math.round(pct * 100)}%` as any, backgroundColor: statusColor, borderRadius: 2 }} />
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </>
            );
          })()}

          {/* ── Ressources — coach uniquement ── */}
          {accountType === 'coach' && (
            <>
              <Text style={styles.sectionLabel}>Ressources</Text>
              <TouchableOpacity
                onPress={() => router.push('/coach-library')}
                style={{ backgroundColor: colors.card, borderRadius: 20, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
                activeOpacity={0.8}
              >
                <View style={{ height: 3, backgroundColor: colors.accent }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: 14 }}>
                  <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="library-outline" size={22} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Ma bibliothèque de séances</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>Séances types à assigner aux élèves</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>
            </>
          )}

          {/* Saisie poids */}
          {accountType !== 'coach' && <View style={[styles.weightInputCard, !!todayEntry && styles.weightInputCardDone]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: todayEntry ? colors.accentGreen + '18' : colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={todayEntry ? 'checkmark-circle-outline' : 'scale-outline'} size={17} color={todayEntry ? colors.accentGreen : colors.accent} />
              </View>
              <Text style={[styles.weightInputTitle, !!todayEntry && { color: colors.textSecondary }]}>
                {todayEntry ? 'Poids enregistré aujourd\'hui' : 'Saisir mon poids du jour'}
              </Text>
            </View>
            <View style={styles.weightInputRow}>
              <TextInput
                style={[styles.weightInput, !!todayEntry && styles.weightInputDisabled]}
                placeholder="ex: 75.4"
                placeholderTextColor={colors.textSecondary}
                value={todayEntry ? String(todayEntry.weight) : weightInput}
                onChangeText={setWeightInput}
                keyboardType="decimal-pad"
                editable={!todayEntry}
              />
              <Text style={[styles.weightInputUnit, !!todayEntry && { color: colors.textSecondary }]}>kg</Text>
              <TouchableOpacity
                style={[styles.weightSaveBtn, (savingWeight || !!todayEntry) && { opacity: 0.4 }]}
                onPress={saveWeight}
                disabled={savingWeight || !!todayEntry}
              >
                <Text style={styles.weightSaveBtnText}>{todayEntry ? 'Enregistré' : 'Enregistrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>}

          {/* ── Section label ── */}
          {(accountType === 'standard' || accountType === 'student') && (
            <Text style={styles.sectionLabel}>Volume</Text>
          )}

          {/* Box Tonnage hebdomadaire — standard et student */}
          {(accountType === 'standard' || accountType === 'student') && (() => {
            const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
            const totalCurr = weekTonnage.reduce((a, b) => a + b, 0);
            const totalPrev = lastWeekTonnage.reduce((a, b) => a + b, 0);
            const maxVal = Math.max(...weekTonnage, ...lastWeekTonnage, 1);
            const jsDay = new Date().getDay();
            const todayDayIdx = jsDay === 0 ? 6 : jsDay - 1;
            const sessionsThisWeek = weekTonnage.filter(v => v > 0).length;
            const bestDayIdx = weekTonnage.indexOf(Math.max(...weekTonnage));
            const delta = totalPrev > 0 ? Math.round(((totalCurr - totalPrev) / totalPrev) * 100) : null;
            const formatKg = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)} kg`;

            const handleShareTonnage = () => {
              if (!myClubId || totalCurr === 0) return;
              setShowShareTonnageModal(true);
            };

            return (
              <View style={{ backgroundColor: colors.card, borderRadius: 20, overflow: 'hidden' }}>
                {/* Header avec accent strip */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="barbell-outline" size={18} color={colors.accent} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800', letterSpacing: -0.2 }}>Tonnage hebdomadaire</Text>
                  </View>
                  {myClubId && (
                    <TouchableOpacity
                      onPress={handleShareTonnage}
                      disabled={sharingTonnage || totalCurr === 0}
                      activeOpacity={0.75}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accent + '18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, opacity: totalCurr === 0 ? 0.35 : 1 }}
                    >
                      <Ionicons name="share-outline" size={13} color={colors.accent} />
                      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>Partager</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Tonnage principal */}
                <View style={{ paddingHorizontal: 16, paddingBottom: 16, flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                  <Text style={{ color: colors.text, fontSize: 36, fontWeight: '900', letterSpacing: -1, lineHeight: 40 }}>
                    {totalCurr === 0 ? '—' : formatKg(totalCurr)}
                  </Text>
                  {delta !== null && totalCurr > 0 && (
                    <View style={{ marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: delta >= 0 ? '#30D158' + '18' : '#FF453A' + '18', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                      <Ionicons name={delta >= 0 ? 'arrow-up' : 'arrow-down'} size={11} color={delta >= 0 ? '#30D158' : '#FF453A'} />
                      <Text style={{ color: delta >= 0 ? '#30D158' : '#FF453A', fontSize: 12, fontWeight: '700' }}>{Math.abs(delta)}%</Text>
                    </View>
                  )}
                </View>

                {/* Barres */}
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 64 }}>
                    {DAY_LABELS.map((label, i) => {
                      const currH = maxVal > 0 ? (weekTonnage[i] / maxVal) * 52 : 0;
                      const prevH = maxVal > 0 ? (lastWeekTonnage[i] / maxVal) * 52 : 0;
                      const isToday = i === todayDayIdx;
                      const isBest = weekTonnage[i] > 0 && i === bestDayIdx && totalCurr > 0;
                      const isFuture = i > todayDayIdx;
                      return (
                        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                          <View style={{ width: '100%', height: 52, justifyContent: 'flex-end', position: 'relative' }}>
                            {/* Ghost semaine dernière */}
                            {prevH > 0 && (
                              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: prevH, backgroundColor: colors.textSecondary + '22', borderRadius: 5 }} />
                            )}
                            {/* Barre courante */}
                            {currH > 0 && (
                              <View style={{
                                height: currH,
                                backgroundColor: isBest ? colors.accent : isFuture ? colors.accent + '33' : isToday ? colors.accent : colors.accent + 'BB',
                                borderRadius: 5,
                              }} />
                            )}
                            {/* Pastille meilleur jour */}
                            {isBest && (
                              <View style={{ position: 'absolute', top: -7, alignSelf: 'center', backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 }}>
                                <Text style={{ color: '#fff', fontSize: 7, fontWeight: '800' }}>MAX</Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ color: isToday ? colors.accent : colors.textSecondary, fontSize: 10, fontWeight: isToday ? '800' : '500' }}>{label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Footer stats */}
                <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                  <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12, gap: 2 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{sessionsThisWeek}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>séance{sessionsThisWeek !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                  <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12, gap: 2 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>
                      {totalPrev > 0 ? formatKg(totalPrev) : '—'}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>semaine préc.</Text>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* ── Section label ── */}
          {accountType !== 'banned' && accountType !== 'coach' && (
            <Text style={styles.sectionLabel}>Communauté</Text>
          )}

          {/* Box Club — tous les comptes sauf banned et coach */}
          {accountType !== 'banned' && accountType !== 'coach' && (
            <View style={{ backgroundColor: colors.card, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>

              {/* Header section — toujours visible */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: 16, paddingBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="people" size={16} color={colors.accent} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>Club à la une</Text>
                  {clubNotifCount > 0 && (
                    <View style={{ backgroundColor: colors.accent, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{clubNotifCount}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={() => router.push('/clubs')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>Voir tous</Text>
                  <Ionicons name="chevron-forward" size={13} color={colors.accent} />
                </TouchableOpacity>
              </View>

              {/* Séparateur */}
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.md }} />

              {featuredClub ? (
                <TouchableOpacity onPress={() => router.push('/clubs')} activeOpacity={0.85}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 14 }}>
                    {/* Photo ou placeholder */}
                    <View style={{ position: 'relative' }}>
                      <View style={{ width: 62, height: 62, borderRadius: 16, borderWidth: 2.5, borderColor: '#FFB800', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent + '18' }}>
                        {featuredClub.photoUrl ? (
                          <ExpoImage source={{ uri: featuredClub.photoUrl }} style={{ width: 54, height: 54, borderRadius: 12 }} contentFit="cover" />
                        ) : (
                          <Ionicons name="people" size={26} color={colors.accent} />
                        )}
                      </View>
                      {/* Badge #1 */}
                      <View style={{ position: 'absolute', bottom: -5, right: -5, backgroundColor: '#FFB800', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 2, borderColor: colors.card }}>
                        <Text style={{ color: '#000', fontSize: 9, fontWeight: '900' }}>#1</Text>
                      </View>
                    </View>

                    {/* Infos */}
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }} numberOfLines={1}>{featuredClub.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ backgroundColor: colors.accent + '20', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>{featuredClub.category}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="people-outline" size={12} color={colors.textSecondary} />
                          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{(featuredClub.memberIds ?? []).length} membre{(featuredClub.memberIds ?? []).length > 1 ? 's' : ''}</Text>
                        </View>
                      </View>
                      {featuredClub.description ? (
                        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }} numberOfLines={1}>{featuredClub.description}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => router.push('/clubs')} activeOpacity={0.85}
                  style={{ padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Aucun club à mettre en avant pour le moment</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      <SessionDetailModal
        session={detailSession?.session ?? null}
        time={detailSession?.time}
        onClose={() => setDetailSession(null)}
      />

      {/* Modal modification poids */}
      {/* Modal — Partager tonnage dans le club */}
      {(() => {
        const totalCurrModal = weekTonnage.reduce((a, b) => a + b, 0);
        const totalStr = totalCurrModal >= 1000
          ? `${(totalCurrModal / 1000).toFixed(2)} tonnes`
          : `${Math.round(totalCurrModal)} kg`;
        return (
          <Modal visible={showShareTonnageModal} transparent animationType="fade" onRequestClose={() => setShowShareTonnageModal(false)}>
            <View style={styles.editModalOverlay}>
              <View style={styles.editModalCard}>
                {/* Logo club ou fallback haltère */}
                <View style={{ alignItems: 'center', marginBottom: 4 }}>
                  {myClubPhoto ? (
                    <ExpoImage source={{ uri: myClubPhoto }} style={{ width: 52, height: 52, borderRadius: 26, marginBottom: 12 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <Ionicons name="barbell-outline" size={24} color={colors.accent} />
                    </View>
                  )}
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>Partager dans le club</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
                    Le message suivant sera posté dans le chat de ton club :
                  </Text>
                </View>
                {/* Aperçu du message */}
                <View style={{ backgroundColor: colors.accent + '12', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.accent + '30' }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 20 }}>
                    {`Mon tonnage cette semaine : ${totalStr} soulevés ! 💪`}
                  </Text>
                </View>
                {/* Boutons */}
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4 }}>
                  <Button label="Annuler" variant="ghost" style={{ flex: 1 }} onPress={() => setShowShareTonnageModal(false)} />
                  <Button
                    label={sharingTonnage ? '...' : 'Partager'}
                    variant="primary"
                    style={{ flex: 1 }}
                    onPress={async () => {
                      if (!myClubId || sharingTonnage) return;
                      setSharingTonnage(true);
                      try {
                        const { addDoc, collection: col, serverTimestamp: sts } = await import('firebase/firestore');
                        const { db: fdb } = await import('../../utils/firebase');
                        const uid = auth.currentUser?.uid;
                        const pseudo = activeProfile?.name ?? 'Un membre';
                        await addDoc(col(fdb, 'clubs', myClubId, 'messages'), {
                          uid,
                          pseudo,
                          text: `🏋️ Mon tonnage cette semaine : ${totalStr} soulevés ! 💪`,
                          type: 'text',
                          createdAt: sts(),
                        });
                        setShowShareTonnageModal(false);
                      } catch {
                        setShowShareTonnageModal(false);
                      } finally {
                        setSharingTonnage(false);
                      }
                    }}
                  />
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}

      <Modal visible={showWeightEdit} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.editModalOverlay}>
            <View style={styles.editModalCard}>
              <Text style={styles.editModalTitle}>Modifier le poids du jour</Text>
              <Text style={styles.editModalSub}>Le changement recalculera tes macros automatiquement.</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center' }}>
                <TextInput
                  style={styles.editModalInput}
                  value={editWeightInput}
                  onChangeText={setEditWeightInput}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                />
                <Text style={{ color: colors.textSecondary, fontSize: 18 }}>kg</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label="Annuler" variant="ghost" style={{ flex: 1 }} onPress={() => setShowWeightEdit(false)} />
                <Button label="Enregistrer" variant="primary" style={{ flex: 1 }} onPress={async () => {
                  const val = parseFloat(editWeightInput.replace(',', '.'));
                  if (!state || !activeProfile || isNaN(val) || val < 20 || val > 300) {
                    Alert.alert('Valeur invalide'); return;
                  }
                  const filteredHistory = activeProfile.weightHistory.filter((e) => e.date !== todayStr);
                  const newHistory = [...filteredHistory, { date: todayStr, weight: val }]
                    .sort((a, b) => a.date.localeCompare(b.date));
                  const next = {
                    ...state,
                    profiles: state.profiles.map((p) =>
                      p.id === activeProfile.id ? { ...p, weight: val, weightHistory: newHistory } : p
                    ),
                  };
                  await saveState(next);
                  setState(next);
                  setShowWeightEdit(false);
                  const uid = auth.currentUser?.uid;
                  if (uid && accountType === 'student') {
                    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
                    const cutoffStr = cutoff.toISOString().slice(0, 10);
                    const weightHistory90 = newHistory
                      .filter((e) => e.date >= cutoffStr)
                      .map((e) => ({ date: e.date, weight: e.weight }));
                    updateDoc(doc(db, 'users', uid), { weight: val, weightHistory90 }).catch(() => {});
                  }
                }} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

