import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../components/Button';
import PulsingLoader from '../components/PulsingLoader';
import UserBadge from '../components/UserBadge';
import { radius, spacing, useColors } from '../constants/theme';
import { ActivityLevel, AppState, Phase, Profile } from '../types';
import { calculateCalorieGoal, calculateTDEE, getEffectiveMaintenance, STEP_GOAL_BY_ACTIVITY } from '../utils/calculations';
import { cancelCoachRequest } from '../utils/coachStorage';
import { deleteAccount } from '../utils/deleteAccount';
import { auth, db } from '../utils/firebase';
import { scheduleWeighReminder } from '../utils/notifications';
import { unblockUser } from '../utils/reportUser';
import { loadState, saveState } from '../utils/storage';
import { updateUserName } from '../utils/updateUserName';
import { uploadImage } from '../utils/uploadImage';

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sédentaire', light: 'Légère', moderate: 'Modérée', active: 'Élevée', athlete: 'Athlète',
};
const ACTIVITY_STEPS: Record<ActivityLevel, string> = {
  sedentary: '<3k', light: '3–8k', moderate: '8–13k', active: '13–18k', athlete: '>18k',
};
const PHASE_LABELS: Record<Phase, string> = {
  'pre-preparation': 'Préparation',
  'deficit-down': 'Déficit ↓',
  'deficit-up': 'Déficit ↑',
  'reverse-diet': 'Reverse diet',
  'bulk': 'Bulk',
};

export default function ProfilModal() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pseudo, setPseudo] = useState('');
  const [prenom, setPrenom] = useState('');
  const [accountType, setAccountType] = useState<'standard' | 'coach' | 'student' | 'admin'>('standard');
  const [verified, setVerified] = useState(false);
  const [coachCode, setCoachCode] = useState('');
  const [coachStatus, setCoachStatus] = useState<'pending' | 'accepted' | null>(null);
  const [coachUid, setCoachUid] = useState<string | null>(null);
  const [coachRequestId, setCoachRequestId] = useState<string | null>(null);
  const [showCoachRequestModal, setShowCoachRequestModal] = useState(false);
  const [coachInfo, setCoachInfo] = useState<{ pseudo: string; prenom: string; photoUrl: string; verified: boolean; sentAt: number | null } | null>(null);

  const [prenomEditing, setPrenomEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [blockedList, setBlockedList] = useState<{ uid: string; pseudo: string; prenom?: string; photoUrl?: string }[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [coachCalorieManaged, setCoachCalorieManaged] = useState(false);
  const [firestoreCalorieGoal, setFirestoreCalorieGoal] = useState<number | null>(null);
  const [coachMacros, setCoachMacros] = useState<{ proteins: number; fats: number; carbs: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await loadState();
    if (s) {
      const me = auth.currentUser;
      if (me && s.profiles.length > 0) {
        try {
          const userDoc = await getDoc(doc(db, 'users', me.uid));
          const data = userDoc.data();
          const photoUrl = data?.photoUrl;
          let dirty = false;
          if (photoUrl && photoUrl.startsWith('https://') && s.profiles[0].photo !== photoUrl) {
            s.profiles[0].photo = photoUrl;
            dirty = true;
          }
          // Birthdate : priorité users/{uid}, fallback appState/main
          let bd: string | undefined = data?.birthdate;
          if (!bd) {
            try {
              const appSnap = await getDoc(doc(db, 'users', me.uid, 'appState', 'main'));
              if (appSnap.exists()) bd = appSnap.data()?.profiles?.[0]?.birthdate;
            } catch {}
          }
          if (bd && s.profiles[0].birthdate !== bd) dirty = true;
          // Reconstruire le profil avec birthdate pour forcer un nouveau state ref
          const updatedProfile = bd ? { ...s.profiles[0], birthdate: bd } : s.profiles[0];
          const updatedState = { ...s, profiles: [updatedProfile, ...s.profiles.slice(1)] };
          if (dirty) await saveState(updatedState);
          setState(updatedState);
          if (data?.pseudo) setPseudo(data.pseudo);
          if (data?.prenom) setPrenom(data.prenom);
          if (data?.accountType) setAccountType(data.accountType);
          setVerified(data?.verified ?? false);
          if (data?.coachCode) setCoachCode(data.coachCode);
          if (data?.coachStatus) setCoachStatus(data.coachStatus);
          if (data?.coachUid) setCoachUid(data.coachUid);
          if (data?.coachRequestId) setCoachRequestId(data.coachRequestId);
          const isCoachManaged = !!data?.nutritionCoachEnabled && !!data?.calorieGoalManual;
          setCoachCalorieManaged(isCoachManaged);
          setFirestoreCalorieGoal(isCoachManaged && data?.calorieGoal ? data.calorieGoal : null);
          setCoachMacros(isCoachManaged && data?.coachMacroManual && data?.coachMacroProteins != null
            ? { proteins: data.coachMacroProteins, fats: data.coachMacroFats, carbs: data.coachMacroCarbs }
            : null);
        } catch {}
      }
      setState(s);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCoachRequestModal = useCallback(async () => {
    setShowCoachRequestModal(true);
    if (coachInfo) return;
    try {
      const me = auth.currentUser;
      if (!me || !coachUid) return;
      // Infos du coach
      const coachDoc = await getDoc(doc(db, 'users', coachUid));
      const coachData = coachDoc.data();
      // Date d'envoi depuis coachRequests
      let sentAt: number | null = null;
      if (coachRequestId) {
        const reqDoc = await getDoc(doc(db, 'coachRequests', coachRequestId));
        if (reqDoc.exists()) sentAt = reqDoc.data().createdAt ?? null;
      }
      setCoachInfo({
        pseudo: coachData?.pseudo ?? '—',
        prenom: coachData?.prenom ?? '',
        photoUrl: coachData?.photoUrl ?? '',
        verified: coachData?.verified ?? false,
        sentAt,
      });
    } catch {}
  }, [coachUid, coachRequestId, coachInfo]);

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    sheet: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, minHeight: 56 },
    headerTitle: { color: colors.text, fontSize: 17, fontWeight: '600' as const, flex: 1, textAlign: 'center' as const },
    content: { padding: spacing.md, gap: spacing.lg, paddingBottom: 48 },

    // Avatar
    avatarWrap: { alignItems: 'center' as const, paddingVertical: spacing.lg, gap: 12 },
    avatarRing: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: colors.accent, overflow: 'hidden' as const, shadowColor: colors.accent, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
    avatarImg: { width: '100%', height: '100%' },
    avatarPlaceholder: { width: '100%', height: '100%', backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
    avatarCamBadge: { position: 'absolute' as const, bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2.5, borderColor: colors.bg },
    avatarName: { color: colors.text, fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3 },
    avatarNameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },

    // Section label
    sectionLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: -4, paddingLeft: 4 },

    // Card groupée iOS-style
    card: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' as const, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: spacing.md, paddingVertical: 14, gap: 12 },
    rowDivider: { marginLeft: spacing.md + 42, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    rowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center' as const, justifyContent: 'center' as const },
    rowLabel: { color: colors.textSecondary, fontSize: 11, marginBottom: 2, fontWeight: '500' as const },
    rowValue: { color: colors.text, fontSize: 15, fontWeight: '600' as const },
    rowInput: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' as const, padding: 0 },
    rowRight: { marginLeft: 'auto' as any, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },

    // Calorie card
    calorieCard: { backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: colors.accent + '33', shadowColor: colors.accent, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    calorieSplit: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-end' as const },
    calorieLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
    calorieVal: { color: colors.text, fontSize: 15, fontWeight: '600' as const, marginTop: 2 },
    calorieGoal: { color: colors.accent, fontSize: 26, fontWeight: '800' as const, marginTop: 2 },
    calorieDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    calorieInput: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, color: colors.text, fontSize: 15, marginTop: 4 },
    calorieHint: { color: colors.textSecondary, fontSize: 11, fontStyle: 'italic' as const, marginTop: 4 },

    // Chips
    chipRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
    chipActive: { backgroundColor: colors.accent + '18', borderColor: colors.accent },
    chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' as const },
    chipTextActive: { color: colors.accent, fontWeight: '700' as const },
    chipSub: { color: colors.textSecondary, fontSize: 9, marginTop: 2 },
    chipSubActive: { color: colors.accent + 'AA' },

    // Statut badge
    statusCard: { borderRadius: radius.md, padding: spacing.md, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  }), [colors]);

  if (loading || !state) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <PulsingLoader size={52} />
      </View>
    );
  }

  const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId)!;
  const tdee = calculateTDEE(activeProfile);
  const calorieGoal = coachMacros
    ? Math.round(coachMacros.proteins * 4 + coachMacros.fats * 9 + coachMacros.carbs * 4)
    : firestoreCalorieGoal ?? calculateCalorieGoal(activeProfile);

  const handleSignOut = async () => {
    Alert.alert('Se déconnecter ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: async () => { await signOut(auth); router.replace('/auth'); } },
      // AsyncStorage intentionnellement NON vidé ici — les données sont keyed par UID,
      // donc un nouvel utilisateur ne lira jamais les données de l'ancien.
    ]);
  };

  const toggleNotif = async (key: keyof Profile['notificationsEnabled']) => {
    const val = !activeProfile.notificationsEnabled[key];
    const profiles = state.profiles.map((p) =>
      p.id === activeProfile.id ? { ...p, notificationsEnabled: { ...p.notificationsEnabled, [key]: val } } : p
    );
    const next = { ...state, profiles };
    await saveState(next);
    setState(next);
    if (key === 'weigh') await scheduleWeighReminder(val);
  };

  const FIRESTORE_SYNC_FIELDS = new Set(['height', 'weight', 'age', 'sex', 'activityLevel', 'birthdate', 'calorieGoal', 'calorieGoalManual', 'knownMaintenance', 'phase']);

  const updateField = async (field: keyof Profile, value: any) => {
    const profiles = state.profiles.map((p) => {
      if (p.id !== activeProfile.id) return p;
      const updated = { ...p, [field]: value };
      if (field === 'activityLevel') updated.stepGoal = STEP_GOAL_BY_ACTIVITY[value as ActivityLevel];
      // knownMaintenance est une référence, pas un objectif — ne pas toucher calorieGoal
      if (field === 'phase') {
        // Changement manuel de phase : réinitialise tous les compteurs d'alerte
        updated.phaseChangedAt = new Date().toISOString();
        updated.phaseAlertSentAt = undefined;
        updated.phaseAlert2SentAt = undefined;
        updated.pendingPhaseChange = null;
        if (value === 'bulk') updated.bulkStartedAt = new Date().toISOString();
        // Si on quitte la Préparation, le calorieGoal actuel = maintenance découverte → on la mémorise
        if (p.phase === 'pre-preparation' && !p.knownMaintenance) {
          updated.knownMaintenance = p.calorieGoal;
        }
        // Repart de la maintenance comme baseline pour la nouvelle phase (sauf si objectif manuel actif)
        if (!p.calorieGoalManual) {
          updated.calorieGoal = updated.knownMaintenance ?? calculateTDEE(p);
        }
      }
      return updated;
    });
    const next = { ...state, profiles };
    await saveState(next);
    setState(next);
    if (field === 'phase') {
      const { cancelPhaseAlerts, scheduleBulkReminders } = await import('../utils/notifications');
      await cancelPhaseAlerts();
      if (value === 'bulk') await scheduleBulkReminders();
    }
    // Sync vers Firestore pour que le coach puisse lire ces infos
    const me = auth.currentUser;
    if (me && FIRESTORE_SYNC_FIELDS.has(field)) {
      updateDoc(doc(db, 'users', me.uid), { [field]: value }).catch(() => {});
    }
  };

  const savePrenom = async () => {
    const me = auth.currentUser;
    const val = prenom.trim();
    if (!me || !val) return;
    try {
      await updateUserName(me.uid, val);
      await updateField('name', val);
      setPrenom(val);
      setPrenomEditing(false);
    } catch {
      Alert.alert('Erreur', 'Impossible de mettre à jour le prénom.');
    }
  };

const pickPhoto = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission refusée', "Active l'accès à la galerie dans les réglages."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images' as any, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
      if (!result.canceled && result.assets[0]) {
        const cloudUrl = await uploadImage(result.assets[0].uri, 'avatars');
        await updateField('photo', cloudUrl);
        const me = auth.currentUser;
        if (me) await updateDoc(doc(db, 'users', me.uid), { photoUrl: cloudUrl });
      }
    } catch {
      Alert.alert('Non disponible', "Relance l'app avec npx expo run:ios pour activer cette fonctionnalité.");
    }
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.sheet} edges={['bottom']}>

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' }} accessibilityLabel="Retour" accessibilityRole="button">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profil</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">

          {/* ── Avatar ── */}
          <View style={styles.avatarWrap}>
            <TouchableOpacity onPress={pickPhoto} activeOpacity={0.85} style={{ position: 'relative' }}>
              <View style={styles.avatarRing}>
                {activeProfile.photo ? (
                  <ExpoImage source={{ uri: activeProfile.photo }} style={styles.avatarImg} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={{ color: colors.accent, fontSize: 32, fontWeight: '800' }}>{activeProfile.name?.[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                )}
              </View>
              <View style={styles.avatarCamBadge}>
                <Ionicons name="camera" size={13} color={colors.text} />
              </View>
            </TouchableOpacity>
            <View style={styles.avatarNameRow}>
              <Text style={styles.avatarName}>{prenom || activeProfile.name}</Text>
              <UserBadge accountType={accountType} verified={verified} size={20} />
            </View>
          </View>

          {/* ── Identité ── */}
          <View style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>Identité</Text>
            <View style={styles.card}>

              {/* Prénom */}
              <View style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: colors.accent + '20' }]}>
                  <Ionicons name="person-outline" size={16} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Prénom affiché</Text>
                  {prenomEditing ? (
                    <TextInput
                      style={styles.rowInput}
                      value={prenom}
                      onChangeText={setPrenom}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={savePrenom}
                    />
                  ) : (
                    <Text style={styles.rowValue}>{prenom || '—'}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={prenomEditing ? savePrenom : () => setPrenomEditing(true)} style={{ padding: 4 }}>
                  <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{prenomEditing ? 'OK' : 'Modifier'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.rowDivider} />

              {/* Pseudo */}
              <View style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: colors.accent + '20' }]}>
                  <Ionicons name="at-outline" size={16} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Pseudo · non modifiable</Text>
                  <Text style={[styles.rowValue, { color: colors.accent }]}>@{pseudo || '—'}</Text>
                </View>
                <TouchableOpacity onPress={async () => { if (pseudo) await Share.share({ message: `Retrouve-moi sur Gosh : @${pseudo}`, title: `@${pseudo}` }); }} style={{ padding: 8 }}>
                  <Ionicons name="share-outline" size={18} color={colors.accent} />
                </TouchableOpacity>
              </View>

              {/* Pseudo coach */}
              {accountType === 'coach' && coachCode ? (
                <>
                  <View style={styles.rowDivider} />
                  <View style={styles.row}>
                    <View style={[styles.rowIcon, { backgroundColor: colors.accent + '20' }]}>
                      <Ionicons name="ribbon-outline" size={16} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={styles.rowLabel}>Pseudo coach</Text>
                        <View style={{ backgroundColor: colors.accent, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>COACH</Text>
                        </View>
                      </View>
                      <Text style={[styles.rowValue, { color: colors.accent }]}>{coachCode}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}>Partage ce code à tes élèves</Text>
                    </View>
                    <TouchableOpacity onPress={() => Share.share({ message: `Mon pseudo coach sur Gosh : ${coachCode}`, title: coachCode })} style={{ padding: 8 }}>
                      <Ionicons name="share-outline" size={18} color={colors.accent} />
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {/* Demande de coaching en attente (compte standard) */}
              {accountType === 'standard' && coachStatus === 'pending' && (
                <>
                  <View style={styles.rowDivider} />
                  <TouchableOpacity style={styles.row} onPress={openCoachRequestModal} activeOpacity={0.7}>
                    <View style={[styles.rowIcon, { backgroundColor: colors.accent + '20' }]}>
                      <Ionicons name="hourglass-outline" size={16} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>Demande de coaching</Text>
                      <Text style={[styles.rowValue, { color: colors.accent }]}>En attente d'acceptation</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </>
              )}

              {/* Statut élève */}
              {accountType === 'student' && (
                <>
                  <View style={styles.rowDivider} />
                  <View style={styles.row}>
                    <View style={[styles.rowIcon, { backgroundColor: (coachStatus === 'accepted' ? colors.accentGreen : colors.accent) + '20' }]}>
                      <Ionicons name={coachStatus === 'accepted' ? 'checkmark-circle-outline' : 'hourglass-outline'} size={16} color={coachStatus === 'accepted' ? colors.accentGreen : colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>Statut élève</Text>
                      <Text style={[styles.rowValue, { color: coachStatus === 'accepted' ? colors.accentGreen : colors.accent }]}>
                        {coachStatus === 'accepted' ? 'Accepté par ton coach' : "En attente d'acceptation"}
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* ── Objectif calorique ── */}
          {accountType !== 'coach' && <View style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>Objectif calorique</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.textSecondary} style={{ marginTop: 1 }} />
              <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, flex: 1 }}>Ces valeurs sont indicatives et ne remplacent pas l'avis d'un professionnel de santé.</Text>
            </View>
            <View style={styles.calorieCard}>
              <View style={styles.calorieSplit} pointerEvents="none">
                <View>
                  <Text style={styles.calorieLabel}>{activeProfile.knownMaintenance ? 'Maintenance connue' : 'TDEE estimé'}</Text>
                  <Text style={styles.calorieVal}>{getEffectiveMaintenance(activeProfile)} kcal</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.calorieLabel}>Objectif actif</Text>
                  <Text style={styles.calorieGoal}>{calorieGoal} kcal</Text>
                </View>
              </View>
              <View style={styles.calorieDivider} />
              {coachCalorieManaged ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="lock-closed-outline" size={16} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>Objectif coach</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>Géré par ton coach · modifiable depuis l'onglet Repas</Text>
                  </View>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}
                    activeOpacity={1}
                    onPress={() => {
                      const hasKnown = !!activeProfile.knownMaintenance;
                      const ps = state!.profiles.map((p) => p.id !== activeProfile.id ? p : { ...p, knownMaintenance: hasKnown ? undefined : tdee });
                      const ns = { ...state!, profiles: ps };
                      saveState(ns);
                      setState(ns);
                      const me = auth.currentUser;
                      if (me && hasKnown) updateDoc(doc(db, 'users', me.uid), { knownMaintenance: null }).catch(() => {});
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>Maintenance connue</Text>
                    <Switch
                      value={!!activeProfile.knownMaintenance}
                      onValueChange={() => {}}
                      trackColor={{ false: colors.border, true: colors.accent }}
                      thumbColor="#ffffff"
                      pointerEvents="none"
                    />
                  </TouchableOpacity>
                  {!!activeProfile.knownMaintenance && (
                    <View>
                      <Text style={styles.calorieLabel}>Ma maintenance réelle (kcal)</Text>
                      <TextInput
                        style={styles.calorieInput}
                        defaultValue={String(activeProfile.knownMaintenance)}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        placeholderTextColor={colors.textSecondary}
                        onEndEditing={(e) => { const v = parseInt(e.nativeEvent.text); if (!isNaN(v) && v > 0) updateField('knownMaintenance', v); }}
                      />
                      <Text style={styles.calorieHint}>TDEE estimé : {tdee} kcal · ta valeur remplace le calcul automatique</Text>
                    </View>
                  )}
                  <View style={styles.calorieDivider} />
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}
                    activeOpacity={1}
                    onPress={() => {
                      const effectiveMaint = getEffectiveMaintenance(activeProfile);
                      const next = !activeProfile.calorieGoalManual;
                      const profiles = state!.profiles.map((p) => {
                        if (p.id !== activeProfile.id) return p;
                        return { ...p, calorieGoalManual: next, calorieGoal: next ? p.calorieGoal : effectiveMaint };
                      });
                      const nextState = { ...state!, profiles };
                      saveState(nextState);
                      setState(nextState);
                      const me = auth.currentUser;
                      if (me) updateDoc(doc(db, 'users', me.uid), { calorieGoalManual: next, calorieGoal: next ? activeProfile.calorieGoal : effectiveMaint }).catch(() => {});
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>Objectif personnalisé</Text>
                    <Switch
                      value={!!activeProfile.calorieGoalManual}
                      onValueChange={() => {}}
                      trackColor={{ false: colors.border, true: colors.accent }}
                      thumbColor="#ffffff"
                      pointerEvents="none"
                    />
                  </TouchableOpacity>
                  {!!activeProfile.calorieGoalManual && (
                    <View>
                      <Text style={styles.calorieLabel}>Calories cibles (kcal)</Text>
                      <TextInput
                        style={styles.calorieInput}
                        defaultValue={String(activeProfile.calorieGoal)}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        placeholderTextColor={colors.textSecondary}
                        onEndEditing={(e) => { const v = parseInt(e.nativeEvent.text); if (!isNaN(v) && v > 0) updateField('calorieGoal', v); }}
                      />
                      <Text style={styles.calorieHint}>Maintenance : {getEffectiveMaintenance(activeProfile)} kcal · Déficit 500 → {getEffectiveMaintenance(activeProfile) - 500} kcal</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>}

          {/* ── Paramètres physiques / Phase / Activité — masqués pour les coachs ── */}
          {accountType !== 'coach' && <>
          <View style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>Paramètres — {activeProfile.name}</Text>
            <View style={styles.card}>

              {/* Date de naissance — non modifiable */}
              <View style={[styles.row, { opacity: 0.7 }]}>
                <View style={[styles.rowIcon, { backgroundColor: '#3B82F620' }]}>
                  <Ionicons name="calendar-outline" size={16} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Date de naissance{activeProfile.age > 0 ? ` · ${activeProfile.age} ans` : ''}</Text>
                  <Text style={styles.rowValue}>
                    {activeProfile.birthdate ? activeProfile.birthdate.split('-').reverse().join('/') : 'Non renseigné'}
                  </Text>
                </View>
                <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
              </View>

              {([
                { label: 'Taille', field: 'height', value: String(activeProfile.height), suffix: 'cm', icon: 'resize-outline', color: '#8B5CF6' },
                { label: 'Poids actuel', field: 'weight', value: String(activeProfile.weight), suffix: 'kg', icon: 'scale-outline', color: '#F59E0B' },
                { label: 'Objectif de pas / jour', field: 'stepGoal', value: String(activeProfile.stepGoal), suffix: 'pas', icon: 'walk-outline', color: colors.accentGreen },
              ] as { label: string; field: keyof Profile; value: string; suffix: string; icon: string; color: string }[]).map(({ label, field, value, suffix, icon, color }, i) => (
                <React.Fragment key={field}>
                  <View style={styles.rowDivider} />
                  <View style={styles.row}>
                    <View style={[styles.rowIcon, { backgroundColor: color + '20' }]}>
                      <Ionicons name={icon as any} size={16} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>{label}</Text>
                      <TextInput
                        style={styles.rowInput}
                        defaultValue={value}
                        keyboardType={field === 'stepGoal' ? 'number-pad' : 'decimal-pad'}
                        returnKeyType="done"
                        placeholderTextColor={colors.textSecondary}
                        onEndEditing={(e) => {
                          const raw = e.nativeEvent.text;
                          const parsed = parseFloat(raw);
                          if (isNaN(parsed)) return;
                          if (field === 'stepGoal') {
                            const level: ActivityLevel = parsed < 3000 ? 'sedentary' : parsed < 8000 ? 'light' : parsed < 13000 ? 'moderate' : parsed < 18000 ? 'active' : 'athlete';
                            // Une seule mise à jour atomique pour éviter que activityLevel écrase stepGoal
                            const profiles = state.profiles.map((p) => {
                              if (p.id !== activeProfile.id) return p;
                              return { ...p, stepGoal: parsed, activityLevel: level };
                            });
                            const next = { ...state, profiles };
                            saveState(next).catch(() => {});
                            setState(next);
                          } else {
                            updateField(field, parsed);
                          }
                        }}
                      />
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{suffix}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>Phase</Text>
            <View style={styles.chipRow}>
              {(Object.keys(PHASE_LABELS) as Phase[]).map((ph) => (
                <TouchableOpacity key={ph} style={[styles.chip, activeProfile.phase === ph && styles.chipActive]} onPress={() => updateField('phase', ph)}>
                  <Text style={[styles.chipText, activeProfile.phase === ph && styles.chipTextActive]}>{PHASE_LABELS[ph]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>Niveau d'activité</Text>
            <View style={styles.chipRow}>
              {(['sedentary', 'light', 'moderate', 'active', 'athlete'] as ActivityLevel[]).map((a) => (
                <View key={a} style={[styles.chip, activeProfile.activityLevel === a && styles.chipActive]}>
                  <Text style={[styles.chipText, activeProfile.activityLevel === a && styles.chipTextActive]}>{ACTIVITY_LABELS[a]}</Text>
                  <Text style={[styles.chipSub, activeProfile.activityLevel === a && styles.chipSubActive]}>{ACTIVITY_STEPS[a]} pas</Text>
                </View>
              ))}
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
              Ajuste ton objectif de pas pour changer de niveau automatiquement.
            </Text>
          </View>
          </>}

          {/* ── Notifications ── */}
          {accountType !== 'coach' && <View style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>Notifications</Text>
            <View style={styles.card}>
              {([
                { key: 'weigh', label: 'Rappel pesée matinale', icon: 'scale-outline', color: '#F59E0B' },
                { key: 'stagnation', label: 'Alerte stagnation', icon: 'trending-down-outline', color: '#EF4444' },
              ] as { key: keyof Profile['notificationsEnabled']; label: string; icon: string; color: string }[]).map(({ key, label, icon, color }, i) => (
                <React.Fragment key={key}>
                  {i > 0 && <View style={styles.rowDivider} />}
                  <TouchableOpacity style={styles.row} activeOpacity={1} onPress={() => toggleNotif(key)}>
                    <View style={[styles.rowIcon, { backgroundColor: color + '20' }]}>
                      <Ionicons name={icon as any} size={16} color={color} />
                    </View>
                    <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>{label}</Text>
                    <Switch
                      value={activeProfile.notificationsEnabled[key]}
                      onValueChange={() => toggleNotif(key)}
                      trackColor={{ false: colors.border, true: colors.accent }}
                      thumbColor="#ffffff"
                      pointerEvents="none"
                    />
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>
          </View>}

          {/* ── Confidentialité ── */}
          <View style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>Confidentialité</Text>
            <View style={styles.card}>
              <TouchableOpacity
                onPress={async () => {
                  const uid = auth.currentUser?.uid;
                  if (!uid) return;
                  setBlockedLoading(true);
                  setShowBlockedModal(true);
                  try {
                    const snap = await getDoc(doc(db, 'users', uid));
                    const blockedUids: string[] = snap.data()?.blockedUsers ?? [];
                    if (blockedUids.length === 0) { setBlockedList([]); return; }
                    const users = await Promise.all(
                      blockedUids.map(async (bid) => {
                        const usnap = await getDoc(doc(db, 'users', bid));
                        const d = usnap.data();
                        return { uid: bid, pseudo: d?.pseudo ?? bid, prenom: d?.prenom, photoUrl: d?.photoUrl };
                      })
                    );
                    setBlockedList(users);
                  } finally {
                    setBlockedLoading(false);
                  }
                }}
                style={styles.row}
                activeOpacity={0.7}
              >
                <View style={[styles.rowIcon, { backgroundColor: '#64B5F620' }]}>
                  <Ionicons name="ban-outline" size={16} color="#64B5F6" />
                </View>
                <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>Comptes bloqués</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>


          {/* ── Abonnement ── */}
          <View style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>Abonnement</Text>
            <View style={styles.card}>
              <TouchableOpacity onPress={() => router.push('/abonnement')} style={styles.row} activeOpacity={0.7}>
                <View style={[styles.rowIcon, { backgroundColor: '#FFB80020' }]}>
                  <Ionicons name="star-outline" size={16} color="#FFB800" />
                </View>
                <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>Mon abonnement</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Aide & Support ── */}
          <View style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>Aide & Support</Text>
            <View style={styles.card}>
              <TouchableOpacity onPress={() => Linking.openURL('mailto:gosh.app.contact@gmail.com?subject=Support%20Gosh')} style={styles.row} activeOpacity={0.7}>
                <View style={[styles.rowIcon, { backgroundColor: colors.accent + '20' }]}>
                  <Ionicons name="mail-outline" size={16} color={colors.accent} />
                </View>
                <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>Contacter le support</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <View style={styles.rowDivider} />
              <TouchableOpacity onPress={() => Linking.openURL('mailto:gosh.app.contact@gmail.com?subject=Signalement%20bug%20Gosh')} style={styles.row} activeOpacity={0.7}>
                <View style={[styles.rowIcon, { backgroundColor: '#F59E0B20' }]}>
                  <Ionicons name="bug-outline" size={16} color="#F59E0B" />
                </View>
                <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>Signaler un bug</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <View style={styles.rowDivider} />
              <TouchableOpacity onPress={() => Linking.openURL('https://gosh-app-contact.github.io/gosh-app.fr/privacy')} style={styles.row} activeOpacity={0.7}>
                <View style={[styles.rowIcon, { backgroundColor: colors.textSecondary + '18' }]}>
                  <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
                </View>
                <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>Politique de confidentialité</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <View style={styles.rowDivider} />
              <TouchableOpacity onPress={() => Linking.openURL('https://gosh-app-contact.github.io/gosh-app.fr/cgu')} style={styles.row} activeOpacity={0.7}>
                <View style={[styles.rowIcon, { backgroundColor: colors.textSecondary + '18' }]}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.textSecondary} />
                </View>
                <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>Conditions d'utilisation</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <View style={styles.rowDivider} />
              <TouchableOpacity onPress={() => Linking.openURL('https://gosh-app-contact.github.io/gosh-app.fr/mentions-legales')} style={styles.row} activeOpacity={0.7}>
                <View style={[styles.rowIcon, { backgroundColor: colors.textSecondary + '18' }]}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                </View>
                <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>Mentions légales</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <View style={styles.rowDivider} />
              <TouchableOpacity
                onPress={() => Linking.openURL('mailto:gosh.app.contact@gmail.com?subject=Exercice%20de%20mes%20droits%20RGPD&body=Bonjour%2C%0A%0AJe%20souhaite%20exercer%20mes%20droits%20relatifs%20%C3%A0%20mes%20donn%C3%A9es%20personnelles%20(acc%C3%A8s%2C%20rectification%2C%20suppression%2C%20portabilit%C3%A9%2C%20opposition).%0A%0AMon%20adresse%20email%20de%20compte%20%3A%20')}
                style={styles.row}
                activeOpacity={0.7}
              >
                <View style={[styles.rowIcon, { backgroundColor: '#6366F118' }]}>
                  <Ionicons name="finger-print-outline" size={16} color="#6366F1" />
                </View>
                <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>Exercer mes droits (RGPD)</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Déconnexion + Suppression ── */}
          <Button label="Se déconnecter" variant="danger" onPress={handleSignOut} />
          <TouchableOpacity onPress={() => setShowDeleteModal(true)} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Supprimer mon compte</Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>

      {/* ── Modal demande de coaching ── */}
      <Modal visible={showCoachRequestModal} transparent animationType="fade" onRequestClose={() => setShowCoachRequestModal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl }} activeOpacity={1} onPress={() => setShowCoachRequestModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, width: 300, gap: spacing.md }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="hourglass-outline" size={18} color={colors.accent} />
                </View>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 }}>Demande de coaching</Text>
                <TouchableOpacity onPress={() => setShowCoachRequestModal(false)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={{ height: 1, backgroundColor: colors.border }} />

              {/* Statut + Date — largeurs fixes pour aligner */}
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 20, alignItems: 'center' }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>Statut</Text>
                  <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>En attente</Text>
                </View>
                {coachInfo?.sentAt ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 20, alignItems: 'center' }}>
                      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>Envoyée le</Text>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>
                      {new Date(coachInfo.sentAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={{ height: 1, backgroundColor: colors.border }} />

              {/* Infos coach */}
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Coach sollicité</Text>

              {coachInfo ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  {coachInfo.photoUrl ? (
                    <ExpoImage source={{ uri: coachInfo.photoUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} cachePolicy="memory-disk" />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="person-outline" size={24} color={colors.textSecondary} />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 3 }}>
                    {coachInfo.prenom ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{coachInfo.prenom}</Text>
                        <UserBadge accountType="coach" verified={coachInfo.verified} size={14} />
                      </View>
                    ) : null}
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>@{coachInfo.pseudo}</Text>
                  </View>
                </View>
              ) : (
                <PulsingLoader size={32} />
              )}

              <View style={{ height: 1, backgroundColor: colors.border }} />

              <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                Ta demande sera visible par le coach dans ses notifications. Elle sera acceptée ou refusée à sa discrétion.
              </Text>

              {/* Bouton annuler */}
              <Button
                label="Annuler la demande"
                variant="danger"
                onPress={() => {
                  Alert.alert(
                    'Annuler la demande',
                    'Es-tu sûr de vouloir annuler ta demande de coaching ?',
                    [
                      { text: 'Non', style: 'cancel' },
                      {
                        text: 'Oui, annuler',
                        style: 'destructive',
                        onPress: async () => {
                          const me = auth.currentUser;
                          if (!me) return;
                          try {
                            await cancelCoachRequest(me.uid);
                            setShowCoachRequestModal(false);
                            setCoachStatus(null);
                            setCoachUid(null);
                            setCoachRequestId(null);
                            setCoachInfo(null);
                          } catch {
                            Alert.alert('Erreur', "Impossible d'annuler la demande.");
                          }
                        },
                      },
                    ]
                  );
                }}
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Modal suppression de compte ── */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => { if (!deleting) setShowDeleteModal(false); }}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl }} activeOpacity={1} onPress={() => { if (!deleting) setShowDeleteModal(false); }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, width: 320, gap: spacing.md }}>

              {/* Header */}
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#FF3B3020', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="trash-outline" size={22} color="#FF3B30" />
                </View>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>Supprimer mon compte</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
                  Cette action est irréversible. Toutes tes données (profil, posts, historique, plan d'entraînement) seront définitivement supprimées.
                </Text>
              </View>

              <View style={{ height: 1, backgroundColor: colors.border }} />

              {/* Mot de passe */}
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>Confirme ton mot de passe</Text>
                <TextInput
                  style={{ backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 15 }}
                  placeholder="Mot de passe"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  autoCapitalize="none"
                  editable={!deleting}
                />
              </View>

              {/* Boutons */}
              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  disabled={!deletePassword.trim() || deleting}
                  onPress={async () => {
                    setDeleting(true);
                    try {
                      await deleteAccount(deletePassword);
                      router.replace('/auth');
                    } catch (e: any) {
                      const msg: Record<string, string> = {
                        'auth/wrong-password': 'Mot de passe incorrect.',
                        'auth/too-many-requests': 'Trop de tentatives, réessaie plus tard.',
                        'auth/requires-recent-login': 'Session expirée, reconnecte-toi d\'abord.',
                      };
                      Alert.alert('Erreur', msg[e.code] ?? 'Impossible de supprimer le compte.');
                      setDeleting(false);
                    }
                  }}
                  style={{ backgroundColor: !deletePassword.trim() || deleting ? '#FF3B3050' : '#FF3B30', borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  activeOpacity={0.85}
                >
                  {deleting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Ionicons name="trash" size={16} color="#fff" /><Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Supprimer définitivement</Text></>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowDeleteModal(false); setDeletePassword(''); }} disabled={deleting} style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Annuler</Text>
                </TouchableOpacity>
              </View>

            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Modal comptes bloqués ── */}
      <Modal visible={showBlockedModal} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowBlockedModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
            {/* Header — nav bar style iOS */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 16, paddingBottom: 14, paddingTop: insets.top + 14,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
              minHeight: 56,
            }}>
              <TouchableOpacity
                onPress={() => setShowBlockedModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' }}
                accessibilityLabel="Retour"
                accessibilityRole="button"
              >
                <Ionicons name="chevron-back" size={26} color={colors.text} />
              </TouchableOpacity>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center', marginRight: 44 }}>
                Comptes bloqués
              </Text>
            </View>

            {/* Description */}
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, paddingHorizontal: 20, paddingVertical: 14 }}>
              Les comptes bloqués ne peuvent pas voir ton profil, te contacter ni voir tes publications.
            </Text>

            {blockedLoading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.accent} size="large" />
              </View>
            ) : blockedList.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 }}>
                <Ionicons name="shield-checkmark-outline" size={56} color={colors.textSecondary} />
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>Aucun compte bloqué</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                  Les comptes que tu bloques apparaîtront ici.
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                {blockedList.map((u) => (
                  <View
                    key={u.uid}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 16, paddingVertical: 12,
                      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
                      minHeight: 72,
                    }}
                  >
                    {/* Avatar — 48pt */}
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginRight: 14, overflow: 'hidden' }}>
                      {u.photoUrl
                        ? <ExpoImage source={{ uri: u.photoUrl }} style={{ width: 48, height: 48 }} contentFit="cover" />
                        : <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '700' }}>{u.pseudo?.[0]?.toUpperCase() ?? '?'}</Text>}
                    </View>

                    {/* Identité */}
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', lineHeight: 20 }} numberOfLines={1}>
                        {u.prenom && u.prenom.trim() ? u.prenom : u.pseudo}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={1}>@{u.pseudo}</Text>
                    </View>

                    {/* Bouton débloquer — min 44pt HIG */}
                    <TouchableOpacity
                      onPress={() => Alert.alert(
                        `Débloquer @${u.pseudo} ?`,
                        'Ce compte pourra à nouveau voir ton profil et te contacter.',
                        [
                          { text: 'Annuler', style: 'cancel' },
                          { text: 'Débloquer', onPress: async () => {
                            await unblockUser(u.uid);
                            setBlockedList((prev) => prev.filter((b) => b.uid !== u.uid));
                          }},
                        ]
                      )}
                      style={{
                        minWidth: 100, minHeight: 44,
                        paddingHorizontal: 16, borderRadius: 22,
                        borderWidth: 1, borderColor: colors.border,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                      activeOpacity={0.7}
                      accessibilityLabel={`Débloquer @${u.pseudo}`}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Débloquer</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}
