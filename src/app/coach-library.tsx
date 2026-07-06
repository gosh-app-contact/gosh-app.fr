import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, useColors } from '../constants/theme';
import { MuscleGroup, WorkoutSession, Exercise, MUSCLE_LABELS, ALL_MUSCLES } from '../types/training';
import { auth } from '../utils/firebase';
import {
  subscribeCoachLibrarySessions,
  saveCoachLibrarySession,
  deleteCoachLibrarySession,
} from '../utils/coachStorage';
import { EXERCISE_LIBRARY, ExerciseLibraryItem } from '../utils/exerciseLibrary';

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ─── ExercisePicker (même pattern que eleves.tsx) ────────────────────────────

const MUSCLE_ICONS: Record<string, string> = {
  pecs: 'body-outline', dos: 'arrow-up-outline', epaules: 'arrow-up-circle-outline',
  biceps: 'flash-outline', triceps: 'flash-outline', 'avant-bras': 'hand-left-outline',
  quadriceps: 'walk-outline', ischios: 'walk-outline', fessiers: 'ellipse-outline',
  mollets: 'walk-outline', abdos: 'grid-outline', lombaires: 'git-branch-outline',
  trapezes: 'git-merge-outline',
};

function ExercisePickerField({ value, onSelect }: { value: ExerciseLibraryItem | null; onSelect: (item: ExerciseLibraryItem) => void }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null);
  const [query, setQuery] = useState('');

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

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TouchableOpacity onPress={() => onChange(Math.max(min, value - 1))} activeOpacity={0.7}
        style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="remove" size={16} color={value <= min ? colors.textSecondary : colors.text} />
      </TouchableOpacity>
      <Text style={{ width: 40, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '700' }}>{value}</Text>
      <TouchableOpacity onPress={() => onChange(Math.min(max, value + 1))} activeOpacity={0.7}
        style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="add" size={16} color={value >= max ? colors.textSecondary : colors.accent} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function CoachLibraryScreen() {
  const colors = useColors();
  const router = useRouter();
  const uid = auth.currentUser?.uid;

  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Éditeur
  const [showEditor, setShowEditor] = useState(false);
  const [editingSession, setEditingSession] = useState<WorkoutSession | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [draftExercises, setDraftExercises] = useState<Exercise[]>([
    { id: genId(), slug: '', name: '', muscle: 'pecs', sets: 3, reps: 10 },
  ]);
  const [step, setStep] = useState<'name' | 'exercises'>('name');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeCoachLibrarySessions(uid, (s) => {
      setSessions(s.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const openNew = () => {
    setEditingSession(null);
    setSessionName('');
    setDraftExercises([{ id: genId(), slug: '', name: '', muscle: 'pecs', sets: 3, reps: 10 }]);
    setStep('name');
    setShowEditor(true);
  };

  const openEdit = (s: WorkoutSession) => {
    setEditingSession(s);
    setSessionName(s.name);
    setDraftExercises(
      s.exercises.length > 0
        ? s.exercises.map((e) => ({ ...e, id: e.id ?? genId() }))
        : [{ id: genId(), slug: '', name: '', muscle: 'pecs', sets: 3, reps: 10 }],
    );
    setStep('exercises');
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!uid || !sessionName.trim()) return;
    setSaving(true);
    try {
      const exercises = draftExercises.filter((e) => e.slug);
      const session: WorkoutSession = {
        id: editingSession?.id ?? genId(),
        name: sessionName.trim(),
        exercises,
      };
      await saveCoachLibrarySession(uid, session);
      setShowEditor(false);
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder la séance.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (s: WorkoutSession) => {
    Alert.alert(
      'Supprimer la séance',
      `Supprimer "${s.name}" de ta bibliothèque ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            if (!uid) return;
            await deleteCoachLibrarySession(uid, s.id).catch(() => {});
          },
        },
      ],
    );
  };

  const updateDraft = (id: string, partial: Partial<Exercise>) => {
    setDraftExercises((prev) => prev.map((e) => e.id === id ? { ...e, ...partial } : e));
  };

  const muscleChips = (session: WorkoutSession) => {
    const muscles = [...new Set(session.exercises.map((e) => e.muscle))];
    return muscles.slice(0, 3).map((m) => MUSCLE_LABELS[m]).join(' · ');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>

      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>Ma bibliothèque</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>{sessions.length} séance{sessions.length !== 1 ? 's' : ''} enregistrée{sessions.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity
          onPress={openNew}
          style={{ height: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Nouvelle</Text>
        </TouchableOpacity>
      </View>

      {/* ── Liste ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : sessions.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: 16 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="library-outline" size={34} color={colors.accent} />
          </View>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>Bibliothèque vide</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
            Crée tes séances types ici. Tu pourras les assigner directement à tes élèves sans tout recréer à chaque fois.
          </Text>
          <TouchableOpacity
            onPress={openNew}
            style={{ marginTop: 8, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 16, backgroundColor: colors.accent }}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Créer ma première séance</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 10, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {sessions.map((s) => {
            const isExpanded = expanded.has(s.id);
            return (
              <View key={s.id} style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>

                {/* ── Header séance ── */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}
                  onPress={() => toggleExpand(s.id)}
                  activeOpacity={0.7}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="barbell-outline" size={20} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{s.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3 }}>
                      {s.exercises.length} exercice{s.exercises.length !== 1 ? 's' : ''}
                      {s.exercises.length > 0 ? '  ·  ' + muscleChips(s) : ''}
                    </Text>
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
                </TouchableOpacity>

                {/* ── Accordéon exercices ── */}
                {isExpanded && (
                  <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                    {s.exercises.length === 0 ? (
                      <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>Aucun exercice</Text>
                    ) : s.exercises.map((ex, idx) => (
                      <View key={ex.id ?? idx} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, minHeight: 48 }}>
                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '800' }}>{idx + 1}</Text>
                        </View>
                        <Text style={{ flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' }}>{ex.name}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>{ex.sets} × {ex.reps}</Text>
                      </View>
                    ))}

                    {/* ── Actions ── */}
                    <View style={{ flexDirection: 'row', gap: 10, padding: 12 }}>
                      <TouchableOpacity
                        style={{ flex: 1, height: 42, borderRadius: 12, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => openEdit(s)}
                      >
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Modifier</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, height: 42, borderRadius: 12, backgroundColor: colors.danger + '18', alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => handleDelete(s)}
                      >
                        <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>Supprimer</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── Modal éditeur ── */}
      <Modal visible={showEditor} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowEditor(false); setStep('name'); }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <TouchableOpacity
                onPress={() => { if (step === 'exercises' && !editingSession) { setStep('name'); } else { setShowEditor(false); setStep('name'); } }}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name={step === 'exercises' && !editingSession ? 'chevron-back' : 'chevron-down'} size={22} color={colors.text} />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>
                  {editingSession ? 'Modifier la séance' : step === 'name' ? 'Nouvelle séance' : sessionName}
                </Text>
              </View>
              {step === 'name' ? (
                <TouchableOpacity
                  onPress={() => { if (sessionName.trim()) setStep('exercises'); }}
                  disabled={!sessionName.trim()}
                  style={{ height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: sessionName.trim() ? colors.accent : colors.surface, alignItems: 'center', justifyContent: 'center' }}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: sessionName.trim() ? '#fff' : colors.textSecondary, fontSize: 15, fontWeight: '700' }}>Suivant</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={saving}
                  style={{ height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
                  activeOpacity={0.8}
                >
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Sauvegarder</Text>}
                </TouchableOpacity>
              )}
            </View>

            {/* Barre de progression */}
            {!editingSession && (
              <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 6 }}>
                {[0, 1].map((i) => (
                  <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: (i === 0 || step === 'exercises') ? colors.accent : colors.border }} />
                ))}
              </View>
            )}

            {/* Étape 1 : Nom */}
            {step === 'name' && (
              <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>Nom de la séance</Text>
                <TextInput
                  style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 16, color: colors.text, fontSize: 16, fontWeight: '600' }}
                  placeholder="Ex : Haut du corps, Jambes, Full body…"
                  placeholderTextColor={colors.textSecondary}
                  value={sessionName}
                  onChangeText={setSessionName}
                  returnKeyType="next"
                  onSubmitEditing={() => { if (sessionName.trim()) setStep('exercises'); }}
                  autoFocus
                />
              </ScrollView>
            )}

            {/* Étape 2 : Exercices */}
            {step === 'exercises' && (
              <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 16, paddingBottom: 80 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>Exercices</Text>

                {draftExercises.map((ex, idx) => (
                  <View key={ex.id} style={{ backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, gap: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '800' }}>{idx + 1}</Text>
                      </View>
                      {draftExercises.length > 1 && (
                        <TouchableOpacity onPress={() => setDraftExercises((prev) => prev.filter((e) => e.id !== ex.id))} hitSlop={8}>
                          <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
                        </TouchableOpacity>
                      )}
                    </View>

                    <ExercisePickerField
                      value={ex.slug ? EXERCISE_LIBRARY.find((e) => e.slug === ex.slug) ?? null : null}
                      onSelect={(item) => updateDraft(ex.id, { slug: item.slug, name: item.name, muscle: item.muscle })}
                    />

                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>Séries</Text>
                        <Stepper value={ex.sets} min={1} max={10} onChange={(v) => updateDraft(ex.id, { sets: v })} />
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>Répétitions</Text>
                        <Stepper value={ex.reps} min={1} max={50} onChange={(v) => updateDraft(ex.id, { reps: v })} />
                      </View>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  onPress={() => setDraftExercises((prev) => [...prev, { id: genId(), slug: '', name: '', muscle: 'pecs', sets: 3, reps: 10 }])}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>Ajouter un exercice</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
