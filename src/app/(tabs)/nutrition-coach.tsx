import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { useColors, spacing } from '../../constants/theme';
import { auth, db } from '../../utils/firebase';
import { doc, getDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { subscribeStudents } from '../../utils/coachStorage';
import { StudentSummary } from '../../types/coach';
import { calculateTDEE, calculateCalorieGoal, calculateMacros } from '../../utils/calculations';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import WeightChart from '../../components/WeightChart';
import { WeightEntry } from '../../types';

const BLUE = '#3B82F6';
const AMBER = '#F59E0B';
const ORANGE = '#FF6B35';

export default function NutritionCoachScreen() {
  const colors = useColors();
  const uid = auth.currentUser?.uid ?? null;

  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [selected, setSelected] = useState<StudentSummary | null>(null);
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftP, setDraftP] = useState('');
  const [draftF, setDraftF] = useState('');
  const [draftC, setDraftC] = useState('');
  const [savingMacros, setSavingMacros] = useState(false);
  const [detailTab, setDetailTab] = useState<'nutrition' | 'poids'>('nutrition');
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);

  // Liste des élèves
  useEffect(() => {
    if (!uid) return;
    return subscribeStudents(uid, setStudents);
  }, [uid]);

  // Profil temps réel de l'élève sélectionné
  useEffect(() => {
    if (!selected) { setProfile(null); setDraft(''); setDetailTab('nutrition'); return; }
    const unsub = onSnapshot(doc(db, 'users', selected.uid), (snap) => {
      const data = snap.exists() ? snap.data() : null;
      setProfile(data);
      const raw: { date: string; weight: number }[] = data?.weightHistory90 ?? [];
      setWeightHistory(raw.sort((a, b) => a.date.localeCompare(b.date)));
    }, () => {});
    return () => unsub();
  }, [selected?.uid]);

  // Réinitialise la sélection si on quitte l'onglet
  useFocusEffect(useCallback(() => {
    return () => { setSelected(null); };
  }, []));

  const [requesting, setRequesting] = useState(false);

  const handleRequestAccess = async () => {
    if (!selected || !uid) return;
    setRequesting(true);
    try {
      await updateDoc(doc(db, 'users', selected.uid), { nutritionAccessPending: true });
    } catch {
      Alert.alert('Erreur', 'Impossible d\'envoyer la demande.');
    } finally {
      setRequesting(false);
    }
  };

  const handleSaveMacros = async (p: number, f: number, c: number, calorieGoal: number) => {
    if (!selected) return;
    const macroKcal = p * 4 + f * 9 + c * 4;
    const ecart = macroKcal - calorieGoal;
    const doSave = async () => {
      setSavingMacros(true);
      try {
        await updateDoc(doc(db, 'users', selected.uid), {
          coachMacroManual: true,
          coachMacroProteins: p,
          coachMacroFats: f,
          coachMacroCarbs: c,
          calorieGoalUpdatedAt: serverTimestamp(),
        });
        setDraftP(''); setDraftF(''); setDraftC('');
      } catch {
        Alert.alert('Erreur', 'Impossible de sauvegarder les macros.');
      } finally {
        setSavingMacros(false);
      }
    };
    if (Math.abs(ecart) > 50) {
      Alert.alert(
        'Répartition incohérente',
        `La répartition actuelle des macros totalise ${macroKcal} kcal, mais l'objectif calorique de l'élève est de ${calorieGoal} kcal (écart : ${ecart > 0 ? '+' : ''}${ecart} kcal).\n\nSauvegarder quand même ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Sauvegarder', style: 'destructive', onPress: doSave },
        ]
      );
    } else {
      await doSave();
    }
  };

  const handleResetMacros = async () => {
    if (!selected) return;
    setSavingMacros(true);
    try {
      await updateDoc(doc(db, 'users', selected.uid), {
        coachMacroManual: false,
        calorieGoalUpdatedAt: serverTimestamp(),
      });
    } catch {
      Alert.alert('Erreur', 'Impossible de réinitialiser les macros.');
    } finally {
      setSavingMacros(false);
    }
  };

  const handleSave = async (kcal: number | null) => {
    if (!selected || !profile) return;
    const profileForCalc = { ...profile, activityLevel: profile.activityLevel ?? 'moderate' } as any;
    const tdee = calculateTDEE(profileForCalc);
    setSaving(true);
    try {
      if (kcal === null) {
        await updateDoc(doc(db, 'users', selected.uid), { calorieGoalManual: false, calorieGoal: tdee, calorieGoalUpdatedAt: serverTimestamp() });
      } else {
        await updateDoc(doc(db, 'users', selected.uid), { calorieGoalManual: true, calorieGoal: kcal, calorieGoalUpdatedAt: serverTimestamp() });
      }
      setDraft('');
    } catch {
      Alert.alert('Erreur', 'Impossible de mettre à jour l\'objectif.');
    } finally {
      setSaving(false);
    }
  };

  // ── Vue détail d'un élève ──────────────────────────────────────────────────
  if (selected) {
    const profileReady = profile?.weight && profile?.height && profile?.age && profile?.sex;
    const profileForCalc = profileReady
      ? { ...profile, activityLevel: profile!.activityLevel ?? 'moderate' } as any
      : null;
    const tdee = profileForCalc ? calculateTDEE(profileForCalc) : null;
    const hasCoachGoal = !!profile?.calorieGoalManual;
    const hasCoachMacrosActive = !!profile?.coachMacroManual;
    const currentGoal = hasCoachMacrosActive
      ? Math.round(profile!.coachMacroProteins * 4 + profile!.coachMacroFats * 9 + profile!.coachMacroCarbs * 4)
      : hasCoachGoal ? profile!.calorieGoal : (tdee ?? 2000);
    const tdeeMacros = profileForCalc ? calculateMacros(profile!.weight, tdee!) : null;
    const macros = profileForCalc
      ? (hasCoachMacrosActive
          ? {
              proteins: profile!.coachMacroProteins,
              fats: profile!.coachMacroFats,
              carbs: profile!.coachMacroCarbs,
              fibers: Math.round((currentGoal / 1000) * 15),
              proteinKcal: Math.round(profile!.coachMacroProteins * 4),
              fatKcal: Math.round(profile!.coachMacroFats * 9),
              carbKcal: Math.round(profile!.coachMacroCarbs * 4),
            }
          : calculateMacros(profile!.weight, currentGoal))
      : null;

    const draftKcal = parseInt(draft);
    const draftValid = !isNaN(draftKcal) && draftKcal >= 800 && draftKcal <= 6000;
    const draftChanged = draft.trim() !== '' && draftKcal !== currentGoal;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            <TouchableOpacity
              onPress={() => setSelected(null)}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>Nutrition</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>@{selected.pseudo}</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>

          {/* Onglets Nutrition / Poids */}
          <View style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            {(['nutrition', 'poids'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setDetailTab(tab)}
                style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: detailTab === tab ? colors.accent : 'transparent' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: detailTab === tab ? colors.accent : colors.textSecondary }}>
                  {tab === 'nutrition' ? 'Nutrition' : 'Poids'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {detailTab === 'poids' ? (
            <WeightTabView weightHistory={weightHistory} profile={profile} colors={colors} />
          ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Carte profil */}
            <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {selected.photoUrl?.startsWith('http')
                ? <ExpoImage source={{ uri: selected.photoUrl }} style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: BLUE }} cachePolicy="memory-disk" />
                : <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: BLUE + '22', borderWidth: 2, borderColor: BLUE, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: BLUE, fontSize: 20, fontWeight: '800' }}>{selected.pseudo?.[0]?.toUpperCase()}</Text>
                  </View>
              }
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{selected.pseudo}</Text>
                {profileReady ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    {profile!.weight} kg · {profile!.height} cm · {profile!.age} ans
                  </Text>
                ) : (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Profil incomplet</Text>
                )}
              </View>
            </View>

            {!profile?.nutritionCoachEnabled ? (
              <View style={{ alignItems: 'center', gap: 20, paddingTop: 40 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                  <Ionicons name="lock-closed-outline" size={32} color={colors.textSecondary} />
                </View>
                <View style={{ alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>Accès non autorisé</Text>
                  {profile?.nutritionAccessPending ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ORANGE + '15', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: ORANGE + '40' }}>
                      <Ionicons name="time-outline" size={15} color={ORANGE} />
                      <Text style={{ color: ORANGE, fontSize: 13, fontWeight: '600' }}>Demande envoyée — en attente de {selected.pseudo}</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                        {selected.pseudo} n'a pas encore autorisé l'accès à sa nutrition.{'\n'}Envoie-lui une demande.
                      </Text>
                      <TouchableOpacity
                        onPress={handleRequestAccess}
                        disabled={requesting}
                        activeOpacity={0.8}
                        style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ORANGE, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 }}
                      >
                        {requesting
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Ionicons name="send-outline" size={16} color="#fff" />
                        }
                        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Demander l'accès</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            ) : !profileReady ? (
              <View style={{ alignItems: 'center', gap: 12, paddingTop: 40 }}>
                <Ionicons name="alert-circle-outline" size={48} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
                  L'élève n'a pas encore complété son profil (poids, taille, âge, sexe requis).
                </Text>
              </View>
            ) : (
              <>
                {/* Objectif actuel */}
                <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>
                  <View style={{ height: 3, backgroundColor: BLUE }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                    <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="flame-outline" size={22} color={BLUE} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                        TDEE (calculé automatiquement)
                      </Text>
                      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 2 }}>
                        {tdee} <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>kcal</Text>
                      </Text>
                    </View>
                  </View>

                  {/* Macros */}
                  <View style={{ flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 16 }}>
                    {[
                      { label: 'Protéines', value: `${tdeeMacros!.proteins}g`, kcal: tdeeMacros!.proteinKcal, color: BLUE },
                      { label: 'Lipides', value: `${tdeeMacros!.fats}g`, kcal: tdeeMacros!.fatKcal, color: AMBER },
                      { label: 'Glucides', value: `${tdeeMacros!.carbs}g`, kcal: tdeeMacros!.carbKcal, color: ORANGE },
                    ].map((m, i) => (
                      <View key={m.label} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderLeftColor: colors.border }}>
                        <Text style={{ color: m.color, fontSize: 18, fontWeight: '800' }}>{m.value}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{m.label}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 1 }}>{m.kcal} kcal</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* TDEE info si objectif coach actif */}
                {hasCoachGoal && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
                    <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      TDEE auto-calculé : {tdee} kcal · Différence : {currentGoal - tdee!} kcal
                    </Text>
                  </View>
                )}

                {/* Saisie objectif */}
                <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 16, gap: 14 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Fixer un objectif personnalisé</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: -8 }}>
                    Tu peux ajuster les calories en fonction de l'objectif de l'élève (prise de masse, perte de poids, maintien…)
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <View style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: colors.surface, borderRadius: 14,
                      borderWidth: draft ? 1.5 : StyleSheet.hairlineWidth,
                      borderColor: draft ? (draftValid ? BLUE : colors.danger) : colors.border,
                      paddingHorizontal: 16, minHeight: 52,
                    }}>
                      <TextInput
                        style={{ flex: 1, color: colors.text, fontSize: 20, fontWeight: '700' }}
                        value={draft}
                        onChangeText={setDraft}
                        placeholder={`${currentGoal}`}
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        maxLength={5}
                      />
                      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>kcal</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { if (draftValid) handleSave(draftKcal); }}
                      disabled={!draftValid || !draftChanged || saving}
                      style={{
                        height: 52, paddingHorizontal: 20, borderRadius: 14,
                        backgroundColor: (draftValid && draftChanged) ? BLUE : colors.surface,
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: (draftValid && draftChanged) ? BLUE : colors.border,
                      }}
                      activeOpacity={0.8}
                    >
                      {saving
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={{ color: (draftValid && draftChanged) ? '#fff' : colors.textSecondary, fontSize: 15, fontWeight: '700' }}>OK</Text>
                      }
                    </TouchableOpacity>
                  </View>

                  {/* Suggestions rapides */}
                  {tdee && (
                    <View style={{ gap: 8 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Suggestions</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {[
                          { label: 'Perte de poids', delta: -400 },
                          { label: 'Maintien', delta: 0 },
                          { label: 'Prise de masse', delta: +300 },
                        ].map((s) => {
                          const val = tdee + s.delta;
                          const isActive = currentGoal === val && hasCoachGoal;
                          return (
                            <TouchableOpacity
                              key={s.label}
                              onPress={() => { setDraft(String(val)); }}
                              style={{
                                flex: 1, minWidth: 90, paddingVertical: 10, paddingHorizontal: 10,
                                borderRadius: 12, alignItems: 'center',
                                backgroundColor: isActive ? BLUE + '18' : colors.surface,
                                borderWidth: isActive ? 1.5 : StyleSheet.hairlineWidth,
                                borderColor: isActive ? BLUE : colors.border,
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={{ color: isActive ? BLUE : colors.text, fontSize: 13, fontWeight: '700' }}>{val} kcal</Text>
                              <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>{s.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Entre 800 et 6 000 kcal</Text>
                </View>

                {/* ── Répartition des macros ── */}
                {(() => {
                  const hasCoachMacros = !!profile?.coachMacroManual;
                  const autoMacros = macros!;
                  const curP = hasCoachMacros ? profile!.coachMacroProteins : autoMacros.proteins;
                  const curF = hasCoachMacros ? profile!.coachMacroFats : autoMacros.fats;
                  const curC = hasCoachMacros ? profile!.coachMacroCarbs : autoMacros.carbs;

                  const dpNum = parseInt(draftP); const dfNum = parseInt(draftF); const dcNum = parseInt(draftC);
                  const dpValid = draftP !== '' && !isNaN(dpNum) && dpNum >= 0;
                  const dfValid = draftF !== '' && !isNaN(dfNum) && dfNum >= 0;
                  const dcValid = draftC !== '' && !isNaN(dcNum) && dcNum >= 0;
                  const allDraftValid = dpValid && dfValid && dcValid;
                  const draftTotalKcal = dpValid && dfValid && dcValid ? dpNum * 4 + dfNum * 9 + dcNum * 4 : null;
                  const draftChanged = draftP !== '' || draftF !== '' || draftC !== '';
                  const saveP = dpValid ? dpNum : curP;
                  const saveF = dfValid ? dfNum : curF;
                  const saveC = dcValid ? dcNum : curC;

                  return (
                    <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>
                      <View style={{ height: 3, backgroundColor: ORANGE }} />
                      <View style={{ padding: 16, gap: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Répartition des macros</Text>
                          {hasCoachMacros && (
                            <TouchableOpacity
                              onPress={handleResetMacros}
                              disabled={savingMacros}
                              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
                            >
                              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>Réinitialiser</Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Valeurs actuelles */}
                        <View style={{ flexDirection: 'row' }}>
                          {[
                            { label: 'Protéines', val: curP, kcal: Math.round(curP * 4), color: BLUE },
                            { label: 'Lipides',   val: curF, kcal: Math.round(curF * 9), color: AMBER },
                            { label: 'Glucides',  val: curC, kcal: Math.round(curC * 4), color: ORANGE },
                          ].map((m, i) => (
                            <View key={m.label} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderLeftColor: colors.border }}>
                              <Text style={{ color: m.color, fontSize: 18, fontWeight: '800' }}>{m.val}g</Text>
                              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{m.label}</Text>
                              <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 1 }}>{m.kcal} kcal</Text>
                            </View>
                          ))}
                        </View>

                        {hasCoachMacros && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ORANGE + '12', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                            <Ionicons name="checkmark-circle" size={14} color={ORANGE} />
                            <Text style={{ color: ORANGE, fontSize: 12, fontWeight: '600' }}>Macros personnalisées actives</Text>
                          </View>
                        )}

                        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

                        {/* Inputs */}
                        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
                          Modifie les valeurs en grammes. Les kcal sont calculés automatiquement.
                        </Text>
                        {[
                          { label: 'Protéines (g)', color: BLUE,  val: draftP, set: setDraftP, placeholder: String(curP) },
                          { label: 'Lipides (g)',   color: AMBER, val: draftF, set: setDraftF, placeholder: String(curF) },
                          { label: 'Glucides (g)',  color: ORANGE,val: draftC, set: setDraftC, placeholder: String(curC) },
                        ].map((field) => (
                          <View key={field.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ width: 4, height: 36, borderRadius: 2, backgroundColor: field.color }} />
                            <Text style={{ color: colors.textSecondary, fontSize: 13, width: 110 }}>{field.label}</Text>
                            <View style={{
                              flex: 1, flexDirection: 'row', alignItems: 'center',
                              backgroundColor: colors.surface, borderRadius: 12,
                              borderWidth: field.val ? 1.5 : StyleSheet.hairlineWidth,
                              borderColor: field.val ? field.color : colors.border,
                              paddingHorizontal: 12, height: 44,
                            }}>
                              <TextInput
                                style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' }}
                                value={field.val}
                                onChangeText={field.set}
                                placeholder={field.placeholder}
                                placeholderTextColor={colors.textSecondary}
                                keyboardType="number-pad"
                                returnKeyType="done"
                                maxLength={4}
                              />
                            </View>
                          </View>
                        ))}

                        {draftTotalKcal !== null && (
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                            <Ionicons
                              name={Math.abs(draftTotalKcal - currentGoal) <= 50 ? 'checkmark-circle-outline' : 'warning-outline'}
                              size={14}
                              color={Math.abs(draftTotalKcal - currentGoal) <= 50 ? '#22C55E' : AMBER}
                              style={{ marginTop: 1 }}
                            />
                            <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>
                              {`Total macros : ${draftTotalKcal} kcal · Objectif : ${currentGoal} kcal`}
                              {Math.abs(draftTotalKcal - currentGoal) > 50 ? ` (écart : ${draftTotalKcal - currentGoal > 0 ? '+' : ''}${draftTotalKcal - currentGoal} kcal)` : ' ✓'}
                            </Text>
                          </View>
                        )}

                        <TouchableOpacity
                          onPress={() => { if (draftChanged) handleSaveMacros(saveP, saveF, saveC, currentGoal); }}
                          disabled={!draftChanged || savingMacros}
                          style={{
                            height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: draftChanged ? ORANGE : colors.surface,
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: draftChanged ? ORANGE : colors.border,
                          }}
                          activeOpacity={0.8}
                        >
                          {savingMacros
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={{ color: draftChanged ? '#fff' : colors.textSecondary, fontSize: 15, fontWeight: '700' }}>Enregistrer les macros</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })()}
              </>
            )}
          </ScrollView>
          )}

        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Onglet Poids ─────────────────────────────────────────────────────────
  // Rendu hors du render principal pour ne pas alourdir

  // ── Liste des élèves ──────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>Nutrition des élèves</Text>
      </View>

      {students.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: 16 }}>
          <Ionicons name="nutrition-outline" size={52} color={colors.textSecondary} />
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Aucun élève</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
              Tes élèves apparaîtront ici une fois qu'ils auront rejoint ton coaching.
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 10 }} showsVerticalScrollIndicator={false}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 }}>
            {students.length} élève{students.length !== 1 ? 's' : ''}
          </Text>
          {students.map((s) => (
            <StudentNutritionRow key={s.uid} student={s} onPress={() => { setSelected(s); setDraft(''); }} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Ligne élève avec aperçu kcal ───────────────────────────────────────────
function StudentNutritionRow({ student, onPress }: { student: StudentSummary; onPress: () => void }) {
  const colors = useColors();
  const [info, setInfo] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'users', student.uid), (snap) => {
      setInfo(snap.exists() ? snap.data() : null);
    }, () => {});
    return () => unsub();
  }, [student.uid]);

  const nutritionEnabled = !!info?.nutritionCoachEnabled;
  const profileReady = info?.weight && info?.height && info?.age && info?.sex;
  const hasCoachGoal = !!info?.calorieGoalManual;
  const kcalDisplay = (() => {
    if (!nutritionEnabled) return null;
    if (!profileReady) return '—';
    const profileForCalc = { ...info, activityLevel: info!.activityLevel ?? 'moderate' } as any;
    const tdee = calculateTDEE(profileForCalc);
    if (info?.coachMacroManual && info?.coachMacroProteins != null) {
      return String(Math.round(info.coachMacroProteins * 4 + info.coachMacroFats * 9 + info.coachMacroCarbs * 4));
    }
    return hasCoachGoal ? String(info!.calorieGoal) : String(tdee);
  })();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ backgroundColor: colors.card, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
      activeOpacity={0.75}
    >
      {student.photoUrl?.startsWith('http')
        ? <ExpoImage source={{ uri: student.photoUrl }} style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: BLUE }} cachePolicy="memory-disk" />
        : <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: BLUE + '22', borderWidth: 2, borderColor: BLUE, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: BLUE, fontSize: 18, fontWeight: '800' }}>{student.pseudo?.[0]?.toUpperCase()}</Text>
          </View>
      }
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{student.pseudo}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
          {nutritionEnabled ? (
            <>
              <Ionicons name="flame-outline" size={12} color={hasCoachGoal ? BLUE : colors.textSecondary} />
              <Text style={{ color: hasCoachGoal ? BLUE : colors.textSecondary, fontSize: 12, fontWeight: hasCoachGoal ? '700' : '400' }}>
                {kcalDisplay} kcal{hasCoachGoal ? ' · Objectif coach' : profileReady ? ' · TDEE auto' : ' · Profil incomplet'}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="lock-closed-outline" size={12} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Accès non autorisé</Text>
            </>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

// ── Onglet Poids ──────────────────────────────────────────────────────────────
const PHASE_LABELS: Record<string, string> = {
  cutting: 'Perte de poids',
  bulking: 'Prise de masse',
  maintenance: 'Maintien',
  recomposition: 'Recomposition',
};

function WeightTabView({ weightHistory, profile, colors }: {
  weightHistory: WeightEntry[];
  profile: Record<string, any> | null;
  colors: ReturnType<typeof useColors>;
}) {
  const hasData = weightHistory.length >= 1;

  const currentWeight = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1].weight : null;

  const trend30 = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const recent = weightHistory.filter((e) => e.date >= cutoffStr);
    if (recent.length < 2) return null;
    return recent[recent.length - 1].weight - recent[0].weight;
  }, [weightHistory]);

  const coachingTrend = useMemo(() => {
    if (!profile?.coachStartedAt) return null;
    const startDate = profile.coachStartedAt.toDate?.();
    if (!startDate) return null;
    const startStr = startDate.toISOString().slice(0, 10);
    const afterStart = weightHistory.filter((e) => e.date >= startStr);
    if (afterStart.length < 2) return null;
    return afterStart[afterStart.length - 1].weight - afterStart[0].weight;
  }, [weightHistory, profile]);

  const weighInFrequency = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return weightHistory.filter((e) => e.date >= cutoffStr).length;
  }, [weightHistory]);

  const phase = profile?.phase ? (PHASE_LABELS[profile.phase] ?? profile.phase) : null;

  const trendColor = (v: number | null) => {
    if (v === null) return colors.textSecondary;
    if (Math.abs(v) < 0.2) return colors.textSecondary;
    if (profile?.phase === 'cutting') return v < 0 ? colors.accentGreen : colors.danger;
    if (profile?.phase === 'bulking') return v > 0 ? colors.accentGreen : colors.danger;
    return colors.textSecondary;
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

      {/* Chips stats */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Poids actuel</Text>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '900' }}>{currentWeight != null ? `${currentWeight.toFixed(1)} kg` : '—'}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tendance 30j</Text>
          <Text style={{ color: trendColor(trend30), fontSize: 22, fontWeight: '900' }}>
            {trend30 != null ? `${trend30 > 0 ? '+' : ''}${trend30.toFixed(1)} kg` : '—'}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Pesées (30j)</Text>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '900' }}>{weighInFrequency}<Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>/30j</Text></Text>
        </View>
        {coachingTrend !== null && (
          <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 4 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Depuis coaching</Text>
            <Text style={{ color: trendColor(coachingTrend), fontSize: 22, fontWeight: '900' }}>
              {coachingTrend > 0 ? '+' : ''}{coachingTrend.toFixed(1)} kg
            </Text>
          </View>
        )}
        {phase && coachingTrend === null && (
          <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 4 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Objectif</Text>
            <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '800', marginTop: 4 }}>{phase}</Text>
          </View>
        )}
      </View>

      {phase && coachingTrend !== null && (
        <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="flag-outline" size={16} color={colors.accent} />
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Objectif de l'élève : <Text style={{ color: colors.accent, fontWeight: '700' }}>{phase}</Text></Text>
        </View>
      )}

      {/* Graphique */}
      <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>
        <View style={{ height: 3, backgroundColor: ORANGE }} />
        <View style={{ padding: 16, gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Évolution du poids (90j)</Text>
          {hasData ? (
            <WeightChart data={weightHistory} showMovingAverage />
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
              <Ionicons name="scale-outline" size={36} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center' }}>
                {weightHistory.length === 0
                  ? "L'élève n'a pas encore enregistré son poids."
                  : 'Pas assez de données pour afficher le graphique.'}
              </Text>
            </View>
          )}
        </View>
      </View>

    </ScrollView>
  );
}
