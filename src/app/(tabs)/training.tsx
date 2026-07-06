import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import Button from '../../components/Button';
import PulsingLoader from '../../components/PulsingLoader';
import UserBadge from '../../components/UserBadge';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, AppState, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function ClockIcon({ size = 12, color = colors.textSecondary }: { size?: number; color?: string }) {
  return <Ionicons name="time-outline" size={size} color={color} />;
}
import SessionDetailModal from '../../components/SessionDetailModal';

function BedIcon({ size = 16 }: { size?: number }) {
  return <Ionicons name="bed-outline" size={size} color={colors.textSecondary} />;
}
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors, colors, spacing, radius } from '../../constants/theme';
import {
  MuscleGroup, MuscleCategory, WorkoutSession, Exercise, ScheduledSession,
  MUSCLE_LABELS, ALL_MUSCLES, CATEGORY_COLORS, CATEGORY_LABELS, SETS_TARGET, DAY_LABELS,
} from '../../types/training';
import { loadTrainingState, saveTrainingState, setTrainingStorageUid } from '../../utils/trainingStorage';
import { syncTrainingStats } from '../../utils/syncTrainingStats';
import { db, auth } from '../../utils/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { getCurrentUid } from '../../utils/currentUser';
import { getMyAccountType, subscribeStudentTrainingPlan, stopCoaching, toggleStudentScheduleItem } from '../../utils/coachStorage';
import { Image as ExpoImage } from 'expo-image';
import { AccountType } from '../../types/coach';
import { loadState as loadAppState } from '../../utils/storage';
import { computeWeeklyVolume } from '../../utils/trainingCalc';
import {
  addSessionToCalendar, removeCalendarEvent,
  sendSessionCompletedNotification, sendVolumeWarningNotification,
  scheduleSessionReminder,
} from '../../utils/trainingCalendar';
import { TrainingState } from '../../types/training';
import { EXERCISE_LIBRARY, ExerciseLibraryItem } from '../../utils/exerciseLibrary';

// ─── Dropdown helpers ─────────────────────────────────────────────────────────

function DropdownRow({
  label, value, options, onSelect, renderLabel,
}: {
  label: string;
  value: string | number;
  options: (string | number)[];
  onSelect: (v: any) => void;
  renderLabel?: (v: any) => string;
}) {
  const colors = useColors();
  const dstyles = useMemo(() => StyleSheet.create({
    label: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' as const, marginBottom: 4 },
    trigger: { backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
    triggerText: { color: colors.text, fontSize: 15 },
    arrow: { color: colors.textSecondary, fontSize: 12 },
    list: { backgroundColor: colors.card, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginTop: 2, zIndex: 100 },
    option: { paddingHorizontal: spacing.md, paddingVertical: 10 },
    optionActive: { backgroundColor: colors.accent + '33' },
    optionText: { color: colors.text, fontSize: 14 },
    optionTextActive: { color: colors.accent, fontWeight: '700' as const },
  }), [colors]);
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Text style={dstyles.label}>{label}</Text>
      <TouchableOpacity style={dstyles.trigger} onPress={() => setOpen(!open)}>
        <Text style={dstyles.triggerText}>{renderLabel ? renderLabel(value) : String(value)}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
      </TouchableOpacity>
      {open && (
        <View style={dstyles.list}>
          <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
            {options.map((opt) => (
              <TouchableOpacity
                key={String(opt)}
                style={[dstyles.option, opt === value && dstyles.optionActive]}
                onPress={() => { onSelect(opt); setOpen(false); }}
              >
                <Text style={[dstyles.optionText, opt === value && dstyles.optionTextActive]}>
                  {renderLabel ? renderLabel(opt) : String(opt)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}


// ─── Shared styles hook ───────────────────────────────────────────────────────

function useTrainingStyles() {
  const colors = useColors();
  return useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    subTabBar: { flexDirection: 'row' as const, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    subTab: { flex: 1, paddingVertical: 14, alignItems: 'center' as const, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
    subTabActive: { borderBottomColor: colors.accent },
    subTabText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' as const },
    subTabTextActive: { color: colors.text },
    weekLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' as const },
    dayCard: { backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, gap: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    dayCardRest: { opacity: 0.6 },
    dayHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const, gap: spacing.xs },
    dayTitle: { color: colors.text, fontSize: 16, fontWeight: '700' as const },
    addDayBtn: { backgroundColor: colors.accent + '22', paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm, minHeight: 32 },
    addDayBtnText: { color: colors.accent, fontSize: 13, fontWeight: '600' as const },
    restBtn: { backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
    restBtnActive: { backgroundColor: '#1a1a2e', borderColor: '#6366f1' },
    restBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' as const },
    restBtnTextActive: { color: '#818cf8' },
    emptyDay: { color: colors.textSecondary, fontSize: 14, fontStyle: 'italic' as const },
    sessionChip: { backgroundColor: colors.bg, borderRadius: 12, padding: spacing.md, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.accent, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, minHeight: 56 },
    sessionChipDone: { borderLeftColor: colors.accentGreen, opacity: 0.7 },
    sessionChipName: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    sessionChipMuscles: { color: colors.textSecondary, fontSize: 13 },
    sessionChipTime: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    doneBtn: { backgroundColor: colors.accentGreen + '22', paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: 10, minHeight: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
    doneBtnText: { color: colors.accentGreen, fontSize: 13, fontWeight: '700' as const },
    doneBadge: { backgroundColor: colors.accentGreen + '22', paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: 10 },
    doneBadgeText: { color: colors.accentGreen, fontSize: 13 },
    removeBtn: { backgroundColor: colors.danger + '18', paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: 10, minHeight: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
    removeText: { color: colors.danger, fontSize: 13, fontWeight: '700' as const },
    newSessionBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' as const },
    newSessionBtnText: { color: '#fff', fontWeight: '700' as const, fontSize: 16 },
    sessionCard: { backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 72, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    sessionCardName: { color: colors.text, fontSize: 16, fontWeight: '700' as const },
    sessionCardMuscles: { color: colors.textSecondary, fontSize: 14, marginTop: 3 },
    sessionCardSets: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
    editArrow: { color: colors.textSecondary, fontSize: 24 },
    exerciseBlock: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    modalOverlay: { flex: 1, backgroundColor: '#000000CC', justifyContent: 'flex-end' as const },
    modalCard: { backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, gap: spacing.md },
    modalTitle: { color: colors.text, fontSize: 19, fontWeight: '800' as const },
    modalSub: { color: colors.textSecondary, fontSize: 14, marginTop: -spacing.sm },
  }), [colors]);
}

// ─── Main component ───────────────────────────────────────────────────────────

type SubTab = 'semaine' | 'seances' | 'recap';

export default function TrainingScreen() {
  const colors = useColors();
  const [state, setState] = useState<TrainingState | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('semaine');
  const [loading, setLoading] = useState(true);
  const [accountType, setAccountType] = useState<AccountType>('standard');
  const [coachStatus, setCoachStatus] = useState<string | null>(null);
  const [coachPseudo, setCoachPseudo] = useState<string | null>(null);
  const [studentPlanUpdatedAt, setStudentPlanUpdatedAt] = useState<number | null>(null);

  // Listener temps réel accountType + planning élève
  useEffect(() => {
    let unsubPlan: (() => void) | null = null;
    let unsubUser: (() => void) | null = null;
    const unsubAuth = auth.onAuthStateChanged((user) => {
      unsubUser?.();
      unsubPlan?.();
      if (!user) return;
      unsubUser = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
        const data = snap.data() ?? {};
        const type = (data.accountType as AccountType) ?? 'standard';
        setAccountType(type);
        setCoachStatus(data.coachStatus ?? null);
        // Récupérer le pseudo du coach si demande en attente
        if (data.coachStatus === 'pending' && data.coachUid) {
          try {
            const coachSnap = await getDoc(doc(db, 'users', data.coachUid));
            setCoachPseudo(coachSnap.data()?.prenom ?? coachSnap.data()?.pseudo ?? null);
          } catch { setCoachPseudo(null); }
        } else {
          setCoachPseudo(null);
        }
        if (type === 'student' && !unsubPlan) {
          unsubPlan = subscribeStudentTrainingPlan(user.uid, (plan) => {
            setState(plan);
            setStudentPlanUpdatedAt(plan?.updatedAt ?? null);
            if (plan) syncTrainingStats(plan as any).catch(() => {});
          });
        } else if (type !== 'student') {
          unsubPlan?.();
          unsubPlan = null;
          _coachInfoCache = null;
          setState(null);
          load(); // recharger l'état standard immédiatement
        }
      }, () => {});
    });
    return () => { unsubAuth(); unsubUser?.(); unsubPlan?.(); };
  }, []);

  // Session editor modal
  const [showSessionEditor, setShowSessionEditor] = useState(false);
  const [editingSession, setEditingSession] = useState<WorkoutSession | null>(null);

  // Schedule modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedulingDay, setSchedulingDay] = useState<number>(0);
  const [scheduleSessionId, setScheduleSessionId] = useState<string>('');
  const [scheduleTime, setScheduleTime] = useState('18:00');
  const [scheduleTimeDate, setScheduleTimeDate] = useState<Date>(() => { const d = new Date(); d.setHours(18, 0, 0, 0); return d; });
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Muscle config modal
  const [showMuscleConfig, setShowMuscleConfig] = useState(false);
  const [profileId, setProfileId] = useState<string>('');
  const profileIdRef = useRef<string>('');
  const prevStatsRef = useRef<{ streak: number; lastCompletedWeek?: string } | undefined>(undefined);
  const [detailSession, setDetailSession] = useState<{ session: WorkoutSession; time: string } | null>(null);

  const load = useCallback(async () => {
    setTrainingStorageUid(auth.currentUser?.uid ?? null);
    setLoading(true);
    const type = await getMyAccountType();
    setAccountType(type);
    const appState = await loadAppState();
    if (!appState) { setLoading(false); return; }
    const pid = appState.activeProfileId;
    setProfileId(pid);
    profileIdRef.current = pid;

    if (type === 'student') {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const { loadStudentTrainingPlan } = await import('../../utils/coachStorage');
        const plan = await loadStudentTrainingPlan(uid);
        setState(plan);
        setStudentPlanUpdatedAt(plan?.updatedAt ?? null);
      }
      setLoading(false);
      return;
    }

    const s = await loadTrainingState(pid);
    setState(s);
    try {
      const user = auth.currentUser;
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        prevStatsRef.current = snap.data()?.trainingStats ?? undefined;
        await syncTrainingStats(s, prevStatsRef.current, false);
      }
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Reset automatique au retour en premier plan si la semaine a changé
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') load();
    });
    return () => sub.remove();
  }, [load]);

  const save = async (next: TrainingState) => {
    const pid = profileIdRef.current || profileId;
    if (!pid) return;
    setState(next);
    await saveTrainingState(next, pid);
    syncTrainingStats(next, prevStatsRef.current, false).catch(() => {});
  };

  const saveCompleted = async (next: TrainingState) => {
    const pid = profileIdRef.current || profileId;
    if (!pid) return;
    setState(next);
    await saveTrainingState(next, pid, true);

    const done = next.schedule.filter((s) => s.completed).length;
    const planned = next.schedule.length;

    // Semaine complète = toutes les séances prévues sont validées
    const weekComplete = planned > 0 && done >= planned;

    if (!weekComplete) {
      syncTrainingStats(next, prevStatsRef.current, false).catch(() => {});
      return;
    }

    // Semaine complète → lire Firestore en direct pour éviter tout état périmé
    try {
      const uid = getCurrentUid();
      if (!uid) return;

      const snap = await getDoc(doc(db, 'users', uid));
      const prevStats = snap.data()?.trainingStats ?? {};
      const lastCompletedWeek: string | null = prevStats.lastCompletedWeek ?? null;

      const today = new Date();
      const dayOfWeek = today.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + diffToMonday);
      const currentMonday = monday.toISOString().split('T')[0];

      const prevMonday = new Date(monday);
      prevMonday.setDate(monday.getDate() - 7);
      const previousMonday = prevMonday.toISOString().split('T')[0];

      // Vérifie si lastCompletedWeek est déjà cette semaine
      const alreadyCountedThisWeek = lastCompletedWeek === currentMonday;
      if (alreadyCountedThisWeek) return; // déjà compté

      let streak: number = prevStats.streak ?? 0;
      if (!lastCompletedWeek) {
        streak = 1;
      } else if (lastCompletedWeek === previousMonday) {
        streak = streak + 1;
      } else {
        streak = 1; // trou dans la série
      }

      await setDoc(
        doc(db, 'users', uid),
        { trainingStats: { weeklyDone: done, weeklyPlanned: planned, streak, lastCompletedWeek: currentMonday } },
        { merge: true },
      );
    } catch (e) {
      console.error('[saveCompleted]', e);
    }
  };

  const styles = useTrainingStyles();

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <PulsingLoader size={52} />
      </View>
    );
  }

  // ─── Pending coach request ───────────────────────────────────────────────────
  if (coachStatus === 'pending') {
    const handleCancelRequest = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      Alert.alert(
        'Annuler la demande',
        'Tu pourras en envoyer une nouvelle à n\'importe quel moment.',
        [
          { text: 'Garder', style: 'cancel' },
          {
            text: 'Annuler la demande', style: 'destructive',
            onPress: async () => {
              const { cancelCoachRequest } = await import('../../utils/coachStorage');
              await cancelCoachRequest(uid);
            },
          },
        ]
      );
    };

    return (
      <SafeAreaView style={[styles.screen, { padding: spacing.xl }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
          <View style={{
            width: 80, height: 80, borderRadius: 40,
            backgroundColor: colors.accent + '18',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="time-outline" size={40} color={colors.accent} />
          </View>

          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>
            Demande en attente
          </Text>

          <Text style={{ color: colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
            {coachPseudo
              ? `Ta demande a été envoyée à ${coachPseudo}. Dès qu'il l'accepte, ton planning apparaîtra ici.`
              : 'Ta demande a été envoyée à ton coach. Dès qu\'il l\'accepte, ton planning apparaîtra ici.'}
          </Text>

          <View style={{
            backgroundColor: colors.card, borderRadius: 14, padding: spacing.md,
            borderWidth: 1, borderColor: colors.border, width: '100%',
          }}>
            {[
              { icon: 'restaurant-outline', text: 'Suis ta nutrition dans l\'onglet Repas' },
              { icon: 'trending-up-outline', text: 'Consulte ton suivi dans l\'onglet Suivi' },
              { icon: 'people-outline', text: 'Connecte-toi avec la communauté dans Social' },
            ].map((tip, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                <Ionicons name={tip.icon as any} size={18} color={colors.accent} />
                <Text style={{ color: colors.textSecondary, fontSize: 14, flex: 1, flexWrap: 'wrap' }}>{tip.text}</Text>
              </View>
            ))}
          </View>

          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
            Si ton coach tarde à répondre, rien ne t'empêche d'annuler ta demande pour profiter pleinement de toutes les fonctionnalités.
          </Text>

          <Button label="Annuler ma demande" variant="secondary" onPress={handleCancelRequest} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Student view: read-only coach plan ──────────────────────────────────────
  if (accountType === 'student') {
    return (
      <StudentTrainingView
        plan={state}
        updatedAt={studentPlanUpdatedAt}
        onClearPlan={() => { setState(null); setStudentPlanUpdatedAt(null); }}
        onRefresh={async () => {
          setLoading(true);
          const uid = auth.currentUser?.uid;
          if (uid) {
            const { loadStudentTrainingPlan } = await import('../../utils/coachStorage');
            const plan = await loadStudentTrainingPlan(uid);
            setState(plan);
            setStudentPlanUpdatedAt(plan?.updatedAt ?? null);
          }
          setLoading(false);
        }}
      />
    );
  }

  if (!state) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <PulsingLoader size={52} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      {/* Sub-tabs */}
      <View style={styles.subTabBar}>
        {(['semaine', 'seances', 'recap'] as SubTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.subTab, subTab === t && styles.subTabActive]}
            onPress={() => setSubTab(t)}
          >
            <Text style={[styles.subTabText, subTab === t && styles.subTabTextActive]}>
              {t === 'semaine' ? 'Semaine' : t === 'seances' ? 'Séances' : 'Récap'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {subTab === 'semaine' && (
        <WeekView
          state={state}
          onSave={save}
          onCompleteSession={saveCompleted}
          onAddSession={(day) => {
            if (state.sessions.length === 0) {
              Alert.alert('Aucune séance', 'Crée d\'abord une séance dans l\'onglet Séances.');
              return;
            }
            setSchedulingDay(day);
            setScheduleSessionId(state.sessions[0].id);
            setScheduleTime('18:00');
            setShowScheduleModal(true);
          }}
          onViewSession={(session, time) => setDetailSession({ session, time })}
        />
      )}

      {subTab === 'seances' && (
        <SessionLibrary
          state={state}
          onSave={save}
          onEditSession={(s) => { setEditingSession(s); setShowSessionEditor(true); }}
          onNewSession={() => { setEditingSession(null); setShowSessionEditor(true); }}
        />
      )}

      {subTab === 'recap' && (
        <RecapView
          state={state}
          onSave={save}
          onOpenMuscleConfig={() => setShowMuscleConfig(true)}
        />
      )}


      {/* Schedule modal */}
      <Modal visible={showScheduleModal} transparent animationType="slide" onRequestClose={() => setShowScheduleModal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: '#000000CC' }} activeOpacity={1} onPress={() => setShowScheduleModal(false)} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 2 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
            <TouchableOpacity onPress={() => setShowScheduleModal(false)} style={{ marginRight: 12 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Planifier une séance</Text>
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600', marginTop: 2 }}>{DAY_LABELS[schedulingDay]}</Text>
            </View>
          </View>

          <View style={{ paddingHorizontal: spacing.xl, paddingBottom: 48, gap: spacing.lg }}>
            {/* Sélection de la séance */}
            <View>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>Séance</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {state.sessions.map((s) => {
                  const active = scheduleSessionId === s.id;
                  const muscles = [...new Set(s.exercises.map((e) => MUSCLE_LABELS[e.muscle]))].slice(0, 2).join(', ');
                  return (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => setScheduleSessionId(s.id)}
                      activeOpacity={0.75}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderRadius: 16,
                        backgroundColor: active ? colors.accent : colors.surface,
                        borderWidth: 1.5,
                        borderColor: active ? colors.accent : colors.border,
                        minWidth: 110,
                      }}
                    >
                      <Text style={{ color: active ? '#fff' : colors.text, fontSize: 14, fontWeight: '700' }}>{s.name}</Text>
                      {muscles ? <Text style={{ color: active ? '#ffffffaa' : colors.textSecondary, fontSize: 11, marginTop: 2 }}>{muscles}</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Heure */}
            <View>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>Heure</Text>
              <TouchableOpacity
                onPress={() => setShowTimePicker(true)}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.surface,
                  borderRadius: radius.md,
                  borderWidth: 1.5,
                  borderColor: showTimePicker ? colors.accent : colors.border,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  gap: 10,
                }}
              >
                <Ionicons name="time-outline" size={20} color={colors.accent} />
                <Text style={{ flex: 1, color: colors.text, fontSize: 20, fontWeight: '700' }}>{scheduleTime}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Bouton confirmer */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={async () => {
                const session = state.sessions.find((s) => s.id === scheduleSessionId);
                if (!session) { Alert.alert('Séance requise', 'Sélectionne une séance.'); return; }
                const scheduled: ScheduledSession = {
                  id: Date.now().toString(),
                  sessionId: scheduleSessionId,
                  dayOfWeek: schedulingDay,
                  time: scheduleTime,
                  completed: false,
                };
                const calId = await addSessionToCalendar(session.name, schedulingDay, scheduleTime, state.weekStartDate);
                if (calId) scheduled.calendarEventId = calId;
                await scheduleSessionReminder(session.name, schedulingDay, scheduleTime, state.weekStartDate);
                const next = { ...state, schedule: [...state.schedule, scheduled] };
                const volumes = computeWeeklyVolume(next);
                for (const vol of volumes) {
                  if (vol.overTarget) sendVolumeWarningNotification(MUSCLE_LABELS[vol.muscle], vol.totalSets, vol.target.max);
                }
                await save(next);
                setShowScheduleModal(false);
              }}
              style={{
                backgroundColor: colors.accent,
                borderRadius: radius.md,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Ajouter au planning</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Time picker popup iOS */}
        {showTimePicker && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: '#000000BB', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setShowTimePicker(false)}>
              <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: 20, width: 320, alignItems: 'center', gap: 16 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Choisir l'heure</Text>
                  <DateTimePicker
                    value={scheduleTimeDate}
                    mode="time"
                    display="spinner"
                    is24Hour
                    locale="fr-FR"
                    onChange={(_, date) => {
                      if (!date) return;
                      setScheduleTimeDate(date);
                      const h = date.getHours().toString().padStart(2, '0');
                      const m = date.getMinutes().toString().padStart(2, '0');
                      setScheduleTime(`${h}:${m}`);
                    }}
                    style={{ width: 280 }}
                    textColor={colors.text}
                    themeVariant="dark"
                  />
                  <TouchableOpacity
                    onPress={() => setShowTimePicker(false)}
                    style={{ backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 40 }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Confirmer</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}
      </Modal>

      {/* Session editor modal */}
      <Modal visible={showSessionEditor} animationType="slide" presentationStyle="pageSheet">
        <SessionEditorModal
          initial={editingSession}
          onClose={() => setShowSessionEditor(false)}
          onSave={async (session) => {
            const exists = state.sessions.find((s) => s.id === session.id);
            const sessions = exists
              ? state.sessions.map((s) => (s.id === session.id ? session : s))
              : [...state.sessions, session];
            await save({ ...state, sessions });
            setShowSessionEditor(false);
          }}
          onDelete={
            editingSession
              ? async () => {
                  const sessions = state.sessions.filter((s) => s.id !== editingSession.id);
                  const schedule = state.schedule.filter((s) => s.sessionId !== editingSession.id);
                  await save({ ...state, sessions, schedule });
                  setShowSessionEditor(false);
                }
              : undefined
          }
        />
      </Modal>

      {/* Muscle config modal */}
      <Modal visible={showMuscleConfig} transparent animationType="slide">
        <MuscleConfigModal
          state={state}
          onClose={() => setShowMuscleConfig(false)}
          onSave={async (configs) => {
            await save({ ...state, muscleConfigs: configs });
            setShowMuscleConfig(false);
          }}
        />
      </Modal>

      <SessionDetailModal
        session={detailSession?.session ?? null}
        time={detailSession?.time}
        onClose={() => setDetailSession(null)}
      />
    </SafeAreaView>
  );
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({ state, onSave, onCompleteSession, onAddSession, onViewSession }: {
  state: TrainingState;
  onSave: (s: TrainingState) => Promise<void>;
  onCompleteSession: (s: TrainingState) => Promise<void>;
  onAddSession: (day: number) => void;
  onViewSession: (session: WorkoutSession, time: string) => void;
}) {
  const colors = useColors();
  const styles = useTrainingStyles();
  const scheduledByDay = (day: number) =>
    state.schedule.filter((s) => s.dayOfWeek === day);

  const isRestDay = (day: number) => (state.restDays ?? []).includes(day);

  // Jour courant en convention app : 0=Lundi … 6=Dimanche
  const todayDayIdx = (new Date().getDay() + 6) % 7;

  const toggleRest = async (day: number) => {
    const restDays = state.restDays ?? [];
    const next = {
      ...state,
      restDays: isRestDay(day)
        ? restDays.filter((d) => d !== day)
        : [...restDays, day],
    };
    await onSave(next);
  };

  const completeSession = async (scheduled: ScheduledSession) => {
    if (scheduled.dayOfWeek !== todayDayIdx) return;
    const session = state.sessions.find((s) => s.id === scheduled.sessionId);
    const next = {
      ...state,
      schedule: state.schedule.map((s) =>
        s.id === scheduled.id ? { ...s, completed: true } : s
      ),
    };
    await onCompleteSession(next);
    if (session) await sendSessionCompletedNotification(session.name);
    // +10 pts club + GoshOff — limité à 1 fois par jour
    const uid = auth.currentUser?.uid;
    if (uid) {
      const { addDailySessionPoints } = await import('../../utils/clubUtils');
      addDailySessionPoints(uid).catch(() => {});
    }
  };

  const removeScheduled = async (scheduled: ScheduledSession) => {
    if (scheduled.calendarEventId) await removeCalendarEvent(scheduled.calendarEventId);
    const next = {
      ...state,
      schedule: state.schedule.filter((s) => s.id !== scheduled.id),
    };
    await onSave(next);
  };

  if (state.sessions.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: spacing.xl }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.accent + '30' }}>
          <Ionicons name="calendar-outline" size={32} color={colors.accent} />
        </View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Planifie ta semaine</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
            Crée d'abord une séance dans l'onglet{' '}
            <Text style={{ color: colors.accent, fontWeight: '700' }}>Séances</Text>
            {' '}pour pouvoir la placer dans ton calendrier.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 80 }}>
      <Text style={styles.weekLabel}>Semaine du {state.weekStartDate}</Text>
      {DAY_LABELS.map((dayLabel, idx) => {
        const sessions = scheduledByDay(idx);
        const rest = isRestDay(idx);
        return (
          <View key={dayLabel} style={[styles.dayCard, rest && styles.dayCardRest]}>
            <View style={styles.dayHeader}>
              <Text style={[styles.dayTitle, rest && { color: colors.textSecondary }]}>
                {dayLabel} {rest ? <BedIcon size={14} /> : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <Button
                  label={rest ? 'Annuler repos' : 'Repos'}
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  style={{ minWidth: 100, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12 }}
                  onPress={() => toggleRest(idx)}
                />
                {!rest && (
                  <Button label="+ Séance" variant="secondary" size="sm" fullWidth={false} onPress={() => onAddSession(idx)} />
                )}
              </View>
            </View>
            {rest ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="moon-outline" size={13} color={colors.textSecondary} />
                <Text style={styles.emptyDay}>Journée de récupération</Text>
              </View>
            ) : sessions.length === 0 ? (
              <Text style={styles.emptyDay}>Aucune séance prévue</Text>
            ) : (
              sessions.map((sc) => {
                const session = state.sessions.find((s) => s.id === sc.sessionId);
                const muscles = [...new Set(session?.exercises.map((e) => MUSCLE_LABELS[e.muscle]) ?? [])];
                return (
                  <View key={sc.id} style={[styles.sessionChip, sc.completed && styles.sessionChipDone]}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => session && onViewSession(session, sc.time)} activeOpacity={0.7}>
                      <Text style={styles.sessionChipName}>{session?.name ?? '—'} <Text style={{ color: colors.textSecondary, fontSize: 11 }}>▶ détails</Text></Text>
                      <Text style={styles.sessionChipMuscles}>{muscles.join(' · ')}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <ClockIcon size={11} />
                        <Text style={styles.sessionChipTime}>{sc.time}</Text>
                      </View>
                    </TouchableOpacity>
                    <View style={{ gap: spacing.xs }}>
                      {sc.completed && (
                        <Button label="✓ Fait" variant="ghost" size="sm" style={{ borderWidth: 1, borderColor: colors.accentGreen, borderRadius: 12 }} onPress={() => {}} disabled />
                      )}
                      <Button label="Supprimer" variant="danger" size="sm" onPress={() => removeScheduled(sc)} />
                    </View>
                  </View>
                );
              })
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Session library ──────────────────────────────────────────────────────────

function SessionLibrary({ state, onSave, onEditSession, onNewSession }: {
  state: TrainingState;
  onSave: (s: TrainingState) => Promise<void>;
  onEditSession: (s: WorkoutSession) => void;
  onNewSession: () => void;
}) {
  const colors = useColors();
  const styles = useTrainingStyles();
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 80 }}>
      {state.sessions.length > 0 && (
        <Button label="+ Nouvelle séance" variant="primary" onPress={onNewSession} />
      )}

      {state.sessions.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: spacing.xl * 2, gap: 16 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.accent + '30' }}>
            <Ionicons name="barbell-outline" size={32} color={colors.accent} />
          </View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Aucune séance créée</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24 }}>
              Crée ta première séance pour commencer à planifier ta semaine d'entraînement.
            </Text>
          </View>
          <Button label="Créer ma première séance" variant="primary" style={{ marginTop: 4, paddingHorizontal: 24 }} onPress={onNewSession} />
        </View>
      )}

      {state.sessions.map((session) => {
        const muscles = [...new Set(session.exercises.map((e) => MUSCLE_LABELS[e.muscle]))];
        const totalSets = session.exercises.reduce((s, e) => s + e.sets, 0);
        return (
          <TouchableOpacity key={session.id} style={styles.sessionCard} onPress={() => onEditSession(session)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sessionCardName}>{session.name}</Text>
              <Text style={styles.sessionCardMuscles}>{muscles.join(' · ') || 'Aucun exercice'}</Text>
              <Text style={styles.sessionCardSets}>{totalSets} séries · {session.exercises.length} exercices</Text>
            </View>
            <Text style={styles.editArrow}>›</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Session editor modal ─────────────────────────────────────────────────────

// ─── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
      <TouchableOpacity
        onPress={() => onChange(Math.max(min, value - 1))}
        style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
        activeOpacity={0.7}
      >
        <Ionicons name="remove" size={18} color={value <= min ? colors.textSecondary : colors.text} />
      </TouchableOpacity>
      <Text style={{ width: 44, textAlign: 'center', color: colors.text, fontSize: 19, fontWeight: '700' }}>{value}</Text>
      <TouchableOpacity
        onPress={() => onChange(Math.min(max, value + 1))}
        style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
        activeOpacity={0.7}
      >
        <Ionicons name="add" size={18} color={value >= max ? colors.textSecondary : colors.accent} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Exercise picker field ────────────────────────────────────────────────────
// Icône par groupe musculaire
const MUSCLE_ICONS: Record<string, string> = {
  pecs: 'body-outline', dos: 'arrow-up-outline', epaules: 'arrow-up-circle-outline',
  biceps: 'flash-outline', triceps: 'flash-outline', 'avant-bras': 'hand-left-outline',
  quadriceps: 'walk-outline', ischios: 'walk-outline', fessiers: 'ellipse-outline',
  mollets: 'walk-outline', abdos: 'grid-outline', lombaires: 'git-branch-outline',
  trapezes: 'git-merge-outline',
};

function ExercisePickerField({
  value,
  onSelect,
}: {
  value: ExerciseLibraryItem | null;
  onSelect: (item: ExerciseLibraryItem) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null);
  const [query, setQuery] = useState('');

  const muscleList = ALL_MUSCLES;

  const exercisesForMuscle = useMemo(() => {
    if (!selectedMuscle) return [];
    const base = EXERCISE_LIBRARY.filter((e) => e.muscle === selectedMuscle);
    if (!query.trim()) return base;
    const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return base.filter((e) => e.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
  }, [selectedMuscle, query]);

  const handleClose = () => {
    setOpen(false);
    setSelectedMuscle(null);
    setQuery('');
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: colors.bg, borderRadius: 14,
          borderWidth: StyleSheet.hairlineWidth, borderColor: value ? colors.accent : colors.border,
          paddingHorizontal: 14, paddingVertical: 14, minHeight: 52,
        }}
      >
        <Ionicons name="barbell-outline" size={18} color={value ? colors.accent : colors.textSecondary} />
        <View style={{ flex: 1 }}>
          {value ? (
            <>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{value.name}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{MUSCLE_LABELS[value.muscle]}</Text>
            </>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Choisir un exercice…</Text>
          )}
        </View>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            {selectedMuscle ? (
              <TouchableOpacity onPress={() => { setSelectedMuscle(null); setQuery(''); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={24} color={colors.text} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 24 }} />
            )}
            <Text style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' }}>
              {selectedMuscle ? MUSCLE_LABELS[selectedMuscle] : 'Groupe musculaire'}
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {!selectedMuscle ? (
            /* ── Étape 1 : grille muscles ── */
            <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 10 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {muscleList.map((muscle) => {
                  const isCurrentMuscle = value?.muscle === muscle;
                  return (
                    <TouchableOpacity
                      key={muscle}
                      onPress={() => setSelectedMuscle(muscle)}
                      activeOpacity={0.75}
                      style={{
                        width: '47%', backgroundColor: isCurrentMuscle ? colors.accent + '18' : colors.card,
                        borderRadius: 16, padding: 16, gap: 8,
                        borderWidth: 1.5, borderColor: isCurrentMuscle ? colors.accent : colors.border,
                      }}
                    >
                      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: isCurrentMuscle ? colors.accent : colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={(MUSCLE_ICONS[muscle] ?? 'barbell-outline') as any} size={18} color={isCurrentMuscle ? '#fff' : colors.accent} />
                      </View>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{MUSCLE_LABELS[muscle]}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                        {EXERCISE_LIBRARY.filter((e) => e.muscle === muscle).length} exercices
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            /* ── Étape 2 : liste exercices du muscle ── */
            <>
              <View style={{ paddingHorizontal: spacing.md, paddingVertical: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
                  <TextInput
                    style={{ flex: 1, color: colors.text, fontSize: 15 }}
                    placeholder="Filtrer…"
                    placeholderTextColor={colors.textSecondary}
                    value={query}
                    onChangeText={setQuery}
                    returnKeyType="search"
                  />
                  {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')}>
                      <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 40 }}>
                {exercisesForMuscle.map((item) => {
                  const selected = value?.slug === item.slug;
                  return (
                    <TouchableOpacity
                      key={item.slug}
                      onPress={() => { onSelect(item); handleClose(); }}
                      activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: selected ? colors.accent : colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="barbell-outline" size={16} color={selected ? '#fff' : colors.accent} />
                      </View>
                      <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: selected ? '700' : '500' }}>{item.name}</Text>
                      {selected && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
                {exercisesForMuscle.length === 0 && (
                  <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40, fontSize: 15 }}>Aucun exercice trouvé</Text>
                )}
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

// ─── Session editor modal ─────────────────────────────────────────────────────
function SessionEditorModal({ initial, onClose, onSave, onDelete }: {
  initial: WorkoutSession | null;
  onClose: () => void;
  onSave: (s: WorkoutSession) => void;
  onDelete?: () => void;
}) {
  const colors = useColors();
  const [name, setName] = useState(initial?.name ?? '');
  const [exercises, setExercises] = useState<Exercise[]>(initial?.exercises ?? []);

  const addExercise = () => {
    setExercises((prev) => [...prev, { id: Date.now().toString(), slug: '', name: '', muscle: 'pecs', sets: 3, reps: 10 }]);
  };

  const update = (id: string, partial: Partial<Exercise>) =>
    setExercises((prev) => prev.map((e) => e.id === id ? { ...e, ...partial } : e));

  const remove = (id: string) =>
    setExercises((prev) => prev.filter((e) => e.id !== id));

  const handleSave = () => {
    if (!name.trim()) { Alert.alert('Nom requis', 'Donne un nom à ta séance.'); return; }
    onSave({ id: initial?.id ?? Date.now().toString(), name: name.trim(), exercises });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

        {/* ── Header ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: spacing.md, paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
          backgroundColor: colors.bg,
        }}>
          <TouchableOpacity
            onPress={onClose}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-down" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>
              {initial ? 'Modifier la séance' : 'Nouvelle séance'}
            </Text>
            {exercises.length > 0 && (
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>
                {exercises.length} exercice{exercises.length > 1 ? 's' : ''}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={handleSave}
            style={{ height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Enregistrer</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.md, gap: 20, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Nom de la séance ── */}
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
              Nom de la séance
            </Text>
            <TextInput
              style={{
                backgroundColor: colors.card,
                borderRadius: 14,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
                paddingHorizontal: 16,
                paddingVertical: 16,
                color: colors.text,
                fontSize: 18,
                fontWeight: '600',
                minHeight: 56,
              }}
              value={name}
              onChangeText={setName}
              placeholder="Push, Dos / Biceps, Full body…"
              placeholderTextColor={colors.textSecondary}
              autoFocus={!initial}
              returnKeyType="done"
            />
          </View>

          {/* ── Exercices ── */}
          {exercises.map((ex, i) => (
            <View
              key={ex.id}
              style={{
                backgroundColor: colors.card,
                borderRadius: 22,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
                overflow: 'hidden',
              }}
            >
              {/* Numéro + corbeille */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 }}>EXERCICE</Text>
                </View>
                <TouchableOpacity
                  onPress={() => remove(ex.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>

              {/* Picker */}
              <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 }}>
                <ExercisePickerField
                  value={ex.slug ? { slug: ex.slug, name: ex.name, muscle: ex.muscle } : null}
                  onSelect={(item) => update(ex.id, { slug: item.slug, name: item.name, muscle: item.muscle })}
                />
              </View>

              {/* Séparateur */}
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 20 }} />

              {/* Séries × Reps */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 20, gap: 16 }}>
                <View style={{ flex: 1, alignItems: 'center', gap: 12 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>Séries</Text>
                  <Stepper value={ex.sets} min={1} max={10} onChange={(v) => update(ex.id, { sets: v })} />
                </View>
                <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                <View style={{ flex: 1, alignItems: 'center', gap: 12 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>Reps</Text>
                  <Stepper value={ex.reps} min={1} max={30} onChange={(v) => update(ex.id, { reps: v })} />
                </View>
              </View>
            </View>
          ))}

          {/* ── Ajouter un exercice ── */}
          <TouchableOpacity
            onPress={addExercise}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              minHeight: 56, borderRadius: 16,
              borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed',
              backgroundColor: colors.accent + '08',
            }}
          >
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={18} color={colors.accent} />
            </View>
            <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '700' }}>Ajouter un exercice</Text>
          </TouchableOpacity>

          {/* ── Supprimer la séance ── */}
          {onDelete && (
            <TouchableOpacity
              onPress={() => Alert.alert('Supprimer', 'Supprimer cette séance ?', [
                { text: 'Annuler' },
                { text: 'Supprimer', style: 'destructive', onPress: onDelete },
              ])}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                minHeight: 48, borderRadius: 14,
                backgroundColor: colors.danger + '10',
              }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: 15, fontWeight: '600' }}>Supprimer la séance</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Recap view ───────────────────────────────────────────────────────────────

function RecapView({ state, onSave, onOpenMuscleConfig }: {
  state: TrainingState;
  onSave: (s: TrainingState) => Promise<void>;
  onOpenMuscleConfig: () => void;
}) {
  const colors = useColors();
  const styles = useTrainingStyles();
  const volumes = computeWeeklyVolume(state);
  const withSets = volumes.filter((v) => v.totalSets > 0);
  const withoutSets = volumes.filter((v) => v.totalSets === 0);

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

      {/* Bouton config */}
      <TouchableOpacity
        onPress={onOpenMuscleConfig}
        activeOpacity={0.8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border }}
      >
        <Ionicons name="settings-outline" size={18} color={colors.textSecondary} />
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }}>Configurer les catégories</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Légende catégories */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        {([
          { key: 'prioritaire', icon: 'flash-outline',       label: 'Prioritaire', sub: '12–20 sér./sem' },
          { key: 'secondaire',  icon: 'trending-up-outline', label: 'Secondaire',  sub: '6–12 sér./sem' },
          { key: 'maintien',    icon: 'lock-closed-outline', label: 'Maintien',    sub: '3–5 sér./sem' },
        ] as const).map(({ key: c, icon, label, sub }) => (
          <View key={c} style={{ flex: 1, backgroundColor: CATEGORY_COLORS[c] + '18', borderRadius: radius.sm, padding: spacing.sm, borderWidth: 1, borderColor: CATEGORY_COLORS[c] + '44', gap: 6, alignItems: 'flex-start' }}>
            <Ionicons name={icon as any} size={16} color={CATEGORY_COLORS[c]} />
            <Text style={{ color: CATEGORY_COLORS[c], fontSize: 11, fontWeight: '700' }}>{label}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{sub}</Text>
          </View>
        ))}
      </View>

      {/* Muscles entraînés */}
      {withSets.length > 0 && (
        <View style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
            <Ionicons name="barbell-outline" size={14} color={colors.accent} />
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Entraînés cette semaine</Text>
          </View>
          <View style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            {withSets.map((vol, i) => {
              const catColor = CATEGORY_COLORS[vol.category];
              const pct = Math.min(1, vol.totalSets / vol.target.max);
              const overMax = vol.totalSets > vol.target.max;
              const ok = vol.totalSets >= vol.target.min && !overMax;
              return (
                <View key={vol.muscle} style={{ padding: spacing.md, borderBottomWidth: i < withSets.length - 1 ? 1 : 0, borderBottomColor: colors.border, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor }} />
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{MUSCLE_LABELS[vol.muscle]}</Text>
                      <Text style={{ color: catColor, fontSize: 10, fontWeight: '600' }}>{CATEGORY_LABELS[vol.category]}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: overMax ? colors.danger : ok ? colors.accentGreen : colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
                        {vol.totalSets}<Text style={{ color: colors.textSecondary, fontWeight: '400' }}>/{vol.target.max}</Text>
                      </Text>
                      {overMax
                        ? <Ionicons name="warning-outline" size={14} color={colors.danger} />
                        : ok
                          ? <Ionicons name="checkmark-circle" size={14} color={colors.accentGreen} />
                          : <Ionicons name="ellipse-outline" size={14} color={colors.textSecondary} />}
                    </View>
                  </View>
                  <View style={{ height: 6, backgroundColor: colors.surface, borderRadius: 3 }}>
                    <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: overMax ? colors.danger : catColor, borderRadius: 3 }} />
                    <View style={{ position: 'absolute', top: -2, bottom: -2, left: `${(vol.target.min / vol.target.max) * 100}%`, width: 1.5, backgroundColor: colors.border }} />
                  </View>
                  {vol.completedSets > 0 && (
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                      {vol.completedSets} sér. effectuées · Cible : {vol.target.min}–{vol.target.max}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Muscles non entraînés */}
      {withoutSets.length > 0 && (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
            <Ionicons name="remove-circle-outline" size={14} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Non planifiés</Text>
          </View>
          <View style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            {withoutSets.map((v, i) => (
              <View key={v.muscle} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: i < withoutSets.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CATEGORY_COLORS[v.category] + '66' }} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{MUSCLE_LABELS[v.muscle]}</Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Cible {v.target.min}–{v.target.max} sér.</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {withSets.length === 0 && withoutSets.length === 0 && (
        <View style={{ alignItems: 'center', marginTop: 60, gap: 12 }}>
          <Ionicons name="bar-chart-outline" size={48} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Aucun volume calculé</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: 40 }}>Planifie des séances pour voir le récap musculaire.</Text>
        </View>
      )}

    </ScrollView>
  );
}

// ─── Muscle config modal ──────────────────────────────────────────────────────

function MuscleConfigModal({ state, onClose, onSave }: {
  state: TrainingState;
  onClose: () => void;
  onSave: (configs: typeof state.muscleConfigs) => void;
}) {
  const colors = useColors();
  const styles = useTrainingStyles();
  const [configs, setConfigs] = useState([...state.muscleConfigs]);

  const setCategory = (muscle: MuscleGroup, category: MuscleCategory) => {
    setConfigs(configs.map((c) => c.muscle === muscle ? { ...c, category } : c));
  };

  const CAT_ICONS: Record<MuscleCategory, { icon: string; desc: string }> = {
    prioritaire: { icon: 'flash-outline',        desc: '12–20 sér./sem · à développer' },
    secondaire:  { icon: 'trending-up-outline',  desc: '6–12 sér./sem · progression' },
    maintien:    { icon: 'lock-closed-outline',  desc: '3–5 sér./sem · maintenir' },
  };

  return (
    <View style={styles.modalOverlay}>
      <View style={[styles.modalCard, { maxHeight: '92%' }]}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={styles.modalTitle}>Catégories musculaires</Text>
          <TouchableOpacity onPress={onClose} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
        <Text style={styles.modalSub}>Classe chaque muscle selon ta priorité d'entraînement</Text>

        {/* Légende */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm }}>
          {(['prioritaire', 'secondaire', 'maintien'] as MuscleCategory[]).map((cat) => (
            <View key={cat} style={{ flex: 1, backgroundColor: CATEGORY_COLORS[cat] + '18', borderRadius: radius.sm, padding: 8, borderWidth: 1, borderColor: CATEGORY_COLORS[cat] + '44', gap: 6, alignItems: 'flex-start' }}>
              <Ionicons name={CAT_ICONS[cat].icon as any} size={16} color={CATEGORY_COLORS[cat]} />
              <Text style={{ color: CATEGORY_COLORS[cat], fontSize: 11, fontWeight: '700' }}>{CATEGORY_LABELS[cat]}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{CAT_ICONS[cat].desc}</Text>
            </View>
          ))}
        </View>

        {/* Liste muscles */}
        <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <View style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            {configs.map((mc, i) => (
              <View key={mc.muscle} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: i < configs.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CATEGORY_COLORS[mc.category] }} />
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{MUSCLE_LABELS[mc.muscle]}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['prioritaire', 'secondaire', 'maintien'] as MuscleCategory[]).map((cat) => {
                    const active = mc.category === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        onPress={() => setCategory(mc.muscle, cat)}
                        style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? CATEGORY_COLORS[cat] + '28' : colors.surface, borderWidth: 1.5, borderColor: active ? CATEGORY_COLORS[cat] : colors.border }}
                      >
                        <Ionicons name={CAT_ICONS[cat].icon as any} size={14} color={active ? CATEGORY_COLORS[cat] : colors.textSecondary} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Boutons */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
          <Button label="Annuler" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
          <Button label="Enregistrer" variant="primary" style={{ flex: 1 }} onPress={() => onSave(configs)} />
        </View>

      </View>
    </View>
  );
}

// ─── StudentTrainingView ──────────────────────────────────────────────────────

// Cache module-level pour éviter un re-fetch à chaque changement d'onglet
let _coachInfoCache: { uid: string; pseudo: string; photoUrl?: string; joinedAt?: number } | null = null;

function StudentTrainingView({ plan, updatedAt, onRefresh, onClearPlan }: {
  plan: TrainingState | null;
  updatedAt: number | null;
  onRefresh: () => Promise<void>;
  onClearPlan: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const todayDayIdx = (new Date().getDay() + 6) % 7;
  const activeTabRef = useRef<'trainings' | 'coaching'>('trainings');
  const [activeTab, setActiveTab] = useState<'trainings' | 'coaching'>(() => activeTabRef.current);
  const switchTab = (t: 'trainings' | 'coaching') => { activeTabRef.current = t; setActiveTab(t); };
  const [coachInfo, setCoachInfo] = useState<{ uid: string; pseudo: string; photoUrl?: string; joinedAt?: number } | null>(_coachInfoCache);
  const [stopping, setStopping] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => setExpandedSessions(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => {
    if (_coachInfoCache) { setCoachInfo(_coachInfoCache); return; }
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      const data = snap.data();
      if (!data?.coachUid) return;
      const coachUid = data.coachUid;
      Promise.all([
        getDoc(doc(db, 'users', coachUid)),
        getDoc(doc(db, 'coachStudents', coachUid, 'students', uid)),
      ]).then(([coachSnap, studentSnap]) => {
        if (!coachSnap.exists()) return;
        const cd = coachSnap.data();
        const joinedAt = studentSnap.data()?.joinedAt;
        const info = { uid: coachUid, pseudo: cd.pseudo ?? 'Coach', photoUrl: cd.photoUrl, joinedAt };
        _coachInfoCache = info;
        setCoachInfo(info);
      });
    });
  }, []);

  const doRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  const toggleDone = (scId: string, currentDone: boolean, dayIdx: number) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !plan) return;
    // Validation uniquement autorisée le jour J (annulation aussi)
    if (dayIdx !== todayDayIdx) return;
    const newVal = !currentDone;
    setCompletedMap((prev) => ({ ...prev, [scId]: newVal }));
    toggleStudentScheduleItem(uid, scId, newVal)
      .then(async () => {
        const updatedSchedule = (plan.schedule ?? []).map((s: any) =>
          s.id === scId ? { ...s, completed: newVal } : s
        );
        const updatedPlan = { ...plan, schedule: updatedSchedule };
        syncTrainingStats(updatedPlan as any).catch(() => {});
        // +10 pts club + GoshOff — limité à 1 fois par jour
        if (newVal) {
          const { addDailySessionPoints } = await import('../../utils/clubUtils');
          addDailySessionPoints(uid).catch(() => {});
        }
      })
      .catch(() => {
        setCompletedMap((prev) => ({ ...prev, [scId]: currentDone }));
      });
  };

  const handleStopCoaching = () => {
    Alert.alert(
      'Arrêter le coaching',
      'Tu vas quitter le programme de ton coach. Ton compte repassera en standard. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Arrêter le coaching',
          style: 'destructive',
          onPress: async () => {
            const uid = auth.currentUser?.uid;
            if (!uid || !coachInfo) return;
            setStopping(true);
            try {
              await stopCoaching(uid, coachInfo.uid);
              // Vider le cache et le plan immédiatement sans attendre le snapshot
              _coachInfoCache = null;
              setCoachInfo(null);
              onClearPlan();
            } catch (e) {
              Alert.alert('Erreur', 'Impossible d\'arrêter le coaching. Réessaie.');
            } finally {
              setStopping(false);
            }
          },
        },
      ]
    );
  };

  const sts = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    tabRow: { flexDirection: 'row' as const, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' as const },
    tabBtnActive: { borderBottomWidth: 2, borderBottomColor: colors.accent },
    tabText: { fontSize: 15, fontWeight: '600' as const, color: colors.textSecondary },
    tabTextActive: { color: colors.text },
    dayCard: { backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    dayTitle: { color: colors.text, fontSize: 16, fontWeight: '700' as const },
    restText: { color: colors.textSecondary, fontSize: 14 },
    chip: { backgroundColor: colors.bg, borderRadius: 12, padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.accent, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginTop: spacing.xs, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, minHeight: 56 },
    chipDone: { borderLeftColor: colors.accentGreen, opacity: 0.7 },
    chipInfo: { flex: 1 },
    chipName: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    chipMuscles: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
    doneBtn: { backgroundColor: colors.accentGreen + '22', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, minHeight: 40, alignItems: 'center' as const, justifyContent: 'center' as const },
    doneBtnText: { color: colors.accentGreen, fontSize: 13, fontWeight: '700' as const },
    undoBtn: { backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, minHeight: 40, alignItems: 'center' as const, justifyContent: 'center' as const },
    undoBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' as const },
    empty: { color: colors.textSecondary, fontSize: 15, textAlign: 'center' as const, marginTop: 60, lineHeight: 24 },
  }), [colors]);

  const coachingDuration = coachInfo?.joinedAt
    ? (() => {
        const days = Math.floor((Date.now() - coachInfo.joinedAt) / (1000 * 60 * 60 * 24));
        if (days < 7) return `${days} jour${days > 1 ? 's' : ''}`;
        if (days < 30) return `${Math.floor(days / 7)} semaine${Math.floor(days / 7) > 1 ? 's' : ''}`;
        return `${Math.floor(days / 30)} mois`;
      })()
    : null;

  return (
    <SafeAreaView style={sts.screen} edges={[]}>
      {/* Onglets */}
      <View style={sts.tabRow}>
        {(['trainings', 'coaching'] as const).map((tab) => (
          <TouchableOpacity key={tab} style={[sts.tabBtn, activeTab === tab && sts.tabBtnActive]} onPress={() => switchTab(tab)}>
            <Text style={[sts.tabText, activeTab === tab && sts.tabTextActive]}>
              {tab === 'trainings' ? 'Mes trainings' : 'Mon coaching'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={doRefresh} tintColor={colors.accent} />}
      >
        {/* ─── Mes trainings ─── */}
        <View style={{ display: activeTab === 'trainings' ? 'flex' : 'none' }}>
          <View>
            {updatedAt && (
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: spacing.md }}>
                Mis à jour le {new Date(updatedAt).toLocaleDateString('fr-FR')} par ton coach
              </Text>
            )}
            {!plan ? (
              <Text style={sts.empty}>{'En attente de planification\nde ton coach'}</Text>
            ) : (
              DAY_LABELS.map((dayLabel, idx) => {
                const scheduled = (plan.schedule ?? []).filter((s: any) => (s.dayOfWeek ?? s.dayIndex) === idx);
                return (
                  <View key={dayLabel} style={sts.dayCard}>
                    <Text style={sts.dayTitle}>{dayLabel}</Text>
                    {scheduled.length === 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="moon-outline" size={13} color={colors.textSecondary} />
                        <Text style={sts.restText}>Repos</Text>
                      </View>
                    ) : scheduled.map((sc: any) => {
                      const session = (plan.sessions ?? []).find((s: any) => s.id === sc.sessionId);
                      const isDone = completedMap[sc.id] ?? sc.completed ?? false;
                      const isExpanded = expandedSessions.has(sc.id);
                      const exos: any[] = session?.exercises ?? [];
                      const totalSets = exos.reduce((acc: number, e: any) => acc + (e.sets ?? 0), 0);
                      const uniqueMuscles = [...new Set(exos.map((e: any) => e.muscle).filter(Boolean))] as string[];
                      const accentColor = isDone ? colors.accentGreen : colors.accent;
                      return (
                        <View key={sc.id} style={{ backgroundColor: colors.card, borderRadius: 20, overflow: 'hidden', marginTop: 8, borderWidth: 1, borderColor: isDone ? colors.accentGreen + '44' : colors.border }}>

                          {/* ── Barre colorée haut ── */}
                          <View style={{ height: 3, backgroundColor: accentColor }} />

                          {/* ── Header carte ── */}
                          <TouchableOpacity
                            onPress={() => toggleExpanded(sc.id)}
                            activeOpacity={0.8}
                            style={{ padding: 16, gap: 10 }}
                          >
                            {/* Ligne 1 : nom + heure + chevron */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>
                                  {session?.name ?? '—'}
                                </Text>
                                {sc.time ? (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                                    <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{sc.time}</Text>
                                  </View>
                                ) : null}
                              </View>
                              {isDone ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accentGreen + '18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                                  <Ionicons name="checkmark-circle" size={14} color={colors.accentGreen} />
                                  <Text style={{ color: colors.accentGreen, fontSize: 12, fontWeight: '700' }}>Effectué</Text>
                                </View>
                              ) : null}
                              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
                            </View>

                            {/* Ligne 2 : chips muscles + stats */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                              {uniqueMuscles.slice(0, 4).map((m) => (
                                <View key={m} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.accent + '20' }}>
                                  <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>
                                    {MUSCLE_LABELS[m as keyof typeof MUSCLE_LABELS] ?? m}
                                  </Text>
                                </View>
                              ))}
                              <View style={{ marginLeft: 'auto' as any, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={{ alignItems: 'center' }}>
                                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{exos.length}</Text>
                                  <Text style={{ color: colors.textSecondary, fontSize: 10 }}>exos</Text>
                                </View>
                                <View style={{ width: 1, height: 20, backgroundColor: colors.border }} />
                                <View style={{ alignItems: 'center' }}>
                                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{totalSets}</Text>
                                  <Text style={{ color: colors.textSecondary, fontSize: 10 }}>séries</Text>
                                </View>
                              </View>
                            </View>
                          </TouchableOpacity>

                          {/* ── Détail exercices (expand) ── */}
                          {isExpanded && (
                            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>

                              {/* Note du coach en premier si présente */}
                              {sc.coachNote ? (
                                <View style={{ margin: 12, marginBottom: 4, padding: 14, backgroundColor: colors.accent + '10', borderRadius: 14, gap: 6, borderWidth: 1, borderColor: colors.accent + '30' }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                                      <Ionicons name="chatbox" size={13} color={colors.accent} />
                                    </View>
                                    <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' }}>Note de ton coach</Text>
                                  </View>
                                  <Text style={{ color: colors.text, fontSize: 14, lineHeight: 21 }}>{sc.coachNote}</Text>
                                </View>
                              ) : null}

                              {/* Exercices */}
                              <View style={{ padding: 12, gap: 10 }}>
                                {exos.map((ex: any, exIdx: number) => {
                                  return (
                                    <View key={ex.id ?? exIdx} style={{ backgroundColor: colors.bg, borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                                      {/* Barre accent gauche */}
                                      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors.accent }} />

                                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 12, paddingVertical: 14, gap: 10 }}>
                                        {/* Numéro */}
                                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '800', width: 18, textAlign: 'center' }}>{exIdx + 1}</Text>

                                        {/* Nom + muscle */}
                                        <View style={{ flex: 1, gap: 4 }}>
                                          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 }}>{ex.name || `Exercice ${exIdx + 1}`}</Text>
                                          {ex.muscle ? (
                                            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.accent + '20' }}>
                                              <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '700' }}>
                                                {MUSCLE_LABELS[ex.muscle as keyof typeof MUSCLE_LABELS] ?? ex.muscle}
                                              </Text>
                                            </View>
                                          ) : null}
                                        </View>

                                        {/* Séries × Reps */}
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                          <View style={{ alignItems: 'center', minWidth: 36 }}>
                                            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '900', lineHeight: 26 }}>{ex.sets}</Text>
                                            <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 }}>séries</Text>
                                          </View>
                                          <Text style={{ color: colors.textSecondary, fontSize: 18, fontWeight: '300', marginBottom: 12, paddingHorizontal: 2 }}>×</Text>
                                          <View style={{ alignItems: 'center', minWidth: 36 }}>
                                            <Text style={{ color: accentColor, fontSize: 22, fontWeight: '900', lineHeight: 26 }}>{ex.reps}</Text>
                                            <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 }}>reps</Text>
                                          </View>
                                        </View>
                                      </View>
                                    </View>
                                  );
                                })}
                              </View>

                              {/* Bouton terminer */}
                              <View style={{ padding: 12, paddingTop: 2 }}>
                                <TouchableOpacity
                                  style={{
                                    height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                                    flexDirection: 'row', gap: 8,
                                    backgroundColor: isDone ? colors.accentGreen + '18' : idx === todayDayIdx ? accentColor : colors.surface,
                                    borderWidth: isDone ? 1 : 0,
                                    borderColor: isDone ? colors.accentGreen + '55' : 'transparent',
                                    opacity: !isDone && idx !== todayDayIdx ? 0.4 : 1,
                                  }}
                                  onPress={() => toggleDone(sc.id, isDone, idx)}
                                  disabled={idx !== todayDayIdx}
                                  activeOpacity={0.8}
                                >
                                  <Ionicons
                                    name={isDone ? 'checkmark-circle' : 'checkmark-circle-outline'}
                                    size={20}
                                    color={isDone ? colors.accentGreen : idx === todayDayIdx ? '#fff' : colors.textSecondary}
                                  />
                                  <Text style={{
                                    fontSize: 15, fontWeight: '700',
                                    color: isDone ? colors.accentGreen : idx === todayDayIdx ? '#fff' : colors.textSecondary,
                                  }}>
                                    {isDone ? 'Séance effectuée' : idx === todayDayIdx ? 'Marquer comme terminée' : 'Pas encore disponible'}
                                  </Text>
                                </TouchableOpacity>
                              </View>

                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* ─── Mon coaching ─── */}
        <View style={{ display: activeTab === 'coaching' ? 'flex' : 'none', gap: spacing.md }}>
            {/* Card coach */}
            {coachInfo ? (
              <View style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, gap: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <TouchableOpacity onPress={() => router.push({ pathname: '/profile', params: { uid: coachInfo.uid } })} activeOpacity={0.8}>
                    {coachInfo.photoUrl ? (
                      <ExpoImage source={{ uri: coachInfo.photoUrl }} style={{ width: 56, height: 56, borderRadius: 28 }} cachePolicy="memory-disk" />
                    ) : (
                      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="person-outline" size={24} color={colors.textSecondary} />
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>{coachInfo.pseudo}</Text>
                      <UserBadge accountType="coach" size={16} />
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Coach personnel</Text>
                  </View>
                </View>

                {/* Stats */}
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center' }}>
                    <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '800' }}>{coachingDuration ?? '—'}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>de coaching</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center' }}>
                    <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '800' }}>{plan?.sessions?.length ?? 0}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>séances planifiées</Text>
                  </View>
                </View>

                {/* Début */}
                {coachInfo.joinedAt && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      Depuis le {new Date(coachInfo.joinedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Aucun coach associé</Text>
              </View>
            )}

            {/* Actions */}
            {coachInfo && (
              <View style={{ gap: spacing.sm }}>
                <TouchableOpacity
                  style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                  onPress={() => router.push({ pathname: '/chat', params: { otherUid: coachInfo.uid, otherPseudo: coachInfo.pseudo } })}
                  activeOpacity={0.7}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="chatbubble-outline" size={17} color={colors.accent} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 }}>Contacter mon coach</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                  onPress={() => router.push({ pathname: '/profile', params: { uid: coachInfo.uid } })}
                  activeOpacity={0.7}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person-outline" size={17} color={colors.textSecondary} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 }}>Voir le profil du coach</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Arrêter le coaching */}
            <View style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Quitter le coaching</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
                Tu peux arrêter le coaching à tout moment. Ton compte repassera en standard et ton programme sera supprimé.
              </Text>
              <Button
                label={stopping ? 'En cours...' : 'Arrêter le coaching'}
                variant="secondary"
                onPress={handleStopCoaching}
                disabled={stopping}
              />
            </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

