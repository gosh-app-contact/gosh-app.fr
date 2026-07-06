import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated,
  Dimensions,
  Easing,
  Image,
  KeyboardAvoidingView, Linking, Platform,
  SafeAreaView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View
} from 'react-native';
import { spacing, useColors } from '../constants/theme';
import { ActivityLevel, Phase, Sex } from '../types';
import { STEP_GOAL_BY_ACTIVITY } from '../utils/calculations';
import { findCoachByCode, sendCoachRequest, setupCoachAccount, verifyAndConsumeCoachCode } from '../utils/coachStorage';
import { auth, db } from '../utils/firebase';
import { setOnboardingDone } from '../utils/onboardingFlag';
import { fetchAndCachePhoto } from '../utils/photoCache';
import { createInitialState, saveState, setStorageUid } from '../utils/storage';
import { updateUserName } from '../utils/updateUserName';

const LOGO = require('../../assets/images/Gosh-logo.png');
const COACH_BADGE = require('../../assets/badges/Badge-coach.png');
const OUTRO_VIDEO = require('../../assets/animation/Introgosh-1080x1920.mp4');

const { width, height: SCREEN_HEIGHT } = Dimensions.get('screen');

// ─── Step sequences ───────────────────────────────────────────────────────────

type StepId =
  | 'welcome'
  | 'prenom'
  | 'account'
  | 'coach_secret'
  | 'student_coach'
  | 'student_confirm'
  | 'sex'
  | 'measurements'
  | 'activity'
  | 'objective'
  | 'maintenance'
  | 'outro';

type AccountChoice = 'standard' | 'coach' | 'student';

function buildSteps(account: AccountChoice | null): StepId[] {
  const base: StepId[] = ['welcome', 'prenom', 'account'];
  if (account === 'coach') return [...base, 'coach_secret', 'outro'];
  if (account === 'student') base.push('student_coach', 'student_confirm');
  base.push('sex', 'measurements', 'activity', 'objective');
  if (account === 'standard') base.push('maintenance');
  base.push('outro');
  return base;
}

const ACTIVITY_OPTIONS: { key: ActivityLevel; label: string; desc: string; steps: string }[] = [
  { key: 'sedentary', label: 'Sédentaire', desc: 'Bureau, peu de déplacements', steps: '~2 000 pas / jour' },
  { key: 'light', label: 'Légère', desc: 'Quelques marches, 1-2 séances', steps: '~5 500 pas / jour' },
  { key: 'moderate', label: 'Modérée', desc: '3-4 séances par semaine', steps: '~10 000 pas / jour' },
  { key: 'active', label: 'Élevée', desc: '5-6 séances intenses', steps: '~15 000 pas / jour' },
  { key: 'athlete', label: 'Athlète', desc: 'Entraînement quotidien / double séance', steps: '~20 000 pas / jour' },
];

const PHASE_OPTIONS: { key: Phase; label: string; emoji: string; desc: string }[] = [
  { key: 'pre-preparation', label: 'Préparation', emoji: '🏆', desc: 'Tu cherches à identifier ta maintenance optimale — le niveau calorique où ton corps performe au mieux avant d\'attaquer un objectif ciblé.' },
  { key: 'deficit-down', label: 'Déficit ↓', emoji: '📉', desc: 'Ton objectif est de perdre du gras. On réduit les calories en dessous de ta maintenance pour que ton corps puise dans ses réserves.' },
  { key: 'deficit-up', label: 'Déficit ↑', emoji: '🎯', desc: 'Tu veux perdre du gras progressivement en remontant doucement les calories après une période de restriction.' },
  { key: 'reverse-diet', label: 'Reverse diet', emoji: '🔄', desc: 'Tu sors d\'une période de déficit et tu veux combler l\'écart calorique sans reprendre de gras — on remonte les calories en douceur.' },
  { key: 'bulk', label: 'Bulk', emoji: '💪', desc: 'Ton objectif est de maximiser la récupération et la prise de masse. On augmente les calories pour soutenir la croissance musculaire et les performances.' },
];

// ─── Outro screen ─────────────────────────────────────────────────────────────

function OutroScreen() {
  const router = useRouter();
  const navigated = useRef(false);
  const overlay = useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(OUTRO_VIDEO, (p) => {
    p.muted = true;
    p.playbackRate = 1.0;
    p.audioMixingMode = 'mixWithOthers';
    p.play();
  });

  const goHome = useCallback(() => {
    if (navigated.current) return;
    navigated.current = true;
    Animated.timing(overlay, { toValue: 1, duration: 600, useNativeDriver: true }).start(() => {
      router.replace('/(tabs)');
    });
  }, []);

  React.useEffect(() => {
    const sub = player.addListener('playToEnd', goHome);
    const timer = setTimeout(goHome, 8000);
    return () => { sub.remove(); clearTimeout(timer); };
  }, []);

  return (
    <>
      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, width, height: SCREEN_HEIGHT }}
        contentFit="cover"
        nativeControls={false}
      />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: overlay }]}
      />
    </>
  );
}

// ─── Main onboarding ──────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const colors = useColors();
  const router = useRouter();

  const [stepHistory, setStepHistory] = useState<StepId[]>(['welcome']);
  const currentStep = stepHistory[stepHistory.length - 1];

  // Form state
  const [prenom, setPrenom] = useState('');
  const [accountChoice, setAccountChoice] = useState<AccountChoice | null>(null);
  const [coachSecret, setCoachSecret] = useState('');
  const [coachCodeInput, setCoachCodeInput] = useState('');
  const [coachFound, setCoachFound] = useState<{ uid: string; pseudo: string; firstName?: string; photoUrl?: string } | null>(null);
  const [coachSearching, setCoachSearching] = useState(false);
  const [sex, setSex] = useState<Sex>('male');
  const [consentData, setConsentData] = useState(false);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [phase, setPhase] = useState<Phase>('deficit-down');
  const [maintenanceKnown, setMaintenanceKnown] = useState<boolean | null>(null);
  const [knownMaintenanceValue, setKnownMaintenanceValue] = useState('');
  const [loading, setLoading] = useState(false);

  const steps = useMemo(() => buildSteps(accountChoice), [accountChoice]);
  // Progress: exclude 'welcome' and 'outro' from bar
  const progressSteps = steps.filter((s) => s !== 'welcome' && s !== 'outro') as Exclude<StepId, 'welcome' | 'outro'>[];
  const progressIndex = progressSteps.indexOf(currentStep as Exclude<StepId, 'welcome' | 'outro'>);
  const progress = progressIndex >= 0 ? (progressIndex + 1) / progressSteps.length : 0;

  const goTo = (step: StepId) => setStepHistory((h) => [...h, step]);
  const goBack = () => setStepHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));

  const nextStep = () => {
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) goTo(steps[idx + 1]);
  };


  // ── Verify coach secret + save coach account ────────────────────────────────
  const verifyCoachSecret = async () => {
    if (!coachSecret.trim()) return;
    setLoading(true);
    try {
      const result = await verifyAndConsumeCoachCode(coachSecret.trim());
      if (!result.valid) {
        Alert.alert('Code invalide', result.reason ?? 'Ce code est invalide ou déjà utilisé.');
        return;
      }
      // Sauvegarde directe sans demander les données physiques
      const me = auth.currentUser;
      if (!me) return;
      setStorageUid(me.uid);
      const userDoc = await getDoc(doc(db, 'users', me.uid));
      const userData = userDoc.data() ?? {};
      const pseudo = userData.pseudo ?? me.email ?? prenom;
      const birthdateIso: string = userData.birthdate ?? '2000-01-01';
      const userAge: number = userData.age ?? 18;
      // État minimal avec valeurs par défaut — le coach n'utilise pas les features nutrition/suivi
      const state = createInitialState(pseudo, userAge, 'male', 175, 75, 'moderate', phase);
      state.profiles[0].birthdate = birthdateIso;
      state.profiles[0].stepGoal = STEP_GOAL_BY_ACTIVITY['moderate'];
      await saveState(state);
      await setOnboardingDone(me.uid);
      await updateUserName(me.uid, prenom);
      await setDoc(doc(db, 'users', me.uid), { onboardingComplete: true }, { merge: true });
      await setupCoachAccount(me.uid, pseudo, coachSecret);
      goTo('outro');
    } catch {
      Alert.alert('Erreur', 'Impossible de vérifier le code.');
    } finally {
      setLoading(false);
    }
  };

  // ── Search coach ────────────────────────────────────────────────────────────
  const searchCoach = async () => {
    const code = coachCodeInput.trim().toLowerCase();
    if (!code) return;
    setCoachSearching(true);
    try {
      const found = await findCoachByCode(code);
      if (!found) {
        Alert.alert('Coach introuvable', 'Vérifie le pseudo et réessaie.');
      } else {
        // Fetch fresh photo depuis Firestore (ignore le cache potentiellement stale)
        const freshPhoto = await fetchAndCachePhoto(found.uid);
        setCoachFound({ ...found, photoUrl: freshPhoto ?? found.photoUrl });
        goTo('student_confirm');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de rechercher ce coach.');
    } finally {
      setCoachSearching(false);
    }
  };

  // ── Save & finish ───────────────────────────────────────────────────────────
  const handleSave = async (phaseOverride?: Phase) => {
    const heightN = parseFloat(height);
    const weightN = parseFloat(weight);
    if (isNaN(heightN) || isNaN(weightN)) {
      Alert.alert('Champs manquants', 'Remplis ta taille et ton poids.');
      return;
    }
    const me = auth.currentUser;
    if (!me) return;
    setStorageUid(me.uid); // garantit _uid avant saveState
    setLoading(true);
    const effectivePhase = phaseOverride ?? phase;
    try {
      const userDoc = await getDoc(doc(db, 'users', me.uid));
      const userData = userDoc.data() ?? {};
      const pseudo = userData.pseudo ?? me.email ?? prenom;
      const birthdateIso: string = userData.birthdate ?? '2000-01-01';
      const userAge: number = userData.age ?? 18;
      const state = createInitialState(pseudo, userAge, sex, heightN, weightN, activity, effectivePhase);
      state.profiles[0].birthdate = birthdateIso;
      state.profiles[0].stepGoal = STEP_GOAL_BY_ACTIVITY[activity];
      const knownMaint = knownMaintenanceValue ? parseInt(knownMaintenanceValue) : undefined;
      if (knownMaint && !isNaN(knownMaint) && knownMaint > 0) {
        state.profiles[0].knownMaintenance = knownMaint;
        state.profiles[0].calorieGoal = knownMaint;
      }
      await saveState(state);
      await setOnboardingDone(me.uid);

      // Sync prénom partout (Firestore prenom + displayName + posts + storage local)
      await updateUserName(me.uid, prenom);

      const baseUpdate: Record<string, any> = {
        onboardingComplete: true,
        height: heightN,
        weight: weightN,
        birthdate: birthdateIso,
        age: userAge,
        sex,
        phase: effectivePhase,
        activityLevel: activity,
        dataConsentAt: Date.now(),
      };
      if (accountChoice === 'student') baseUpdate.joinedAt = Date.now();

      await setDoc(doc(db, 'users', me.uid), baseUpdate, { merge: true });

      if (accountChoice === 'coach') {
        await setupCoachAccount(me.uid, pseudo, coachSecret);
      } else if (accountChoice === 'student' && coachFound) {
        const photoUrl = userDoc.data()?.photoUrl ?? '';
        await sendCoachRequest(me.uid, pseudo, photoUrl, coachFound.uid, coachCodeInput.trim().toLowerCase());
      }

      goTo('outro');
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Styles ─────────────────────────────────────────────────────────────────
  const s = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    safeArea: { flex: 1 },
    progressBar: { height: 4, backgroundColor: colors.border, marginHorizontal: spacing.lg, borderRadius: 2, marginTop: 8 },
    progressFill: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
    backBtn: {
      width: 40, height: 40, borderRadius: 20,
      alignItems: 'center', justifyContent: 'center',
      marginLeft: spacing.md, marginTop: 4,
    },
    body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.lg },
    stepLabel: { color: colors.accent, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    question: { color: colors.text, fontSize: 28, fontWeight: '900', lineHeight: 34 },
    subtitle: { color: colors.textSecondary, fontSize: 15, marginTop: -spacing.xs },
    input: {
      backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: spacing.md,
      paddingVertical: 16, color: colors.text, fontSize: 22, fontWeight: '700',
      borderWidth: 1, borderColor: colors.border,
    },
    smallInput: {
      backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: spacing.md,
      paddingVertical: 14, color: colors.text, fontSize: 20, fontWeight: '700' as const,
      borderWidth: 1, borderColor: colors.border,
    },
    choiceCard: {
      backgroundColor: colors.card, borderRadius: 16, padding: spacing.md,
      borderWidth: 2, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    },
    choiceCardActive: { borderColor: colors.accent, backgroundColor: colors.accent + '11' },
    choiceEmoji: { fontSize: 28 },
    choiceTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
    choiceSub: { color: colors.textSecondary, fontSize: 13 },
    optionBtn: {
      backgroundColor: colors.card, borderRadius: 14, padding: spacing.md,
      borderWidth: 1.5, borderColor: colors.border,
    },
    optionBtnActive: { borderColor: colors.accent, backgroundColor: colors.accent + '11' },
    optionLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
    optionLabelActive: { color: colors.accent },
    optionDesc: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
    // Next arrow button
    nextBtn: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: colors.accent,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
    },
    nextBtnDisabled: { backgroundColor: colors.border },
    nextRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.sm },
    // Coach found card
    foundCard: {
      backgroundColor: colors.card, borderRadius: 16, padding: spacing.lg,
      borderWidth: 2, borderColor: colors.accent, alignItems: 'center', gap: spacing.md,
    },
    foundAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.border },
    foundName: { color: colors.text, fontSize: 20, fontWeight: '800' },
    foundSub: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
    // Welcome
    welcomeScreen: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
    logo: { width: 160, height: 160, marginBottom: spacing.xl },
    welcomeTitle: { color: '#fff', fontSize: 32, fontWeight: '900', marginBottom: spacing.sm },
    welcomeSub: { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginBottom: spacing.xl * 2, textAlign: 'center', paddingHorizontal: spacing.xl },
    welcomeBtn: {
      backgroundColor: colors.accent, borderRadius: 20,
      paddingVertical: 18, paddingHorizontal: 40, alignItems: 'center',
    },
    welcomeBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  }), [colors]);

  // ─── OUTRO ──────────────────────────────────────────────────────────────────
  if (currentStep === 'outro') return <OutroScreen />;

  // ─── WELCOME ─────────────────────────────────────────────────────────────────
  if (currentStep === 'welcome') {
    return <WelcomeScreen onStart={() => goTo('prenom')} />;
  }

  // ─── SHARED LAYOUT ──────────────────────────────────────────────────────────
  const isLastDataStep = currentStep === 'objective';

  const renderContent = () => {
    switch (currentStep) {

      // ── Prénom ───────────────────────────────────────────────────────────────
      case 'prenom':
        return (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={s.body}>
              <Text style={s.stepLabel}>Étape 1</Text>
              <Text style={s.question}>Pour commencer, quel est ton prénom ?</Text>
              <TextInput
                style={s.input}
                value={prenom}
                onChangeText={setPrenom}
                placeholder="Prénom"
                placeholderTextColor={colors.textSecondary}
                autoFocus
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => prenom.trim() && nextStep()}
              />
            </View>
            <View style={s.nextRow}>
              <NextButton disabled={!prenom.trim()} onPress={nextStep} />
            </View>
          </KeyboardAvoidingView>
        );

      // ── Type de compte ───────────────────────────────────────────────────────
      case 'account': {
        const choices: { key: AccountChoice; emoji: string; title: string; sub: string }[] = [
          { key: 'standard', emoji: '🏃', title: 'Pratiquant', sub: 'Suis ta nutrition et tes entraînements' },
          { key: 'coach', emoji: '🎯', title: 'Coach', sub: 'Planifie les séances de tes élèves' },
          { key: 'student', emoji: '📚', title: 'Élève', sub: 'Ton coach planifie tes entraînements' },
        ];
        return (
          <>
            <View style={s.body}>
              <Text style={s.question}>Bienvenue {prenom} ! Tu comptes utiliser Gosh en tant que…</Text>
              {choices.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[s.choiceCard, accountChoice === c.key && s.choiceCardActive]}
                  onPress={() => setAccountChoice(c.key)}
                  activeOpacity={0.8}
                >
                  <Text style={s.choiceEmoji}>{c.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.choiceTitle}>{c.title}</Text>
                    <Text style={s.choiceSub}>{c.sub}</Text>
                  </View>
                  {accountChoice === c.key && <Ionicons name="checkmark-circle" size={24} color={colors.accent} />}
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.nextRow}>
              <NextButton disabled={!accountChoice} onPress={nextStep} />
            </View>
          </>
        );
      }

      // ── Code secret coach ────────────────────────────────────────────────────
      case 'coach_secret':
        return (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={s.body}>
              <Text style={s.question}>Accès coach 🎯</Text>
              <Text style={s.subtitle}>Renseigne ton code qui t'a été fourni par Gosh.</Text>
              <TextInput
                style={s.input}
                value={coachSecret}
                onChangeText={setCoachSecret}
                placeholder="CODE-XXXX"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
              />
            </View>
            <View style={s.nextRow}>
              <NextButton disabled={!coachSecret.trim()} loading={loading} onPress={verifyCoachSecret} />
            </View>
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  'Demande de compte coach',
                  'Un mail va s\'ouvrir. Remplis les champs vides et envoie-le. On reviendra vers toi avec ton code sous 48h.',
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Envoyer le mail',
                      onPress: () => {
                        const body = [
                          'Bonjour,',
                          '',
                          'Je souhaite devenir coach sur Gosh et obtenir mon code d\'acces.',
                          '',
                          '=== MES INFORMATIONS ===',
                          '',
                          'Prenom : ',
                          'Nom : ',
                          'Email du compte Gosh : ',
                          '',
                          '=== MON DIPLOME / MA CERTIFICATION ===',
                          '',
                          'Intitule du diplome ou certification : (ex : BPJEPS, STAPS, CQP, Personal Trainer...)',
                          'Numero du diplome : ',
                          'Annee d\'obtention : ',
                          '',
                          'Note : le numero de diplome sera utilise uniquement pour verifier',
                          'l\'authenticite de votre certification. Ces informations restent',
                          'confidentielles et ne seront pas diffusees sur l\'application.',
                          '',
                          '=== CE QUE JE FERAI APRES AVOIR RECU MON CODE ===',
                          '',
                          '1. Je rouvre l\'app Gosh',
                          '2. Je me connecte avec mon email et mon mot de passe',
                          '3. Je repasse par les etapes d\'inscription',
                          '4. Je choisis "Compte Coach"',
                          '5. Je renseigne le code que vous m\'aurez envoye',
                          '6. Mon compte coach est active',
                          '',
                          'Merci de traiter ma demande. Je reste disponible si vous avez besoin d\'informations supplementaires.',
                        ].join('\n');
                        Linking.openURL(`mailto:gosh.app.contact@gmail.com?subject=${encodeURIComponent('Demande compte coach Gosh')}&body=${encodeURIComponent(body)}`);
                      },
                    },
                  ]
                );
              }}
              style={{ alignItems: 'center', paddingBottom: 24 }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                Tu n'as pas de code ?{' '}
                <Text style={{ color: colors.accent, textDecorationLine: 'underline' }}>
                  Envoyer une demande
                </Text>
              </Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        );

      // ── Recherche coach (élève) ───────────────────────────────────────────────
      case 'student_coach':
        return (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={s.body}>
              <Text style={s.question}>As-tu un code coach ?</Text>
              <Text style={s.subtitle}>Entre le pseudo coach de ton coach (ex : thomas.gosh)</Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: colors.card, borderRadius: 14,
                borderWidth: 1, borderColor: colors.border,
                paddingHorizontal: spacing.md, gap: 8,
              }}>
                <TextInput
                  style={[s.input, { flex: 1, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0 }]}
                  value={coachCodeInput}
                  onChangeText={setCoachCodeInput}
                  placeholder="pseudo.gosh"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
                {coachCodeInput.length > 0 && (
                  <TouchableOpacity onPress={() => setCoachCodeInput('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={s.nextRow}>
              <NextButton disabled={!coachCodeInput.trim()} loading={coachSearching} onPress={searchCoach} />
            </View>
          </KeyboardAvoidingView>
        );

      // ── Confirmation coach trouvé ─────────────────────────────────────────────
      case 'student_confirm':
        return (
          <>
            <View style={s.body}>
              <Text style={s.question}>Ton coach a été trouvé !</Text>
              <Text style={s.subtitle}>Il recevra ta demande et pourra commencer à planifier tes séances.</Text>
              {coachFound && <CoachFoundCard coach={coachFound} />}
            </View>
            <View style={s.nextRow}>
              <NextButton onPress={nextStep} />
            </View>
          </>
        );

      // ── Sexe ─────────────────────────────────────────────────────────────────
      case 'sex':
        return (
          <>
            <View style={s.body}>
              <Text style={s.question}>Tu es…</Text>

              {/* Info box collecte de données sensibles */}
              <View style={{ backgroundColor: colors.accent + '18', borderRadius: 12, padding: spacing.md, borderWidth: 1, borderColor: colors.accent + '40', flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle-outline" size={18} color={colors.accent} style={{ marginTop: 1 }} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, flex: 1 }}>
                  Cette information est utilisée uniquement pour personnaliser tes recommandations nutritionnelles et sportives. Elle n'est jamais partagée avec des tiers.
                </Text>
              </View>

              {(['male', 'female'] as Sex[]).map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[s.optionBtn, sex === val && s.optionBtnActive]}
                  onPress={() => setSex(val)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.optionLabel, sex === val && s.optionLabelActive]}>
                    {val === 'male' ? '👨 Homme' : '👩 Femme'}
                  </Text>
                </TouchableOpacity>
              ))}

              {/* Consentement RGPD */}
              <TouchableOpacity
                onPress={() => setConsentData((v) => !v)}
                activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 4 }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                  borderColor: consentData ? colors.accent : colors.textSecondary,
                  backgroundColor: consentData ? colors.accent : 'transparent',
                  alignItems: 'center', justifyContent: 'center', marginTop: 1,
                }}>
                  {consentData && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, flex: 1 }}>
                  J'accepte que Gosh utilise mes données personnelles (sexe, taille, poids, activité) dans le but exclusif de personnaliser mon suivi sportif et nutritionnel.
                </Text>
              </TouchableOpacity>
            </View>
            <View style={s.nextRow}>
              <NextButton disabled={!consentData} onPress={nextStep} />
            </View>
          </>
        );

      // ── Taille & Poids ────────────────────────────────────────────────────────
      case 'measurements':
        return (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={s.body}>
              <Text style={s.question}>Ta taille et ton poids</Text>

              {/* Info box collecte de données */}
              <View style={{ backgroundColor: colors.accent + '18', borderRadius: 12, padding: spacing.md, borderWidth: 1, borderColor: colors.accent + '40', flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle-outline" size={18} color={colors.accent} style={{ marginTop: 1 }} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, flex: 1 }}>
                  Ces données sont utilisées uniquement pour calculer tes apports caloriques personnalisés.
                  {accountChoice === 'student' ? '\n\nEn tant qu\'élève, ton coach y aura accès pour assurer ton suivi.' : ''}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Taille (cm)</Text>
                  <TextInput
                    style={s.smallInput}
                    value={height}
                    onChangeText={setHeight}
                    placeholder="175"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Poids (kg)</Text>
                  <TextInput
                    style={s.smallInput}
                    value={weight}
                    onChangeText={setWeight}
                    placeholder="70"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            </View>
            <View style={s.nextRow}>
              <NextButton disabled={!height.trim() || !weight.trim()} onPress={nextStep} />
            </View>
          </KeyboardAvoidingView>
        );

      // ── Activité ──────────────────────────────────────────────────────────────
      case 'activity':
        return (
          <>
            <View style={s.body}>
              <Text style={s.question}>Quel est ton niveau d'activité ?</Text>
              {ACTIVITY_OPTIONS.map((a) => (
                <TouchableOpacity
                  key={a.key}
                  style={[s.optionBtn, activity === a.key && s.optionBtnActive]}
                  onPress={() => setActivity(a.key)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[s.optionLabel, activity === a.key && s.optionLabelActive]}>{a.label}</Text>
                    <Text style={{ color: activity === a.key ? colors.accent : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{a.steps}</Text>
                  </View>
                  <Text style={s.optionDesc}>{a.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.nextRow}>
              <NextButton onPress={nextStep} />
            </View>
          </>
        );

      // ── Objectif ──────────────────────────────────────────────────────────────
      case 'objective':
        return (
          <PhaseStep
            phase={phase}
            setPhase={setPhase}
            loading={loading}
            onSave={accountChoice === 'standard' ? nextStep : handleSave}
            styles={s}
          />
        );

      // ── Maintenance (standard uniquement) ─────────────────────────────────────
      case 'maintenance':
        return (
          <MaintenanceStep
            phase={phase}
            setPhase={setPhase}
            maintenanceKnown={maintenanceKnown}
            setMaintenanceKnown={setMaintenanceKnown}
            knownMaintenanceValue={knownMaintenanceValue}
            setKnownMaintenanceValue={setKnownMaintenanceValue}
            loading={loading}
            onSave={handleSave}
            styles={s}
          />
        );

      default:
        return null;
    }
  };

  return (
    <View style={s.screen}>
      <SafeAreaView style={s.safeArea}>
        {/* Progress bar */}
        <View style={s.progressBar}>
          <Animated.View style={[s.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        {/* Back button */}
        <TouchableOpacity style={s.backBtn} onPress={goBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>

        {renderContent()}
      </SafeAreaView>
    </View>
  );
}

// ─── Phase step avec tooltip ──────────────────────────────────────────────────

function PhaseStep({ phase, setPhase, loading, onSave, styles: s }: {
  phase: Phase;
  setPhase: (p: Phase) => void;
  loading: boolean;
  onSave: () => void;
  styles: any;
}) {
  const colors = useColors();
  const [openDesc, setOpenDesc] = useState<Phase | null>(null);

  return (
    <>
      <View style={s.body}>
        <Text style={s.question}>
          Quel est ton objectif actuel ?{'  '}
          <Text onPress={() => Alert.alert('Information', 'Les apports caloriques calculés sont indicatifs et basés sur tes données personnelles. Ils ne remplacent pas l\'avis d\'un professionnel de santé ou d\'un nutritionniste.', [{ text: 'OK' }])}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          </Text>
        </Text>
        {PHASE_OPTIONS.map((p) => (
          <View key={p.key}>
            <TouchableOpacity
              style={[s.optionBtn, phase === p.key && s.optionBtnActive]}
              onPress={() => setPhase(p.key)}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[s.optionLabel, phase === p.key && s.optionLabelActive]}>
                  {p.emoji} {p.label}
                </Text>
                <TouchableOpacity
                  onPress={() => setOpenDesc(openDesc === p.key ? null : p.key)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={{
                    width: 20, height: 20, borderRadius: 10,
                    backgroundColor: openDesc === p.key ? colors.accent : colors.border,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: openDesc === p.key ? '#fff' : colors.textSecondary, fontSize: 11, fontWeight: '800' }}>i</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
            {openDesc === p.key && (
              <View style={{ backgroundColor: colors.accent + '12', borderRadius: 10, padding: 12, marginTop: 4, marginHorizontal: 2 }}>
                <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>{p.desc}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
      <View style={s.nextRow}>
        <NextButton loading={loading} onPress={onSave} isCheck />
      </View>
    </>
  );
}

// ─── Maintenance step (standard uniquement) ───────────────────────────────────

function MaintenanceStep({ phase, setPhase, maintenanceKnown, setMaintenanceKnown, knownMaintenanceValue, setKnownMaintenanceValue, loading, onSave, styles: s }: {
  phase: Phase;
  setPhase: (p: Phase) => void;
  maintenanceKnown: boolean | null;
  setMaintenanceKnown: (v: boolean) => void;
  knownMaintenanceValue: string;
  setKnownMaintenanceValue: (v: string) => void;
  loading: boolean;
  onSave: (phaseOverride?: Phase) => void;
  styles: any;
}) {
  const colors = useColors();

  if (phase === 'pre-preparation') {
    // L'utilisateur a choisi Préparation — pas besoin de demander la maintenance, on save directement
    return (
      <>
        <View style={s.body}>
          <Text style={s.question}>Parfait, tu pars en Préparation 🏆</Text>
          <View style={{ backgroundColor: colors.accent + '18', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.accent + '40', gap: 8 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Ce que va faire l'app pour toi</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
              On part du TDEE estimé et on remonte progressivement les calories jusqu'à trouver ta vraie maintenance — le niveau où ton poids se stabilise. Ensuite, tu choisiras ton objectif (déficit, bulk…) avec une base solide.
            </Text>
          </View>
        </View>
        <View style={s.nextRow}>
          <NextButton loading={loading} onPress={onSave} isCheck />
        </View>
      </>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={s.body}>
        <Text style={s.question}>Tu connais ta maintenance calorique ?</Text>
        <Text style={s.subtitle}>C'est le nombre de calories où ton poids reste stable.</Text>

        <TouchableOpacity
          style={[s.optionBtn, maintenanceKnown === true && s.optionBtnActive]}
          onPress={() => setMaintenanceKnown(true)}
          activeOpacity={0.8}
        >
          <Text style={[s.optionLabel, maintenanceKnown === true && s.optionLabelActive]}>✅ Oui, je la connais</Text>
          <Text style={s.optionDesc}>Je renseigne ma valeur pour partir sur une base précise</Text>
        </TouchableOpacity>

        {maintenanceKnown === true && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Ma maintenance (kcal / jour)</Text>
            <TextInput
              style={s.input}
              value={knownMaintenanceValue}
              onChangeText={setKnownMaintenanceValue}
              placeholder="ex : 2800"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              autoFocus
              returnKeyType="done"
            />
          </View>
        )}

        <TouchableOpacity
          style={[s.optionBtn, maintenanceKnown === false && s.optionBtnActive]}
          onPress={() => setMaintenanceKnown(false)}
          activeOpacity={0.8}
        >
          <Text style={[s.optionLabel, maintenanceKnown === false && s.optionLabelActive]}>❓ Non, je ne sais pas</Text>
          <Text style={s.optionDesc}>L'app va m'aider à la découvrir</Text>
        </TouchableOpacity>

        {maintenanceKnown === false && (
          <View style={{ backgroundColor: colors.surface ?? colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>💡 On te conseille de commencer par la Préparation</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              Partir en déficit depuis un TDEE estimé, c'est risqué. La phase Préparation te permet de découvrir ta vraie maintenance en 2–4 semaines pour un déficit bien plus efficace ensuite.
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: colors.accent, borderRadius: 12, padding: 14, alignItems: 'center' }}
              onPress={() => { setPhase('pre-preparation'); onSave('pre-preparation'); }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Commencer par la Préparation (recommandé)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}
              onPress={() => onSave()}
              activeOpacity={0.85}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 14 }}>Continuer quand même (TDEE estimé)</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {maintenanceKnown === true && (
        <View style={s.nextRow}>
          <NextButton
            loading={loading}
            disabled={!knownMaintenanceValue.trim() || isNaN(parseInt(knownMaintenanceValue))}
            onPress={onSave}
            isCheck
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Coach found card (animée) ────────────────────────────────────────────────

function CoachFoundCard({ coach }: { coach: { uid: string; pseudo: string; firstName?: string; photoUrl?: string } }) {
  const colors = useColors();
  const cardY = useRef(new Animated.Value(60)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const avatarScale = useRef(new Animated.Value(0.5)).current;
  const badgePulse = useRef(new Animated.Value(1)).current;

  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(cardY, { toValue: 0, damping: 18, stiffness: 200, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]),
      Animated.spring(avatarScale, { toValue: 1, damping: 12, stiffness: 250, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1.3, duration: 200, useNativeDriver: true }),
        Animated.spring(badgePulse, { toValue: 1, damping: 8, stiffness: 300, useNativeDriver: true }),
      ]),
    ]).start(() => {
      // Battement de cœur en boucle sur le badge après l'entrée
      Animated.loop(
        Animated.sequence([
          Animated.timing(badgePulse, { toValue: 1.35, duration: 120, useNativeDriver: true }),
          Animated.timing(badgePulse, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(badgePulse, { toValue: 1.2, duration: 100, useNativeDriver: true }),
          Animated.timing(badgePulse, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.delay(900),
        ])
      ).start();
    });
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    const timer = setTimeout(() => loop.start(), 800);
    return () => { clearTimeout(timer); loop.stop(); };
  }, []);

  return (
    <Animated.View style={[
      { alignItems: 'center', gap: spacing.md },
      { opacity: cardOpacity, transform: [{ translateY: cardY }] },
    ]}>
      {/* Avatar + glow : deux Animated.View séparés pour éviter le conflit native/JS driver */}
      <Animated.View style={{
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [4, 12] }) as any },
        shadowOpacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] }) as any,
        shadowRadius: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 28] }) as any,
        elevation: 12,
        borderRadius: 48,
      }}>
        <Animated.View style={{ transform: [{ scale: avatarScale }], borderRadius: 48 }}>
          {coach.photoUrl ? (
            <Image
              source={{ uri: coach.photoUrl }}
              style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: colors.accent }}
            />
          ) : (
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.accent }}>
              <Ionicons name="person" size={44} color={colors.textSecondary} />
            </View>
          )}
        </Animated.View>
      </Animated.View>

      {/* Nom + badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '900' }}>{coach.firstName ?? coach.pseudo}</Text>
        <Animated.Image
          source={COACH_BADGE}
          style={{ width: 24, height: 24, transform: [{ scale: badgePulse }] }}
          resizeMode="contain"
        />
      </View>

      <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center' }}>
        Coach certifié Gosh
      </Text>

      <View style={{ backgroundColor: colors.accent + '18', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13, textAlign: 'center' }}>
          ✓ Demande envoyée à validation
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Welcome screen ───────────────────────────────────────────────────────────

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}>
      <Animated.Image
        source={LOGO}
        style={{ width: 140, height: 140, marginBottom: spacing.xl, opacity: pulse }}
        resizeMode="contain"
      />
      <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', marginBottom: 8, textAlign: 'center' }}>
        Bienvenue sur Gosh
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 16, textAlign: 'center', marginBottom: spacing.xl * 2 }}>
        Nutrition, entraînement et suivi — tout en un.
      </Text>
      <TouchableOpacity
        style={{ backgroundColor: colors.accent, borderRadius: 20, paddingVertical: 18, paddingHorizontal: 36, alignItems: 'center' }}
        onPress={onStart}
        activeOpacity={0.85}
      >
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Je suis prêt à rejoindre le club</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Next button ──────────────────────────────────────────────────────────────

function NextButton({ onPress, disabled = false, loading = false, isCheck = false }: {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  isCheck?: boolean;
}) {
  const colors = useColors();
  const shadowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (disabled) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shadowAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(shadowAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [disabled]);

  const shadowRadius = shadowAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 24] });
  const shadowOffsetY = shadowAnim.interpolate({ inputRange: [0, 1], outputRange: [4, 10] });
  const shadowOpacity = shadowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] });

  return (
    <Animated.View style={{
      shadowColor: disabled ? 'transparent' : colors.accent,
      shadowOffset: { width: 0, height: shadowOffsetY as any },
      shadowOpacity: disabled ? 0 : shadowOpacity as any,
      shadowRadius: disabled ? 0 : shadowRadius as any,
      elevation: disabled ? 0 : 12,
      borderRadius: 32,
    }}>
      <TouchableOpacity
        style={{
          width: 64, height: 64, borderRadius: 32,
          backgroundColor: disabled ? colors.border : colors.accent,
          alignItems: 'center', justifyContent: 'center',
        }}
        onPress={disabled || loading ? undefined : onPress}
        activeOpacity={disabled ? 1 : 0.85}
      >
        {loading
          ? <Ionicons name="hourglass-outline" size={26} color="#fff" />
          : <Ionicons name={isCheck ? 'checkmark' : 'arrow-forward'} size={26} color="#fff" />
        }
      </TouchableOpacity>
    </Animated.View>
  );
}
