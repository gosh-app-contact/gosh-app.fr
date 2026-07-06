import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { GoshOff, GoshOffPR } from '../utils/clubUtils';
import { useColors } from '../constants/theme';

const GC = '#7C3AED';
const PODIUM = ['#FFB800', '#C0C0C0', '#CD7F32'];

export default function GoshOffLeaderboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { goshOffId } = useLocalSearchParams<{ goshOffId: string }>();

  const [goshOff, setGoshOff] = useState<GoshOff | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'global' | string>('global');

  useEffect(() => {
    if (!goshOffId) return;
    getDoc(doc(db, 'goshoffs', goshOffId)).then((snap) => {
      if (snap.exists()) setGoshOff({ id: snap.id, ...snap.data() } as GoshOff);
      setLoading(false);
    });
  }, [goshOffId]);

  if (loading || !goshOff) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={GC} />
      </SafeAreaView>
    );
  }

  const prs = Object.values(goshOff.prs ?? {}) as GoshOffPR[];

  // ── Classement global : somme de tous les PRs soumis par membre ──
  const globalMap = new Map<string, { pseudo: string; photoUrl?: string; clubId: string; total: number; count: number }>();
  for (const pr of prs) {
    const side = goshOff.challengerClubId; // on compare via uid→club via challengerClubId
    const existing = globalMap.get(pr.uid);
    if (existing) {
      existing.total += pr.weight;
      existing.count += 1;
    } else {
      globalMap.set(pr.uid, { pseudo: pr.pseudo, photoUrl: pr.photoUrl, clubId: '', total: pr.weight, count: 1 });
    }
  }
  // Trouver le clubId de chaque uid via les PRs
  for (const pr of prs) {
    const entry = globalMap.get(pr.uid);
    if (entry && !entry.clubId) {
      // On identifie le camp en cherchant si l'uid soumis appartient au challenger ou challengé
      // (on ne stocke pas clubId dans PR, on utilise une heuristique : le challengerTonnage inclut qui?)
      // Sans info directe, on laisse vide — la UI affichera juste le pseudo
    }
  }
  const globalRanking = [...globalMap.entries()]
    .map(([uid, d]) => ({ uid, ...d }))
    .sort((a, b) => b.total - a.total);

  // ── Classement par exercice ──
  const exerciseRankings = (goshOff.exercises ?? []).map((ex) => {
    const exPrs = prs
      .filter((p) => p.exerciseSlug === ex.slug)
      .sort((a, b) => b.weight - a.weight);
    return { ex, prs: exPrs };
  });

  const tabs = [
    { key: 'global', label: 'Global' },
    ...(goshOff.exercises ?? []).map((ex) => ({ key: ex.slug, label: ex.name })),
  ];

  const currentExRanking = tab === 'global'
    ? null
    : exerciseRankings.find((r) => r.ex.slug === tab);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Classement GoshOff</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>{goshOff.challengerClubName} vs {goshOff.challengedClubName}</Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 48 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center', paddingVertical: 8 }}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            activeOpacity={0.75}
            style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: tab === t.key ? GC : colors.card, borderWidth: tab === t.key ? 0 : StyleSheet.hairlineWidth, borderColor: colors.border }}
          >
            <Text style={{ color: tab === t.key ? '#fff' : colors.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
        {/* Score clubs en haut */}
        <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: GC + '40' }}>
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{goshOff.challengerClubName}</Text>
            <Text style={{ color: GC, fontSize: 24, fontWeight: '900' }}>{(goshOff.challengerTonnage ?? 0).toLocaleString('fr-FR')}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>kg total</Text>
          </View>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: GC, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>VS</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{goshOff.challengedClubName}</Text>
            <Text style={{ color: '#6366F1', fontSize: 24, fontWeight: '900' }}>{(goshOff.challengedTonnage ?? 0).toLocaleString('fr-FR')}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>kg total</Text>
          </View>
        </View>

        {/* Classement global */}
        {tab === 'global' && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 }}>Meilleur total sur les 3 exercices</Text>
            {globalRanking.length === 0 && (
              <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 24, alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Aucun PR soumis pour l'instant</Text>
              </View>
            )}
            {globalRanking.map(({ uid, pseudo, photoUrl, total, count }, i) => (
              <View key={uid} style={{ backgroundColor: colors.card, borderRadius: 14, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderWidth: i < 3 ? 1 : StyleSheet.hairlineWidth, borderColor: i < 3 ? PODIUM[i] + '60' : colors.border }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: i < 3 ? PODIUM[i] + '25' : colors.border + '50', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: i < 3 ? PODIUM[i] : colors.textSecondary, fontSize: 14, fontWeight: '900' }}>{i + 1}</Text>
                </View>
                {photoUrl
                  ? <ExpoImage source={{ uri: photoUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
                  : <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: GC + '22', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: GC, fontSize: 16, fontWeight: '900' }}>{pseudo[0]?.toUpperCase()}</Text>
                    </View>}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{pseudo}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{count} exercice{count > 1 ? 's' : ''} soumis</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: i === 0 ? PODIUM[0] : colors.text, fontSize: 20, fontWeight: '900' }}>{total.toLocaleString('fr-FR')}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>kg</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Classement par exercice */}
        {tab !== 'global' && currentExRanking && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 }}>1RM — {currentExRanking.ex.name}</Text>
            {currentExRanking.prs.length === 0 && (
              <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 24, alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Aucun PR soumis pour cet exercice</Text>
              </View>
            )}
            {currentExRanking.prs.map((pr, i) => (
              <View key={`${pr.uid}_${pr.exerciseSlug}`} style={{ backgroundColor: colors.card, borderRadius: 14, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderWidth: i < 3 ? 1 : StyleSheet.hairlineWidth, borderColor: i < 3 ? PODIUM[i] + '60' : colors.border }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: i < 3 ? PODIUM[i] + '25' : colors.border + '50', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: i < 3 ? PODIUM[i] : colors.textSecondary, fontSize: 14, fontWeight: '900' }}>{i + 1}</Text>
                </View>
                {pr.photoUrl
                  ? <ExpoImage source={{ uri: pr.photoUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
                  : <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: GC + '22', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: GC, fontSize: 16, fontWeight: '900' }}>{pr.pseudo[0]?.toUpperCase()}</Text>
                    </View>}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{pr.pseudo}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: i === 0 ? PODIUM[0] : colors.text, fontSize: 20, fontWeight: '900' }}>{pr.weight}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>kg</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
