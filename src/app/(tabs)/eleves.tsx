import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Button from '../../components/Button';
import PulsingLoader from '../../components/PulsingLoader';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { useColors, spacing, radius } from '../../constants/theme';
import { auth, db } from '../../utils/firebase';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import {
  subscribeCoachRequests, subscribeStudents,
  acceptCoachRequest, rejectCoachRequest,
  saveStudentTrainingPlan, loadStudentTrainingPlan,
  subscribeStudentTrainingPlan, stopCoaching,
  updateScheduledSessionNote,
  loadCoachLibrarySessions,
} from '../../utils/coachStorage';
import { CoachRequest, StudentSummary } from '../../types/coach';
import { loadTrainingState, saveTrainingState } from '../../utils/trainingStorage';
import { calculateTDEE, calculateCalorieGoal } from '../../utils/calculations';
import { loadState } from '../../utils/storage';
import { TrainingState, DAY_LABELS, MUSCLE_LABELS, ALL_MUSCLES, WorkoutSession, ScheduledSession, Exercise, MuscleGroup } from '../../types/training';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { blockUser, unblockUser, sendReport, REPORT_REASONS } from '../../utils/reportUser';
import { EXERCISE_LIBRARY, ExerciseLibraryItem } from '../../utils/exerciseLibrary';
function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ─── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TouchableOpacity onPress={() => onChange(Math.max(min, value - 1))} activeOpacity={0.7}
        style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="remove" size={18} color={value <= min ? colors.textSecondary : colors.text} />
      </TouchableOpacity>
      <Text style={{ width: 44, textAlign: 'center', color: colors.text, fontSize: 19, fontWeight: '700' }}>{value}</Text>
      <TouchableOpacity onPress={() => onChange(Math.min(max, value + 1))} activeOpacity={0.7}
        style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="add" size={18} color={value >= max ? colors.textSecondary : colors.accent} />
      </TouchableOpacity>
    </View>
  );
}

// ─── ExercisePickerField ──────────────────────────────────────────────────────
const MUSCLE_ICONS: Record<string, string> = {
  pecs: 'body-outline', dos: 'arrow-up-outline', epaules: 'arrow-up-circle-outline',
  biceps: 'flash-outline', triceps: 'flash-outline', 'avant-bras': 'hand-left-outline',
  quadriceps: 'walk-outline', ischios: 'walk-outline', fessiers: 'ellipse-outline',
  mollets: 'walk-outline', abdos: 'grid-outline', lombaires: 'git-branch-outline',
  trapezes: 'git-merge-outline',
};

function ExercisePickerField({ value, onSelect }: { value: ExerciseLibraryItem | null; onSelect: (item: ExerciseLibraryItem) => void }) {
  const colors = useColors();
  const [open, setOpen] = React.useState(false);
  const [selectedMuscle, setSelectedMuscle] = React.useState<MuscleGroup | null>(null);
  const [query, setQuery] = React.useState('');

  const exercisesForMuscle = React.useMemo(() => {
    if (!selectedMuscle) return [];
    const base = EXERCISE_LIBRARY.filter((e) => e.muscle === selectedMuscle);
    if (!query.trim()) return base;
    const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return base.filter((e) => e.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
  }, [selectedMuscle, query]);

  const handleClose = () => { setOpen(false); setSelectedMuscle(null); setQuery(''); };

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: value ? colors.accent : colors.border, paddingHorizontal: 14, paddingVertical: 14, minHeight: 52 }}>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            {selectedMuscle ? (
              <TouchableOpacity onPress={() => { setSelectedMuscle(null); setQuery(''); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={24} color={colors.text} />
              </TouchableOpacity>
            ) : <View style={{ width: 24 }} />}
            <Text style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' }}>
              {selectedMuscle ? MUSCLE_LABELS[selectedMuscle] : 'Groupe musculaire'}
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {!selectedMuscle ? (
            <ScrollView contentContainerStyle={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {ALL_MUSCLES.map((muscle) => {
                  const isCurrent = value?.muscle === muscle;
                  return (
                    <TouchableOpacity key={muscle} onPress={() => setSelectedMuscle(muscle)} activeOpacity={0.75}
                      style={{ width: '47%', backgroundColor: isCurrent ? colors.accent + '18' : colors.card, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1.5, borderColor: isCurrent ? colors.accent : colors.border }}>
                      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: isCurrent ? colors.accent : colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={(MUSCLE_ICONS[muscle] ?? 'barbell-outline') as any} size={18} color={isCurrent ? '#fff' : colors.accent} />
                      </View>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{MUSCLE_LABELS[muscle]}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{EXERCISE_LIBRARY.filter((e) => e.muscle === muscle).length} exercices</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <>
              <View style={{ paddingHorizontal: spacing.md, paddingVertical: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
                  <TextInput style={{ flex: 1, color: colors.text, fontSize: 15 }} placeholder="Filtrer…" placeholderTextColor={colors.textSecondary} value={query} onChangeText={setQuery} returnKeyType="search" />
                  {query.length > 0 && <TouchableOpacity onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={colors.textSecondary} /></TouchableOpacity>}
                </View>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 40 }}>
                {exercisesForMuscle.map((item) => {
                  const selected = value?.slug === item.slug;
                  return (
                    <TouchableOpacity key={item.slug} onPress={() => { onSelect(item); handleClose(); }} activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
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

export default function ElevesScreen() {
  const colors = useColors();
  const router = useRouter();
  const navigation = useNavigation();
  const [requests, setRequests] = useState<CoachRequest[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [studentPlanMeta, setStudentPlanMeta] = useState<Record<string, { sessions: number; sent: boolean; done: number; total: number }>>({});
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentSummary | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [studentInfo, setStudentInfo] = useState<Record<string, any> | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [studentPlan, setStudentPlan] = useState<TrainingState | null>(null);
  const [myPlan, setMyPlan] = useState<TrainingState | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [completionMap, setCompletionMap] = useState<Record<string, boolean>>({});
  const unsubPlanRef = useRef<(() => void) | null>(null);
  const uid = auth.currentUser?.uid;
  const [myCoachCode, setMyCoachCode] = useState<string | null>(null);
  const [myBlockedUsers, setMyBlockedUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'users', uid), async (snap) => {
      const data = snap.data() ?? {};
      setMyCoachCode(data.coachCode ?? null);
      const blocked: string[] = data.blockedUsers ?? [];
      setMyBlockedUsers(blocked);
      // Si un élève actif est bloqué, rompre la relation coaching
      setStudents((prev) => {
        const toRemove = prev.filter((s) => blocked.includes(s.uid));
        toRemove.forEach((s) => stopCoaching(s.uid, uid).catch(() => {}));
        return prev.filter((s) => !blocked.includes(s.uid));
      });
    }, () => {});
    return unsub;
  }, [uid]);

  const openStudentMenu = (student: StudentSummary) => {
    const isBlocked = myBlockedUsers.includes(student.uid);
    Alert.alert(student.pseudo, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Arrêter le coaching',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Arrêter le coaching',
            `Es-tu sûr de vouloir arrêter le coaching avec @${student.pseudo} ? Cette action est irréversible.`,
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Arrêter',
                style: 'destructive',
                onPress: async () => {
                  if (!uid) return;
                  await stopCoaching(student.uid, uid).catch(() => {});
                  import('firebase/firestore').then(({ setDoc, doc: firestoreDoc }) => {
                    setDoc(firestoreDoc(db, 'notifications', student.uid, 'items', `coaching_stopped_coach_${uid}`), {
                      type: 'coaching_stopped',
                      fromUid: uid,
                      message: 'Ton coach a mis fin à la relation de coaching.',
                      read: false,
                      createdAt: Date.now(),
                    }).catch(() => {});
                  });
                },
              },
            ],
          );
        },
      },
      {
        text: isBlocked ? 'Débloquer' : 'Bloquer',
        style: isBlocked ? 'default' : 'destructive',
        onPress: async () => {
          if (isBlocked) {
            await unblockUser(student.uid).catch(() => {});
            setMyBlockedUsers((prev) => prev.filter((u) => u !== student.uid));
          } else {
            await blockUser(student.uid).catch(() => {});
            setMyBlockedUsers((prev) => [...prev, student.uid]);
            if (uid) await stopCoaching(student.uid, uid).catch(() => {});
          }
        },
      },
      {
        text: 'Signaler',
        onPress: () => {
          Alert.alert('Signaler', 'Motif du signalement', [
            { text: 'Annuler', style: 'cancel' },
            ...REPORT_REASONS.map((r) => ({
              text: r.label,
              onPress: () => sendReport({ reportedUid: student.uid, reportedPseudo: student.pseudo, contentType: 'user', reason: r.key }).catch(() => {}),
            })),
          ]);
        },
      },
    ]);
  };

  // Alerte si le coach quitte l'onglet sans valider
  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (isDirty) {
        Alert.alert(
          'Planning non validé',
          "Pense à bien valider ton planning pour que ton élève le reçoive.",
          [{ text: 'OK' }]
        );
      }
    });
    return unsub;
  }, [navigation]);

  useFocusEffect(useCallback(() => {
    setIsDirty(false);
  }, []));

  useEffect(() => {
    if (!uid || students.length === 0) return;
    const unsubs = students.map((s) =>
      onSnapshot(doc(db, 'studentTraining', s.uid), (snap) => {
        const plan = snap.exists() ? snap.data() : null;
        const schedule: any[] = plan?.schedule ?? [];
        setStudentPlanMeta((prev) => ({
          ...prev,
          [s.uid]: {
            sessions: (plan?.sessions ?? []).length,
            sent: !!plan?.sentAt,
            total: schedule.length,
            done: schedule.filter((sc: any) => sc.completed === true).length,
          },
        }));
      }, () => {})
    );
    return () => unsubs.forEach((u) => u());
  }, [uid, students]);

  // Listener temps réel sur le plan de l'élève sélectionné (pour voir les completions)
  useEffect(() => {
    unsubPlanRef.current?.();
    unsubPlanRef.current = null;
    setCompletionMap({});
    if (!selectedStudent) return;
    unsubPlanRef.current = subscribeStudentTrainingPlan(selectedStudent.uid, (plan) => {
      if (!plan?.schedule) { setCompletionMap({}); return; }
      const map: Record<string, boolean> = {};
      (plan.schedule as any[]).forEach((sc) => { map[sc.id] = sc.completed ?? false; });
      setCompletionMap(map);
    });
    return () => { unsubPlanRef.current?.(); unsubPlanRef.current = null; };
  }, [selectedStudent?.uid]);

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: { display: selectedStudent ? 'none' : undefined } });
  }, [selectedStudent]);

  useEffect(() => {
    if (!uid) return;
    const unsubReq = subscribeCoachRequests(uid, setRequests);
    const unsubStu = subscribeStudents(uid, async (freshStudents) => {
      // Enrichir les photos depuis users/{uid} (la photo dans coachStudents peut être obsolète)
      const enriched = await Promise.all(freshStudents.map(async (s) => {
        try {
          const snap = await getDoc(doc(db, 'users', s.uid));
          const photoUrl = snap.data()?.photoUrl ?? '';
          if (photoUrl && photoUrl !== s.photoUrl) {
            // Mettre à jour coachStudents pour la prochaine fois
            const { updateDoc: upd, doc: d } = await import('firebase/firestore');
            upd(d(db, 'coachStudents', uid, 'students', s.uid), { photoUrl }).catch(() => {});
            return { ...s, photoUrl };
          }
        } catch {}
        return s;
      }));
      setStudents(enriched);
      // Si l'élève sélectionné a quitté le coaching, revenir à la liste
      setSelectedStudent((prev) => {
        if (!prev) return null;
        return enriched.find((s) => s.uid === prev.uid) ?? null;
      });
    });
    return () => { unsubReq(); unsubStu(); };
  }, [uid]);

  // Écoute en temps réel le profil de l'élève dès qu'il est sélectionné
  useEffect(() => {
    if (!selectedStudent) { setStudentInfo(null); return; }
    const unsub = onSnapshot(doc(db, 'users', selectedStudent.uid), (snap) => {
      setStudentInfo(snap.exists() ? snap.data() : null);
    }, () => {});
    return () => unsub();
  }, [selectedStudent?.uid]);

  // Load my own training plan to use as base for student planning
  useEffect(() => {
    loadState().then((appState) => {
      if (appState) loadTrainingState(appState.activeProfileId).then(setMyPlan);
    });
  }, []);

  const openStudentPlan = async (student: StudentSummary) => {
    setLoadingPlan(true);
    try {
      const snap = await getDoc(doc(db, 'users', student.uid));
      const photoUrl = snap.data()?.photoUrl ?? student.photoUrl ?? '';
      setSelectedStudent({ ...student, photoUrl });
    } catch {
      setSelectedStudent(student);
    }
    const [plan, libSessions] = await Promise.all([
      loadStudentTrainingPlan(student.uid),
      uid ? loadCoachLibrarySessions(uid).catch(() => []) : Promise.resolve([]),
    ]);
    setStudentPlan(plan);
    setLibrarySessions(libSessions.sort((a, b) => a.name.localeCompare(b.name)));
    setLoadingPlan(false);
  };

  const handleAccept = async (req: CoachRequest) => {
    try {
      await acceptCoachRequest(req.id);
    } catch (e) {
      console.error('[handleAccept]', e);
      Alert.alert('Erreur', 'Impossible d\'accepter la demande.');
    }
  };

  const handleReject = async (req: CoachRequest) => {
    Alert.alert('Refuser', `Refuser la demande de ${req.studentPseudo} ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Refuser', style: 'destructive', onPress: async () => {
        await rejectCoachRequest(req.id);
      }},
    ]);
  };

  const assignMyPlanToStudent = async () => {
    if (!selectedStudent || !myPlan || !uid) return;
    Alert.alert(
      'Assigner mon planning',
      `Assigner ton planning d'entraînement à ${selectedStudent.pseudo} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Assigner', onPress: async () => {
          setLoadingPlan(true);
          try {
            await saveStudentTrainingPlan(uid, selectedStudent.uid, myPlan);
            setStudentPlan(myPlan);
            Alert.alert('Succès', 'Planning assigné à l\'élève.');
          } catch {
            Alert.alert('Erreur', 'Impossible d\'assigner le planning.');
          } finally {
            setLoadingPlan(false);
          }
        }},
      ]
    );
  };

  // Modal planification
  type PlanStep = 'name' | 'library' | 'exercises';
  const [addDayModal, setAddDayModal] = useState<{ dayIndex: number; dayLabel: string } | null>(null);
  const [planStep, setPlanStep] = useState<PlanStep>('name');
  const [saving, setSaving] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [draftExercises, setDraftExercises] = useState<Exercise[]>([{ id: genId(), slug: '', name: '', muscle: 'pecs' as MuscleGroup, sets: 3, reps: 10 }]);
  // Edition d'une séance existante
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [librarysessions, setLibrarySessions] = useState<WorkoutSession[]>([]);

  const SESSION_PRESETS = ['Repos', 'Jambes', 'Haut du corps', 'Full body', 'Dos / Biceps', 'Pecs / Triceps', 'Épaules', 'Cardio', 'Abdos'];

  const onRefresh = useCallback(async () => {
    if (!selectedStudent) return;
    setRefreshing(true);
    const plan = await loadStudentTrainingPlan(selectedStudent.uid);
    setStudentPlan(plan);
    setRefreshing(false);
  }, [selectedStudent]);

  const createAndAddSession = async () => {
    if (!newSessionName.trim() || !selectedStudent || !uid) return;
    const exercises: Exercise[] = draftExercises.filter((e) => e.slug);

    if (editingSessionId && studentPlan) {
      // Mode édition : mettre à jour la session existante dans la bibliothèque
      setSaving(true);
      try {
        const updatedSessions = studentPlan.sessions.map((s: any) =>
          s.id === editingSessionId ? { ...s, name: newSessionName.trim(), exercises } : s
        );
        const updatedPlan = { ...studentPlan, sessions: updatedSessions, sentAt: undefined };
        setIsDirty(true);
        await saveStudentTrainingPlan(uid, selectedStudent.uid, updatedPlan);
        const fresh = await loadStudentTrainingPlan(selectedStudent.uid);
        setStudentPlan(fresh ?? updatedPlan);
        setEditingSessionId(null);
        setAddDayModal(null);
      } catch {
        Alert.alert('Erreur', 'Impossible de modifier la séance.');
      } finally {
        setSaving(false);
      }
    } else {
      const newSession: WorkoutSession = { id: genId(), name: newSessionName.trim(), exercises };
      await addSessionToDay(newSession);
    }
    setNewSessionName('');
    setDraftExercises([{ id: genId(), slug: '', name: '', muscle: 'pecs' as MuscleGroup, sets: 3, reps: 10 }]);
    setPlanStep('name');
  };

  const updateDraftExercise = (id: string, partial: Partial<Exercise>) => {
    setDraftExercises((prev) => prev.map((e) => e.id === id ? { ...e, ...partial } : e));
  };

  const addDraftExercise = () => {
    setDraftExercises((prev) => [...prev, { id: genId(), slug: '', name: '', muscle: 'pecs' as MuscleGroup, sets: 3, reps: 10 }]);
  };

  const removeDraftExercise = (id: string) => {
    setDraftExercises((prev) => prev.length > 1 ? prev.filter((e) => e.id !== id) : prev);
  };

  const addSessionToDay = async (session: WorkoutSession) => {
    if (!selectedStudent || !uid || !addDayModal) return;
    setSaving(true);
    try {
      const currentPlan: TrainingState = studentPlan ?? ({
        sessions: [],
        schedule: [],
        weekStartDate: new Date().toISOString().split('T')[0],
        muscleConfigs: [],
      } as any);
      // Ajouter la session à la bibliothèque si absente
      const alreadyInLib = currentPlan.sessions.some((s: any) => s.id === session.id);
      const updatedSessions = alreadyInLib ? currentPlan.sessions : [...currentPlan.sessions, session];
      const newScheduled: ScheduledSession = {
        id: genId(),
        sessionId: session.id,
        dayOfWeek: addDayModal.dayIndex,
        time: '18:00',
        completed: false,
      };
      const updatedPlan: TrainingState = {
        ...currentPlan,
        sessions: updatedSessions,
        schedule: [...(currentPlan.schedule ?? []), newScheduled],
        sentAt: undefined,
      };
      setIsDirty(true);
      await saveStudentTrainingPlan(uid, selectedStudent.uid, updatedPlan);
      // Recharger depuis Firestore pour garantir la cohérence
      const fresh = await loadStudentTrainingPlan(selectedStudent.uid);
      setStudentPlan(fresh ?? updatedPlan);
      setAddDayModal(null);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'ajouter la séance.');
    } finally {
      setSaving(false);
    }
  };

  // Demande confirmation si le planning a déjà été envoyé, puis exécute l'action
  const confirmIfSent = (action: () => void) => {
    if (studentPlan?.sentAt) {
      Alert.alert(
        'Modifier le planning',
        `Vous êtes sûr de vouloir modifier les séances de ${selectedStudent?.pseudo} ?\nLe planning devra être renvoyé.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Modifier', style: 'destructive', onPress: action },
        ]
      );
    } else {
      action();
    }
  };

  const removeSessionFromDay = async (scId: string) => {
    if (!selectedStudent || !uid || !studentPlan) return;
    const updatedPlan = { ...studentPlan, schedule: studentPlan.schedule.filter((s: any) => s.id !== scId), sentAt: undefined };
    setIsDirty(true);
    await saveStudentTrainingPlan(uid, selectedStudent.uid, updatedPlan);
    const fresh = await loadStudentTrainingPlan(selectedStudent.uid);
    setStudentPlan(fresh ?? updatedPlan);
  };

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: spacing.md, gap: spacing.md },
    sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' as const, marginBottom: spacing.xs },
    sectionSub: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.sm },
    // Request cards
    reqCard: { backgroundColor: colors.card, borderRadius: 18, padding: spacing.md, gap: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    reqHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
    reqAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.border },
    reqName: { color: colors.text, fontSize: 16, fontWeight: '700' as const },
    reqSub: { color: colors.textSecondary, fontSize: 14, marginTop: 2 },
    reqBtns: { flexDirection: 'row' as const, gap: 10 },
    acceptBtn: { flex: 1, backgroundColor: colors.accentGreen + '22', borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center' as const },
    acceptText: { color: colors.accentGreen, fontWeight: '700' as const, fontSize: 13 },
    rejectBtn: { flex: 1, backgroundColor: colors.danger + '22', borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center' as const },
    rejectText: { color: colors.danger, fontWeight: '700' as const, fontSize: 13 },
    // Student cards
    studentCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
    studentAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border },
    studentName: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    studentSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    studentArrow: { color: colors.textSecondary, fontSize: 18, marginLeft: 'auto' as const },
    // Plan view
    planHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
    backBtn: { backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
    backText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' as const },
    planTitle: { color: colors.text, fontSize: 18, fontWeight: '800' as const, flex: 1 },
    refreshBtn: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' as const, marginBottom: spacing.md, flexDirection: 'row' as const, justifyContent: 'center' as const, gap: spacing.xs },
    refreshText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' as const },
    dayCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.xs },
    dayHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
    dayTitle: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    addDayBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' as const, marginTop: spacing.xs },
    addDayBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' as const },
    sessionChip: { backgroundColor: colors.bg, borderRadius: radius.sm, padding: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.accent, borderWidth: 1, borderColor: colors.border, marginTop: spacing.xs },
    chipInfo: { flex: 1 },
    chipName: { color: colors.text, fontSize: 14, fontWeight: '700' as const },
    chipMuscles: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    chipRemove: { backgroundColor: colors.danger + '22', borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' as const, marginTop: spacing.xs },
    chipRemoveText: { color: colors.danger, fontSize: 13, fontWeight: '700' as const },
    chipActionBtn: { borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' as const },
    emptyPlan: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' as const, marginTop: 40 },
    emptyCard: { color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' as const },
    noStudents: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' as const, marginTop: 60 },
    badge: { backgroundColor: colors.accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' as const },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' as const },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: '#000000CC', justifyContent: 'flex-end' as const },
    modalCard: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
    modalTitle: { color: colors.text, fontSize: 18, fontWeight: '800' as const },
    modalSub: { color: colors.textSecondary, fontSize: 13 },
    timeInput: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.md, color: colors.text, fontSize: 16, borderWidth: 1, borderColor: colors.border },
    sessionOption: { backgroundColor: colors.bg, borderRadius: radius.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 4 },
    sessionOptionName: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    sessionOptionMuscles: { color: colors.textSecondary, fontSize: 12 },
    cancelBtn: { padding: spacing.md, alignItems: 'center' as const },
    cancelText: { color: colors.textSecondary, fontSize: 15 },
  }), [colors]);

  // ─── Info modal ─────────────────────────────────────────────────────────────
  const renderInfoModal = () => {
    if (!studentInfo || !selectedStudent) return null;
    const bmi = studentInfo.height && studentInfo.weight
      ? (studentInfo.weight / ((studentInfo.height / 100) ** 2)).toFixed(1)
      : null;
    const bmiNum = bmi ? parseFloat(bmi) : null;
    const bmiLabel = bmiNum
      ? bmiNum < 18.5 ? 'Insuffisance pondérale'
        : bmiNum < 25 ? 'Corpulence normale'
        : bmiNum < 30 ? 'Surpoids'
        : 'Obésité'
      : null;
    const bmiColor = bmiNum
      ? bmiNum < 18.5 ? colors.accent
        : bmiNum < 25 ? colors.accentGreen
        : bmiNum < 30 ? '#F59E0B'
        : colors.danger
      : colors.textSecondary;
    const PHASE_LABELS: Record<string, string> = {
      'pre-preparation': 'Préparation',
      'deficit-down': 'Déficit (descente)',
      'deficit-up': 'Déficit (remontée)',
      'reverse-diet': 'Reverse diet',
      'bulk': 'Bulk',
    };
    const PHASE_ICONS: Record<string, string> = {
      'pre-preparation': 'hourglass-outline',
      'deficit-down': 'trending-down-outline',
      'deficit-up': 'trending-up-outline',
      'reverse-diet': 'refresh-outline',
      'bulk': 'barbell-outline',
    };
    const SEX_LABELS: Record<string, string> = { male: 'Homme', female: 'Femme' };
    const sessionsThisWeek = (studentPlan?.schedule ?? []).length;
    const joinedAt = selectedStudent.joinedAt
      ? new Date(selectedStudent.joinedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      : '—';
    const age = studentInfo.age ? `${studentInfo.age} ans` : '—';
    const phase = studentInfo.phase ?? null;

    const InfoRow = ({ icon, label, value, valueColor, isLast }: { icon: string; label: string; value: string; valueColor?: string; isLast?: boolean }) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.border, minHeight: 52 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
          <Ionicons name={icon as any} size={17} color={colors.accent} />
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 15, flex: 1 }}>{label}</Text>
        <Text style={{ color: valueColor ?? colors.text, fontSize: 15, fontWeight: '700' }}>{value}</Text>
      </View>
    );

    return (
      <Modal visible={showInfoModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowInfoModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>

          {/* ── Header ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            <TouchableOpacity
              onPress={() => setShowInfoModal(false)}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="chevron-down" size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>Profil de l'élève</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Carte identité ── */}
            <View style={{ backgroundColor: colors.card, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 20, alignItems: 'center', gap: 14 }}>
              {selectedStudent.photoUrl?.startsWith('http') ? (
                <ExpoImage
                  source={{ uri: selectedStudent.photoUrl }}
                  style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: colors.accent }}
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.accent + '22', borderWidth: 3, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.accent, fontSize: 30, fontWeight: '800' }}>{selectedStudent.pseudo?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
              )}
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 }}>{selectedStudent.pseudo}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{SEX_LABELS[studentInfo.sex] ?? '—'} · {age}</Text>
              </View>

              {/* ── Stats chips ── */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                {studentInfo.height ? (
                  <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                    <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{studentInfo.height}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>cm</Text>
                  </View>
                ) : null}
                {studentInfo.weight ? (
                  <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                    <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{studentInfo.weight}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>kg</Text>
                  </View>
                ) : null}
                {bmi ? (
                  <View style={{ flex: 1, backgroundColor: bmiColor + '14', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: bmiColor + '40' }}>
                    <Text style={{ color: bmiColor, fontSize: 20, fontWeight: '800' }}>{bmi}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>IMC</Text>
                  </View>
                ) : null}
                <View style={{ flex: 1, backgroundColor: colors.accent + '14', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent + '40' }}>
                  <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '800' }}>{sessionsThisWeek}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>séances</Text>
                </View>
              </View>

              {/* ── Badge IMC ── */}
              {bmiLabel ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: bmiColor + '14', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'stretch', justifyContent: 'center' }}>
                  <Ionicons name="body-outline" size={16} color={bmiColor} />
                  <Text style={{ color: bmiColor, fontSize: 14, fontWeight: '700' }}>{bmiLabel}</Text>
                </View>
              ) : null}
            </View>

            {/* ── Section Profil ── */}
            <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' }}>Profil</Text>
              </View>
              <InfoRow icon="calendar-outline" label="Date de naissance" value={studentInfo.birthdate ? new Date(studentInfo.birthdate).toLocaleDateString('fr-FR') : '—'} />
              <InfoRow icon="people-outline" label="Élève depuis" value={joinedAt} />
              {phase ? (
                <InfoRow
                  icon={PHASE_ICONS[phase] ?? 'flag-outline'}
                  label="Objectif"
                  value={PHASE_LABELS[phase] ?? phase}
                  valueColor={colors.accent}
                  isLast
                />
              ) : null}
            </View>

            {/* ── Section Calories ── */}
            {(() => {
              const profile = studentInfo as any;
              if (!profile.weight || !profile.height || !profile.age || !profile.sex) return null;
              const profileForCalc = { ...profile, activityLevel: profile.activityLevel ?? 'moderate' };
              const tdee = calculateTDEE(profileForCalc);
              const hasCustomGoal = !!profile.calorieGoalManual;
              const customGoal = hasCustomGoal ? calculateCalorieGoal(profileForCalc) : null;
              return (
                <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>
                  <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' }}>Calories</Text>
                  </View>
                  <InfoRow icon="flame-outline" label="TDEE (dépense totale)" value={`${tdee} kcal`} valueColor={colors.accent} />
                  {hasCustomGoal && customGoal ? (
                    <InfoRow icon="options-outline" label="Objectif personnalisé" value={`${customGoal} kcal`} valueColor={colors.accentGreen} isLast />
                  ) : (
                    <InfoRow icon="checkmark-circle-outline" label="Objectif actif" value={`${tdee} kcal`} isLast />
                  )}
                </View>
              );
            })()}

          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // ─── Student plan detail view ────────────────────────────────────────────────
  if (selectedStudent) {
    const availableSessions: WorkoutSession[] = myPlan?.sessions ?? [];
    const alreadySent = !!studentPlan?.sentAt && !isDirty;
    const hasSessions = (studentPlan?.schedule ?? []).length > 0;

    const handleSendPlan = async () => {
      if (!selectedStudent || !uid || !studentPlan) return;
      if (alreadySent) {
        Alert.alert('Modifier le planning ?', `Souhaitez-vous modifier le planning de ${selectedStudent.pseudo} ?`, [
          { text: 'Non', style: 'cancel' },
          { text: 'Oui', onPress: () => { setIsDirty(true); setStudentPlan({ ...studentPlan, sentAt: undefined }); } },
        ]);
        return;
      }
      try {
        await saveStudentTrainingPlan(uid, selectedStudent.uid, { ...studentPlan, sentAt: Date.now() });
        setIsDirty(false);
        const fresh = await loadStudentTrainingPlan(selectedStudent.uid);
        if (fresh) setStudentPlan(fresh);
        const { doc: fdoc, setDoc: fsetDoc } = await import('firebase/firestore');
        const { db: firedb } = await import('../../utils/firebase');
        await fsetDoc(fdoc(firedb, 'notifications', selectedStudent.uid, 'items', `training_plan_updated_${uid}`), {
          type: 'training_plan_updated', fromUid: uid, fromPseudo: 'Ton coach', read: false, createdAt: Date.now(),
        });
        Alert.alert('Planning envoyé ✓', `${selectedStudent.pseudo} peut maintenant voir son programme.`, [
          { text: 'OK', onPress: () => setSelectedStudent(null) },
        ]);
      } catch {
        Alert.alert('Erreur', "Impossible d'envoyer le planning.");
      }
    };

    return (
      <SafeAreaView style={styles.screen}>

        {/* ── Header ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <TouchableOpacity
            onPress={() => {
              if (isDirty) {
                Alert.alert('Planning non validé', "Pense à bien valider ton planning pour que ton élève le reçoive.", [
                  { text: 'OK', onPress: () => setSelectedStudent(null) }, { text: 'Rester', style: 'cancel' }
                ]);
              } else { setSelectedStudent(null); }
            }}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>Planning</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>@{selectedStudent.pseudo}</Text>
          </View>
          <TouchableOpacity
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => router.push({ pathname: '/chat', params: { otherUid: selectedStudent.uid, otherPseudo: selectedStudent.pseudo } })}
          >
            <Ionicons name="chatbubble-outline" size={19} color={colors.accent} />
          </TouchableOpacity>
        </View>

        {renderInfoModal()}

        <ScrollView
          contentContainerStyle={{ padding: spacing.md, gap: 12, paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Carte profil élève ── */}
          <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {selectedStudent.photoUrl?.startsWith('http')
              ? <ExpoImage source={{ uri: selectedStudent.photoUrl }} style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2.5, borderColor: colors.accent }} cachePolicy="memory-disk" />
              : <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accent + '22', borderWidth: 2.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '800' }}>{selectedStudent.pseudo?.[0]?.toUpperCase()}</Text>
                </View>
            }
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{selectedStudent.pseudo}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  Élève depuis le {new Date(selectedStudent.joinedAt).toLocaleDateString('fr-FR')}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="barbell-outline" size={12} color={colors.accent} />
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>
                  {(studentPlan?.schedule ?? []).length} séance{(studentPlan?.schedule ?? []).length !== 1 ? 's' : ''} cette semaine
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}
              onPress={() => { setStudentInfo(null); setShowInfoModal(true); }}
            >
              <Ionicons name="information-circle-outline" size={22} color={colors.accent} />
            </TouchableOpacity>
          </View>

          {/* ── Label section ── */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 4 }}>
            Programme semaine
          </Text>

          {loadingPlan ? (
            <PulsingLoader size={44} style={{ marginTop: 40 }} />
          ) : (
            DAY_LABELS.map((dayLabel, idx) => {
              const scheduled = (studentPlan?.schedule ?? []).filter((s: any) => s.dayOfWeek === idx);
              const sessions = studentPlan?.sessions ?? myPlan?.sessions ?? [];
              const isRest = scheduled.length === 0;
              return (
                <View key={dayLabel} style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>

                  {/* ── Header du jour ── */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: isRest ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isRest ? colors.border : colors.accent }} />
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{dayLabel}</Text>
                    </View>
                    {isRest
                      ? <View style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>Repos</Text>
                        </View>
                      : <View style={{ backgroundColor: colors.accent + '18', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>{scheduled.length} séance{scheduled.length > 1 ? 's' : ''}</Text>
                        </View>
                    }
                  </View>

                  {/* ── Séances ── */}
                  {!isRest && scheduled.map((sc: any) => {
                    const session = sessions.find((s: any) => s.id === sc.sessionId);
                    const done = completionMap[sc.id];
                    return (
                      <View key={sc.id} style={{ marginHorizontal: 12, marginTop: 10, backgroundColor: colors.bg, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: done ? colors.accentGreen + '60' : colors.accent + '40', overflow: 'hidden' }}>
                        {/* Bande latérale + toggle */}
                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}
                          onPress={() => setExpandedSessions(prev => {
                            const next = new Set(prev);
                            next.has(sc.id) ? next.delete(sc.id) : next.add(sc.id);
                            return next;
                          })}
                          activeOpacity={0.7}
                        >
                          <View style={{ width: 3, position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: done ? colors.accentGreen : colors.accent }} />
                          <View style={{ flex: 1, paddingLeft: 6 }}>
                            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{session?.name ?? '—'}</Text>
                            <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                              {session?.exercises?.length ?? 0} exercice{(session?.exercises?.length ?? 0) > 1 ? 's' : ''}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: done ? colors.accentGreen + '18' : colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                            <Ionicons name={done ? 'checkmark-circle' : 'time-outline'} size={14} color={done ? colors.accentGreen : colors.textSecondary} />
                            <Text style={{ color: done ? colors.accentGreen : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
                              {done ? 'Effectué' : 'En attente'}
                            </Text>
                          </View>
                          <Ionicons name={expandedSessions.has(sc.id) ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
                        </TouchableOpacity>

                        {/* Accordéon exercices */}
                        {expandedSessions.has(sc.id) && (
                          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                            {(session?.exercises ?? []).map((ex: any, exIdx: number) => (
                              <View key={ex.id ?? exIdx} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, minHeight: 48 }}>
                                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                  <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '800' }}>{exIdx + 1}</Text>
                                </View>
                                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{ex.name || `Exercice ${exIdx + 1}`}</Text>
                                <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{ex.sets} × {ex.reps}</Text>
                              </View>
                            ))}

                            {/* ── Note coach ── */}
                            <View style={{ padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Ionicons name="chatbox-outline" size={14} color={colors.accent} />
                                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' }}>Note coach</Text>
                              </View>
                              <TextInput
                                style={{
                                  backgroundColor: colors.bg,
                                  borderRadius: 12,
                                  borderWidth: 1,
                                  borderColor: noteDrafts[sc.id] !== undefined
                                    ? (noteDrafts[sc.id].trim() ? colors.accent + '80' : colors.border)
                                    : (sc.coachNote ? colors.accent + '80' : colors.border),
                                  padding: 12,
                                  color: colors.text,
                                  fontSize: 14,
                                  minHeight: 72,
                                  textAlignVertical: 'top',
                                }}
                                placeholder="Ajouter une instruction pour l'élève…"
                                placeholderTextColor={colors.textSecondary}
                                multiline
                                value={noteDrafts[sc.id] !== undefined ? noteDrafts[sc.id] : (sc.coachNote ?? '')}
                                onChangeText={(text) => setNoteDrafts((prev) => ({ ...prev, [sc.id]: text }))}
                              />
                              {noteDrafts[sc.id] !== undefined && noteDrafts[sc.id] !== (sc.coachNote ?? '') && (
                                <TouchableOpacity
                                  style={{ height: 40, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                                  onPress={async () => {
                                    if (!selectedStudent) return;
                                    setSavingNote(sc.id);
                                    try {
                                      await updateScheduledSessionNote(selectedStudent.uid, sc.id, noteDrafts[sc.id]);
                                      // Mettre à jour le plan local pour refléter la note sauvegardée
                                      setStudentPlan((prev) => {
                                        if (!prev) return prev;
                                        return {
                                          ...prev,
                                          schedule: prev.schedule.map((s: any) =>
                                            s.id === sc.id
                                              ? noteDrafts[sc.id].trim()
                                                ? { ...s, coachNote: noteDrafts[sc.id].trim() }
                                                : (({ coachNote, ...rest }) => rest)(s)
                                              : s
                                          ),
                                        };
                                      });
                                      setNoteDrafts((prev) => { const n = { ...prev }; delete n[sc.id]; return n; });
                                    } catch {
                                      Alert.alert('Erreur', 'Impossible de sauvegarder la note.');
                                    } finally {
                                      setSavingNote(null);
                                    }
                                  }}
                                  disabled={savingNote === sc.id}
                                >
                                  {savingNote === sc.id
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <>
                                        <Ionicons name="checkmark" size={15} color="#fff" />
                                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Sauvegarder la note</Text>
                                      </>
                                  }
                                </TouchableOpacity>
                              )}
                            </View>

                            <View style={{ flexDirection: 'row', gap: 10, padding: 12, paddingTop: 0 }}>
                              <TouchableOpacity
                                style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
                                onPress={() => confirmIfSent(() => {
                                  if (!session) return;
                                  setEditingSessionId(session.id);
                                  setNewSessionName(session.name);
                                  setDraftExercises(
                                    (session.exercises ?? []).length > 0
                                      ? session.exercises.map((e: any) => ({ id: e.id ?? genId(), slug: e.slug ?? '', name: e.name, muscle: e.muscle ?? 'pecs' as MuscleGroup, sets: Number(e.sets ?? 3), reps: Number(e.reps ?? 10) }))
                                      : [{ id: genId(), slug: '', name: '', muscle: 'pecs' as MuscleGroup, sets: 3, reps: 10 }]
                                  );
                                  setPlanStep('exercises');
                                  setAddDayModal({ dayIndex: idx, dayLabel });
                                })}
                              >
                                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Modifier</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.danger + '18', alignItems: 'center', justifyContent: 'center' }}
                                onPress={() => confirmIfSent(() => removeSessionFromDay(sc.id))}
                              >
                                <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>Supprimer</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {/* ── Bouton ajouter séance ── */}
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 16, marginTop: isRest ? 0 : 4 }}
                    onPress={() => confirmIfSent(() => {
                      setEditingSessionId(null);
                      setNewSessionName('');
                      setDraftExercises([{ id: genId(), slug: '', name: '', muscle: 'pecs' as MuscleGroup, sets: 3, reps: 10 }]);
                      setPlanStep('name');
                      setAddDayModal({ dayIndex: idx, dayLabel });
                    })}
                    activeOpacity={0.7}
                  >
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="add" size={14} color={colors.accent} />
                    </View>
                    <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>Ajouter une séance</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}

          {/* ── Bouton envoyer planning ── */}
          {!loadingPlan && hasSessions && (
            <TouchableOpacity
              onPress={handleSendPlan}
              style={{
                minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: 8,
                backgroundColor: alreadySent ? colors.accentGreen + '18' : colors.accent,
                borderWidth: alreadySent ? 1 : 0,
                borderColor: alreadySent ? colors.accentGreen + '55' : 'transparent',
                marginTop: 4,
              }}
              activeOpacity={0.8}
            >
              <Ionicons name={alreadySent ? 'checkmark-circle' : 'send'} size={18} color={alreadySent ? colors.accentGreen : '#fff'} />
              <Text style={{ color: alreadySent ? colors.accentGreen : '#fff', fontSize: 16, fontWeight: '700' }}>
                {alreadySent ? `Planning envoyé à ${selectedStudent.pseudo}` : 'Valider et envoyer le planning'}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Modal planification — 3 étapes : name / library / exercises */}
        <Modal visible={!!addDayModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setAddDayModal(null); setPlanStep('name'); setEditingSessionId(null); }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

              {/* ── Header ── */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <TouchableOpacity
                  onPress={() => {
                    if (planStep === 'library') { setPlanStep('name'); }
                    else if (planStep === 'exercises' && !editingSessionId) { setPlanStep('name'); }
                    else { setAddDayModal(null); setPlanStep('name'); setEditingSessionId(null); }
                  }}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name={planStep === 'name' ? 'chevron-down' : 'chevron-back'} size={22} color={colors.text} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>
                    {planStep === 'library' ? 'Ma bibliothèque' : planStep === 'name' ? 'Nouvelle séance' : newSessionName}
                  </Text>
                  {addDayModal && (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>{addDayModal.dayLabel}</Text>
                  )}
                </View>
                {planStep === 'library' ? (
                  <View style={{ width: 44 }} />
                ) : planStep === 'name' ? (
                  <TouchableOpacity
                    onPress={() => { if (newSessionName.trim()) setPlanStep('exercises'); }}
                    disabled={!newSessionName.trim()}
                    style={{ height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: newSessionName.trim() ? colors.accent : colors.surface, alignItems: 'center', justifyContent: 'center' }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: newSessionName.trim() ? '#fff' : colors.textSecondary, fontSize: 15, fontWeight: '700' }}>Suivant</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={createAndAddSession}
                    disabled={saving}
                    style={{ height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
                    activeOpacity={0.8}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Planifier</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>

              {/* ── Barre de progression (masquée sur l'étape library) ── */}
              {planStep !== 'library' && (
                <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 6 }}>
                  {[0, 1].map((i) => (
                    <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: (i === 0 || planStep === 'exercises') ? colors.accent : colors.border }} />
                  ))}
                </View>
              )}

              {/* ── Étape bibliothèque ── */}
              {planStep === 'library' && (
                <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 10, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
                  {librarysessions.length === 0 ? (
                    <View style={{ alignItems: 'center', gap: 16, paddingTop: 60 }}>
                      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                        <Ionicons name="library-outline" size={32} color={colors.textSecondary} />
                      </View>
                      <View style={{ alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>Bibliothèque vide</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                          Crée d'abord des séances types dans ta bibliothèque.
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => { setAddDayModal(null); setPlanStep('name'); router.push('/coach-library'); }}
                        style={{ height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
                        activeOpacity={0.8}
                      >
                        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Créer des séances</Text>
                      </TouchableOpacity>
                    </View>
                  ) : librarysessions.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      onPress={async () => {
                        setAddDayModal(null);
                        setPlanStep('name');
                        const copy: WorkoutSession = { ...s, id: genId() };
                        await addSessionToDay(copy);
                      }}
                      style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
                      activeOpacity={0.75}
                    >
                      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="barbell-outline" size={20} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{s.name}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                          {s.exercises.length} exercice{s.exercises.length !== 1 ? 's' : ''}
                          {s.exercises.length > 0 ? '  ·  ' + [...new Set(s.exercises.map((e) => MUSCLE_LABELS[e.muscle]))].slice(0, 3).join(', ') : ''}
                        </Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* ── Étape nom ── */}
              {planStep === 'name' && (
                <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                  {/* Depuis ma bibliothèque */}
                  <View style={{ gap: 10 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                      Depuis ma bibliothèque
                    </Text>
                    <TouchableOpacity
                      onPress={() => setPlanStep('library')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.accent + '12', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.accent + '40' }}
                      activeOpacity={0.8}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="library-outline" size={20} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>Choisir une séance type</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                          {librarysessions.length > 0 ? `${librarysessions.length} séance${librarysessions.length !== 1 ? 's' : ''} disponible${librarysessions.length !== 1 ? 's' : ''}` : 'Bibliothèque vide'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.accent} />
                    </TouchableOpacity>
                  </View>

                  {/* Ou créer */}
                  <View style={{ gap: 10 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                      Ou créer une nouvelle séance
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {SESSION_PRESETS.filter(p => p !== 'Repos').map((preset) => {
                        const selected = newSessionName === preset;
                        return (
                          <TouchableOpacity
                            key={preset}
                            activeOpacity={0.7}
                            onPress={() => setNewSessionName(preset)}
                            style={{
                              paddingHorizontal: 18, paddingVertical: 12, borderRadius: 22,
                              backgroundColor: selected ? colors.accent : colors.card,
                              borderWidth: selected ? 0 : StyleSheet.hairlineWidth,
                              borderColor: colors.border,
                              minHeight: 44, alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: selected ? '#fff' : colors.text, fontSize: 15, fontWeight: selected ? '700' : '500' }}>{preset}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Nom libre */}
                  <View style={{ gap: 10 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                      Ou nom personnalisé
                    </Text>
                    <View style={{
                      backgroundColor: colors.card, borderRadius: 14,
                      borderWidth: newSessionName && !SESSION_PRESETS.includes(newSessionName) ? 1.5 : StyleSheet.hairlineWidth,
                      borderColor: newSessionName && !SESSION_PRESETS.includes(newSessionName) ? colors.accent : colors.border,
                      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10, minHeight: 56,
                    }}>
                      <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                      <TextInput
                        style={{ flex: 1, paddingVertical: 16, color: colors.text, fontSize: 16 }}
                        value={SESSION_PRESETS.includes(newSessionName) ? '' : newSessionName}
                        onChangeText={setNewSessionName}
                        placeholder="Ex : Push / Pull / Legs…"
                        placeholderTextColor={colors.textSecondary}
                        returnKeyType="next"
                      />
                      {newSessionName && !SESSION_PRESETS.includes(newSessionName) && (
                        <TouchableOpacity onPress={() => setNewSessionName('')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                </ScrollView>
              )}

              {/* ── Étape exercices ── */}
              {planStep === 'exercises' && (
                <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                    Exercices
                  </Text>

                  {draftExercises.map((ex, idx) => (
                    <View key={ex.id} style={{ backgroundColor: colors.card, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{idx + 1}</Text>
                          </View>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 }}>EXERCICE</Text>
                        </View>
                        {draftExercises.length > 1 && (
                          <TouchableOpacity onPress={() => removeDraftExercise(ex.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="trash-outline" size={18} color={colors.danger} />
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 }}>
                        <ExercisePickerField
                          value={ex.slug ? { slug: ex.slug, name: ex.name, muscle: ex.muscle } : null}
                          onSelect={(item) => updateDraftExercise(ex.id, { slug: item.slug, name: item.name, muscle: item.muscle })}
                        />
                      </View>

                      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 20 }} />

                      <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 20, gap: 16 }}>
                        <View style={{ flex: 1, alignItems: 'center', gap: 12 }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>Séries</Text>
                          <Stepper value={ex.sets} min={1} max={10} onChange={(v) => updateDraftExercise(ex.id, { sets: v })} />
                        </View>
                        <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                        <View style={{ flex: 1, alignItems: 'center', gap: 12 }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>Reps</Text>
                          <Stepper value={ex.reps} min={1} max={30} onChange={(v) => updateDraftExercise(ex.id, { reps: v })} />
                        </View>
                      </View>
                    </View>
                  ))}

                  <TouchableOpacity onPress={addDraftExercise} activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56, borderRadius: 16, borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed', backgroundColor: colors.accent + '08' }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="add" size={18} color={colors.accent} />
                    </View>
                    <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '700' }}>Ajouter un exercice</Text>
                  </TouchableOpacity>

                </ScrollView>
              )}

            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

      </SafeAreaView>
    );
  }

  // ─── Main view ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.screen}>
      {/* Header custom */}
      <View style={{ paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>Mes élèves</Text>
      </View>
      {students.length > 0 && (
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, gap: 8 }}>
            <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
            <TextInput
              style={{ flex: 1, paddingVertical: 10, color: colors.text, fontSize: 14 }}
              placeholder="Rechercher un élève..."
              placeholderTextColor={colors.textSecondary}
              value={studentSearch}
              onChangeText={setStudentSearch}
              autoCapitalize="none"
            />
            {studentSearch.length > 0 && (
              <TouchableOpacity onPress={() => setStudentSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>

        {/* Bouton demandes de coaching */}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, padding: spacing.md, borderWidth: 1, borderColor: requests.length > 0 ? colors.accent + '55' : colors.border, gap: 12 }}
          onPress={() => setShowRequestsModal(true)}
          activeOpacity={0.8}
        >
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person-add-outline" size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Demandes de coaching</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>
              {requests.length === 0 ? 'Aucune demande en attente' : `${requests.length} demande${requests.length > 1 ? 's' : ''} en attente`}
            </Text>
          </View>
          {requests.length > 0 && (
            <View style={{ backgroundColor: colors.accent, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{requests.length}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Modal demandes */}
        <Modal visible={showRequestsModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowRequestsModal(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>

            {/* ── Header ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <TouchableOpacity
                onPress={() => setShowRequestsModal(false)}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="chevron-down" size={22} color={colors.text} />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>Demandes de coaching</Text>
                {requests.length > 0 && (
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 1 }}>
                    {requests.length} demande{requests.length > 1 ? 's' : ''} en attente
                  </Text>
                )}
              </View>
              {/* Placeholder pour centrer le titre */}
              <View style={{ width: 44 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {requests.length === 0 ? (
                /* ── État vide ── */
                <View style={{ alignItems: 'center', gap: 16, paddingTop: 60 }}>
                  <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                    <Ionicons name="time-outline" size={36} color={colors.textSecondary} />
                  </View>
                  <View style={{ alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>Aucune demande en attente</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
                      Partage ton code coach pour que tes élèves puissent t'envoyer une demande.
                    </Text>
                  </View>
                  {myCoachCode && (
                    <View style={{ width: '100%', gap: 12, marginTop: 8 }}>
                      <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 20, paddingHorizontal: spacing.md, alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Ton code coach</Text>
                        <Text style={{ color: colors.accent, fontSize: 28, fontWeight: '900', letterSpacing: 2 }}>{myCoachCode}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => Share.share({ message: `Rejoins mon coaching sur Gosh ! Entre ce code pour m'envoyer une demande : ${myCoachCode}` })}
                        activeOpacity={0.85}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.accent, borderRadius: 16, minHeight: 54 }}
                      >
                        <Ionicons name="share-outline" size={20} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Partager mon code</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : requests.map((req) => (
                /* ── Card demande ── */
                <View key={req.id} style={styles.reqCard}>
                  <View style={styles.reqHeader}>
                    {req.studentPhotoUrl ? (
                      <ExpoImage source={{ uri: req.studentPhotoUrl }} style={styles.reqAvatar} cachePolicy="memory-disk" />
                    ) : (
                      <View style={[styles.reqAvatar, { backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '800' }}>{req.studentPseudo?.[0]?.toUpperCase() ?? '?'}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reqName}>{req.studentPseudo}</Text>
                      <Text style={styles.reqSub}>Veut rejoindre ton coaching</Text>
                    </View>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />
                  </View>
                  <View style={styles.reqBtns}>
                    <TouchableOpacity
                      onPress={() => { handleAccept(req); if (requests.length <= 1) setShowRequestsModal(false); }}
                      activeOpacity={0.8}
                      style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Accepter</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleReject(req)}
                      activeOpacity={0.8}
                      style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: colors.danger + '18', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.danger + '55' }}
                    >
                      <Text style={{ color: colors.danger, fontSize: 15, fontWeight: '700' }}>Refuser</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* Students list */}
        <View>
          <Text style={styles.sectionTitle}>Mes élèves</Text>
          <Text style={styles.sectionSub}>Appuie sur un élève pour gérer son planning</Text>

{students.length === 0 ? (
            <Text style={styles.noStudents}>Aucun élève pour l'instant.{'\n'}Partage ton pseudo coach pour recevoir des demandes.</Text>
          ) : students.filter((s) => s.pseudo.toLowerCase().includes(studentSearch.toLowerCase())).length === 0 ? (
            <Text style={styles.noStudents}>Aucun élève trouvé pour "{studentSearch}"</Text>
          ) : students.filter((s) => s.pseudo.toLowerCase().includes(studentSearch.toLowerCase())).map((student) => {
            const meta = studentPlanMeta[student.uid];
            const hasPlan = meta && meta.sessions > 0;
            const isSent = meta?.sent ?? false;
            const total = meta?.total ?? 0;
            const done = meta?.done ?? 0;
            const allDone = total > 0 && done === total;
            const statusColor = !hasPlan ? colors.textSecondary : !isSent ? colors.warning : allDone ? colors.accent : done > 0 ? colors.warning : colors.danger;
            const statusLabel = !hasPlan ? 'Pas de plan' : !isSent ? 'Plan non envoyé' : `${done}/${total} séances`;
            const statusIcon = !hasPlan ? 'document-outline' : !isSent ? 'time-outline' : allDone ? 'checkmark-circle' : done > 0 ? 'ellipse-outline' : 'close-circle-outline';
            return (
              <View key={student.uid} style={[styles.studentCard, { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md }]}>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.md }} onPress={() => openStudentPlan(student)} activeOpacity={0.8}>
                  {student.photoUrl ? (
                    <ExpoImage source={{ uri: student.photoUrl }} style={styles.studentAvatar} cachePolicy="memory-disk" />
                  ) : (
                    <View style={[styles.studentAvatar, { backgroundColor: colors.accent + '25', alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '800' }}>{student.pseudo[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.studentName}>{student.pseudo}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name={statusIcon as any} size={13} color={statusColor} />
                      <Text style={{ color: statusColor, fontSize: 12, fontWeight: '600' }}>{statusLabel}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openStudentMenu(student)} style={{ padding: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
