import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Button from '../../components/Button';
import PulsingLoader from '../../components/PulsingLoader';
import UserBadge from '../../components/UserBadge';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert, Animated, PanResponder, Keyboard,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors, colors, spacing, radius } from '../../constants/theme';
import { loadState } from '../../utils/storage';
import { loadRepasState, saveRepasState, addMealEntry, removeMealEntry, setRepasStorageUid } from '../../utils/repasStorage';
import { getCurrentUid } from '../../utils/currentUser';
import { fetchByBarcode, searchByName } from '../../utils/openFoodFacts';
import {
  RepasState, MealEntry, FoodProduct,
  MEAL_TYPE_LABELS, computeNutrition,
} from '../../types/repas';
import { calculateCalorieGoal, calculateMacros } from '../../utils/calculations';
import { Profile } from '../../types';
import { Image } from 'react-native';
import { auth, db } from '../../utils/firebase';
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';

const MEAL_TYPES: MealEntry['mealType'][] = ['petit-dejeuner', 'dejeuner', 'collation', 'diner'];

const MEAL_CONFIG: Record<MealEntry['mealType'], { label: string; icon: string; color: string }> = {
  'petit-dejeuner': { label: 'Petit-déjeuner', icon: 'partly-sunny-outline', color: '#FF6B35' },
  dejeuner:         { label: 'Déjeuner',        icon: 'sunny-outline',        color: '#FF6B35' },
  collation:        { label: 'Collation',        icon: 'cafe-outline',         color: '#FF6B35' },
  diner:            { label: 'Dîner',            icon: 'moon-outline',         color: '#FF6B35' },
};

// ─── DetailSection / DetailRow ────────────────────────────────────────────────

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 1 }}>
      <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{title}</Text>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.sm, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

function DetailRow({ label, value, goal, sub, over, under, warn, warnMsg, underMsg }: {
  label: string; value: string; goal?: string; sub?: boolean;
  over?: boolean; under?: boolean; warn?: boolean; warnMsg?: string; underMsg?: string;
}) {
  const c = useColors();
  return (
    <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: sub ? c.textSecondary : c.text, fontSize: sub ? 12 : 14, fontWeight: sub ? '400' : '600' }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: over ? c.danger : under ? c.accentGreen : c.text, fontSize: 14, fontWeight: '700' }}>{value}</Text>
          {goal && <Text style={{ color: c.textSecondary, fontSize: 13 }}>/{goal}</Text>}
        </View>
      </View>
      {(warn && warnMsg) && <Text style={{ color: c.danger, fontSize: 11, marginTop: 2 }}>{warnMsg}</Text>}
      {(under && underMsg) && <Text style={{ color: c.accentGreen, fontSize: 11, marginTop: 2 }}>{underMsg}</Text>}
    </View>
  );
}

// ─── QtyPickerWheel ───────────────────────────────────────────────────────────

const QTY_VALUES = [
  5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
  55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
  110, 120, 130, 140, 150, 175, 200, 225, 250,
  275, 300, 350, 400, 450, 500,
];
const ITEM_H = 48;
const VISIBLE = 5;

function QtyPickerWheel({ value, onSelect }: { value: number; onSelect: (v: number) => void }) {
  const c = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const [selected, setSelected] = useState(value);

  const initialIdx = QTY_VALUES.reduce((best, v, i) =>
    Math.abs(v - value) < Math.abs(QTY_VALUES[best] - value) ? i : best, 0);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: initialIdx * ITEM_H, animated: false }), 50);
  }, []);

  return (
    <View style={{ height: ITEM_H * VISIBLE, position: 'relative' }}>
      <View style={{ position: 'absolute', top: ITEM_H * 2, height: ITEM_H, left: 0, right: 0, backgroundColor: c.accent + '18', borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.accent + '40', zIndex: 1 }} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
          const clamped = Math.max(0, Math.min(idx, QTY_VALUES.length - 1));
          setSelected(QTY_VALUES[clamped]);
          onSelect(QTY_VALUES[clamped]);
        }}
      >
        {QTY_VALUES.map((v) => {
          const active = v === selected;
          return (
            <TouchableOpacity key={v} style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }} onPress={() => { setSelected(v); onSelect(v); }} activeOpacity={0.7}>
              <Text style={{ color: active ? c.accent : c.text, fontSize: active ? 20 : 16, fontWeight: active ? '800' : '400' }}>{v} g</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── SwipeableProductRow ──────────────────────────────────────────────────────

const SWIPE_WIDTH = 64;

function SwipeableProductRow({ product, onPress, onDelete }: {
  product: FoodProduct; onPress: () => void; onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const open = useRef(false);

  const snapTo = (toValue: number) => {
    open.current = toValue < 0;
    Animated.spring(translateX, { toValue, useNativeDriver: true, damping: 20, stiffness: 200, mass: 0.8 }).start();
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => translateX.stopAnimation(),
    onPanResponderMove: (_, g) => {
      const base = open.current ? -SWIPE_WIDTH : 0;
      translateX.setValue(Math.max(Math.min(base + g.dx, 0), -SWIPE_WIDTH));
    },
    onPanResponderRelease: (_, g) => {
      if (open.current) snapTo(g.dx > 20 ? 0 : -SWIPE_WIDTH);
      else snapTo(g.dx < -20 ? -SWIPE_WIDTH : 0);
    },
  })).current;

  return (
    <View style={{ overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <TouchableOpacity onPress={onDelete} activeOpacity={0.85} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: SWIPE_WIDTH, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="close" size={22} color="#fff" />
      </TouchableOpacity>
      <Animated.View style={{ transform: [{ translateX }], backgroundColor: colors.bg }} {...pan.panHandlers}>
        <TouchableOpacity onPress={() => { snapTo(0); onPress(); }} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{product.name}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>{product.per100g.kcal} kcal/100g</Text>
          </View>
          <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={16} color={colors.accent} />
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function RepasScreen() {
  const c = useColors();
  const [isCoach, setIsCoach] = useState(false);
  const [coachUid, setCoachUid] = useState<string | null>(null);
  const [nutritionCoachEnabled, setNutritionCoachEnabled] = useState(false);
  const [nutritionAccessPending, setNutritionAccessPending] = useState(false);
  const [coachCalorieGoal, setCoachCalorieGoal] = useState<number | null>(null);
  const [coachCalorieGoalUpdatedAt, setCoachCalorieGoalUpdatedAt] = useState<Date | null>(null);
  const [coachMacros, setCoachMacros] = useState<{ proteins: number; fats: number; carbs: number } | null>(null);
  const [togglingNutrition, setTogglingNutrition] = useState(false);
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [coachProfile, setCoachProfile] = useState<{ pseudo: string; photoUrl?: string } | null>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (!user) return;
      return onSnapshot(doc(db, 'users', user.uid), (snap) => {
        const data = snap.data();
        setIsCoach(data?.accountType === 'coach');
        setCoachUid(data?.coachUid ?? null);
        setNutritionCoachEnabled(!!data?.nutritionCoachEnabled);
        setNutritionAccessPending(!!data?.nutritionAccessPending);
        const coachActive = !!data?.nutritionCoachEnabled;
        setCoachCalorieGoal(coachActive && data?.calorieGoalManual && data?.calorieGoal ? data.calorieGoal : null);
        setCoachCalorieGoalUpdatedAt(coachActive && data?.calorieGoalUpdatedAt ? data.calorieGoalUpdatedAt.toDate?.() ?? null : null);
        setCoachMacros(coachActive && data?.coachMacroManual && data?.coachMacroProteins != null
          ? { proteins: data.coachMacroProteins, fats: data.coachMacroFats, carbs: data.coachMacroCarbs }
          : null);
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!coachUid) { setCoachProfile(null); return; }
    getDoc(doc(db, 'users', coachUid)).then((snap) => {
      if (snap.exists()) {
        setCoachProfile({ pseudo: snap.data().pseudo ?? 'Coach', photoUrl: snap.data().photoUrl });
      }
    });
  }, [coachUid]);

  const respondToNutritionRequest = async (accept: boolean) => {
    const user = auth.currentUser;
    if (!user) return;
    setTogglingNutrition(true);
    try {
      if (accept) {
        await updateDoc(doc(db, 'users', user.uid), { nutritionCoachEnabled: true, nutritionAccessPending: false, coachStartedAt: serverTimestamp() });
      } else {
        await updateDoc(doc(db, 'users', user.uid), { nutritionAccessPending: false });
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de répondre à la demande.');
    } finally {
      setTogglingNutrition(false);
    }
  };

  const revokeNutritionAccess = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setTogglingNutrition(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { nutritionCoachEnabled: false, calorieGoalManual: false, coachMacroManual: false });
    } catch {
      Alert.alert('Erreur', 'Impossible de révoquer l\'accès.');
    } finally {
      setTogglingNutrition(false);
    }
  };

  const [repasState, setRepasState] = useState<RepasState | null>(null);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [profileId, setProfileId] = useState('');
  const [loading, setLoading] = useState(true);
  const [openMeal, setOpenMeal] = useState<MealEntry['mealType'] | null>(null);
  const [activeTab, setActiveTab] = useState<'journal' | 'detail'>('journal');
  const [showAddModal, setShowAddModal] = useState(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [scanCooldown, setScanCooldown] = useState(false);
  const [pendingMeal, setPendingMeal] = useState<MealEntry['mealType']>('dejeuner');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodProduct[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<FoodProduct | null>(null);
  const [quantity, setQuantity] = useState('100');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const [showManual, setShowManual] = useState(false);
  const [showQtyPicker, setShowQtyPicker] = useState(false);
  const [addModalPage, setAddModalPage] = useState<'search' | 'mesProduits'>('search');
  const [mesProduitSearch, setMesProduitSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualKcal, setManualKcal] = useState('');
  const [manualProteins, setManualProteins] = useState('');
  const [manualFats, setManualFats] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFibers, setManualFibers] = useState('');
  const [manualSugars, setManualSugars] = useState('');
  const [manualSaturated, setManualSaturated] = useState('');
  const [manualSalt, setManualSalt] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const [manualUnit, setManualUnit] = useState<'100g' | '100ml'>('100g');

  const todayStr = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    setRepasStorageUid(getCurrentUid());
    setLoading(true);
    const appState = await loadState();
    if (!appState) { setLoading(false); return; }
    const pid = appState.activeProfileId;
    setProfileId(pid);
    const activeP = appState.profiles.find((p) => p.id === pid) ?? null;
    setActiveProfile(activeP);
    setRepasState(await loadRepasState(pid));
    setLoading(false);
    // Sync poids 90j vers Firestore pour le coach
    const uid = auth.currentUser?.uid;
    if (uid && activeP?.weightHistory?.length) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const weightHistory90 = activeP.weightHistory
        .filter((e: any) => e.date >= cutoffStr)
        .map((e: any) => ({ date: e.date, weight: e.weight }));
      updateDoc(doc(db, 'users', uid), { weightHistory90 }).catch(() => {});
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const todayEntries = (repasState?.entries ?? []).filter((e) => e.date === todayStr);
  const entriesForMeal = (type: MealEntry['mealType']) => todayEntries.filter((e) => e.mealType === type);
  const kcalForMeal = (type: MealEntry['mealType']) =>
    entriesForMeal(type).reduce((s, e) => s + computeNutrition(e.product, e.quantity).kcal, 0);

  const todayTotals = todayEntries.reduce(
    (acc, e) => {
      const n = computeNutrition(e.product, e.quantity);
      return {
        kcal: acc.kcal + n.kcal, proteins: acc.proteins + n.proteins,
        fats: acc.fats + n.fats, saturatedFats: acc.saturatedFats + (n.saturatedFats ?? 0),
        carbs: acc.carbs + n.carbs, sugars: acc.sugars + (n.sugars ?? 0),
        fibers: acc.fibers + (n.fibers ?? 0), salt: acc.salt + (n.salt ?? 0),
        hasSaturatedFats: acc.hasSaturatedFats || n.saturatedFats !== undefined,
        hasSugars: acc.hasSugars || n.sugars !== undefined,
        hasFibers: acc.hasFibers || n.fibers !== undefined,
        hasSalt: acc.hasSalt || n.salt !== undefined,
      };
    },
    { kcal: 0, proteins: 0, fats: 0, saturatedFats: 0, carbs: 0, sugars: 0, fibers: 0, salt: 0,
      hasSaturatedFats: false, hasSugars: false, hasFibers: false, hasSalt: false }
  );

  const calorieGoal = coachMacros
    ? Math.round(coachMacros.proteins * 4 + coachMacros.fats * 9 + coachMacros.carbs * 4)
    : coachCalorieGoal ?? (activeProfile ? calculateCalorieGoal(activeProfile) : 2000);
  const lastWeight = activeProfile
    ? ([...activeProfile.weightHistory].sort((a, b) => b.date.localeCompare(a.date))[0]?.weight ?? activeProfile.weight)
    : 70;
  const macroGoal = coachMacros
    ? {
        proteins: coachMacros.proteins,
        fats: coachMacros.fats,
        carbs: coachMacros.carbs,
        fibers: Math.round((calorieGoal / 1000) * 15),
        proteinKcal: Math.round(coachMacros.proteins * 4),
        fatKcal: Math.round(coachMacros.fats * 9),
        carbKcal: Math.round(coachMacros.carbs * 4),
      }
    : activeProfile
      ? calculateMacros(lastWeight, calorieGoal)
      : { proteins: 150, fats: 70, carbs: 250, fibers: 30, proteinKcal: 600, fatKcal: 630, carbKcal: 1000 };

  // ── Scanner ──────────────────────────────────────────────────────────────────

  const openScanner = async (meal: MealEntry['mealType']) => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) { Alert.alert('Caméra requise', "Autorise l'accès à la caméra dans les réglages."); return; }
    }
    setPendingMeal(meal);
    setScanning(true);
  };

  const handleBarcode = async (barcode: string) => {
    if (scanCooldown) return;
    setScanCooldown(true);
    setScanning(false);
    const product = await fetchByBarcode(barcode);
    if (product) {
      setSelectedProduct(product);
    } else {
      Alert.alert('Produit non trouvé', "Code barre inconnu. Tu peux l'ajouter manuellement.", [
        { text: 'Saisie manuelle', onPress: () => setShowManual(true) },
        { text: 'Annuler' },
      ]);
    }
    setTimeout(() => setScanCooldown(false), 2000);
  };

  // ── Recherche ────────────────────────────────────────────────────────────────

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGeneration = useRef(0);
  useEffect(() => () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); }, []);

  const doSearch = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
    searchGeneration.current += 1;
    const gen = searchGeneration.current;
    setSearching(true);
    try {
      const results = await searchByName(q);
      if (gen !== searchGeneration.current) return;
      setSearchResults(results);
    } catch {
      if (gen !== searchGeneration.current) return;
      setSearchResults([]);
    } finally {
      if (gen === searchGeneration.current) setSearching(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!val.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimeout.current = setTimeout(() => doSearch(val), 300);
  };

  const clearSearch = () => { setSearchQuery(''); setSearchResults([]); };

  // ── Ajouter ──────────────────────────────────────────────────────────────────

  const confirmAdd = async () => {
    if (!selectedProduct || !repasState) return;
    const qty = parseFloat(quantity.replace(',', '.'));
    if (isNaN(qty) || qty <= 0) { Alert.alert('Quantité invalide'); return; }
    let next = repasState;
    if (editingEntryId) {
      const updated = repasState.entries.map((e) => e.id === editingEntryId ? { ...e, quantity: qty } : e);
      next = { ...repasState, entries: updated };
      await saveRepasState(next, profileId);
    } else {
      const entry: MealEntry = { id: Date.now().toString(), date: todayStr, product: selectedProduct, quantity: qty, mealType: openMeal ?? pendingMeal };
      next = await addMealEntry(repasState, entry, profileId);
      const existing = next.recentFoods ?? [];
      const filtered = existing.filter((f) => f.name !== selectedProduct.name);
      next = { ...next, recentFoods: [selectedProduct, ...filtered].slice(0, 10) };
      await saveRepasState(next, profileId);
    }
    setRepasState(next);
    setSelectedProduct(null);
    setQuantity('100');
    setEditingEntryId(null);
    clearSearch();
  };

  // ── Saisie manuelle ──────────────────────────────────────────────────────────

  const confirmManual = async () => {
    if (!manualName.trim()) { Alert.alert('Nom requis'); return; }
    const pf = (v: string) => { const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? undefined : n; };
    const product: FoodProduct = {
      name: manualName.trim(), isCustom: true, category: manualCategory || undefined,
      per100g: { kcal: pf(manualKcal) ?? 0, proteins: pf(manualProteins) ?? 0, fats: pf(manualFats) ?? 0, carbs: pf(manualCarbs) ?? 0, fibers: pf(manualFibers), sugars: pf(manualSugars), saturatedFats: pf(manualSaturated), salt: pf(manualSalt) },
    } as any;
    const next = { ...repasState!, customProducts: [...(repasState?.customProducts ?? []), product] };
    await saveRepasState(next, profileId);
    setRepasState(next);
    setShowManual(false);
    setSelectedProduct(product);
    setManualName(''); setManualKcal(''); setManualProteins(''); setManualFats(''); setManualCarbs('');
    setManualFibers(''); setManualSugars(''); setManualSaturated(''); setManualSalt(''); setManualCategory(''); setManualUnit('100g');
  };

  // ── Supprimer ────────────────────────────────────────────────────────────────

  const removeEntry = async (id: string) => {
    if (!repasState) return;
    setRepasState(await removeMealEntry(repasState, id, profileId));
  };

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    // ─ Sub tab bar — identique au reste de l'app ─
    subTabBar: { flexDirection: 'row' as const, borderBottomWidth: 1, borderBottomColor: c.border },
    subTab: { flex: 1, paddingVertical: 12, alignItems: 'center' as const, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
    subTabActive: { borderBottomColor: c.accent },
    subTabText: { color: c.textSecondary, fontSize: 15, fontWeight: '600' as const },
    subTabTextActive: { color: c.text },
    // ─ Contenu ─
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: 100 },
    // ─ Bilan ─
    bilanCard: { backgroundColor: c.card, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
    bilanHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
    bilanTitle: { color: c.text, fontSize: 16, fontWeight: '700' as const },
    bilanTopRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
    bilanSide: { flex: 1, alignItems: 'center' as const, gap: 4 },
    bilanBigNum: { color: c.text, fontSize: 26, fontWeight: '900' as const, letterSpacing: -0.5 },
    bilanSideLabel: { color: c.textSecondary, fontSize: 12, fontWeight: '500' as const },
    bilanArcWrap: { width: 136, height: 136, alignItems: 'center' as const, justifyContent: 'center' as const },
    bilanArcCenter: { position: 'absolute' as const, alignItems: 'center' as const },
    bilanArcNum: { color: c.text, fontSize: 24, fontWeight: '900' as const, letterSpacing: -0.5 },
    bilanArcLabel: { color: c.textSecondary, fontSize: 11, fontWeight: '500' as const },
    // ─ Macros ─
    macroRow: { flexDirection: 'row' as const, gap: spacing.sm },
    macroCol: { flex: 1, backgroundColor: c.surface, borderRadius: radius.sm, padding: 10, gap: 6 },
    macroHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
    macroDot: { width: 7, height: 7, borderRadius: 4 },
    macroLabel: { color: c.textSecondary, fontSize: 10, fontWeight: '600' as const },
    macroTrack: { height: 4, backgroundColor: c.border, borderRadius: 2, overflow: 'hidden' as const },
    macroFill: { height: '100%' as const, borderRadius: 2 },
    macroVal: { color: c.text, fontSize: 12, fontWeight: '800' as const },
    macroGoal: { color: c.textSecondary, fontSize: 10 },
    // ─ Meal cards ─
    mealCard: { backgroundColor: c.card, borderRadius: radius.md, overflow: 'hidden' as const },
    mealHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, padding: spacing.md, gap: 12 },
    mealIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center' as const, justifyContent: 'center' as const },
    mealInfo: { flex: 1 },
    mealName: { color: c.text, fontSize: 15, fontWeight: '700' as const },
    mealCount: { color: c.textSecondary, fontSize: 12, marginTop: 2 },
    mealRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
    mealKcalBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
    mealKcalText: { fontSize: 13, fontWeight: '800' as const },
    addBtn: { width: 34, height: 34, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const },
    // ─ Entries ─
    entriesList: { borderTopWidth: 1, borderTopColor: c.border },
    entryRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    entryName: { color: c.text, fontSize: 14, fontWeight: '600' as const },
    entryMacros: { color: c.textSecondary, fontSize: 12, marginTop: 2 },
    entryActions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
    kcalPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    kcalPillText: { fontSize: 12, fontWeight: '700' as const },
    subtotalRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingHorizontal: spacing.md, paddingVertical: 10 },
    subtotalLabel: { fontSize: 13, fontWeight: '600' as const },
    subtotalKcal: { fontSize: 14, fontWeight: '800' as const },
    // ─ Modal add ─
    modalBg: { flex: 1, backgroundColor: '#000000CC', justifyContent: 'flex-end' as const },
    modalCard: { backgroundColor: c.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: 'center' as const, marginBottom: 20 },
  }), [c]);

  // ── Loading / Coach ──────────────────────────────────────────────────────────

  if (loading || !repasState) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <PulsingLoader size={52} />
      </View>
    );
  }

  if (isCoach) return null;

  // ── Scanner fullscreen ───────────────────────────────────────────────────────

  if (scanning) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onBarcodeScanned={({ data }) => handleBarcode(data)} />
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 260, height: 160, borderWidth: 2, borderColor: c.accent, borderRadius: radius.md }} />
          <Text style={{ color: '#fff', fontSize: 14, marginTop: 20, backgroundColor: '#00000088', paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.sm }}>Pointez sur le code barre</Text>
        </View>
        <TouchableOpacity style={{ position: 'absolute', bottom: 120, alignSelf: 'center', width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setScanning(false)}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  // ── Arc calorie helper ───────────────────────────────────────────────────────

  const renderArc = () => {
    const eaten = todayTotals.kcal;
    const over = eaten > calorieGoal;
    const pct = Math.min(eaten / calorieGoal, 1);
    const size = 136;
    const stroke = 10;
    const r = (size - stroke) / 2;
    const cx = size / 2; const cy = size / 2;
    const startAngle = -215; const sweepAngle = 250;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const arcPath = (from: number, sweep: number) => {
      const a1 = toRad(from); const a2 = toRad(from + sweep);
      const x1 = cx + r * Math.cos(a1); const y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2); const y2 = cy + r * Math.sin(a2);
      return `M${x1},${y1} A${r},${r},0,${sweep > 180 ? 1 : 0},1,${x2},${y2}`;
    };
    const fillColor = over ? c.danger : c.accent;
    return (
      <View style={styles.bilanArcWrap}>
        <Svg width={size} height={size}>
          <Path d={arcPath(startAngle, sweepAngle)} stroke={c.border} strokeWidth={stroke} fill="none" strokeLinecap="round" />
          {pct > 0 && <Path d={arcPath(startAngle, sweepAngle * pct)} stroke={fillColor} strokeWidth={stroke} fill="none" strokeLinecap="round" />}
        </Svg>
        <View style={styles.bilanArcCenter}>
          <Text style={[styles.bilanArcNum, { color: over ? c.danger : c.text }]}>{Math.max(0, Math.round(calorieGoal - eaten))}</Text>
          <Text style={styles.bilanArcLabel}>{over ? 'Dépassé' : 'Restant'}</Text>
        </View>
      </View>
    );
  };

  // ── Return ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.screen} edges={[]}>

      {/* ── Sub tab bar — même pattern que le reste de l'app ── */}
      <View style={styles.subTabBar}>
        {(['journal', 'detail'] as const).map((tab) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.subTab, activeTab === tab && styles.subTabActive]}>
            <Text style={[styles.subTabText, activeTab === tab && styles.subTabTextActive]}>
              {tab === 'journal' ? 'Journal' : 'Détail'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'journal' ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* ── Bilan du jour ── */}
          <View style={styles.bilanCard}>
            <View style={styles.bilanHeader}>
              <Text style={styles.bilanTitle}>Bilan du jour</Text>
              <TouchableOpacity onPress={() => Alert.alert('Information', "Les apports caloriques sont indicatifs et ne remplacent pas l'avis d'un professionnel de santé.", [{ text: 'OK' }])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
                <Ionicons name="information-circle-outline" size={18} color={c.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Arc + chiffres */}
            <View style={styles.bilanTopRow}>
              <View style={styles.bilanSide}>
                <Text style={styles.bilanBigNum}>{Math.round(todayTotals.kcal)}</Text>
                <Text style={styles.bilanSideLabel}>Mangé</Text>
              </View>
              {renderArc()}
              <View style={styles.bilanSide}>
                <Text style={styles.bilanBigNum}>{calorieGoal}</Text>
                <Text style={styles.bilanSideLabel}>Objectif</Text>
              </View>
            </View>

            {/* Macros */}
            <View style={styles.macroRow}>
              {([
                { label: 'Glucides',  val: Math.round(todayTotals.carbs),    max: macroGoal.carbs,    color: c.accent },
                { label: 'Protéines', val: Math.round(todayTotals.proteins), max: macroGoal.proteins, color: '#3B82F6' },
                { label: 'Lipides',   val: Math.round(todayTotals.fats),     max: macroGoal.fats,     color: '#F59E0B' },
              ]).map(({ label, val, max, color }) => {
                const over = val > max;
                const pct = Math.min(val / Math.max(max, 1), 1);
                const activeColor = over ? c.danger : color;
                return (
                  <View key={label} style={styles.macroCol}>
                    <Text style={styles.macroLabel}>{label}</Text>
                    <View style={styles.macroTrack}>
                      <View style={[styles.macroFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: activeColor }]} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                      <Text style={[styles.macroVal, { color: activeColor }]}>{val}</Text>
                      <Text style={styles.macroGoal}>/ {max}g</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Demande d'accès nutrition en attente ── */}
          {!isCoach && !!coachUid && (nutritionAccessPending || nutritionCoachEnabled) && (
            <TouchableOpacity
              onPress={() => setShowNutritionModal(true)}
              activeOpacity={0.8}
              style={{
                backgroundColor: c.card,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: nutritionCoachEnabled ? c.accent + '55' : c.border,
                flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
              }}
            >
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: nutritionCoachEnabled ? c.accent + '55' : c.border }}>
                {coachProfile?.photoUrl
                  ? <Image source={{ uri: coachProfile.photoUrl }} style={{ width: 42, height: 42 }} />
                  : <Ionicons name="person" size={18} color={c.textSecondary} />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
                  {nutritionCoachEnabled
                    ? 'Nutrition gérée par ton coach'
                    : `${coachProfile?.pseudo ?? 'Ton coach'} demande l'accès`}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {nutritionCoachEnabled
                    ? `Suivi par ${coachProfile?.pseudo ?? 'ton coach'} · Appuie pour gérer`
                    : 'Il souhaite gérer ton objectif calorique'}
                </Text>
              </View>
              {nutritionCoachEnabled
                ? <Ionicons name="shield-checkmark" size={18} color={c.accent} />
                : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' }} />
              }
            </TouchableOpacity>
          )}

          {/* ── Modal demande / gestion nutrition coach ── */}
          <Modal
            visible={showNutritionModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowNutritionModal(false)}
          >
            <View style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              <View style={{ backgroundColor: c.card, borderRadius: 24, width: '100%', overflow: 'hidden' }}>

                {/* Header — photo centrée + prénom + badge inline */}
                <View style={{ alignItems: 'center', paddingTop: 24, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, gap: 12 }}>
                  <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: c.accent + '55' }}>
                    {coachProfile?.photoUrl
                      ? <Image source={{ uri: coachProfile.photoUrl }} style={{ width: 72, height: 72 }} />
                      : <Ionicons name="person" size={32} color={c.textSecondary} />
                    }
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 }}>
                      {coachProfile?.pseudo ?? 'Ton coach'}
                    </Text>
                    <UserBadge accountType="coach" size={20} />
                  </View>
                </View>

                {/* Corps */}
                <View style={{ padding: 20, gap: 16 }}>
                  <Text style={{ color: c.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' }}>
                    {nutritionCoachEnabled ? 'Ton coach gère ta nutrition' : `${coachProfile?.pseudo ?? 'Ton coach'} veut gérer ta nutrition`}
                  </Text>
                  {nutritionCoachEnabled && coachCalorieGoal && coachCalorieGoalUpdatedAt && (
                    <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: -8, textAlign: 'center' }}>
                      {`Objectif fixé à ${coachCalorieGoal} kcal · modifié le ${coachCalorieGoalUpdatedAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                    </Text>
                  )}
                  {[
                    { icon: 'eye-outline' as const, text: 'Il peut consulter ton objectif calorique actuel' },
                    { icon: 'create-outline' as const, text: 'Il peut ajuster tes calories et tes macros selon tes objectifs' },
                    { icon: 'scale-outline' as const, text: 'Il peut voir ton historique de poids (90 derniers jours) pour suivre ta progression' },
                    { icon: 'lock-closed-outline' as const, text: 'Tu restes propriétaire de tes données — révocable à tout moment' },
                  ].map((item) => (
                    <View key={item.icon} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                      <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                        <Ionicons name={item.icon} size={15} color={c.accent} />
                      </View>
                      <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 20, flex: 1 }}>{item.text}</Text>
                    </View>
                  ))}
                </View>

                {/* Boutons */}
                <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 8 }}>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginBottom: 8 }} />
                  {!nutritionCoachEnabled ? (
                    <>
                      <Button
                        label={togglingNutrition ? 'Activation...' : 'Accepter'}
                        variant="primary"
                        disabled={togglingNutrition}
                        onPress={async () => { await respondToNutritionRequest(true); setShowNutritionModal(false); }}
                      />
                      <Button
                        label="Refuser"
                        variant="danger"
                        disabled={togglingNutrition}
                        onPress={async () => { await respondToNutritionRequest(false); setShowNutritionModal(false); }}
                      />
                    </>
                  ) : (
                    <Button
                      label={togglingNutrition ? 'En cours...' : 'Révoquer l\'accès'}
                      variant="danger"
                      disabled={togglingNutrition}
                      onPress={async () => { await revokeNutritionAccess(); setShowNutritionModal(false); }}
                    />
                  )}
                  <Button label="Fermer" variant="ghost" onPress={() => setShowNutritionModal(false)} />
                </View>

              </View>
            </View>
          </Modal>

          {/* ── 4 cartes repas ── */}
          {MEAL_TYPES.map((type) => {
            const cfg = MEAL_CONFIG[type];
            const entries = entriesForMeal(type);
            const kcal = kcalForMeal(type);
            const isOpen = openMeal === type;

            return (
              <View key={type} style={styles.mealCard}>
                <TouchableOpacity style={styles.mealHeader} onPress={() => setOpenMeal(isOpen ? null : type)} activeOpacity={0.7}>
                  {/* Icône colorée */}
                  <View style={[styles.mealIconWrap, { backgroundColor: cfg.color + '18' }]}>
                    <Ionicons name={cfg.icon as any} size={22} color={cfg.color} />
                  </View>

                  <View style={styles.mealInfo}>
                    <Text style={styles.mealName}>{cfg.label}</Text>
                    <Text style={styles.mealCount}>{entries.length === 0 ? 'Aucun aliment' : `${entries.length} aliment${entries.length > 1 ? 's' : ''}`}</Text>
                  </View>

                  <View style={styles.mealRight}>
                    {kcal > 0 && (
                      <View style={[styles.mealKcalBadge, { backgroundColor: cfg.color + '18' }]}>
                        <Text style={[styles.mealKcalText, { color: cfg.color }]}>{Math.round(kcal)}</Text>
                      </View>
                    )}
                    {entries.length > 0 && (
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={c.textSecondary} />
                    )}
                    <TouchableOpacity
                      onPress={() => { setPendingMeal(type); setSearchQuery(''); setSearchResults([]); setShowAddModal(true); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                      style={[styles.addBtn, { backgroundColor: cfg.color, shadowColor: cfg.color, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 }]}
                    >
                      <Ionicons name="add" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>

                {/* Liste aliments */}
                {isOpen && entries.length > 0 && (
                  <View style={styles.entriesList}>
                    {entries.map((entry) => {
                      const n = computeNutrition(entry.product, entry.quantity);
                      return (
                        <View key={entry.id} style={styles.entryRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.entryName} numberOfLines={1}>{entry.product.name}</Text>
                            <Text style={styles.entryMacros}>{entry.quantity}g · P {n.proteins}g · L {n.fats}g · G {n.carbs}g</Text>
                          </View>
                          <View style={styles.entryActions}>
                            <TouchableOpacity onPress={() => { setEditingEntryId(entry.id); setSelectedProduct(entry.product); setQuantity(String(entry.quantity)); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="pencil-outline" size={15} color={c.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => removeEntry(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="close" size={15} color={c.danger} />
                            </TouchableOpacity>
                            <View style={[styles.kcalPill, { backgroundColor: cfg.color + '18' }]}>
                              <Text style={[styles.kcalPillText, { color: cfg.color }]}>{n.kcal}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                    <View style={[styles.subtotalRow, { backgroundColor: cfg.color + '10' }]}>
                      <Text style={[styles.subtotalLabel, { color: cfg.color }]}>Total {cfg.label}</Text>
                      <Text style={[styles.subtotalKcal, { color: cfg.color }]}>{Math.round(kcal)} kcal</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 }]}>
          <View style={{ gap: spacing.md }}>
            <DetailSection title="Énergie">
              <DetailRow label="Calories" value={`${Math.round(todayTotals.kcal)} kcal`} goal={`${calorieGoal} kcal`} over={todayTotals.kcal > calorieGoal} />
            </DetailSection>
            <DetailSection title="Macronutriments">
              <DetailRow label="Protéines" value={`${Math.round(todayTotals.proteins)}g`} goal={`${macroGoal.proteins}g`} over={todayTotals.proteins > macroGoal.proteins} />
              <DetailRow label="Lipides" value={`${Math.round(todayTotals.fats)}g`} goal={`${macroGoal.fats}g`} over={todayTotals.fats > macroGoal.fats} />
              {todayTotals.hasSaturatedFats && <DetailRow label="  dont saturés" value={`${Math.round(todayTotals.saturatedFats * 10) / 10}g`} sub />}
              <DetailRow label="Glucides" value={`${Math.round(todayTotals.carbs)}g`} goal={`${macroGoal.carbs}g`} over={todayTotals.carbs > macroGoal.carbs} />
              {todayTotals.hasSugars && <DetailRow label="  dont sucres" value={`${Math.round(todayTotals.sugars * 10) / 10}g`} sub warn={todayTotals.sugars > 50} warnMsg="Apport recommandé < 50g/j" />}
            </DetailSection>
            <DetailSection title="Fibres & minéraux">
              <DetailRow label="Fibres" value={todayTotals.hasFibers ? `${Math.round(todayTotals.fibers * 10) / 10}g` : '—'} goal={`${macroGoal.fibers}g`} under={todayTotals.hasFibers && todayTotals.fibers < macroGoal.fibers} underMsg={`Objectif recommandé : ${macroGoal.fibers}g/j`} />
              <DetailRow label="Sel" value={todayTotals.hasSalt ? `${Math.round(todayTotals.salt * 100) / 100}g` : '—'} goal="5g" over={todayTotals.hasSalt && todayTotals.salt > 5} warn={todayTotals.hasSalt && todayTotals.salt > 5} warnMsg="Limite OMS : 5g/j" />
              <DetailRow label="Sucres" value={todayTotals.hasSugars ? `${Math.round(todayTotals.sugars * 10) / 10}g` : '—'} goal="50g" over={todayTotals.hasSugars && todayTotals.sugars > 50} warn={todayTotals.hasSugars && todayTotals.sugars > 50} warnMsg="Apport recommandé < 50g/j" />
              {todayTotals.hasSaturatedFats && <DetailRow label="Acides gras saturés" value={`${Math.round(todayTotals.saturatedFats * 10) / 10}g`} goal="20g" over={todayTotals.saturatedFats > 20} warn={todayTotals.saturatedFats > 20} warnMsg="Limite recommandée : 20g/j" />}
            </DetailSection>
            {todayEntries.length === 0 && (
              <Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: spacing.lg }}>Aucun aliment enregistré aujourd'hui.</Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* ── Modal ajout aliment ── */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { setShowAddModal(false); setAddModalPage('search'); }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <TouchableOpacity onPress={() => { if (addModalPage === 'mesProduits') { setAddModalPage('search'); setMesProduitSearch(''); } else { setShowAddModal(false); } }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={22} color={c.text} />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>{addModalPage === 'mesProduits' ? 'Mes produits' : MEAL_CONFIG[pendingMeal].label}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 1 }}>{Math.round(kcalForMeal(pendingMeal))} kcal ajoutées</Text>
              </View>
              <View style={{ width: 22 }} />
            </View>

            {addModalPage === 'mesProduits' ? (
              (repasState?.customProducts ?? []).length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <Ionicons name="bag-outline" size={48} color={c.textSecondary} />
                  <Text style={{ color: c.textSecondary, fontSize: 15 }}>Aucun produit enregistré</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: 40 }}>Ajoute des aliments manuellement pour les retrouver ici.</Text>
                </View>
              ) : (() => {
                const filtered = repasState!.customProducts.filter((p) => p.name.toLowerCase().includes(mesProduitSearch.toLowerCase()));
                return (
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', margin: spacing.md, backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: mesProduitSearch ? c.accent : c.border }}>
                      <Ionicons name="search-outline" size={16} color={c.textSecondary} style={{ marginRight: 8 }} />
                      <TextInput style={{ flex: 1, color: c.text, fontSize: 15, paddingVertical: 12 }} placeholder="Rechercher dans mes produits…" placeholderTextColor={c.textSecondary} value={mesProduitSearch} onChangeText={setMesProduitSearch} returnKeyType="search" />
                      {mesProduitSearch ? <TouchableOpacity onPress={() => setMesProduitSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close" size={18} color={c.textSecondary} /></TouchableOpacity> : null}
                    </View>
                    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 40 }}>
                      {filtered.length === 0 ? (
                        <View style={{ alignItems: 'center', marginTop: 40, gap: 8 }}>
                          <Text style={{ color: c.textSecondary, fontSize: 15 }}>Aucun résultat pour "{mesProduitSearch}"</Text>
                        </View>
                      ) : filtered.map((p, i) => (
                        <SwipeableProductRow
                          key={i} product={p}
                          onPress={() => { setSelectedProduct(p); setAddModalPage('search'); setShowAddModal(false); }}
                          onDelete={() => {
                            Alert.alert('Supprimer le produit', `Souhaitez-vous supprimer "${p.name}" ?`, [
                              { text: 'Annuler', style: 'cancel' },
                              { text: 'Supprimer', style: 'destructive', onPress: async () => {
                                const next = { ...repasState!, customProducts: repasState!.customProducts.filter((_, j) => j !== i) };
                                await saveRepasState(next, profileId);
                                setRepasState(next);
                              }},
                            ]);
                          }}
                        />
                      ))}
                    </ScrollView>
                  </View>
                );
              })()
            ) : (<>
              {/* Barre de recherche */}
              <View style={{ flexDirection: 'row', alignItems: 'center', margin: spacing.md, backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: searchQuery ? c.accent : c.border }}>
                <Ionicons name="search-outline" size={16} color={c.textSecondary} style={{ marginRight: 8 }} />
                <TextInput style={{ flex: 1, color: c.text, fontSize: 16, paddingVertical: 13 }} placeholder="Rechercher un aliment…" placeholderTextColor={c.textSecondary} value={searchQuery} onChangeText={handleSearchChange} onSubmitEditing={() => doSearch(searchQuery)} returnKeyType="search" autoFocus />
                {searching ? <ActivityIndicator color={c.accent} size="small" /> : searchQuery ? <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close" size={18} color={c.textSecondary} /></TouchableOpacity> : null}
              </View>

              {/* Actions rapides */}
              {!searchQuery && searchResults.length === 0 && (
                <View style={{ flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.sm, marginBottom: spacing.md }}>
                  {[
                    { label: 'Caméra', icon: 'barcode-outline', onPress: () => { setShowAddModal(false); openScanner(pendingMeal); } },
                    { label: 'Manuel', icon: 'pencil-outline', onPress: () => { setShowAddModal(false); setShowManual(true); } },
                    { label: 'Mes produits', icon: 'bookmark-outline', onPress: () => setAddModalPage('mesProduits') },
                  ].map((a) => (
                    <TouchableOpacity key={a.label} onPress={a.onPress} activeOpacity={0.7} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: c.border }}>
                      <Ionicons name={a.icon as any} size={26} color={c.accent} />
                      <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>{a.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
                {searchQuery.trim().length > 0 && !searching && searchResults.length === 0 && (
                  <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.lg, alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: c.textSecondary, fontSize: 15 }}>Aucun aliment trouvé pour "{searchQuery}"</Text>
                    <Text style={{ color: c.textSecondary, fontSize: 13 }}>Essaie un autre terme ou ajoute-le manuellement.</Text>
                  </View>
                )}

                {searchResults.length > 0 && (
                  <View style={{ paddingHorizontal: spacing.md }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                      <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{searchResults.length} résultats</Text>
                      <TouchableOpacity onPress={clearSearch}><Text style={{ color: c.accent, fontSize: 13 }}>Effacer</Text></TouchableOpacity>
                    </View>
                    {searchResults.slice(0, 10).map((p, i) => (
                      <TouchableOpacity key={i} onPress={() => { setSelectedProduct(p); clearSearch(); setShowAddModal(false); }} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{p.name}</Text>
                          {p.brand && <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2 }}>{p.brand}</Text>}
                        </View>
                        <Text style={{ color: c.textSecondary, fontSize: 13, marginRight: 12 }}>{p.per100g.kcal} kcal</Text>
                        <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: c.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="add" size={16} color={c.accent} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {!searchQuery && searchResults.length === 0 && (
                  <View style={{ paddingHorizontal: spacing.md }}>
                    {(repasState?.recentFoods ?? []).length > 0 ? (
                      <>
                        <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm }}>Récemment consommés</Text>
                        {repasState!.recentFoods!.map((p, i) => (
                          <TouchableOpacity key={i} onPress={() => { setSelectedProduct(p); setShowAddModal(false); }} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
                            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.accent + '14', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                              <Ionicons name="time-outline" size={18} color={c.accent} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{p.name}</Text>
                              {p.brand && <Text style={{ color: c.textSecondary, fontSize: 13 }}>{p.brand}</Text>}
                            </View>
                            <Text style={{ color: c.textSecondary, fontSize: 13 }}>{p.per100g.kcal} kcal</Text>
                          </TouchableOpacity>
                        ))}
                      </>
                    ) : (
                      <View style={{ alignItems: 'center', marginTop: 48, gap: 8 }}>
                        <Ionicons name="search-outline" size={44} color={c.textSecondary} />
                        <Text style={{ color: c.textSecondary, fontSize: 15 }}>Commence à renseigner tes aliments</Text>
                        <Text style={{ color: c.textSecondary, fontSize: 13 }}>Ils apparaîtront ici pour un accès rapide.</Text>
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>

              <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                <Button label="Terminer" variant="primary" size="lg" onPress={() => setShowAddModal(false)} />
              </View>
            </>)}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Modal confirmation quantité ── */}
      <Modal visible={!!selectedProduct} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              {selectedProduct && (() => {
                const qty = parseFloat(quantity) || 0;
                const n = computeNutrition(selectedProduct, qty);
                return (
                  <>
                    <View style={styles.handle} />
                    <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 2 }} numberOfLines={2}>{selectedProduct.name}</Text>
                    {selectedProduct.brand && <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: spacing.md }}>{selectedProduct.brand}</Text>}

                    <Text style={{ color: c.textSecondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm }}>Pour 100g</Text>
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
                      {[
                        { label: 'Kcal',  val: String(selectedProduct.per100g.kcal),   color: c.accent },
                        { label: 'Prot.', val: `${selectedProduct.per100g.proteins}g`, color: '#4CAF50' },
                        { label: 'Lip.',  val: `${selectedProduct.per100g.fats}g`,     color: '#F59E0B' },
                        { label: 'Gluc.', val: `${selectedProduct.per100g.carbs}g`,    color: '#64B5F6' },
                      ].map((item) => (
                        <View key={item.label} style={{ flex: 1, backgroundColor: c.surface, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: c.border }}>
                          <Text style={{ color: item.color, fontSize: 14, fontWeight: '800' }}>{item.val}</Text>
                          <Text style={{ color: c.textSecondary, fontSize: 9, fontWeight: '600' }}>{item.label}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                      <Text style={{ color: c.textSecondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Quantité</Text>
                      <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowQtyPicker((v) => !v); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={showQtyPicker ? 'create-outline' : 'list-outline'} size={14} color={c.accent} />
                        <Text style={{ color: c.accent, fontSize: 11, fontWeight: '600' }}>{showQtyPicker ? 'Saisie libre' : 'Roue'}</Text>
                      </TouchableOpacity>
                    </View>

                    {showQtyPicker ? (
                      <View style={{ borderRadius: radius.md, borderWidth: 1.5, borderColor: c.accent + '40', overflow: 'hidden', marginBottom: spacing.md }}>
                        <QtyPickerWheel value={parseFloat(quantity) || 100} onSelect={(v) => setQuantity(String(v))} />
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.accent + '60', marginBottom: spacing.md, overflow: 'hidden' }}>
                        <TouchableOpacity onPress={() => setQuantity((q) => String(Math.max(1, (parseFloat(q) || 0) - 5)))} style={{ paddingHorizontal: 14, paddingVertical: 14 }} activeOpacity={0.7}>
                          <Ionicons name="remove" size={18} color={c.accent} />
                        </TouchableOpacity>
                        <TextInput style={{ flex: 1, color: c.text, fontSize: 22, fontWeight: '800', textAlign: 'center', paddingVertical: 14 }} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" autoFocus />
                        <Text style={{ color: c.textSecondary, fontSize: 13, marginRight: 4 }}>g</Text>
                        <TouchableOpacity onPress={() => setQuantity((q) => String((parseFloat(q) || 0) + 5))} style={{ paddingHorizontal: 14, paddingVertical: 14 }} activeOpacity={0.7}>
                          <Ionicons name="add" size={18} color={c.accent} />
                        </TouchableOpacity>
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.accent + '12', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: c.accent + '30' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.accent, fontSize: 28, fontWeight: '800' }}>{n.kcal} <Text style={{ fontSize: 14, fontWeight: '500' }}>kcal</Text></Text>
                        <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>P {n.proteins}g · L {n.fats}g · G {n.carbs}g</Text>
                      </View>
                      <Ionicons name="flash-outline" size={28} color={c.accent + '60'} />
                    </View>

                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Button label="Annuler" variant="ghost" style={{ flex: 1 }} onPress={() => { setSelectedProduct(null); setQuantity('100'); setEditingEntryId(null); setShowQtyPicker(false); }} />
                      <Button label="Ajouter" variant="primary" style={{ flex: 1 }} onPress={confirmAdd} />
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal saisie manuelle ── */}
      <Modal visible={showManual} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowManual(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <TouchableOpacity onPress={() => setShowManual(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={22} color={c.text} />
              </TouchableOpacity>
              <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 17, fontWeight: '800' }}>Nouvel aliment</Text>
              <View style={{ width: 22 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Nom de l'aliment *</Text>
                <TextInput style={mStyles.input} value={manualName} onChangeText={setManualName} placeholder="ex: Riz basmati cuit, Poulet grillé…" placeholderTextColor={c.textSecondary} autoFocus />
              </View>

              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Catégorie</Text>
                <View style={mStyles.categoryGrid}>
                  {[
                    { id: 'viande', label: '🥩 Viande' }, { id: 'volaille', label: '🍗 Volaille' },
                    { id: 'poisson', label: '🐟 Poisson' }, { id: 'oeuf', label: '🥚 Œufs' },
                    { id: 'laitage', label: '🥛 Laitages' }, { id: 'cereale', label: '🌾 Céréales & riz' },
                    { id: 'legume', label: '🥦 Légumes' }, { id: 'fruit', label: '🍎 Fruits' },
                    { id: 'legumineuse', label: '🫘 Légumineuses' }, { id: 'oleagineux', label: '🥜 Oléagineux & beurres' },
                    { id: 'matiere_grasse', label: '🧈 Matières grasses' }, { id: 'boisson', label: '🧃 Boissons' },
                    { id: 'sucre', label: '🍫 Sucreries' }, { id: 'pain_viennoiserie', label: '🥐 Pain & viennoiserie' },
                    { id: 'plat_prepare', label: '🍱 Plats préparés' }, { id: 'complement', label: '💊 Compléments' },
                    { id: 'epice', label: '🧂 Épices & condiments' }, { id: 'sauce', label: '🫙 Sauces' },
                    { id: 'autre', label: '📦 Autre' },
                  ].map(({ id, label }) => (
                    <TouchableOpacity key={id} style={[mStyles.categoryChip, manualCategory === id && mStyles.categoryChipActive]} onPress={() => setManualCategory(manualCategory === id ? '' : id)} activeOpacity={0.7}>
                      <Text style={[mStyles.categoryChipText, manualCategory === id && mStyles.categoryChipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Valeurs nutritionnelles pour</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['100g', '100ml'] as const).map((u) => (
                    <TouchableOpacity key={u} style={[mStyles.unitChip, manualUnit === u && mStyles.unitChipActive]} onPress={() => setManualUnit(u)} activeOpacity={0.7}>
                      <Text style={[mStyles.unitChipText, manualUnit === u && mStyles.unitChipTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Macronutriments principaux</Text>
                <View style={mStyles.macroGrid}>
                  {[
                    { label: 'Calories', unit: 'kcal', val: manualKcal, set: setManualKcal, color: c.accent },
                    { label: 'Protéines', unit: 'g', val: manualProteins, set: setManualProteins, color: '#4CAF50' },
                    { label: 'Lipides', unit: 'g', val: manualFats, set: setManualFats, color: '#FF9800' },
                    { label: 'Glucides', unit: 'g', val: manualCarbs, set: setManualCarbs, color: '#2196F3' },
                  ].map(({ label, unit, val, set, color }) => (
                    <View key={label} style={mStyles.macroCell}>
                      <View style={[mStyles.macroDot, { backgroundColor: color }]} />
                      <Text style={mStyles.macroLabel}>{label}</Text>
                      <View style={mStyles.macroInputRow}>
                        <TextInput style={mStyles.macroInput} value={val} onChangeText={set} placeholder="0" placeholderTextColor={c.textSecondary} keyboardType="decimal-pad" />
                        <Text style={mStyles.macroUnit}>{unit}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Détails (optionnel)</Text>
                <View style={{ gap: 10 }}>
                  {[
                    { label: 'Dont sucres', unit: 'g', val: manualSugars, set: setManualSugars },
                    { label: 'Dont acides gras saturés', unit: 'g', val: manualSaturated, set: setManualSaturated },
                    { label: 'Fibres', unit: 'g', val: manualFibers, set: setManualFibers },
                    { label: 'Sel', unit: 'g', val: manualSalt, set: setManualSalt },
                  ].map(({ label, unit, val, set }) => (
                    <View key={label} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: c.border }}>
                      <Text style={{ flex: 1, color: c.textSecondary, fontSize: 14 }}>{label}</Text>
                      <TextInput style={{ color: c.text, fontSize: 15, fontWeight: '600', minWidth: 60, textAlign: 'right' }} value={val} onChangeText={set} placeholder="0" placeholderTextColor={c.textSecondary} keyboardType="decimal-pad" />
                      <Text style={{ color: c.textSecondary, fontSize: 13, marginLeft: 4 }}>{unit}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border }}>
              <Button label="Enregistrer et ajouter" variant="primary" size="lg" onPress={confirmManual} />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles saisie manuelle ───────────────────────────────────────────────────

const mStyles = StyleSheet.create({
  section: { gap: 10 },
  sectionTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  input: { backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, color: colors.text, fontSize: 16, borderWidth: 1, borderColor: colors.border },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  categoryChipActive: { backgroundColor: colors.accent + '22', borderColor: colors.accent },
  categoryChipText: { color: colors.textSecondary, fontSize: 13 },
  categoryChipTextActive: { color: colors.accent, fontWeight: '700' },
  unitChip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  unitChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  unitChipText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  unitChipTextActive: { color: '#fff', fontWeight: '700' },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  macroCell: { flex: 1, minWidth: '45%', backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 6 },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  macroInputRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  macroInput: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '800' },
  macroUnit: { color: colors.textSecondary, fontSize: 13 },
});
