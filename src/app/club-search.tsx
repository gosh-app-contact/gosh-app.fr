import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors, spacing, radius } from '../constants/theme';
import { auth, db } from '../utils/firebase';
import { collection, query, where, orderBy, limit, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { Club, CLUB_CATEGORIES, ClubCategory, sendJoinRequest, cancelJoinRequest } from '../utils/clubUtils';

export default function ClubSearchScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = auth.currentUser;

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [myClubId, setMyClubId] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<string[]>([]);
  const [allClubs, setAllClubs] = useState<Club[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ClubCategory | 'Tout'>('Tout');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    const unsub = onSnapshot(doc(db, 'users', me.uid), (snap) => {
      setIsSuperAdmin(snap.data()?.accountType === 'admin');
    }, () => {});
    return unsub;
  }, [me]);

  useEffect(() => {
    if (!me) return;
    const q = query(collection(db, 'clubs'), where('memberIds', 'array-contains', me.uid));
    const unsub = onSnapshot(q, (snap) => {
      setMyClubId(snap.empty ? null : snap.docs[0].id);
    }, () => {});
    return unsub;
  }, [me]);

  useEffect(() => {
    if (!me) return;
    const q = query(collection(db, 'clubs'), where('pendingRequests', 'array-contains', me.uid));
    const unsub = onSnapshot(q, (snap) => {
      setPendingRequests(snap.docs.map((d) => d.id));
    }, () => {});
    return unsub;
  }, [me]);

  const [rankedClubIds, setRankedClubIds] = useState<string[]>([]);

  const loadClubs = useCallback(async () => {
    // Sans orderBy pour récupérer TOUS les clubs, même ceux sans weeklyScore
    const snap = await getDocs(query(collection(db, 'clubs'), limit(200)));
    const clubs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Club));
    // Classement global : uniquement les clubs avec activité cette semaine
    const activeClubs = clubs
      .filter((c) => (c.weeklyScore ?? 0) > 0)
      .sort((a, b) => ((b.weeklyScore ?? 0) / Math.max(b.memberCount, 1)) - ((a.weeklyScore ?? 0) / Math.max(a.memberCount, 1)));
    setRankedClubIds(activeClubs.map((c) => c.id));
    setAllClubs(clubs);
  }, []);

  useEffect(() => {
    loadClubs().finally(() => setLoading(false));
  }, [loadClubs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadClubs();
    setRefreshing(false);
  };

  const handleJoin = async (clubId: string) => {
    if (!me) return;
    setJoining(clubId);
    try {
      if (pendingRequests.includes(clubId)) {
        await cancelJoinRequest(clubId);
      } else {
        await sendJoinRequest(clubId);
      }
    } catch {
      // ignore
    } finally {
      setJoining(null);
    }
  };

  const displayClubs = allClubs.filter((c) => {
    const matchCat = selectedCategory === 'Tout' || c.category === selectedCategory;
    const matchSearch = !searchText.trim() || c.name.toLowerCase().includes(searchText.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 14,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        flexDirection: 'row', alignItems: 'center',
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' }}>Trouver un club</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Barre de recherche */}
        <View style={{ marginHorizontal: 16, marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 12, gap: 8 }}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={{ flex: 1, paddingVertical: 13, color: colors.text, fontSize: 15 }}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Rechercher un club…"
              placeholderTextColor={colors.textSecondary}
              autoCorrect={false}
              clearButtonMode="while-editing"
              autoFocus
            />
          </View>
        </View>

        {/* Chips catégories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 14 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingRight: 20 }}
        >
          {(['Tout', ...CLUB_CATEGORIES] as const).map((cat) => {
            const active = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.8}
                style={{
                  paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                  backgroundColor: active ? colors.accent : colors.card,
                  borderWidth: 1,
                  borderColor: active ? colors.accent : colors.border,
                }}
              >
                <Text style={{ color: active ? '#fff' : colors.text, fontSize: 13, fontWeight: active ? '700' : '500' }}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Résultats */}
        <View style={{ marginHorizontal: 16, marginTop: 20 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
            {searchText.trim()
              ? `Résultats · ${displayClubs.length}`
              : selectedCategory !== 'Tout'
                ? selectedCategory
                : 'Tous les clubs'}
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
          ) : displayClubs.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 40, gap: 10 }}>
              <Ionicons name="search-outline" size={40} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center' }}>Aucun club trouvé.</Text>
            </View>
          ) : (
            displayClubs.map((club, index) => {
              const isMyClub = myClubId === club.id;
              const isPending = pendingRequests.includes(club.id);
              const canAccess = isMyClub || isSuperAdmin;
              const isJoining = joining === club.id;

              // Badge rang — uniquement parmi les clubs actifs (weeklyScore > 0)
              const globalRank = rankedClubIds.indexOf(club.id);
              const MEDAL_COLORS: Record<number, string> = { 0: '#FFB800', 1: '#A8A8A8', 2: '#CD7F32' };
              const medalColor = globalRank >= 0 && globalRank <= 2 ? MEDAL_COLORS[globalRank] : undefined;

              return (
                <TouchableOpacity
                  key={club.id}
                  onPress={() => router.push({ pathname: '/club', params: { clubId: club.id } })}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: colors.card, borderRadius: 14,
                    borderWidth: medalColor ? 1.5 : StyleSheet.hairlineWidth,
                    borderColor: medalColor ? medalColor + '55' : colors.border,
                    padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12,
                  }}
                >
                  {/* Photo */}
                  <View style={{ position: 'relative' }}>
                    {club.photoUrl
                      ? <ExpoImage source={{ uri: club.photoUrl }} style={{ width: 50, height: 50, borderRadius: 25 }} contentFit="cover" />
                      : <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="people" size={20} color={colors.accent} />
                        </View>}
                    {medalColor && (
                      <View style={{ position: 'absolute', bottom: -4, right: -4, backgroundColor: medalColor, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1.5, borderColor: colors.card }}>
                        <Text style={{ color: '#000', fontSize: 8, fontWeight: '900' }}>#{globalRank + 1}</Text>
                      </View>
                    )}
                  </View>

                  {/* Infos */}
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{club.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ backgroundColor: colors.accent + '20', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 }}>
                        <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '600' }}>{club.category}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="people-outline" size={12} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{(club.memberIds ?? []).length} membre{(club.memberIds ?? []).length > 1 ? 's' : ''}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Action */}
                  {!canAccess && !myClubId && (
                    <TouchableOpacity
                      onPress={() => handleJoin(club.id)}
                      disabled={isJoining}
                      style={{ backgroundColor: isPending ? colors.card : colors.accent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: isPending ? 1 : 0, borderColor: colors.border }}
                    >
                      {isJoining
                        ? <ActivityIndicator size="small" color={isPending ? colors.textSecondary : '#fff'} />
                        : <Text style={{ color: isPending ? colors.textSecondary : '#fff', fontSize: 13, fontWeight: '600' }}>
                            {isPending ? 'Annuler' : 'Rejoindre'}
                          </Text>}
                    </TouchableOpacity>
                  )}
                  {isMyClub && (
                    <View style={{ backgroundColor: colors.accent + '18', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>Mon club</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
