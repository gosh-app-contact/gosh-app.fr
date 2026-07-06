import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Button from '../../components/Button';
import PulsingLoader from '../../components/PulsingLoader';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Alert, TextInput } from 'react-native';
import { SafeAreaView as SafeAreaViewRN } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors, colors, spacing, radius } from '../../constants/theme';
import { loadState } from '../../utils/storage';
import { AppState, WeightEntry } from '../../types';
import { initHealthKit } from '../../utils/healthKit';
import { detectStagnation } from '../../utils/stagnation';
import { calculateCalorieGoal, calculateMacros } from '../../utils/calculations';
import WeightChart from '../../components/WeightChart';
import MacroCard from '../../components/MacroCard';
import { auth, db } from '../../utils/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { getMyAccountType } from '../../utils/coachStorage';
import { getWorkoutLogs, getExerciseHistory, computeVolume } from '../../utils/workoutLogStorage';
import { LoggedExercise } from '../../types/workoutLog';

function ScaleIcon({ color, size = 16 }: { color: string; size?: number }) {
  return <Ionicons name="scale-outline" size={size} color={color} />;
}

function PieIcon({ color, size = 16 }: { color: string; size?: number }) {
  return <Ionicons name="pie-chart-outline" size={size} color={color} />;
}

type SubTab = 'poids' | 'macros' | 'perfs';
type Period = '7j' | '1m' | '3m' | 'tout';
const PERIODS: { key: Period; label: string }[] = [
  { key: '7j', label: '7 j' },
  { key: '1m', label: '1 m' },
  { key: '3m', label: '3 m' },
  { key: 'tout', label: 'Tout' },
];
type Filter = '1w' | '1m' | '3m' | '6m' | '1y';

const FILTERS: { key: Filter; label: string; days: number }[] = [
  { key: '1w', label: '1S', days: 7 },
  { key: '1m', label: '1M', days: 30 },
  { key: '3m', label: '3M', days: 90 },
  { key: '6m', label: '6M', days: 180 },
  { key: '1y', label: '1A', days: 365 },
];

export default function SuiviScreen() {
  const colors = useColors();
  const router = useRouter();
  const [subTab, setSubTab] = useState<SubTab>('poids');
  const [state, setState] = useState<AppState | null>(null);
  const [filter, setFilter] = useState<Filter>('1m');
  const [loading, setLoading] = useState(true);
  const [isCoach, setIsCoach] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await loadState();
    await initHealthKit();
    if (s) setState(s);
    const type = await getMyAccountType();
    setIsCoach(type === 'coach');
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: 100 },
    subTabBar: {
      flexDirection: 'row' as const,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    subTab: { flex: 1, paddingVertical: 12, alignItems: 'center' as const, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
    subTabActive: { borderBottomColor: colors.accent },
    subTabText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' as const },
    subTabTextActive: { color: colors.text },
    statsRow: { flexDirection: 'row' as const, gap: spacing.sm },
    stat: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' as const },
    statLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5, textAlign: 'center' as const },
    statValue: { color: colors.text, fontSize: 20, fontWeight: '700' as const, marginTop: 4 },
    stagnationBadge: { backgroundColor: '#1A1500', borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.warning },
    stagnationText: { color: colors.warning, fontSize: 13, fontWeight: '500' as const },
    filterRow: { flexDirection: 'row' as const, gap: spacing.sm },
    filterBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.card, alignItems: 'center' as const },
    filterBtnActive: { backgroundColor: colors.accent },
    filterText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' as const },
    filterTextActive: { color: colors.text },
    chartCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, overflow: 'hidden' as const },
    sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' as const },
    entryRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, backgroundColor: colors.card, borderRadius: radius.sm, padding: spacing.md },
    entryDate: { color: colors.textSecondary, fontSize: 14 },
    entryWeight: { color: colors.text, fontSize: 16, fontWeight: '600' as const },
    emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' as const, marginTop: spacing.lg },
    histBtn: { backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' as const, borderWidth: 1, borderColor: colors.accent + '55' },
    histBtnText: { color: colors.accent, fontSize: 15, fontWeight: '700' as const },
    headerCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.lg },
    headerLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    headerValue: { color: colors.text, fontSize: 28, fontWeight: '800' as const, marginTop: 2 },
    headerUnit: { fontSize: 14, fontWeight: '400' as const, color: colors.textSecondary },
    divider: { width: 1, height: 48, backgroundColor: colors.border },
    fiberCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
    fiberLabel: { flex: 1, color: colors.textSecondary, fontSize: 14, fontWeight: '500' as const },
    fiberValue: { color: colors.text, fontSize: 20, fontWeight: '700' as const },
    fiberSub: { color: colors.textSecondary, fontSize: 11 },
    noteCard: { backgroundColor: '#0F1A0F', borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.accentGreen, gap: spacing.sm },
    noteTitle: { color: colors.accentGreen, fontSize: 14, fontWeight: '700' as const },
    noteText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
    noteBold: { color: colors.text, fontWeight: '600' as const },
    summaryCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
    summaryRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
    summaryLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' as const },
    summaryRight: { alignItems: 'flex-end' as const },
    summaryFormula: { color: colors.text, fontSize: 12, fontFamily: 'monospace' },
    summarySub: { color: colors.textSecondary, fontSize: 11 },
  }), [colors]);

  if (isCoach) return null;

  if (loading || !state) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <PulsingLoader size={52} />
      </View>
    );
  }

  const profile = state.profiles.find((p) => p.id === state.activeProfileId)!;
  const lastEntry = (profile.weightHistory?.length ?? 0) > 0
    ? [...profile.weightHistory].sort((a, b) => b.date.localeCompare(a.date))[0]
    : null;
  const w = lastEntry?.weight ?? profile.weight;

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      {/* Sub-tabs */}
      <View style={styles.subTabBar}>
        {(['poids', 'macros', ...(isCoach ? [] : ['perfs'])] as SubTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.subTab, subTab === t && styles.subTabActive]}
            onPress={() => setSubTab(t)}
          >
            <Text style={[styles.subTabText, subTab === t && styles.subTabTextActive]}>
              {t === 'poids' ? 'Poids' : t === 'macros' ? 'Macros' : 'Perfs'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {subTab === 'poids' ? (
        <PoidsView state={state} profile={profile} filter={filter} setFilter={setFilter} />
      ) : subTab === 'macros' ? (
        <MacrosView profile={profile} w={w} />
      ) : (
        <PerfsView />
      )}
    </SafeAreaView>
  );
}

// ─── Poids ────────────────────────────────────────────────────────────────────

// ─── Historique poids modal ────────────────────────────────────────────────────

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS_FR = ['L','M','M','J','V','S','D'];

function CalendarView({ monthKey, entries, onBack }: {
  monthKey: string;
  entries: WeightEntry[];
  onBack: () => void;
}) {
  const colors = useColors();
  const histStyles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: spacing.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { color: colors.text, fontSize: 16, fontWeight: '700' as const },
    close: { color: colors.accent, fontSize: 15, fontWeight: '600' as const },
    tabBar: { flexDirection: 'row' as const, borderBottomWidth: 1, borderBottomColor: colors.border },
    tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' as const, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
    tabBtnActive: { borderBottomColor: colors.accent },
    tabText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' as const },
    tabTextActive: { color: colors.text },
    body: { padding: spacing.md, gap: 10, paddingBottom: 40 },
    empty: { color: colors.textSecondary, textAlign: 'center' as const, marginTop: 40 },
    monthCard: { backgroundColor: colors.card, borderRadius: 14, padding: 16, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, borderWidth: 1, borderColor: colors.border },
    monthCardEmpty: { opacity: 0.45 },
    monthLeft: { gap: 4 },
    monthTitle: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    monthSub: { color: colors.textSecondary, fontSize: 12 },
    monthRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16 },
    monthStats: { flexDirection: 'row' as const, gap: 14 },
    monthStat: { alignItems: 'center' as const, gap: 2 },
    monthStatLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '600' as const, textTransform: 'uppercase' as const },
    monthStatVal: { color: colors.text, fontSize: 13, fontWeight: '700' as const },
    calHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: spacing.md, paddingVertical: 14 },
    backBtn: { padding: 4 },
    calTitle: { color: colors.text, fontSize: 16, fontWeight: '700' as const },
    dowRow: { flexDirection: 'row' as const, paddingHorizontal: spacing.md, marginBottom: 6 },
    dowText: { flex: 1, textAlign: 'center' as const, color: colors.textSecondary, fontSize: 12, fontWeight: '600' as const },
    grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, paddingHorizontal: spacing.md, gap: 6 },
    cell: { width: `${100 / 7}%` as any, aspectRatio: 1, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 10 },
    cellHasData: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    cellSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
    cellDay: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' as const },
    cellDayHasData: { color: colors.text, fontWeight: '700' as const },
    cellDaySelected: { color: '#fff', fontWeight: '800' as const },
    cellWeight: { color: colors.accent, fontSize: 9, fontWeight: '700' as const, marginTop: 1 },
    detailCard: { margin: spacing.md, marginTop: 20, backgroundColor: colors.card, borderRadius: 16, padding: 20, alignItems: 'center' as const, borderWidth: 1, borderColor: colors.accent + '44' },
    detailDate: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' as const, marginBottom: 8 },
    detailWeightRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 6 },
    detailWeight: { color: colors.accent, fontSize: 42, fontWeight: '800' as const, lineHeight: 48 },
    detailUnit: { color: colors.textSecondary, fontSize: 18, fontWeight: '600' as const, paddingBottom: 6 },
    detailEmpty: { color: colors.textSecondary, fontSize: 14 },
  }), [colors]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [year, m] = monthKey.split('-').map(Number);
  const monthLabel = `${MONTHS_FR[m - 1]} ${year}`;

  // Map date → weight
  const weightMap: Record<string, number> = {};
  entries.forEach((e) => { weightMap[e.date] = e.weight; });

  // Jours du mois
  const daysInMonth = new Date(year, m, 0).getDate();
  // Décalage du premier jour (lundi = 0)
  const firstDow = new Date(year, m - 1, 1).getDay(); // 0=dim
  const offset = firstDow === 0 ? 6 : firstDow - 1;

  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Compléter jusqu'à multiple de 7
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedDate = selectedDay
    ? `${monthKey}-${String(selectedDay).padStart(2, '0')}`
    : null;
  const selectedWeight = selectedDate ? weightMap[selectedDate] : null;

  return (
    <View style={{ flex: 1 }}>
      <View style={histStyles.calHeader}>
        <TouchableOpacity onPress={onBack} style={histStyles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M15 18l-6-6 6-6" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={histStyles.calTitle}>{monthLabel}</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Jours de la semaine */}
      <View style={histStyles.dowRow}>
        {DAYS_FR.map((d, i) => (
          <Text key={i} style={histStyles.dowText}>{d}</Text>
        ))}
      </View>

      {/* Grille */}
      <View style={histStyles.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={i} style={histStyles.cell} />;
          const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`;
          const hasWeight = weightMap[dateStr] !== undefined;
          const isSelected = selectedDay === String(day);
          return (
            <TouchableOpacity
              key={i}
              style={[
                histStyles.cell,
                hasWeight && histStyles.cellHasData,
                isSelected && histStyles.cellSelected,
              ]}
              onPress={() => setSelectedDay(isSelected ? null : String(day))}
              activeOpacity={0.7}
              disabled={!hasWeight}
            >
              <Text style={[
                histStyles.cellDay,
                hasWeight && histStyles.cellDayHasData,
                isSelected && histStyles.cellDaySelected,
              ]}>{day}</Text>
              {hasWeight && !isSelected && (
                <Text style={histStyles.cellWeight}>{weightMap[dateStr].toFixed(1)}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Détail sélection */}
      {selectedDate && (
        <View style={histStyles.detailCard}>
          {selectedWeight != null ? (
            <>
              <Text style={histStyles.detailDate}>
                {parseInt(selectedDate.split('-')[2], 10)} {MONTHS_FR[m - 1]} {year}
              </Text>
              <View style={histStyles.detailWeightRow}>
                <Text style={histStyles.detailWeight}>{selectedWeight.toFixed(1)}</Text>
                <Text style={histStyles.detailUnit}>kg</Text>
              </View>
            </>
          ) : (
            <Text style={histStyles.detailEmpty}>Aucune pesée ce jour</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Mini calendrier inline ───────────────────────────────────────────────────

function InlineCalendar({ selectedDate, onSelect, weightMap, label, accentColor }: {
  selectedDate: string | null;
  onSelect: (d: string) => void;
  weightMap: Record<string, number>;
  label: string;
  accentColor: string;
}) {
  const colors = useColors();
  const calStyles = useMemo(() => StyleSheet.create({
    container: { backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
    calLabel: { fontSize: 11, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.8, textAlign: 'center' as const },
    navRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 4 },
    navTitle: { color: colors.text, fontSize: 14, fontWeight: '700' as const },
    dowRow: { flexDirection: 'row' as const },
    dowText: { flex: 1, textAlign: 'center' as const, color: colors.textSecondary, fontSize: 11, fontWeight: '600' as const },
    grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 2 },
    cell: { width: `${100 / 7}%` as any, aspectRatio: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
    cellDay: { color: colors.textSecondary, fontSize: 12 },
    cellWeight: { color: colors.accent, fontSize: 8, fontWeight: '700' as const },
  }), [colors]);
  const now = new Date();
  const initYM = selectedDate ? selectedDate.slice(0, 7) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [viewYM, setViewYM] = useState(initYM);
  const [vy, vm] = viewYM.split('-').map(Number);

  const prevYM = () => {
    const d = new Date(vy, vm - 2, 1);
    setViewYM(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextYM = () => {
    const d = new Date(vy, vm, 1);
    setViewYM(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const daysInMonth = new Date(vy, vm, 0).getDate();
  const firstDow = new Date(vy, vm - 1, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={[calStyles.container, { borderColor: accentColor + '66' }]}>
      <Text style={[calStyles.calLabel, { color: accentColor }]}>{label}</Text>
      {/* Navigation mois */}
      <View style={calStyles.navRow}>
        <TouchableOpacity onPress={prevYM} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={calStyles.navTitle}>{MONTHS_FR[vm - 1]} {vy}</Text>
        <TouchableOpacity onPress={nextYM} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
      {/* Jours semaine */}
      <View style={calStyles.dowRow}>
        {DAYS_FR.map((d, i) => <Text key={i} style={calStyles.dowText}>{d}</Text>)}
      </View>
      {/* Grille */}
      <View style={calStyles.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={i} style={calStyles.cell} />;
          const dateStr = `${viewYM}-${String(day).padStart(2, '0')}`;
          const hasWeight = weightMap[dateStr] !== undefined;
          const isSelected = selectedDate === dateStr;
          return (
            <TouchableOpacity
              key={i}
              style={[
                calStyles.cell,
                hasWeight && { backgroundColor: accentColor + '18', borderRadius: 8 },
                isSelected && { backgroundColor: accentColor, borderRadius: 8 },
              ]}
              onPress={() => hasWeight && onSelect(dateStr)}
              activeOpacity={hasWeight ? 0.7 : 1}
            >
              <Text style={[
                calStyles.cellDay,
                hasWeight && { color: colors.text, fontWeight: '700' },
                isSelected && { color: '#fff', fontWeight: '800' },
              ]}>{day}</Text>
              {hasWeight && (
                <Text style={[calStyles.cellWeight, isSelected && { color: '#fff' }]}>
                  {weightMap[dateStr].toFixed(1)}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}


// ─── Période view ─────────────────────────────────────────────────────────────

function PeriodeView({ history, allMonths, byMonth, onOpenMonth }: {
  history: WeightEntry[];
  allMonths: string[];
  byMonth: Record<string, WeightEntry[]>;
  onOpenMonth: (m: string) => void;
}) {
  const colors = useColors();
  const histStyles = useMemo(() => StyleSheet.create({
    monthCard: { backgroundColor: colors.card, borderRadius: 14, padding: 16, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, borderWidth: 1, borderColor: colors.border },
    monthCardEmpty: { opacity: 0.45 },
    monthLeft: { gap: 4 },
    monthTitle: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    monthSub: { color: colors.textSecondary, fontSize: 12 },
    monthRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16 },
    monthStats: { flexDirection: 'row' as const, gap: 14 },
    monthStat: { alignItems: 'center' as const, gap: 2 },
    monthStatLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '600' as const, textTransform: 'uppercase' as const },
    monthStatVal: { color: colors.text, fontSize: 13, fontWeight: '700' as const },
  }), [colors]);
  const periStyles = useMemo(() => StyleSheet.create({
    body: { padding: spacing.md, gap: 14, paddingBottom: 40 },
    empty: { color: colors.textSecondary, textAlign: 'center' as const, marginTop: 8, fontSize: 14 },
    selectorRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
    selector: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center' as const, gap: 4 },
    selectorLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    selectorVal: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    selectorArrow: { paddingHorizontal: 4 },
    selectorActive: { borderColor: colors.accent },
    evolutionCard: { backgroundColor: colors.card, borderRadius: 16, padding: 18, gap: 14, borderWidth: 1, borderColor: colors.border },
    evolutionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    deltaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
    deltaVal: { fontSize: 36, fontWeight: '800' as const },
    deltaBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    deltaBadgeText: { fontSize: 12, fontWeight: '700' as const },
    fromToRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
    fromTo: { flex: 1, alignItems: 'center' as const, gap: 3 },
    fromToDivider: { width: 1, height: 40, backgroundColor: colors.border, marginHorizontal: 8 },
    fromToLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' as const, textTransform: 'uppercase' as const },
    fromToVal: { color: colors.text, fontSize: 18, fontWeight: '800' as const },
    fromToDate: { color: colors.textSecondary, fontSize: 11 },
    statsGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
    statCard: { flex: 1, minWidth: '45%', backgroundColor: colors.card, borderRadius: 12, padding: 14, alignItems: 'center' as const, gap: 4, borderWidth: 1, borderColor: colors.border },
    statLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
    statVal: { color: colors.text, fontSize: 18, fontWeight: '700' as const },
    listTitle: { color: colors.text, fontSize: 14, fontWeight: '700' as const },
  }), [colors]);
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const sortedHistory = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = sortedHistory[0]?.date ?? todayStr;

  const [startDate, setStartDate] = useState<string | null>(firstDate);
  const [endDate, setEndDate] = useState<string | null>(todayStr);
  const [pickingStart, setPickingStart] = useState(false);
  const [pickingEnd, setPickingEnd] = useState(false);

  // Map date → weight pour tout l'historique
  const weightMap: Record<string, number> = {};
  history.forEach((e) => { weightMap[e.date] = e.weight; });

  const inRange = startDate && endDate
    ? sortedHistory.filter((e) => e.date >= startDate && e.date <= endDate)
    : [];

  // Pesées les plus proches des dates sélectionnées
  const startEntry = inRange[0] ?? null;
  const endEntry = inRange[inRange.length - 1] ?? null;
  const delta = startEntry && endEntry && startEntry.date !== endEntry.date
    ? endEntry.weight - startEntry.weight : null;
  const avgWeight = inRange.length > 0 ? inRange.reduce((s, e) => s + e.weight, 0) / inRange.length : null;
  const minW = inRange.length > 0 ? Math.min(...inRange.map((e) => e.weight)) : null;
  const maxW = inRange.length > 0 ? Math.max(...inRange.map((e) => e.weight)) : null;

  const startMonthOfRange = startDate ? startDate.slice(0, 7) : null;
  const endMonthOfRange = endDate ? endDate.slice(0, 7) : null;

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    const [, mo, day] = d.split('-');
    return `${parseInt(day, 10)} ${MONTHS_FR[parseInt(mo, 10) - 1].slice(0, 3)}.`;
  };

  return (
    <ScrollView contentContainerStyle={periStyles.body} showsVerticalScrollIndicator={false}>
      {/* Sélecteurs */}
      <View style={periStyles.selectorRow}>
        <TouchableOpacity
          style={[periStyles.selector, pickingStart && periStyles.selectorActive]}
          onPress={() => { setPickingStart((v) => !v); setPickingEnd(false); }}
          activeOpacity={0.8}
        >
          <Text style={periStyles.selectorLabel}>Début</Text>
          <Text style={periStyles.selectorVal}>{fmtDate(startDate)}</Text>
        </TouchableOpacity>
        <View style={periStyles.selectorArrow}>
          <Ionicons name="arrow-forward" size={20} color={colors.textSecondary} />
        </View>
        <TouchableOpacity
          style={[periStyles.selector, pickingEnd && periStyles.selectorActive]}
          onPress={() => { setPickingEnd((v) => !v); setPickingStart(false); }}
          activeOpacity={0.8}
        >
          <Text style={periStyles.selectorLabel}>Fin</Text>
          <Text style={periStyles.selectorVal}>{fmtDate(endDate)}</Text>
        </TouchableOpacity>
      </View>

      {pickingStart && (
        <InlineCalendar
          selectedDate={startDate}
          onSelect={(d) => { setStartDate(d); setPickingStart(false); }}
          weightMap={weightMap}
          label="Date de début"
          accentColor={colors.accentGreen}
        />
      )}
      {pickingEnd && (
        <InlineCalendar
          selectedDate={endDate}
          onSelect={(d) => { setEndDate(d); setPickingEnd(false); }}
          weightMap={weightMap}
          label="Date de fin"
          accentColor={colors.accent}
        />
      )}

      {inRange.length === 0 ? (
        <Text style={periStyles.empty}>Aucune pesée sur cette période.</Text>
      ) : (
        <>
          {/* Évolution principale */}
          <View style={periStyles.evolutionCard}>
            <Text style={periStyles.evolutionLabel}>Évolution sur la période</Text>
            {delta !== null ? (
              <View style={periStyles.deltaRow}>
                <Text style={[periStyles.deltaVal, { color: delta < 0 ? colors.accentGreen : delta > 0 ? colors.accent : colors.text }]}>
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)} kg
                </Text>
                <View style={[periStyles.deltaBadge, { backgroundColor: delta < 0 ? colors.accentGreen + '22' : delta > 0 ? colors.accent + '22' : colors.card }]}>
                  <Text style={[periStyles.deltaBadgeText, { color: delta < 0 ? colors.accentGreen : delta > 0 ? colors.accent : colors.textSecondary }]}>
                    {delta < 0 ? '▼ Perte' : delta > 0 ? '▲ Prise' : '= Stable'}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={periStyles.empty}>{inRange.length} pesée sur la période</Text>
            )}
            <View style={periStyles.fromToRow}>
              <View style={periStyles.fromTo}>
                <Text style={periStyles.fromToLabel}>Départ</Text>
                <Text style={periStyles.fromToVal}>{startEntry?.weight.toFixed(1)} kg</Text>
                <Text style={periStyles.fromToDate}>{startEntry?.date}</Text>
              </View>
              <View style={periStyles.fromToDivider} />
              <View style={periStyles.fromTo}>
                <Text style={periStyles.fromToLabel}>Arrivée</Text>
                <Text style={periStyles.fromToVal}>{endEntry?.weight.toFixed(1)} kg</Text>
                <Text style={periStyles.fromToDate}>{endEntry?.date}</Text>
              </View>
            </View>
          </View>

          {/* Stats */}
          <View style={periStyles.statsGrid}>
            {[
              { label: 'Pesées', val: `${inRange.length}` },
              { label: 'Moyenne', val: `${avgWeight?.toFixed(1)} kg` },
              { label: 'Minimum', val: `${minW?.toFixed(1)} kg` },
              { label: 'Maximum', val: `${maxW?.toFixed(1)} kg` },
            ].map((s) => (
              <View key={s.label} style={periStyles.statCard}>
                <Text style={periStyles.statLabel}>{s.label}</Text>
                <Text style={periStyles.statVal}>{s.val}</Text>
              </View>
            ))}
          </View>

          {/* Par mois sur la période */}
          <Text style={periStyles.listTitle}>Par mois</Text>
          {allMonths
            .filter((ym) => (!startMonthOfRange || ym >= startMonthOfRange) && (!endMonthOfRange || ym <= endMonthOfRange))
            .reverse()
            .map((monthKey) => {
              const [year, mo] = monthKey.split('-');
              const label = `${MONTHS_FR[parseInt(mo, 10) - 1]} ${year}`;
              const entries = byMonth[monthKey] ?? [];
              const hasData = entries.length > 0;
              if (!hasData) {
                return (
                  <View key={monthKey} style={[histStyles.monthCard, histStyles.monthCardEmpty]}>
                    <Text style={[histStyles.monthTitle, { color: colors.textSecondary }]}>{label}</Text>
                    <Text style={histStyles.monthSub}>Aucune donnée</Text>
                  </View>
                );
              }
              const sorted2 = [...entries].sort((a, b) => a.date.localeCompare(b.date));
              const minM = Math.min(...entries.map((e) => e.weight));
              const maxM = Math.max(...entries.map((e) => e.weight));
              const lastM = sorted2[sorted2.length - 1].weight;
              return (
                <TouchableOpacity key={monthKey} style={histStyles.monthCard} onPress={() => onOpenMonth(monthKey)} activeOpacity={0.8}>
                  <View style={histStyles.monthLeft}>
                    <Text style={histStyles.monthTitle}>{label}</Text>
                    <Text style={histStyles.monthSub}>{entries.length} pesée{entries.length > 1 ? 's' : ''}</Text>
                  </View>
                  <View style={histStyles.monthRight}>
                    <View style={histStyles.monthStats}>
                      <View style={histStyles.monthStat}>
                        <Text style={histStyles.monthStatLabel}>Min</Text>
                        <Text style={histStyles.monthStatVal}>{minM.toFixed(1)}</Text>
                      </View>
                      <View style={histStyles.monthStat}>
                        <Text style={histStyles.monthStatLabel}>Max</Text>
                        <Text style={histStyles.monthStatVal}>{maxM.toFixed(1)}</Text>
                      </View>
                      <View style={histStyles.monthStat}>
                        <Text style={histStyles.monthStatLabel}>Dernier</Text>
                        <Text style={[histStyles.monthStatVal, { color: colors.accent }]}>{lastM.toFixed(1)}</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              );
            })}
        </>
      )}
    </ScrollView>
  );
}


// ─── Modal principal ───────────────────────────────────────────────────────────

function HistoriqueModal({ visible, onClose, history }: { visible: boolean; onClose: () => void; history: WeightEntry[] }) {
  const colors = useColors();
  const histStyles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: spacing.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { color: colors.text, fontSize: 16, fontWeight: '700' as const },
    close: { color: colors.accent, fontSize: 15, fontWeight: '600' as const },
    tabBar: { flexDirection: 'row' as const, borderBottomWidth: 1, borderBottomColor: colors.border },
    tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' as const, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
    tabBtnActive: { borderBottomColor: colors.accent },
    tabText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' as const },
    tabTextActive: { color: colors.text },
    body: { padding: spacing.md, gap: 10, paddingBottom: 40 },
    empty: { color: colors.textSecondary, textAlign: 'center' as const, marginTop: 40 },
    monthCard: { backgroundColor: colors.card, borderRadius: 14, padding: 16, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, borderWidth: 1, borderColor: colors.border },
    monthCardEmpty: { opacity: 0.45 },
    monthLeft: { gap: 4 },
    monthTitle: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    monthSub: { color: colors.textSecondary, fontSize: 12 },
    monthRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16 },
    monthStats: { flexDirection: 'row' as const, gap: 14 },
    monthStat: { alignItems: 'center' as const, gap: 2 },
    monthStatLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '600' as const, textTransform: 'uppercase' as const },
    monthStatVal: { color: colors.text, fontSize: 13, fontWeight: '700' as const },
  }), [colors]);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const byMonth: Record<string, WeightEntry[]> = {};
  history.forEach((e) => {
    const key = e.date.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(e);
  });

  // Générer tous les mois depuis le premier enregistrement jusqu'au mois courant
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const earliestYM = history.length > 0
    ? [...history].sort((a, b) => a.date.localeCompare(b.date))[0].date.slice(0, 7)
    : currentYM;

  const allMonths: string[] = [];
  let cursor = new Date(`${earliestYM}-01`);
  const end = new Date(`${currentYM}-01`);
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    allMonths.push(key);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const months = allMonths.reverse();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setOpenMonth(null); onClose(); }}>
      <SafeAreaViewRN style={histStyles.screen} edges={['top']}>
        {/* Header */}
        <View style={histStyles.header}>
          {openMonth ? (
            <TouchableOpacity onPress={() => setOpenMonth(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={22} color={colors.accent} />
            </TouchableOpacity>
          ) : <View style={{ width: 24 }} />}
          <Text style={histStyles.title}>Historique poids</Text>
          <Button label="Fermer" variant="secondary" size="sm" fullWidth={false} onPress={() => { setOpenMonth(null); onClose(); }} />
        </View>

        {openMonth ? (
          <CalendarView
            monthKey={openMonth}
            entries={byMonth[openMonth] ?? []}
            onBack={() => setOpenMonth(null)}
          />
        ) : (
          <PeriodeView
            history={history}
            allMonths={[...allMonths].reverse()}
            byMonth={byMonth}
            onOpenMonth={setOpenMonth}
          />
        )}
      </SafeAreaViewRN>
    </Modal>
  );
}


// ─── Poids ────────────────────────────────────────────────────────────────────

function PoidsView({ state, profile, filter, setFilter }: {
  state: AppState;
  profile: any;
  filter: Filter;
  setFilter: (f: Filter) => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const styles = useMemo(() => StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: 100 },
    statsRow: { flexDirection: 'row' as const, gap: spacing.sm },
    stat: { flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 14, alignItems: 'center' as const, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    statLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: 0.6, textAlign: 'center' as const },
    statValue: { color: colors.text, fontSize: 18, fontWeight: '800' as const },
    stagnationBadge: { backgroundColor: '#1A1500', borderRadius: 14, padding: spacing.md, borderWidth: 1, borderColor: colors.warning },
    stagnationText: { color: colors.warning, fontSize: 13, fontWeight: '500' as const },
    filterRow: { flexDirection: 'row' as const, gap: 6, backgroundColor: colors.card, borderRadius: 14, padding: 4 },
    filterBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' as const },
    filterBtnActive: { backgroundColor: colors.accent },
    filterText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' as const },
    filterTextActive: { color: '#fff', fontWeight: '700' as const },
    chartCard: { backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, overflow: 'hidden' as const, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    histBtn: { backgroundColor: colors.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center' as const, borderWidth: 1.5, borderColor: colors.accent + '44', flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 8 },
    histBtnText: { color: colors.accent, fontSize: 15, fontWeight: '700' as const },
  }), [colors]);
  const [showHistorique, setShowHistorique] = useState(false);
  const allHistory: WeightEntry[] = profile?.weightHistory ?? [];

  const filterDays = FILTERS.find((f) => f.key === filter)!.days;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - filterDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const filteredData: WeightEntry[] = allHistory.filter((w: WeightEntry) => w.date >= cutoffStr);

  const lastWeight = filteredData.length > 0 ? filteredData[filteredData.length - 1].weight : null;
  const firstWeight = filteredData.length > 0 ? filteredData[0].weight : null;
  const delta = lastWeight !== null && firstWeight !== null ? lastWeight - firstWeight : null;
  const stagnation = profile ? detectStagnation(profile) : null;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Ionicons name="scale-outline" size={20} color={colors.accent} />
          <Text style={styles.statLabel}>Actuel</Text>
          <Text style={styles.statValue}>{lastWeight ? `${lastWeight.toFixed(1)}` : '–'}</Text>
          {lastWeight && <Text style={{ color: colors.textSecondary, fontSize: 11 }}>kg</Text>}
        </View>
        <View style={styles.stat}>
          <Ionicons name={delta !== null && delta < 0 ? 'trending-down-outline' : 'trending-up-outline'} size={20} color={delta !== null ? (delta < 0 ? colors.accentGreen : colors.accent) : colors.textSecondary} />
          <Text style={styles.statLabel}>Variation</Text>
          <Text style={[styles.statValue, { color: delta !== null ? (delta < 0 ? colors.accentGreen : colors.accent) : colors.text }]}>
            {delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}` : '–'}
          </Text>
          {delta !== null && <Text style={{ color: colors.textSecondary, fontSize: 11 }}>kg</Text>}
        </View>
        <View style={styles.stat}>
          <Ionicons name="bar-chart-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.statLabel}>Pesées</Text>
          <Text style={styles.statValue}>{filteredData.length}</Text>
        </View>
      </View>

      {stagnation?.stagnating && (
        <TouchableOpacity
          style={[styles.stagnationBadge, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}
          activeOpacity={0.75}
          onPress={() => router.push('/')}
        >
          <Ionicons name="warning-outline" size={18} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.stagnationText, { fontWeight: '700' }]}>Stagnation détectée</Text>
            <Text style={[styles.stagnationText, { fontSize: 11, opacity: 0.8 }]}>Variation &lt; 200g sur 5 jours · Ajuste tes calories →</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.warning} />
        </TouchableOpacity>
      )}

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.chartCard}>
        <WeightChart data={filteredData} showMovingAverage />
      </View>

      <TouchableOpacity style={styles.histBtn} onPress={() => setShowHistorique(true)} activeOpacity={0.8}>
        <Ionicons name="time-outline" size={17} color={colors.accent} />
        <Text style={styles.histBtnText}>Voir tout l'historique</Text>
      </TouchableOpacity>

      <HistoriqueModal
        visible={showHistorique}
        onClose={() => setShowHistorique(false)}
        history={allHistory}
      />
    </ScrollView>
  );
}

// ─── Macros ───────────────────────────────────────────────────────────────────

function MacrosView({ profile, w }: { profile: any; w: number }) {
  const colors = useColors();
  const [coachCalorieGoal, setCoachCalorieGoal] = useState<number | null>(null);
  const [coachMacros, setCoachMacros] = useState<{ proteins: number; fats: number; carbs: number } | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const data = snap.data();
      const coachActive = !!data?.nutritionCoachEnabled;
      setCoachCalorieGoal(coachActive && data?.calorieGoalManual && data?.calorieGoal ? data.calorieGoal : null);
      setCoachMacros(coachActive && data?.coachMacroManual && data?.coachMacroProteins != null
        ? { proteins: data.coachMacroProteins, fats: data.coachMacroFats, carbs: data.coachMacroCarbs }
        : null);
    }, () => {});
    return () => unsub();
  }, []);

  const styles = useMemo(() => StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: 100 },
    sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' as const },
    headerCard: { backgroundColor: colors.card, borderRadius: 18, padding: spacing.lg, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    headerLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: 0.7 },
    headerValue: { color: colors.text, fontSize: 30, fontWeight: '800' as const, marginTop: 2 },
    headerUnit: { fontSize: 14, fontWeight: '400' as const, color: colors.textSecondary },
    divider: { width: 1, height: 52, backgroundColor: colors.border },
    fiberCard: { backgroundColor: colors.card, borderRadius: 14, padding: spacing.md, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    fiberLabel: { flex: 1, color: colors.textSecondary, fontSize: 14, fontWeight: '500' as const },
    fiberValue: { color: colors.text, fontSize: 22, fontWeight: '800' as const },
    fiberSub: { color: colors.textSecondary, fontSize: 11 },
    noteCard: { backgroundColor: '#0F1A0F', borderRadius: 14, padding: spacing.md, borderWidth: 1, borderColor: colors.accentGreen + '88', gap: spacing.sm },
    noteTitle: { color: colors.accentGreen, fontSize: 14, fontWeight: '700' as const },
    noteText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
    noteBold: { color: colors.text, fontWeight: '600' as const },
    summaryCard: { backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, gap: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    summaryRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingVertical: 4 },
    summaryLabel: { color: colors.text, fontSize: 14, fontWeight: '600' as const },
    summaryRight: { alignItems: 'flex-end' as const },
    summaryFormula: { color: colors.textSecondary, fontSize: 12, fontFamily: 'monospace' },
    summarySub: { color: colors.accent, fontSize: 11, fontWeight: '700' as const },
  }), [colors]);
  const calorieGoal = coachMacros
    ? Math.round(coachMacros.proteins * 4 + coachMacros.fats * 9 + coachMacros.carbs * 4)
    : coachCalorieGoal ?? calculateCalorieGoal(profile);
  const macros = coachMacros
    ? { proteins: coachMacros.proteins, fats: coachMacros.fats, carbs: coachMacros.carbs, fibers: Math.round((calorieGoal / 1000) * 15),
        proteinKcal: Math.round(coachMacros.proteins * 4), fatKcal: Math.round(coachMacros.fats * 9), carbKcal: Math.round(coachMacros.carbs * 4) }
    : calculateMacros(w, calorieGoal);
  const total = macros.proteinKcal + macros.fatKcal + macros.carbKcal;
  const protPct = Math.round((macros.proteinKcal / total) * 100);
  const fatPct = Math.round((macros.fatKcal / total) * 100);
  const carbPct = 100 - protPct - fatPct;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headerCard}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="flame-outline" size={13} color={colors.accent} />
            <Text style={styles.headerLabel}>Objectif calorique</Text>
          </View>
          <Text style={styles.headerValue}>{calorieGoal} <Text style={styles.headerUnit}>kcal</Text></Text>
        </View>
        <View style={styles.divider} />
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="scale-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.headerLabel}>Poids</Text>
          </View>
          <Text style={styles.headerValue}>{w.toFixed(1)} <Text style={styles.headerUnit}>kg</Text></Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Répartition des macros</Text>
      <MacroCard label="Protéines" grams={macros.proteins} kcal={macros.proteinKcal} color="#3B82F6" percentage={protPct} />
      <MacroCard label="Lipides" grams={macros.fats} kcal={macros.fatKcal} color="#F59E0B" percentage={fatPct} />
      <MacroCard label="Glucides" grams={macros.carbs} kcal={macros.carbKcal} color={colors.accent} percentage={carbPct} />

      <View style={styles.fiberCard}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentGreen + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="leaf-outline" size={18} color={colors.accentGreen} />
        </View>
        <Text style={styles.fiberLabel}>Fibres (indicatif)</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.fiberValue}>{macros.fibers}g</Text>
          <Text style={styles.fiberSub}>15g / 1000 kcal</Text>
        </View>
      </View>

      <View style={styles.noteCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="bulb-outline" size={14} color={colors.accentGreen} />
            <Text style={styles.noteTitle}>Recommandations d'ajustement</Text>
          </View>
          <TouchableOpacity
            onPress={() => Alert.alert('Information', 'Ces recommandations sont indicatives et basées sur des principes généraux de nutrition sportive. Elles ne remplacent pas l\'avis d\'un professionnel de santé ou d\'un nutritionniste agréé.', [{ text: 'OK' }])}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.noteText}>
          Pour tout changement de 200 kcal, ajuste <Text style={styles.noteBold}>uniquement les glucides</Text> de ±50g.
        </Text>
        <Text style={styles.noteText}>1g glucides = 4 kcal · 50g = 200 kcal</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Récapitulatif</Text>
        {(coachMacros ? [
          { label: 'Protéines', val: `Plan coach`, sub: `${macros.proteins}g · ${macros.proteinKcal} kcal` },
          { label: 'Lipides', val: `Plan coach`, sub: `${macros.fats}g · ${macros.fatKcal} kcal` },
          { label: 'Glucides', val: `Plan coach`, sub: `${macros.carbs}g · ${macros.carbKcal} kcal` },
        ] : [
          { label: 'Protéines', val: `2.2g × ${w.toFixed(0)}kg = ${macros.proteins}g`, sub: `${macros.proteinKcal} kcal` },
          { label: 'Lipides', val: `1g × ${w.toFixed(0)}kg = ${macros.fats}g`, sub: `${macros.fatKcal} kcal` },
          { label: 'Glucides', val: `(${calorieGoal} - ${macros.proteinKcal} - ${macros.fatKcal}) ÷ 4 = ${macros.carbs}g`, sub: `${macros.carbKcal} kcal` },
        ]).map((row) => (
          <View key={row.label} style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{row.label}</Text>
            <View style={styles.summaryRight}>
              <Text style={styles.summaryFormula}>{row.val}</Text>
              <Text style={styles.summarySub}>{row.sub}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Perfs view ───────────────────────────────────────────────────────────────

type PerfsSubTab = 'seances' | 'exercices';

function PerfsView() {
  const colors = useColors();
  const [perfsTab, setPerfsTab] = useState<PerfsSubTab>('seances');
  const [allLogs, setAllLogs] = useState<import('../../types/workoutLog').WorkoutLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getWorkoutLogs(uid).then((logs) => {
      setAllLogs(logs);
      setLoadingLogs(false);
    });
  }, []);

  if (loadingLogs) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
        <PulsingLoader size={40} />
      </View>
    );
  }

  if (allLogs.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 16 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent + '15', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="trending-up-outline" size={32} color={colors.accent} />
        </View>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>Ta progression t'attend</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
          Démarre ta première séance depuis l'accueil pour voir tes performances ici.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Sous-onglets Séances / Exercices */}
      <View style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        {([
          { key: 'seances', label: 'Séances' },
          { key: 'exercices', label: 'Exercices' },
        ] as { key: PerfsSubTab; label: string }[]).map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setPerfsTab(t.key)}
            style={{
              flex: 1, paddingVertical: 12, alignItems: 'center',
              borderBottomWidth: 2,
              borderBottomColor: perfsTab === t.key ? colors.accent : 'transparent',
              marginBottom: -1,
            }}
          >
            <Text style={{ color: perfsTab === t.key ? colors.text : colors.textSecondary, fontSize: 15, fontWeight: '600' }}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {perfsTab === 'seances' ? (
        <SeancesView allLogs={allLogs} />
      ) : (
        <ExercicesView allLogs={allLogs} />
      )}
    </View>
  );
}

// ─── Vue Séances ──────────────────────────────────────────────────────────────

function SeancesView({ allLogs }: { allLogs: import('../../types/workoutLog').WorkoutLog[] }) {
  const colors = useColors();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [pickStep, setPickStep] = useState<'A' | 'B'>('A'); // quelle date on choisit
  const [dateA, setDateA] = useState<string | null>(null); // YYYY-MM-DD
  const [dateB, setDateB] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Grouper les logs par nom de séance, triés du plus récent au plus ancien
  const sessionGroups = useMemo(() => {
    const map = new Map<string, import('../../types/workoutLog').WorkoutLog[]>();
    [...allLogs].sort((a, b) => b.completedAt - a.completedAt).forEach((log) => {
      const existing = map.get(log.sessionName) ?? [];
      map.set(log.sessionName, [...existing, log]);
    });
    return Array.from(map.entries()).map(([name, logs]) => ({ name, logs }));
  }, [allLogs]);

  const selectedLogs = useMemo(
    () => sessionGroups.find((g) => g.name === selectedName)?.logs ?? [],
    [sessionGroups, selectedName],
  );

  // Deux dernières séances pour la comparaison
  const lastTwo = selectedLogs.slice(0, 2);
  const current = lastTwo[0] ?? null;
  const previous = lastTwo[1] ?? null;

  // Données graphique volume
  const volumeChartData = useMemo(() => {
    return [...selectedLogs].reverse().map((log) => ({
      label: log.date.slice(5).replace('-', '/'),
      value: computeVolume(log.exercises),
    }));
  }, [selectedLogs]);

  // Durée formatée
  const fmtDuration = (ms?: number) => {
    if (!ms) return null;
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)}h${(m % 60).toString().padStart(2, '0')}`;
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 100, gap: spacing.md }}>
      {/* Sélecteur de séance */}
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        activeOpacity={0.8}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: colors.card, borderRadius: 16,
          borderWidth: selectedName ? 1.5 : StyleSheet.hairlineWidth,
          borderColor: selectedName ? colors.accent : colors.border,
          padding: spacing.md,
        }}
      >
        <Ionicons name="calendar-outline" size={20} color={selectedName ? colors.accent : colors.textSecondary} />
        <Text style={{ flex: 1, color: selectedName ? colors.text : colors.textSecondary, fontSize: 15, fontWeight: selectedName ? '700' : '400' }}>
          {selectedName ?? 'Choisir une séance…'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Modal picker séance */}
      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPicker(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 }}>
            <Text style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' }}>Mes séances</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 40 }}>
            {sessionGroups.map((g) => (
              <TouchableOpacity
                key={g.name}
                onPress={() => { setSelectedName(g.name); setShowPicker(false); }}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: g.name === selectedName ? colors.accent : colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="barbell-outline" size={18} color={g.name === selectedName ? '#fff' : colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{g.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{g.logs.length} séance{g.logs.length > 1 ? 's' : ''} enregistrée{g.logs.length > 1 ? 's' : ''}</Text>
                </View>
                {g.name === selectedName && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {selectedName && current && (
        <>
          {/* Titre + stats de la dernière séance */}
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: spacing.md, gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>{selectedName}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {selectedLogs.length} séance{selectedLogs.length > 1 ? 's' : ''} · Dernière le {new Date(current.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4 }}>
              <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 }}>
                <Ionicons name="barbell-outline" size={16} color={colors.accent} />
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{computeVolume(current.exercises)} kg</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Volume</Text>
              </View>
              {current.duration ? (
                <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 }}>
                  <Ionicons name="time-outline" size={16} color={colors.accent} />
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{fmtDuration(current.duration)}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Durée</Text>
                </View>
              ) : null}
              <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 }}>
                <Ionicons name="layers-outline" size={16} color={colors.accent} />
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>
                  {current.exercises.reduce((t, ex) => t + (ex.mode === 'sets' ? ex.sets.filter(s => s.done).length : 1), 0)}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Séries</Text>
              </View>
            </View>
          </View>

          {/* Comparaison dernière vs précédente */}
          {previous && (() => {
            const curTot = computeVolume(current.exercises);
            const prevTot = computeVolume(previous.exercises);
            const volDelta = curTot - prevTot;
            const volDeltaColor = volDelta > 0 ? '#34C759' : volDelta < 0 ? '#FF3B30' : colors.textSecondary;

            return (
              <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: spacing.md, gap: spacing.md }}>
                {/* Titre + badge volume global */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Comparaison séances</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: volDeltaColor + '18', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Ionicons
                      name={volDelta > 0 ? 'trending-up' : volDelta < 0 ? 'trending-down' : 'remove'}
                      size={14}
                      color={volDeltaColor}
                    />
                    <Text style={{ color: volDeltaColor, fontSize: 13, fontWeight: '800' }}>
                      {volDelta > 0 ? '+' : ''}{volDelta} kg vol.
                    </Text>
                  </View>
                </View>

                {/* En-têtes dates */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Avant</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                      {new Date(previous.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.accent + '18', borderRadius: 12, padding: 10, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: colors.accent + '30' }}>
                    <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Dernière</Text>
                    <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>
                      {new Date(current.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                </View>

                {/* Exercice par exercice */}
                {current.exercises.map((curEx, i) => {
                  const prevEx = previous.exercises.find((e) => e.exerciseSlug === curEx.exerciseSlug);
                  const curDone = curEx.mode === 'sets' ? curEx.sets.filter(s => s.done) : [];
                  const prevDone = prevEx?.mode === 'sets' ? prevEx.sets.filter(s => s.done) : [];
                  const maxSets = Math.max(curDone.length, prevDone.length, curEx.mode === '1rm' ? 1 : 0);
                  const curVol = computeVolume([curEx]);
                  const prevVol = prevEx ? computeVolume([prevEx]) : null;
                  const deltaVol = prevVol !== null ? curVol - prevVol : null;
                  const dvColor = deltaVol === null ? colors.textSecondary : deltaVol > 0 ? '#34C759' : deltaVol < 0 ? '#FF3B30' : colors.textSecondary;

                  return (
                    <View key={i} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm, gap: 10 }}>
                      {/* Nom exercice */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{curEx.exerciseName}</Text>
                        {deltaVol !== null && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: dvColor + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Ionicons
                              name={deltaVol > 0 ? 'arrow-up' : deltaVol < 0 ? 'arrow-down' : 'remove'}
                              size={10}
                              color={dvColor}
                            />
                            <Text style={{ color: dvColor, fontSize: 11, fontWeight: '700' }}>
                              {deltaVol === 0 ? 'Identique' : `${deltaVol > 0 ? '+' : ''}${deltaVol} kg`}
                            </Text>
                          </View>
                        )}
                      </View>

                      {curEx.mode === '1rm' ? (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                              {prevEx?.mode === '1rm' ? `${prevEx.oneRmKg ?? 0} kg` : '—'}
                            </Text>
                          </View>
                          <View style={{ flex: 1, backgroundColor: colors.accent + '12', borderRadius: 10, padding: 10, alignItems: 'center' }}>
                            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{curEx.oneRmKg ?? 0} kg</Text>
                          </View>
                        </View>
                      ) : (
                        <View style={{ gap: 5 }}>
                          {Array.from({ length: maxSets }, (_, si) => {
                            const cs = curDone[si];
                            const ps = prevDone[si];
                            const dKg = cs && ps ? cs.kg - ps.kg : null;
                            const dReps = cs && ps ? cs.reps - ps.reps : null;
                            const improved = (dKg !== null && dKg > 0) || (dReps !== null && dReps > 0);
                            const regressed = (dKg !== null && dKg < 0) || (dReps !== null && dReps < 0);
                            const dColor = cs && ps ? (improved ? '#34C759' : regressed ? '#FF3B30' : colors.textSecondary) : colors.textSecondary;

                            const deltaLabel = (() => {
                              if (!cs || !ps) return cs ? 'Nouvelle série' : '—';
                              if (dKg === 0 && dReps === 0) return 'Identique';
                              const parts = [];
                              if (dKg !== 0) parts.push(`${dKg! > 0 ? '+' : ''}${dKg} kg`);
                              if (dReps !== 0) parts.push(`${dReps! > 0 ? '+' : ''}${dReps} rép`);
                              return parts.join('  ');
                            })();

                            return (
                              <View key={si} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                {/* Numéro série */}
                                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                                  <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800' }}>{si + 1}</Text>
                                </View>
                                {/* Avant */}
                                <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                                  {ps ? (
                                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                                      {ps.reps} × {ps.kg} kg
                                    </Text>
                                  ) : (
                                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>—</Text>
                                  )}
                                </View>
                                {/* Dernière */}
                                <View style={{ flex: 1, backgroundColor: cs ? colors.accent + '12' : colors.bg, borderRadius: 10, paddingVertical: 8, alignItems: 'center', borderWidth: cs ? 1 : 0, borderColor: colors.accent + '25' }}>
                                  {cs ? (
                                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                                      {cs.reps} × {cs.kg} kg
                                    </Text>
                                  ) : (
                                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>—</Text>
                                  )}
                                </View>
                                {/* Delta */}
                                <View style={{
                                  flex: 1,
                                  backgroundColor: cs && ps ? dColor + '18' : 'transparent',
                                  borderRadius: 10,
                                  paddingVertical: 8,
                                  alignItems: 'center',
                                  flexDirection: 'row',
                                  justifyContent: 'center',
                                  gap: 3,
                                }}>
                                  {cs && ps && dKg === 0 && dReps === 0 ? (
                                    <Ionicons name="remove" size={12} color={colors.textSecondary} />
                                  ) : cs && ps ? (
                                    <Ionicons name={improved ? 'arrow-up' : 'arrow-down'} size={11} color={dColor} />
                                  ) : null}
                                  <Text style={{ color: dColor, fontSize: 11, fontWeight: '800' }}>{deltaLabel}</Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })()}

          {/* Graphique volume dans le temps */}
          {volumeChartData.length >= 2 && (
            <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: spacing.md, gap: 12 }}>
              <View style={{ gap: 2 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Tendance du volume</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  Volume total (kg soulevés) par séance. Plus c'est haut, plus tu as travaillé.
                </Text>
              </View>
              <SimpleLineChart data={volumeChartData} color={colors.accent} unit="kg" />
            </View>
          )}

          {/* Modal calendrier — choisir séance A et séance B */}
          {(() => {
            const sessionDates = new Set(selectedLogs.map(l => l.date));
            const { year, month } = calMonth;
            const firstDay = new Date(year, month, 1).getDay(); // 0=dim
            const startOffset = (firstDay + 6) % 7; // lundi en premier
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const cells = Array.from({ length: startOffset + daysInMonth }, (_, i) => {
              if (i < startOffset) return null;
              const day = i - startOffset + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              return { day, dateStr };
            });
            const monthLabel = new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

            return (
              <Modal visible={showCalendarPicker} transparent animationType="slide" onRequestClose={() => setShowCalendarPicker(false)}>
                <View style={{ flex: 1, backgroundColor: '#00000070', justifyContent: 'flex-end' }}>
                  <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: spacing.md }}>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900', flex: 1 }}>Choisir deux séances</Text>
                      <TouchableOpacity onPress={() => setShowCalendarPicker(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Ionicons name="close" size={22} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    {/* Sélection A / B */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity onPress={() => setPickStep('A')} style={{ flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 2, backgroundColor: pickStep === 'A' ? '#FF9500' + '25' : colors.bg, borderWidth: 1.5, borderColor: pickStep === 'A' ? '#FF9500' : colors.border }}>
                        <Text style={{ color: '#FF9500', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>Séance A</Text>
                        <Text style={{ color: dateA ? colors.text : colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
                          {dateA ? new Date(dateA).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Choisir'}
                        </Text>
                      </TouchableOpacity>
                      <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                        <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
                      </View>
                      <TouchableOpacity onPress={() => setPickStep('B')} style={{ flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 2, backgroundColor: pickStep === 'B' ? colors.accent + '25' : colors.bg, borderWidth: 1.5, borderColor: pickStep === 'B' ? colors.accent : colors.border }}>
                        <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>Séance B</Text>
                        <Text style={{ color: dateB ? colors.text : colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
                          {dateB ? new Date(dateB).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Choisir'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Navigation mois */}
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity onPress={() => setCalMonth(m => { const d = new Date(m.year, m.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="chevron-back" size={20} color={colors.text} />
                      </TouchableOpacity>
                      <Text style={{ flex: 1, textAlign: 'center', color: colors.text, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' }}>{monthLabel}</Text>
                      <TouchableOpacity onPress={() => setCalMonth(m => { const d = new Date(m.year, m.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="chevron-forward" size={20} color={colors.text} />
                      </TouchableOpacity>
                    </View>

                    {/* Jours de semaine */}
                    <View style={{ flexDirection: 'row' }}>
                      {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                        <Text key={i} style={{ flex: 1, textAlign: 'center', color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{d}</Text>
                      ))}
                    </View>

                    {/* Grille jours */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {cells.map((cell, i) => {
                        if (!cell) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
                        const { day, dateStr } = cell;
                        const hasSession = sessionDates.has(dateStr);
                        const isA = dateStr === dateA;
                        const isB = dateStr === dateB;
                        const minDate = dateA && dateB ? (dateA < dateB ? dateA : dateB) : null;
                        const maxDate = dateA && dateB ? (dateA > dateB ? dateA : dateB) : null;
                        const inRange = minDate && maxDate && dateStr > minDate && dateStr < maxDate;
                        const bgColor = isA ? '#FF9500' : isB ? colors.accent : inRange ? colors.accent + '20' : 'transparent';
                        const textColor = isA || isB ? '#fff' : hasSession ? colors.text : colors.textSecondary;

                        return (
                          <TouchableOpacity
                            key={i}
                            disabled={!hasSession}
                            onPress={() => {
                              if (pickStep === 'A') { setDateA(dateStr); setPickStep('B'); }
                              else { setDateB(dateStr); }
                            }}
                            style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: inRange ? colors.accent + '15' : bgColor, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: textColor, fontSize: 14, fontWeight: isA || isB ? '800' : hasSession ? '600' : '400' }}>{day}</Text>
                              {hasSession && !isA && !isB && (
                                <View style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Légende */}
                    <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF9500' }} />
                        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Séance A</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
                        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Séance B</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />
                        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Séance</Text>
                      </View>
                    </View>

                    {/* Bouton comparer */}
                    <TouchableOpacity
                      disabled={!dateA || !dateB || dateA === dateB}
                      onPress={() => { setShowCalendarPicker(false); setShowCompareModal(true); }}
                      style={{ backgroundColor: dateA && dateB && dateA !== dateB ? colors.accent : colors.surface, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                    >
                      <Text style={{ color: dateA && dateB && dateA !== dateB ? '#fff' : colors.textSecondary, fontSize: 15, fontWeight: '800' }}>
                        {dateA && dateB && dateA !== dateB ? 'Comparer ces deux séances' : 'Choisir A et B pour comparer'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            );
          })()}

          {/* Modal résultat comparaison */}
          {(() => {
            const logA = dateA ? selectedLogs.find(l => l.date === dateA) ?? null : null;
            const logB = dateB ? selectedLogs.find(l => l.date === dateB) ?? null : null;
            if (!logA || !logB) return null;
            // older = plus ancienne, newer = plus récente
            const older = logA.completedAt <= logB.completedAt ? logA : logB;
            const newer = logA.completedAt <= logB.completedAt ? logB : logA;
            const olderVol = computeVolume(older.exercises);
            const newerVol = computeVolume(newer.exercises);
            const volDelta = newerVol - olderVol;
            const olderSets = older.exercises.reduce((t, ex) => t + (ex.mode === 'sets' ? ex.sets.filter(s => s.done).length : 1), 0);
            const newerSets = newer.exercises.reduce((t, ex) => t + (ex.mode === 'sets' ? ex.sets.filter(s => s.done).length : 1), 0);
            const setsDelta = newerSets - olderSets;
            const volColor = volDelta > 0 ? '#34C759' : volDelta < 0 ? '#FF3B30' : colors.textSecondary;
            const setsColor = setsDelta > 0 ? '#34C759' : setsDelta < 0 ? '#FF3B30' : colors.textSecondary;

            return (
              <Modal visible={showCompareModal} transparent animationType="slide" onRequestClose={() => setShowCompareModal(false)}>
                <View style={{ flex: 1, backgroundColor: '#00000070', justifyContent: 'flex-end' }}>
                  <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: spacing.md, maxHeight: '85%' }}>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900', flex: 1 }}>Comparaison</Text>
                      <TouchableOpacity onPress={() => setShowCompareModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Ionicons name="close" size={22} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    {/* Dates */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>Avant</Text>
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                          {new Date(older.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: colors.accent + '18', borderRadius: 12, padding: 10, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: colors.accent + '30' }}>
                        <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>Après</Text>
                        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>
                          {new Date(newer.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      </View>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: spacing.md }}>
                      {/* Stats globales */}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}>Volume</Text>
                          <Text style={{ color: colors.text, fontSize: 13 }}>{olderVol} kg</Text>
                          <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '800' }}>{newerVol} kg</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: volColor + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Ionicons name={volDelta > 0 ? 'trending-up' : volDelta < 0 ? 'trending-down' : 'remove'} size={12} color={volColor} />
                            <Text style={{ color: volColor, fontSize: 12, fontWeight: '800' }}>{volDelta > 0 ? '+' : ''}{volDelta} kg</Text>
                          </View>
                        </View>
                        <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}>Séries</Text>
                          <Text style={{ color: colors.text, fontSize: 13 }}>{olderSets}</Text>
                          <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '800' }}>{newerSets}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: setsColor + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Ionicons name={setsDelta > 0 ? 'trending-up' : setsDelta < 0 ? 'trending-down' : 'remove'} size={12} color={setsColor} />
                            <Text style={{ color: setsColor, fontSize: 12, fontWeight: '800' }}>{setsDelta > 0 ? '+' : ''}{setsDelta}</Text>
                          </View>
                        </View>
                        {(older.duration || newer.duration) ? (
                          <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}>Durée</Text>
                            {older.duration ? <Text style={{ color: colors.text, fontSize: 13 }}>{fmtDuration(older.duration)}</Text> : <Text style={{ color: colors.textSecondary, fontSize: 13 }}>—</Text>}
                            {newer.duration ? <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '800' }}>{fmtDuration(newer.duration)}</Text> : <Text style={{ color: colors.textSecondary, fontSize: 13 }}>—</Text>}
                          </View>
                        ) : null}
                      </View>

                      {/* Exercice par exercice */}
                      {newer.exercises.map((newEx, i) => {
                        const oldEx = older.exercises.find(e => e.exerciseSlug === newEx.exerciseSlug);
                        const newDone = newEx.mode === 'sets' ? newEx.sets.filter(s => s.done) : [];
                        const oldDone = oldEx?.mode === 'sets' ? oldEx.sets.filter(s => s.done) : [];
                        const maxSets = Math.max(newDone.length, oldDone.length, newEx.mode === '1rm' ? 1 : 0);
                        const newVol = computeVolume([newEx]);
                        const oldVol = oldEx ? computeVolume([oldEx]) : null;
                        const dvRaw = oldVol !== null ? newVol - oldVol : null;
                        const dvColor = dvRaw === null ? colors.textSecondary : dvRaw > 0 ? '#34C759' : dvRaw < 0 ? '#FF3B30' : colors.textSecondary;

                        return (
                          <View key={i} style={{ backgroundColor: colors.bg, borderRadius: 16, padding: 12, gap: 10 }}>
                            {/* Nom + badge vol delta */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{newEx.exerciseName}</Text>
                              {dvRaw !== null && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: dvColor + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                                  <Ionicons name={dvRaw > 0 ? 'arrow-up' : dvRaw < 0 ? 'arrow-down' : 'remove'} size={10} color={dvColor} />
                                  <Text style={{ color: dvColor, fontSize: 11, fontWeight: '700' }}>
                                    {dvRaw === 0 ? 'Identique' : `${dvRaw > 0 ? '+' : ''}${dvRaw} kg vol.`}
                                  </Text>
                                </View>
                              )}
                              {!oldEx && (
                                <View style={{ backgroundColor: colors.accent + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                                  <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>Nouvel exo</Text>
                                </View>
                              )}
                            </View>

                            {newEx.mode === '1rm' ? (
                              <View style={{ flexDirection: 'row', gap: 8 }}>
                                <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{oldEx?.mode === '1rm' ? `${oldEx.oneRmKg ?? 0} kg` : '—'}</Text>
                                </View>
                                <View style={{ flex: 1, backgroundColor: colors.accent + '12', borderRadius: 10, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.accent + '25' }}>
                                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{newEx.oneRmKg ?? 0} kg</Text>
                                </View>
                              </View>
                            ) : (
                              <View style={{ gap: 5 }}>
                                {Array.from({ length: maxSets }, (_, si) => {
                                  const ns = newDone[si];
                                  const os = oldDone[si];
                                  const dKg = ns && os ? ns.kg - os.kg : null;
                                  const dReps = ns && os ? ns.reps - os.reps : null;
                                  const improved = (dKg !== null && dKg > 0) || (dReps !== null && dReps > 0);
                                  const regressed = (dKg !== null && dKg < 0) || (dReps !== null && dReps < 0);
                                  const dColor = ns && os ? (improved ? '#34C759' : regressed ? '#FF3B30' : colors.textSecondary) : colors.textSecondary;
                                  const deltaLabel = (() => {
                                    if (!ns || !os) return ns ? 'Nouvelle' : '—';
                                    if (dKg === 0 && dReps === 0) return 'Identique';
                                    const parts = [];
                                    if (dKg !== 0) parts.push(`${dKg! > 0 ? '+' : ''}${dKg} kg`);
                                    if (dReps !== 0) parts.push(`${dReps! > 0 ? '+' : ''}${dReps} rép`);
                                    return parts.join('  ');
                                  })();
                                  return (
                                    <View key={si} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800' }}>{si + 1}</Text>
                                      </View>
                                      <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                                        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{os ? `${os.reps} × ${os.kg} kg` : '—'}</Text>
                                      </View>
                                      <View style={{ flex: 1, backgroundColor: ns ? colors.accent + '12' : colors.card, borderRadius: 10, paddingVertical: 8, alignItems: 'center', borderWidth: ns ? 1 : 0, borderColor: colors.accent + '25' }}>
                                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{ns ? `${ns.reps} × ${ns.kg} kg` : '—'}</Text>
                                      </View>
                                      <View style={{ flex: 1, backgroundColor: ns && os ? dColor + '18' : 'transparent', borderRadius: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3 }}>
                                        {ns && os && dKg === 0 && dReps === 0
                                          ? <Ionicons name="remove" size={12} color={colors.textSecondary} />
                                          : ns && os ? <Ionicons name={improved ? 'arrow-up' : 'arrow-down'} size={11} color={dColor} />
                                          : null}
                                        <Text style={{ color: dColor, fontSize: 11, fontWeight: '800' }}>{deltaLabel}</Text>
                                      </View>
                                    </View>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              </Modal>
            );
          })()}

          {/* Historique des séances + bouton comparer */}
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: spacing.md, gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', flex: 1 }}>Toutes les séances</Text>
              <TouchableOpacity
                onPress={() => {
                  setDateA(null); setDateB(null); setPickStep('A');
                  const d = new Date(); setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
                  setShowCalendarPicker(true);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accent + '18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <Ionicons name="git-compare-outline" size={14} color={colors.accent} />
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>Comparer</Text>
              </TouchableOpacity>
            </View>
            {selectedLogs.map((log, i) => {
              const vol = computeVolume(log.exercises);
              const sets = log.exercises.reduce((t, ex) => t + (ex.mode === 'sets' ? ex.sets.filter(s => s.done).length : 1), 0);
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: i < selectedLogs.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border, gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                      {new Date(log.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {sets} séries · {log.exercises.length} exercice{log.exercises.length > 1 ? 's' : ''}
                      {log.duration ? ` · ${fmtDuration(log.duration)}` : ''}
                    </Text>
                  </View>
                  <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '800' }}>{vol} kg</Text>
                  {i === 0 && (
                    <View style={{ backgroundColor: colors.accent + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>Dernier</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ─── Vue Exercices ────────────────────────────────────────────────────────────

function ExercicesView({ allLogs }: { allLogs: import('../../types/workoutLog').WorkoutLog[] }) {
  const colors = useColors();
  const [history, setHistory] = useState<{ date: string; log: LoggedExercise; sessionName: string }[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('3m');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [showForceInfo, setShowForceInfo] = useState(false);

  const loggedSlugs = useMemo(() => {
    const slugMap = new Map<string, string>();
    allLogs.forEach((log) => {
      log.exercises.forEach((ex) => {
        if (!slugMap.has(ex.exerciseSlug)) slugMap.set(ex.exerciseSlug, ex.exerciseName);
      });
    });
    return Array.from(slugMap.entries()).map(([slug, name]) => ({ slug, name }));
  }, [allLogs]);

  const loadHistory = async (slug: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoadingHistory(true);
    setSelectedSlug(slug);
    const h = await getExerciseHistory(uid, slug);
    setHistory(h);
    setLoadingHistory(false);
    setShowPicker(false);
    setSearchQuery('');
  };

  const periodCutoff = useMemo(() => {
    const now = new Date();
    if (period === '7j') { now.setDate(now.getDate() - 7); return now.toISOString().slice(0, 10); }
    if (period === '1m') { now.setMonth(now.getMonth() - 1); return now.toISOString().slice(0, 10); }
    if (period === '3m') { now.setMonth(now.getMonth() - 3); return now.toISOString().slice(0, 10); }
    return '0000-00-00';
  }, [period]);

  const filteredHistory = useMemo(
    () => history.filter((h) => h.date >= periodCutoff),
    [history, periodCutoff],
  );

  // Dernière vs avant-dernière pour la comparaison série par série
  const last = filteredHistory[filteredHistory.length - 1] ?? null;
  const prev = filteredHistory[filteredHistory.length - 2] ?? null;

  // 1RM estimé Epley : kg × (1 + reps/30)
  // Utilisé pour le PR et le graphique — plus juste que le raw kg car prend en compte les reps
  const epley = (log: LoggedExercise) => {
    if (log.mode === '1rm') return log.oneRmKg ?? 0;
    const done = log.sets.filter(s => s.done);
    if (done.length === 0) return 0;
    const best = done.reduce((b, s) => s.kg * (1 + s.reps / 30) > b ? s.kg * (1 + s.reps / 30) : b, 0);
    return Math.round(best * 10) / 10;
  };

  // PR absolu : uniquement les séances où l'utilisateur a validé le mode 1RM explicitement
  const prEntry = useMemo(() => {
    const oneRmEntries = history.filter(h => h.log.mode === '1rm' && (h.log.oneRmKg ?? 0) > 0);
    if (oneRmEntries.length === 0) return null;
    return oneRmEntries.reduce((best, h) => (h.log.oneRmKg ?? 0) >= (best.log.oneRmKg ?? 0) ? h : best);
  }, [history]);

  const chartData = useMemo(() => filteredHistory.map((h) => ({
    label: h.date.slice(5).replace('-', '/'),
    value: epley(h.log),
  })), [filteredHistory]);

  const selectedName = loggedSlugs.find((s) => s.slug === selectedSlug)?.name ?? '';
  const filteredSlugs = searchQuery.trim()
    ? loggedSlugs.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : loggedSlugs;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 100, gap: spacing.md }}>
      {/* Sélecteur d'exercice */}
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        activeOpacity={0.8}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: colors.card, borderRadius: 16,
          borderWidth: selectedSlug ? 1.5 : StyleSheet.hairlineWidth,
          borderColor: selectedSlug ? colors.accent : colors.border,
          padding: spacing.md,
        }}
      >
        <Ionicons name="bar-chart-outline" size={20} color={selectedSlug ? colors.accent : colors.textSecondary} />
        <Text style={{ flex: 1, color: selectedSlug ? colors.text : colors.textSecondary, fontSize: 15, fontWeight: selectedSlug ? '700' : '400' }}>
          {selectedSlug ? selectedName : 'Choisir un exercice…'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Modal sélection exercice */}
      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPicker(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 }}>
            <Text style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' }}>Mes exercices</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: spacing.md, paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 }}>
              <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
              <TextInput
                style={{ flex: 1, color: colors.text, fontSize: 15 }}
                placeholder="Rechercher…"
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
            </View>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 40 }}>
            {filteredSlugs.map((item) => (
              <TouchableOpacity
                key={item.slug}
                onPress={() => loadHistory(item.slug)}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: item.slug === selectedSlug ? colors.accent : colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="barbell-outline" size={16} color={item.slug === selectedSlug ? '#fff' : colors.accent} />
                </View>
                <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: item.slug === selectedSlug ? '700' : '500' }}>{item.name}</Text>
                {item.slug === selectedSlug && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {selectedSlug && !loadingHistory && history.length > 0 && (
        <>
          {/* Carte hero PR + 1RM estimé */}
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: spacing.md, gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>{selectedName}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{history.length} séance{history.length > 1 ? 's' : ''} enregistrée{history.length > 1 ? 's' : ''}</Text>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4 }}>
              {/* PR — uniquement si 1RM explicitement validé par l'utilisateur */}
              <View style={{ flex: 1, backgroundColor: prEntry ? '#FFB80015' : colors.surface, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: prEntry ? '#FFB80040' : colors.border }}>
                <Ionicons name="trophy-outline" size={18} color={prEntry ? '#FFB800' : colors.textSecondary} />
                <Text style={{ color: prEntry ? '#FFB800' : colors.textSecondary, fontSize: 18, fontWeight: '900' }}>
                  {prEntry ? `${prEntry.log.oneRmKg} kg` : '—'}
                </Text>
                <Text style={{ color: prEntry ? '#FFB80099' : colors.textSecondary, fontSize: 11, fontWeight: '600' }}>PR — 1RM</Text>
              </View>
              {/* 1RM estimé Epley */}
              <View style={{ flex: 1, backgroundColor: colors.accent + '15', borderRadius: 14, padding: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.accent + '40' }}>
                <Ionicons name="analytics-outline" size={18} color={colors.accent} />
                <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '900' }}>
                  {last ? epley(last.log) : 0} kg
                </Text>
                <Text style={{ color: colors.accent + '99', fontSize: 11, fontWeight: '600' }}>1RM estimé</Text>
              </View>
            </View>

            {/* Explication pédagogique 1RM */}
            <View style={{ backgroundColor: colors.bg, borderRadius: 12, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
                Le <Text style={{ fontWeight: '700' }}>1RM estimé</Text> est la charge maximale que tu pourrais soulever une seule fois, calculée automatiquement à partir de tes séries (formule d'Epley). C'est le meilleur indicateur de ta force réelle.
              </Text>
            </View>
          </View>

          {/* Filtre période */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {PERIODS.map((p) => (
              <TouchableOpacity
                key={p.key}
                onPress={() => setPeriod(p.key)}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center',
                  backgroundColor: period === p.key ? colors.accent + '20' : colors.card,
                  borderWidth: 1.5, borderColor: period === p.key ? colors.accent : colors.border,
                }}
              >
                <Text style={{ color: period === p.key ? colors.accent : colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Graphique 1RM estimé */}
          {/* Modal explication 1RM */}
          <Modal visible={showForceInfo} transparent animationType="fade" onRequestClose={() => setShowForceInfo(false)}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: '#00000060', justifyContent: 'center', alignItems: 'center', padding: spacing.lg }} activeOpacity={1} onPress={() => setShowForceInfo(false)}>
              <TouchableOpacity activeOpacity={1} style={{ backgroundColor: colors.card, borderRadius: 20, padding: spacing.lg, gap: 16, width: '100%', maxWidth: 360 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="analytics-outline" size={22} color={colors.accent} />
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900', flex: 1 }}>Progression de ta force</Text>
                  <TouchableOpacity onPress={() => setShowForceInfo(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={{ gap: 12 }}>
                  <View style={{ gap: 4 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>C'est quoi ce graphique ?</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                      Chaque point représente ton <Text style={{ color: colors.text, fontWeight: '700' }}>1RM estimé</Text> lors d'une séance. Si la courbe monte, ta force progresse sur cet exercice.
                    </Text>
                  </View>

                  <View style={{ backgroundColor: colors.bg, borderRadius: 12, padding: 12, gap: 6 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>Formule d'Epley</Text>
                    <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '900', textAlign: 'center', paddingVertical: 4 }}>
                      1RM = kg × (1 + reps ÷ 30)
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
                      Exemple : 10 reps × 80 kg → 1RM estimé = <Text style={{ color: colors.text, fontWeight: '700' }}>107 kg</Text>
                    </Text>
                  </View>

                  <View style={{ gap: 4 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Pourquoi c'est utile ?</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                      Tu n'as pas besoin de faire un vrai 1RM pour mesurer ta force. Passer de 80 kg × 8 reps à 82 kg × 8 reps = la courbe monte. C'est un <Text style={{ color: colors.text, fontWeight: '700' }}>indicateur de progression relatif</Text>, pas absolu.
                    </Text>
                  </View>

                  <View style={{ gap: 4 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Différence avec le PR</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                      Le <Text style={{ color: '#FFB800', fontWeight: '700' }}>PR</Text> ne se met à jour que quand tu valides un vrai 1RM dans la séance. La courbe, elle, se calcule automatiquement à chaque séance classique.
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

          {chartData.length >= 2 ? (
            <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: spacing.md, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Progression de ta force</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    1RM estimé séance après séance. Si la courbe monte, tu progresses.
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowForceInfo(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <SimpleLineChart data={chartData} color={colors.accent} unit="kg" />
            </View>
          ) : chartData.length === 1 ? (
            <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, alignItems: 'center', gap: 8 }}>
              <Ionicons name="analytics-outline" size={28} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                2 séances minimum pour afficher la courbe. Continue — tu as déjà une base !
              </Text>
            </View>
          ) : null}

          {/* Comparaison dernière vs avant-dernière */}
          {last && prev && (
            <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: spacing.md, gap: spacing.md }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Dernière vs précédente</Text>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 10, padding: 8, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>Avant</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    {new Date(prev.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.accent + '18', borderRadius: 10, padding: 8, alignItems: 'center' }}>
                  <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>Dernier</Text>
                  <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>
                    {new Date(last.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              </View>

              {/* Série par série */}
              {last.log.mode === 'sets' && prev.log.mode === 'sets' ? (
                (() => {
                  const maxLen = Math.max(last.log.sets.filter(s => s.done).length, prev.log.sets.filter(s => s.done).length);
                  const lastDone = last.log.sets.filter(s => s.done);
                  const prevDone = prev.log.sets.filter(s => s.done);
                  return Array.from({ length: maxLen }, (_, i) => {
                    const ls = lastDone[i];
                    const ps = prevDone[i];
                    const deltaKg = ls && ps ? ls.kg - ps.kg : null;
                    const deltaReps = ls && ps ? ls.reps - ps.reps : null;
                    const improved = (deltaKg !== null && deltaKg > 0) || (deltaReps !== null && deltaReps > 0);
                    const regressed = (deltaKg !== null && deltaKg < 0) || (deltaReps !== null && deltaReps < 0);
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: i < maxLen - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }}>
                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '800' }}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          {ps ? <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{ps.reps} × {ps.kg} kg</Text> : <Text style={{ color: colors.textSecondary, fontSize: 13 }}>—</Text>}
                        </View>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          {ls ? <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{ls.reps} × {ls.kg} kg</Text> : <Text style={{ color: colors.textSecondary, fontSize: 13 }}>—</Text>}
                        </View>
                        <View style={{ width: 52, alignItems: 'center' }}>
                          {deltaKg !== null ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                              <Ionicons
                                name={improved ? 'arrow-up' : regressed ? 'arrow-down' : 'remove'}
                                size={12}
                                color={improved ? '#34C759' : regressed ? '#FF3B30' : colors.textSecondary}
                              />
                              <Text style={{ color: improved ? '#34C759' : regressed ? '#FF3B30' : colors.textSecondary, fontSize: 11, fontWeight: '700' }}>
                                {deltaKg === 0 && deltaReps === 0 ? '=' : deltaKg !== 0 ? `${Math.abs(deltaKg)}kg` : `${Math.abs(deltaReps!)}rep`}
                              </Text>
                            </View>
                          ) : <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Nv.</Text>}
                        </View>
                      </View>
                    );
                  });
                })()
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 15 }}>{prev.log.oneRmKg ?? 0} kg</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{last.log.oneRmKg ?? 0} kg</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Calendrier historique */}
          <WorkoutCalendar history={history} prEntry={prEntry} epley={epley} />
        </>
      )}

      {selectedSlug && loadingHistory && (
        <View style={{ alignItems: 'center', padding: spacing.md }}>
          <PulsingLoader size={40} />
        </View>
      )}
    </ScrollView>
  );
}

// ─── Calendrier historique exercice ──────────────────────────────────────────

const CAL_DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const CAL_MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function WorkoutCalendar({
  history,
  prEntry,
  epley,
}: {
  history: { date: string; log: LoggedExercise; sessionName: string }[];
  prEntry: { date: string; log: LoggedExercise; sessionName: string } | null;
  epley: (log: LoggedExercise) => number;
}) {
  const colors = useColors();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-based
  const [selected, setSelected] = useState<string | null>(null);

  // Index: date string → entry
  const byDate = useMemo(() => {
    const map = new Map<string, { date: string; log: LoggedExercise; sessionName: string }>();
    history.forEach((h) => map.set(h.date, h));
    return map;
  }, [history]);

  // Cellules du mois
  const cells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    // 0=dim → convertir en 0=lun
    const startDow = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const result: (number | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(d);
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelected(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelected(null);
  };

  const selectedEntry = selected ? byDate.get(selected) ?? null : null;
  const isPR = selectedEntry && prEntry && selectedEntry.date === prEntry.date;

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: spacing.md, gap: spacing.md }}>
      {/* Navigation mois */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Historique</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={prevMonth} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', minWidth: 120, textAlign: 'center' }}>
            {CAL_MONTHS[viewMonth]} {viewYear}
          </Text>
          <TouchableOpacity onPress={nextMonth} hitSlop={10}>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Jours de la semaine */}
      <View style={{ flexDirection: 'row' }}>
        {CAL_DAYS.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700' }}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Grille */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, i) => {
          if (!day) return <View key={i} style={{ width: `${100 / 7}%`, height: 44 }} />;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const entry = byDate.get(dateStr);
          const isSelected = selected === dateStr;
          const isToday = dateStr === today.toISOString().slice(0, 10);
          const isThisPR = entry && prEntry && dateStr === prEntry.date;

          return (
            <TouchableOpacity
              key={i}
              onPress={() => entry ? setSelected(isSelected ? null : dateStr) : null}
              activeOpacity={entry ? 0.7 : 1}
              style={{ width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center', gap: 3 }}
            >
              <View style={{
                width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isSelected ? colors.accent : isToday ? colors.accent + '20' : 'transparent',
                borderWidth: isToday && !isSelected ? 1.5 : 0,
                borderColor: colors.accent,
              }}>
                <Text style={{
                  fontSize: 14, fontWeight: entry ? '800' : '400',
                  color: isSelected ? '#fff' : entry ? colors.text : colors.textSecondary,
                }}>
                  {day}
                </Text>
              </View>
              {/* Point indicateur */}
              {entry && !isSelected && (
                <View style={{
                  width: 5, height: 5, borderRadius: 3,
                  backgroundColor: isThisPR ? '#FFB800' : colors.accent,
                }} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Légende */}
      <View style={{ flexDirection: 'row', gap: spacing.md, paddingTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Séance</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFB800' }} />
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>PR</Text>
        </View>
      </View>

      {/* Détail du jour sélectionné */}
      {selectedEntry && (
        <View style={{ backgroundColor: colors.bg, borderRadius: 14, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: isPR ? '#FFB80040' : colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>
              {new Date(selectedEntry.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            {isPR && (
              <View style={{ backgroundColor: '#FFB80020', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ color: '#FFB800', fontSize: 12, fontWeight: '800' }}>PR</Text>
              </View>
            )}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{selectedEntry.sessionName}</Text>

          {selectedEntry.log.mode === '1rm' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <Text style={{ color: '#FFB800', fontSize: 18, fontWeight: '900' }}>{selectedEntry.log.oneRmKg} kg</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>1 répétition max</Text>
            </View>
          ) : (
            <View style={{ gap: 6, marginTop: 4 }}>
              {selectedEntry.log.sets.filter(s => s.done).map((s, si) => (
                <View key={si} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>{si + 1}</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                    {s.reps} reps <Text style={{ color: colors.text, fontWeight: '800' }}>× {s.kg} kg</Text>
                  </Text>
                </View>
              ))}
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                1RM estimé ce jour : <Text style={{ color: colors.accent, fontWeight: '700' }}>{epley(selectedEntry.log)} kg</Text>
              </Text>
            </View>
          )}
        </View>
      )}

      {!selected && (
        <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
          Appuie sur un jour marqué pour voir le détail de la séance
        </Text>
      )}
    </View>
  );
}

// ─── Graphique ligne SVG ──────────────────────────────────────────────────────
function SimpleLineChart({ data, color, unit }: { data: { label: string; value: number }[]; color: string; unit: string }) {
  const colors = useColors();
  if (data.length < 2) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 20 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Minimum 2 séances pour afficher le graphique</Text>
      </View>
    );
  }
  const W = 320, H = 140, PAD = 16;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = (W - PAD * 2) / (data.length - 1);
  const points = data.map((d, i) => ({
    x: PAD + i * xStep,
    y: PAD + (1 - (d.value - min) / range) * (H - PAD * 2),
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z`;

  const SvgLib = require('react-native-svg');
  const SvgEl = SvgLib.Svg;
  const PathEl = SvgLib.Path;
  const CircleEl = SvgLib.Circle;
  const TextEl = SvgLib.Text;

  return (
    <View style={{ gap: 8 }}>
      <SvgEl width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <PathEl d={areaD} fill={color + '18'} />
        <PathEl d={pathD} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => <CircleEl key={i} cx={p.x} cy={p.y} r={4} fill={color} />)}
        {data.map((d, i) => (
          <TextEl key={i} x={points[i].x} y={H - 2} textAnchor="middle" fontSize={9} fill={colors.textSecondary}>
            {d.label}
          </TextEl>
        ))}
      </SvgEl>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[
          { label: 'Départ', value: values[0] },
          { label: 'Meilleur', value: Math.max(...values) },
          { label: 'Dernier', value: values[values.length - 1] },
        ].map(({ label, value }) => (
          <View key={label} style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 12, padding: 10, alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>{label}</Text>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 2 }}>{value} {unit}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}


