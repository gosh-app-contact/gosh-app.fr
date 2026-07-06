import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, StyleSheet, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors, spacing, radius } from '../constants/theme';
import { auth, db } from '../utils/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, getDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { loadTrainingState, saveTrainingState, setTrainingStorageUid } from '../utils/trainingStorage';
import { saveWorkoutLog, computeVolume } from '../utils/workoutLogStorage';
import { TrainingState, WorkoutSession, Exercise, MUSCLE_LABELS } from '../types/training';
import { LoggedExercise, LoggedSet } from '../types/workoutLog';
import Button from '../components/Button';

// ─── Heure Paris ─────────────────────────────────────────────────────────────
function getTodayParis(): string {
  return new Date().toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('/').reverse().join('-');
}

// ─── Pop-up 1RM ───────────────────────────────────────────────────────────────
function OneRmModal({
  exercises,
  onConfirm,
  onSkip,
}: {
  exercises: Exercise[];
  onConfirm: (ids: string[]) => void;
  onSkip: () => void;
}) {
  const colors = useColors();
  const [step, setStep] = useState<'ask' | 'pick'>('ask');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Modal animationType="fade" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: spacing.xl, width: '100%', gap: 20 }}>
          {step === 'ask' ? (
            <>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFB80020', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="trophy-outline" size={28} color="#FFB800" />
                </View>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>
                  Tentative de 1RM aujourd'hui ?
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                  Si tu prévois de tester ta charge maximale sur un exercice, on le traquera séparément de tes séries habituelles.
                </Text>
              </View>
              <View style={{ gap: 10 }}>
                <Button label="Oui, j'ai un 1RM" variant="primary" onPress={() => setStep('pick')} />
                <Button label="Non, séance normale" variant="ghost" onPress={onSkip} />
              </View>
            </>
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Sur quel(s) exercice(s) ?</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Sélectionne les exercices en 1RM</Text>
              </View>
              <View style={{ gap: 8 }}>
                {exercises.map((ex) => {
                  const active = selected.has(ex.id);
                  return (
                    <TouchableOpacity
                      key={ex.id}
                      onPress={() => toggle(ex.id)}
                      activeOpacity={0.8}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        padding: 14, borderRadius: 14,
                        backgroundColor: active ? colors.accent + '18' : colors.bg,
                        borderWidth: 1.5, borderColor: active ? colors.accent : colors.border,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{ex.name}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{MUSCLE_LABELS[ex.muscle]}</Text>
                      </View>
                      <View style={{
                        width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                        borderColor: active ? colors.accent : colors.border,
                        backgroundColor: active ? colors.accent : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {active && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{ gap: 10 }}>
                <Button
                  label="Confirmer"
                  variant="primary"
                  disabled={selected.size === 0}
                  onPress={() => onConfirm(Array.from(selected))}
                />
                <Button label="Retour" variant="ghost" onPress={() => setStep('ask')} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Carte exercice ───────────────────────────────────────────────────────────
function ExerciseCard({
  exercise,
  logged,
  isOneRm,
  onChange,
  lastEx,
}: {
  exercise: Exercise;
  logged: LoggedExercise;
  isOneRm: boolean;
  onChange: (updated: LoggedExercise) => void;
  lastEx?: LoggedExercise;
}) {
  const colors = useColors();
  // Tracks which (setIdx, field) pairs have been manually edited by the user
  const [edited, setEdited] = useState<Set<string>>(new Set());

  const isPrefilled = (setIdx: number, field: 'reps' | 'kg') =>
    lastEx?.mode === 'sets' && !edited.has(`${setIdx}-${field}`);

  const updateSet = (idx: number, field: 'reps' | 'kg', raw: string) => {
    setEdited((prev) => { const n = new Set(prev); n.add(`${idx}-${field}`); return n; });
    const val = raw === '' ? 0 : parseFloat(raw.replace(',', '.')) || 0;
    const newSets = logged.sets.map((s, i) => i === idx ? { ...s, [field]: val } : s);
    onChange({ ...logged, sets: newSets });
  };

  const toggleDone = (idx: number) => {
    const newSets = logged.sets.map((s, i) => i === idx ? { ...s, done: !s.done } : s);
    onChange({ ...logged, sets: newSets });
  };

  const updateOneRm = (raw: string) => {
    const val = raw === '' ? 0 : parseFloat(raw.replace(',', '.')) || 0;
    onChange({ ...logged, oneRmKg: val });
  };

  const allDone = isOneRm
    ? (logged.oneRmKg ?? 0) > 0
    : logged.sets.every((s) => s.done);

  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: 20,
      borderWidth: isOneRm ? 1.5 : StyleSheet.hairlineWidth,
      borderColor: isOneRm ? '#FFB800' : colors.border,
      overflow: 'hidden', marginBottom: spacing.md,
    }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: isOneRm ? '#FFB80012' : 'transparent',
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
      }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isOneRm ? '#FFB80030' : colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={isOneRm ? 'trophy' : 'barbell-outline'} size={18} color={isOneRm ? '#FFB800' : colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{exercise.name}</Text>
          <Text style={{ color: isOneRm ? '#FFB800' : colors.textSecondary, fontSize: 12, marginTop: 1 }}>
            {isOneRm ? '1RM — charge maximale' : `${exercise.sets} séries × ${exercise.reps} reps · ${MUSCLE_LABELS[exercise.muscle]}`}
          </Text>
        </View>
        {allDone && (
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#34C75930', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={16} color="#34C759" />
          </View>
        )}
      </View>

      {/* Référence dernière séance */}
      {lastEx && !isOneRm && lastEx.mode === 'sets' && lastEx.sets.filter(s => s.done).length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>Dernière fois :</Text>
          {lastEx.sets.filter(s => s.done).map((s, i) => (
            <View key={i} style={{ backgroundColor: colors.card, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                S{i + 1} <Text style={{ color: colors.text, fontWeight: '700' }}>{s.reps}r × {s.kg}kg</Text>
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        {isOneRm ? (
          /* ── Mode 1RM ── */
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>Charge (kg)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TextInput
                style={{
                  flex: 1, backgroundColor: colors.bg, borderRadius: 14,
                  borderWidth: 1.5, borderColor: '#FFB800',
                  paddingHorizontal: 16, paddingVertical: 14,
                  color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center',
                }}
                value={logged.oneRmKg ? String(logged.oneRmKg) : ''}
                onChangeText={updateOneRm}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
              <Text style={{ color: '#FFB800', fontSize: 18, fontWeight: '700' }}>kg</Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>1 répétition · charge maximale</Text>
          </View>
        ) : (
          /* ── Mode séries ── */
          <>
            {/* En-têtes colonnes */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
              <Text style={{ width: 28, color: colors.textSecondary, fontSize: 11, fontWeight: '700', textAlign: 'center' }}>#</Text>
              <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 11, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase' }}>Reps</Text>
              <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 11, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase' }}>kg</Text>
              <Text style={{ width: 44, color: colors.textSecondary, fontSize: 11, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase' }}>✓</Text>
            </View>

            {/* Lignes séries */}
            {logged.sets.map((s, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: s.done ? colors.accent : colors.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: s.done ? colors.accent : colors.border }}>
                  <Text style={{ color: s.done ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{idx + 1}</Text>
                </View>

                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: s.done ? colors.accent + '12' : isPrefilled(idx, 'reps') ? colors.surface : colors.bg,
                    borderRadius: 12, borderWidth: 1,
                    borderColor: s.done ? colors.accent + '60' : isPrefilled(idx, 'reps') ? colors.border : colors.border,
                    paddingVertical: 12, fontSize: 17, fontWeight: '700', textAlign: 'center',
                    color: s.done ? colors.text : isPrefilled(idx, 'reps') ? colors.textSecondary : colors.text,
                  }}
                  value={s.reps > 0 ? String(s.reps) : ''}
                  onFocus={() => { if (isPrefilled(idx, 'reps')) updateSet(idx, 'reps', ''); }}
                  onChangeText={(v) => updateSet(idx, 'reps', v)}
                  placeholder={String(exercise.reps)}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  returnKeyType="next"
                />

                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: s.done ? colors.accent + '12' : isPrefilled(idx, 'kg') ? colors.surface : colors.bg,
                    borderRadius: 12, borderWidth: 1,
                    borderColor: s.done ? colors.accent + '60' : colors.border,
                    paddingVertical: 12, fontSize: 17, fontWeight: '700', textAlign: 'center',
                    color: s.done ? colors.text : isPrefilled(idx, 'kg') ? colors.textSecondary : colors.text,
                  }}
                  value={s.kg > 0 ? String(s.kg) : ''}
                  onFocus={() => { if (isPrefilled(idx, 'kg')) updateSet(idx, 'kg', ''); }}
                  onChangeText={(v) => updateSet(idx, 'kg', v)}
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <TouchableOpacity
                  onPress={() => toggleDone(idx)}
                  style={{
                    width: 44, height: 44, borderRadius: 14,
                    backgroundColor: s.done ? '#34C759' : colors.bg,
                    borderWidth: 1.5, borderColor: s.done ? '#34C759' : colors.border,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Ionicons name="checkmark" size={20} color={s.done ? '#fff' : colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────
export default function WorkoutSessionScreen() {
  const colors = useColors();
  const router = useRouter();
  const { scheduledId, sessionId, startTime: startTimeParam } = useLocalSearchParams<{ scheduledId: string; sessionId: string; startTime: string }>();
  const startTimeMs = useRef<number>(parseInt(startTimeParam ?? '0') || Date.now());

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [trainingState, setTrainingState] = useState<TrainingState | null>(null);
  const [oneRmSlugs, setOneRmSlugs] = useState<Set<string> | null>(null);
  const [loggedExercises, setLoggedExercises] = useState<LoggedExercise[]>([]);
  const [lastSessionExercises, setLastSessionExercises] = useState<Record<string, LoggedExercise>>({});
  const [saving, setSaving] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [myClubId, setMyClubId] = useState<string | null>(null);
  const [myClubName, setMyClubName] = useState<string>('');
  const [resumeModal, setResumeModal] = useState(false);
  const [customSessionName, setCustomSessionName] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [accountType, setAccountType] = useState<string>('standard');
  const [coachUid, setCoachUid] = useState<string | null>(null);
  const profileIdRef = useRef<string>('default');
  const finishCalledRef = useRef(false);

  // Timer live
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeMs.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  // Charger la séance depuis le training state
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setTrainingStorageUid(uid);
    import('../utils/storage').then(({ loadState }) => loadState()).then(async (appState) => {
      const profileId = appState?.profiles?.[0]?.id ?? 'default';
      profileIdRef.current = profileId;

      // Charger accountType + coachUid en premier pour savoir quelle source utiliser
      const mySnap = await getDoc(doc(db, 'users', uid));
      const myData = mySnap.data() ?? {};
      const myAccountType = myData.accountType ?? 'standard';
      setAccountType(myAccountType);
      setCoachUid(myData.coachUid ?? null);

      let found: any = null;
      if (myAccountType === 'student') {
        // Plan envoyé par le coach — source Firestore uniquement
        const { loadStudentTrainingPlan } = await import('../utils/coachStorage');
        const plan = await loadStudentTrainingPlan(uid);
        if (plan) {
          setTrainingState(plan);
          found = (plan.sessions ?? []).find((s: any) => s.id === sessionId) ?? null;
        }
      } else {
        const ts = await loadTrainingState(profileId);
        setTrainingState(ts);
        found = ts.sessions.find((s) => s.id === sessionId) ?? null;
      }
      setSession(found);
      if (!found) return;

      // Charger la dernière séance du même nom pour pré-remplir
      const { getWorkoutLogs } = await import('../utils/workoutLogStorage');
      const logs = await getWorkoutLogs(uid).catch(() => []);
      const lastLog = logs.find((l) => l.sessionName === found.name || l.sessionId === found.id);
      const lastMap: Record<string, LoggedExercise> = {};
      if (lastLog) {
        lastLog.exercises.forEach((ex) => { lastMap[ex.exerciseSlug] = ex; });
        setLastSessionExercises(lastMap);
      }

      // Initialiser les exercices : pré-remplir depuis la dernière séance si dispo
      setLoggedExercises(found.exercises.map((ex: any) => {
        const prev = lastMap[ex.slug];
        if (prev?.mode === 'sets' && prev.sets.length > 0) {
          return {
            exerciseSlug: ex.slug,
            exerciseName: ex.name,
            mode: 'sets' as const,
            sets: prev.sets.map((s) => ({ reps: s.reps, kg: s.kg, done: false })),
          };
        }
        return {
          exerciseSlug: ex.slug,
          exerciseName: ex.name,
          mode: 'sets' as const,
          sets: Array.from({ length: ex.sets }, () => ({ reps: ex.reps, kg: 0, done: false })),
        };
      }));
    });
  }, [sessionId]);

  // Quand l'utilisateur répond au modal 1RM
  const handleOneRmConfirm = (ids: string[]) => {
    const idSet = new Set(ids);
    setOneRmSlugs(new Set()); // modal fermée
    setLoggedExercises((prev) =>
      prev.map((ex, idx) =>
        idSet.has(session?.exercises[idx]?.id ?? '')
          ? { ...ex, mode: '1rm', sets: [], oneRmKg: 0 }
          : ex
      )
    );
  };

  const handleOneRmSkip = () => setOneRmSlugs(new Set());

  const updateExercise = (idx: number, updated: LoggedExercise) => {
    setLoggedExercises((prev) => prev.map((e, i) => i === idx ? updated : e));
  };

  // Le bouton Terminé est accessible quand tous les exercices sont complétés
  const allDone = useMemo(() => {
    if (loggedExercises.length === 0) return false;
    return loggedExercises.every((ex) => {
      if (ex.mode === '1rm') return (ex.oneRmKg ?? 0) > 0;
      return ex.sets.every((s) => s.done);
    });
  }, [loggedExercises]);

  const handleFinish = () => {
    if (finishCalledRef.current) return;
    if (!session) return;
    setCustomSessionName(session.name);
    setResumeModal(true);
  };

  const handleSave = async () => {
    if (finishCalledRef.current) return;
    finishCalledRef.current = true;
    const uid = auth.currentUser?.uid;
    if (!uid || !session || !trainingState) { finishCalledRef.current = false; return; }
    setResumeModal(false);
    setSaving(true);
    const completedAt = Date.now();
    const duration = completedAt - startTimeMs.current;
    try {
      // 1. Sauvegarder le log de performance
      await saveWorkoutLog(uid, {
        sessionId: session.id,
        sessionName: customSessionName.trim() || session.name,
        scheduledId: scheduledId ?? '',
        date: getTodayParis(),
        completedAt,
        duration,
        exercises: loggedExercises,
      });

      // 2. Marquer la séance comme complétée dans le planning
      const nextState: TrainingState = {
        ...trainingState,
        schedule: trainingState.schedule.map((s) =>
          s.id === scheduledId ? { ...s, completed: true } : s
        ),
      };
      await saveTrainingState(nextState, profileIdRef.current, true);

      // 2b. Pour les élèves, mettre à jour studentTraining/{uid} (lu par le coach)
      if (accountType === 'student' && scheduledId) {
        const updatedSchedule = (trainingState.schedule ?? []).map((s: any) =>
          s.id === scheduledId ? { ...s, completed: true } : s
        );
        updateDoc(doc(db, 'studentTraining', uid), { schedule: updatedSchedule }).catch(() => {});
      }

      // 3. Points club + GoshOff
      const { addDailySessionPoints } = await import('../utils/clubUtils');
      addDailySessionPoints(uid).catch(() => {});

      // 4. Chercher le club de l'utilisateur pour proposer le partage
      const clubSnap = await getDocs(query(collection(db, 'clubs'), where('memberIds', 'array-contains', uid)));
      if (!clubSnap.empty) {
        const clubDoc = clubSnap.docs[0];
        setMyClubId(clubDoc.id);
        setMyClubName((clubDoc.data() as any).name ?? 'mon club');
        setShareModal(true);
      } else {
        router.back();
      }
    } catch {
      finishCalledRef.current = false;
      Alert.alert('Erreur', 'Impossible de sauvegarder la séance.');
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !myClubId || !session) return;
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      const userData = userSnap.data() ?? {};
      const tonnage = computeVolume(loggedExercises);
      await addDoc(collection(db, 'clubs', myClubId, 'messages'), {
        uid,
        pseudo: userData.pseudo ?? '',
        prenom: userData.prenom ?? '',
        senderPhoto: userData.photoUrl ?? null,
        type: 'workout',
        workoutSessionName: session.name,
        workoutTonnage: tonnage,
        workoutDate: getTodayParis(),
        workoutExercises: loggedExercises.map((ex) => ({
          name: ex.exerciseName,
          mode: ex.mode,
          sets: ex.sets,
          oneRmKg: ex.oneRmKg ?? null,
        })),
        createdAt: serverTimestamp(),
      });
    } catch {
      // partage échoue silencieusement
    }
    setShareModal(false);
    router.back();
  };

  const handleShareWithCoach = async () => {
    if (finishCalledRef.current) return;
    finishCalledRef.current = true;
    const uid = auth.currentUser?.uid;
    if (!uid || !coachUid || !session || !trainingState) { finishCalledRef.current = false; return; }
    setResumeModal(false);
    setSaving(true);
    const completedAt = Date.now();
    const duration = completedAt - startTimeMs.current;
    try {
      // 1. Sauvegarder le log de performance
      await saveWorkoutLog(uid, {
        sessionId: session.id,
        sessionName: customSessionName.trim() || session.name,
        scheduledId: scheduledId ?? '',
        date: getTodayParis(),
        completedAt,
        duration,
        exercises: loggedExercises,
      });

      // 2. Marquer la séance comme complétée dans le planning
      const nextState: TrainingState = {
        ...trainingState,
        schedule: trainingState.schedule.map((s) =>
          s.id === scheduledId ? { ...s, completed: true } : s
        ),
      };
      await saveTrainingState(nextState, profileIdRef.current, true);

      // 2b. Mettre à jour studentTraining/{uid} pour que le coach voie la complétion
      if (scheduledId) {
        const updatedSchedule = (trainingState.schedule ?? []).map((s: any) =>
          s.id === scheduledId ? { ...s, completed: true } : s
        );
        updateDoc(doc(db, 'studentTraining', uid), { schedule: updatedSchedule }).catch(() => {});
      }

      // 3. Points club
      const { addDailySessionPoints } = await import('../utils/clubUtils');
      addDailySessionPoints(uid).catch(() => {});

      // 4. Envoyer au coach via le chat
      const userSnap = await getDoc(doc(db, 'users', uid));
      const userData = userSnap.data() ?? {};
      const tonnage = computeVolume(loggedExercises);
      const participants = [uid, coachUid].sort();
      const chatId = participants.join('_');
      const chatRef = doc(db, 'chats', chatId);
      await setDoc(chatRef, {
        participants,
        lastMessageAt: serverTimestamp(),
        lastSenderUid: uid,
        lastMessage: 'Partage de séance',
        [`pseudo_${uid}`]: userData.pseudo ?? userData.prenom ?? '',
      }, { merge: true });
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        uid,
        pseudo: userData.pseudo ?? '',
        prenom: userData.prenom ?? '',
        senderPhoto: userData.photoUrl ?? null,
        type: 'workout',
        workoutSessionName: customSessionName.trim() || session.name,
        workoutTonnage: tonnage,
        workoutDate: getTodayParis(),
        workoutExercises: loggedExercises.map((ex) => ({
          name: ex.exerciseName,
          mode: ex.mode,
          sets: ex.sets,
          oneRmKg: ex.oneRmKg ?? null,
        })),
        createdAt: serverTimestamp(),
      });

      router.back();
    } catch (e: any) {
      finishCalledRef.current = false;
      Alert.alert('Erreur', 'Impossible de partager la séance avec ton coach.');
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }} edges={['top', 'bottom']}>
        <Text style={{ color: colors.textSecondary }}>Chargement…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      {/* Modal partage club */}
      <Modal visible={shareModal} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 28, padding: spacing.xl, width: '100%', gap: 20 }}>
            {/* Icône */}
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trophy-outline" size={32} color={colors.accent} />
              </View>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
                Belle séance !
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                Partage tes performances dans <Text style={{ color: colors.accent, fontWeight: '700' }}>{myClubName}</Text> pour motiver ton club.
              </Text>
            </View>

            {/* Aperçu de la carte */}
            <View style={{ backgroundColor: colors.bg, borderRadius: 18, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="barbell-outline" size={16} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{session?.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{loggedExercises.length} exercice{loggedExercises.length > 1 ? 's' : ''}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 10, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>Tonnage</Text>
                  <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '800', marginTop: 2 }}>{computeVolume(loggedExercises)} kg</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 10, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>Exercices</Text>
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 }}>{loggedExercises.length}</Text>
                </View>
              </View>
            </View>

            {/* Actions */}
            <View style={{ gap: 10 }}>
              <Button label="Partager dans le club" variant="primary" onPress={handleShare} />
              <Button label="Non merci" variant="ghost" onPress={() => { setShareModal(false); router.back(); }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 1RM au démarrage */}
      {oneRmSlugs === null && session.exercises.length > 0 && (
        <OneRmModal
          exercises={session.exercises}
          onConfirm={handleOneRmConfirm}
          onSkip={handleOneRmSkip}
        />
      )}

      {/* Modal résumé de fin de séance */}
      <Modal visible={resumeModal} animationType="slide" transparent onRequestClose={() => setResumeModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, gap: spacing.md }}>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 8 }}>Séance terminée</Text>
              </View>

              {/* Stats */}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 16, padding: spacing.md, alignItems: 'center', gap: 4 }}>
                  <Ionicons name="time-outline" size={20} color={colors.accent} />
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{formatDuration(elapsed)}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>Durée</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 16, padding: spacing.md, alignItems: 'center', gap: 4 }}>
                  <Ionicons name="barbell-outline" size={20} color={colors.accent} />
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{computeVolume(loggedExercises)} kg</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>Volume total</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 16, padding: spacing.md, alignItems: 'center', gap: 4 }}>
                  <Ionicons name="layers-outline" size={20} color={colors.accent} />
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>
                    {loggedExercises.reduce((t, ex) => t + (ex.mode === 'sets' ? ex.sets.filter(s => s.done).length : 1), 0)}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>Séries</Text>
                </View>
              </View>

              {/* Nom de la séance */}
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Nom de la séance</Text>
                {accountType === 'student' ? (
                  <View style={{ backgroundColor: colors.bg, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{session?.name}</Text>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={{
                        backgroundColor: colors.bg, borderRadius: 14,
                        borderWidth: 1.5, borderColor: colors.accent,
                        paddingHorizontal: 16, paddingVertical: 14,
                        color: colors.text, fontSize: 16, fontWeight: '600',
                      }}
                      value={customSessionName}
                      onChangeText={setCustomSessionName}
                      placeholder={session?.name ?? ''}
                      placeholderTextColor={colors.textSecondary}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      Ce nom sera utilisé pour regrouper tes séances dans les statistiques.
                    </Text>
                  </>
                )}
              </View>

              <Button label={saving ? 'Sauvegarde…' : 'Enregistrer la séance'} variant="primary" onPress={handleSave} disabled={saving} loading={saving} />
              {accountType === 'student' && coachUid && (
                <Button
                  label="Partager avec mon coach"
                  variant="secondary"
                  onPress={async () => { await handleShareWithCoach(); }}
                />
              )}
              <Button label="Continuer la séance" variant="ghost" onPress={() => setResumeModal(false)} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: spacing.md, paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
      }}>
        <TouchableOpacity
          onPress={() => Alert.alert('Quitter la séance ?', 'Ta progression ne sera pas sauvegardée.', [
            { text: 'Continuer la séance', style: 'cancel' },
            { text: 'Quitter', style: 'destructive', onPress: () => router.back() },
          ])}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>{session.name}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {session.exercises.length} exercice{session.exercises.length > 1 ? 's' : ''} · {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
        {/* Chrono live */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent + '18', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
          <Ionicons name="time-outline" size={14} color={colors.accent} />
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{formatDuration(elapsed)}</Text>
        </View>
      </View>

      {/* Contenu */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {session.exercises.map((ex, idx) => {
            const logged = loggedExercises[idx];
            if (!logged) return null;
            const isOneRm = logged.mode === '1rm';
            return (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                logged={logged}
                isOneRm={isOneRm}
                onChange={(updated) => updateExercise(idx, updated)}
                lastEx={lastSessionExercises[ex.slug]}
              />
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bouton Terminé flottant */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: spacing.md, paddingBottom: Platform.OS === 'ios' ? 40 : 24, paddingTop: 16,
        backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
      }}>
        <Button
          label={saving ? 'Sauvegarde…' : 'Terminer la séance'}
          variant="primary"
          disabled={!allDone || saving}
          loading={saving}
          onPress={handleFinish}
        />
        {!allDone && (
          <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 6 }}>
            Valide toutes tes séries pour terminer
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}
