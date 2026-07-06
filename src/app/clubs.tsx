import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import GoshOffSlotModal from '../components/GoshOffSlotModal';
import { useColors } from '../constants/theme';
import { useColorScheme } from 'react-native';
import {
  acceptGoshOff,
  cancelJoinRequest,
  closeGoshOffIfExpired,
  Club,
  fetchActiveGoshOffs,
  fetchGoshOffReadyClubs,
  fetchMyGoshOffs,
  GoshOff,
  GOSHOFF_EXERCISES,
  GoshOffPR,
  launchGoshOff,
  refuseGoshOff,
  searchClubs,
  sendJoinRequest,
  submitGoshOffPR,
} from '../utils/clubUtils';
import { auth, db } from '../utils/firebase';

const GOSHOFF_LOGO = require('../../assets/images/logo-goshoff.png');
const GOSHOFF_OFF_LOGO = require('../../assets/images/logo-goshoff-off.png');
const GOSHOFF_COLOR = '#7C3AED';
const GOSHOFF_OFF_COLOR = '#9CA3AF';

const GoshOffLogoOff = React.memo(({ size = 44 }: { size?: number }) => {
  const glowOpacity = useRef(new Animated.Value(0.6)).current;
  const logoScale   = useRef(new Animated.Value(1)).current;
  const glowSize = size * 2.6;

  useEffect(() => {
    const aGlowOp = Animated.loop(Animated.sequence([
      Animated.timing(glowOpacity, { toValue: 1,    duration: 600, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: 0.35, duration: 800, useNativeDriver: true }),
    ]));
    const aLogo = Animated.loop(Animated.sequence([
      Animated.timing(logoScale, { toValue: 1.05, duration: 800,  useNativeDriver: true }),
      Animated.timing(logoScale, { toValue: 0.97, duration: 600,  useNativeDriver: true }),
      Animated.timing(logoScale, { toValue: 1,    duration: 500,  useNativeDriver: true }),
    ]));
    aGlowOp.start();
    aLogo.start();
    return () => { aGlowOp.stop(); aLogo.stop(); };
  }, []);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: glowSize, height: glowSize, opacity: glowOpacity }}>
        <Svg width={glowSize} height={glowSize}>
          <Defs>
            <RadialGradient id="glow_goshoff_off" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%"   stopColor={GOSHOFF_OFF_COLOR} stopOpacity="0.65" />
              <Stop offset="35%"  stopColor={GOSHOFF_OFF_COLOR} stopOpacity="0.25" />
              <Stop offset="65%"  stopColor={GOSHOFF_OFF_COLOR} stopOpacity="0.07" />
              <Stop offset="100%" stopColor={GOSHOFF_OFF_COLOR} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx={glowSize / 2} cy={glowSize / 2} rx={glowSize / 2} ry={glowSize / 2} fill="url(#glow_goshoff_off)" />
        </Svg>
      </Animated.View>
      <Animated.Image
        source={GOSHOFF_OFF_LOGO}
        style={{ width: size, height: size, transform: [{ scale: logoScale }] }}
        resizeMode="contain"
      />
    </View>
  );
});

const GoshOffLogoAnimated = React.memo(({ size = 44 }: { size?: number }) => {
  const glowOpacity = useRef(new Animated.Value(0.6)).current;
  const logoScale   = useRef(new Animated.Value(1)).current;
  const glowSize = size * 2.6;

  useEffect(() => {
    const aGlowOp = Animated.loop(Animated.sequence([
      Animated.timing(glowOpacity, { toValue: 1,    duration: 600, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: 0.35, duration: 800, useNativeDriver: true }),
    ]));
    const aLogo = Animated.loop(Animated.sequence([
      Animated.timing(logoScale, { toValue: 1.05, duration: 800,  useNativeDriver: true }),
      Animated.timing(logoScale, { toValue: 0.97, duration: 600,  useNativeDriver: true }),
      Animated.timing(logoScale, { toValue: 1,    duration: 500,  useNativeDriver: true }),
    ]));
    aGlowOp.start();
    aLogo.start();
    return () => { aGlowOp.stop(); aLogo.stop(); };
  }, []);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Lueur radiale SVG */}
      <Animated.View style={{ position: 'absolute', width: glowSize, height: glowSize, opacity: glowOpacity }}>
        <Svg width={glowSize} height={glowSize}>
          <Defs>
            <RadialGradient id="glow_goshoff" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%"   stopColor={GOSHOFF_COLOR} stopOpacity="0.65" />
              <Stop offset="35%"  stopColor={GOSHOFF_COLOR} stopOpacity="0.25" />
              <Stop offset="65%"  stopColor={GOSHOFF_COLOR} stopOpacity="0.07" />
              <Stop offset="100%" stopColor={GOSHOFF_COLOR} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx={glowSize / 2} cy={glowSize / 2} rx={glowSize / 2} ry={glowSize / 2} fill="url(#glow_goshoff)" />
        </Svg>
      </Animated.View>
      {/* Logo */}
      <Animated.Image
        source={GOSHOFF_LOGO}
        style={{ width: size, height: size, transform: [{ scale: logoScale }] }}
        resizeMode="contain"
      />
    </View>
  );
});

type Tab = 'clubs' | 'goshoff';

export default function ClubsScreen() {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = auth.currentUser;

  const [tab, setTab] = useState<Tab>('clubs');

  // ── Clubs tab state ──────────────────────────────────────────────────────────
  type PendingInfo = { uid: string; pseudo: string; prenom?: string; photoUrl?: string; accountType?: string; verified?: boolean };
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [myAccountType, setMyAccountType] = useState<string>('standard');
  const [myClub, setMyClub] = useState<Club | null>(null);
  const [myClubId, setMyClubId] = useState<string | null>(null);
  const [myNotifCount, setMyNotifCount] = useState(0);
  const [pendingRequests, setPendingRequests] = useState<string[]>([]);
  const [allClubs, setAllClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  // ── GoshOff tab state ────────────────────────────────────────────────────────
  const [goshOffs, setGoshOffs] = useState<GoshOff[]>([]);
  const [myGoshOffs, setMyGoshOffs] = useState<GoshOff[]>([]);
  const [pendingGoshOffs, setPendingGoshOffs] = useState<GoshOff[]>([]);
  const [sentGoshOffs, setSentGoshOffs] = useState<GoshOff[]>([]);
  const [refusedGoshOffs, setRefusedGoshOffs] = useState<GoshOff[]>([]);
  const [goshOffLoading, setGoshOffLoading] = useState(false);
  const [showLaunch, setShowLaunch] = useState(false);
  const [slotModal, setSlotModal] = useState<{
    targetClubId: string;
    targetClubName: string;
    drawn: { slug: string; name: string }[];
  } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ targetClubId: string; targetClubName: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Club[]>([]);
  const [searching, setSearching] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [isOwnerOrAdmin, setIsOwnerOrAdmin] = useState(false);
  const [busyClubIds, setBusyClubIds] = useState<Set<string>>(new Set());
  const [activeGoshOffs, setActiveGoshOffs] = useState<GoshOff[]>([]);
  const [goshOffReadyClubs, setGoshOffReadyClubs] = useState<Club[]>([]);
  const [showGoshOffIntro, setShowGoshOffIntro] = useState(false);
  const [prModal, setPrModal] = useState<{ goshOffId: string; exerciseSlug: string; exerciseName: string } | null>(null);
  const [prWeight, setPrWeight] = useState('');
  const [submittingPr, setSubmittingPr] = useState(false);

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!me) return;
    const unsub = onSnapshot(doc(db, 'users', me.uid), (snap) => {
      const at = snap.data()?.accountType ?? 'standard';
      setIsSuperAdmin(at === 'admin');
      setMyAccountType(at);
    }, () => {});
    return unsub;
  }, [me]);

  useEffect(() => {
    if (!me) return;
    const q = query(collection(db, 'clubs'), where('memberIds', 'array-contains', me.uid));
    const unsub = onSnapshot(q, async (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        const club = { id: d.id, ...d.data() } as Club;
        setMyClub(club);
        setMyClubId(d.id);
        const amOwnerOrAdmin = club.ownerId === me.uid || (club.adminIds ?? []).includes(me.uid);
        setIsOwnerOrAdmin(amOwnerOrAdmin);
      } else {
        setMyClub(null);
        setMyClubId(null);
        setIsOwnerOrAdmin(false);
      }
    }, () => {});
    return unsub;
  }, [me]);

  useEffect(() => {
    if (!myClubId || !me) return;
    const q = query(
      collection(db, 'clubs', myClubId, 'notifications'),
      where('toUid', '==', me.uid),
      where('read', '==', false),
    );
    const unsub = onSnapshot(q, (snap) => setMyNotifCount(snap.size), () => {});
    return unsub;
  }, [myClubId, me]);

  useEffect(() => {
    if (!me) return;
    const q = query(collection(db, 'clubs'), where('pendingRequests', 'array-contains', me.uid));
    const unsub = onSnapshot(q, (snap) => {
      setPendingRequests(snap.docs.map((d) => d.id));
    }, () => {});
    return unsub;
  }, [me]);

  const loadClubs = useCallback(async () => {
    const snap = await getDocs(
      query(collection(db, 'clubs'), orderBy('weeklyScore', 'desc'), limit(50))
    );
    const clubs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Club));
    // Seuls les clubs avec au moins 1 point d'activité cette semaine sont classés
    const active = clubs.filter((c) => (c.weeklyScore ?? 0) > 0);
    const sorted = active.sort((a, b) => {
      const sA = a.weeklyScore / Math.max(a.memberCount, 1);
      const sB = b.weeklyScore / Math.max(b.memberCount, 1);
      return sB - sA;
    });
    setAllClubs(sorted);
  }, []);

  useFocusEffect(useCallback(() => {
    loadClubs().finally(() => setLoading(false));
  }, [loadClubs]));

  // Listener temps réel — GoshOffs envoyés en attente (challengerClubId = monClub)
  useEffect(() => {
    if (!myClubId) { setSentGoshOffs([]); return; }
    const q = query(
      collection(db, 'goshoffs'),
      where('challengerClubId', '==', myClubId),
      where('status', '==', 'pending'),
    );
    const unsub = onSnapshot(q, async (snap) => {
      const goshoffs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GoshOff));
      const enriched = await Promise.all(goshoffs.map(async (g) => {
        if (g.challengedClubPhoto) return g;
        try {
          const clubSnap = await getDoc(doc(db, 'clubs', g.challengedClubId));
          return { ...g, challengedClubPhoto: clubSnap.data()?.photoUrl ?? '' };
        } catch { return g; }
      }));
      setSentGoshOffs(enriched);
    }, () => {});
    return unsub;
  }, [myClubId]);

  // Listener temps réel — GoshOffs refusés (défis envoyés par mon club et refusés)
  useEffect(() => {
    if (!myClubId) { setRefusedGoshOffs([]); return; }
    const q = query(
      collection(db, 'goshoffs'),
      where('challengerClubId', '==', myClubId),
      where('status', '==', 'cancelled'),
      where('cancelledReason', '==', 'refused'), // 'refused_seen' exclut les dismissés
    );
    const unsub = onSnapshot(q, (snap) => {
      setRefusedGoshOffs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GoshOff)));
    }, () => {});
    return unsub;
  }, [myClubId]);

  // Listener temps réel — GoshOffs en attente pour mon club (toutes les invitations reçues)
  useEffect(() => {
    if (!myClubId) { setPendingGoshOffs([]); return; }
    const q = query(
      collection(db, 'goshoffs'),
      where('challengedClubId', '==', myClubId),
      where('status', '==', 'pending'),
    );
    const unsub = onSnapshot(q, async (snap) => {
      const goshoffs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GoshOff));
      // Enrichir avec la photo actuelle du club challenger si absente
      const enriched = await Promise.all(goshoffs.map(async (g) => {
        if (g.challengerClubPhoto) return g;
        try {
          const clubSnap = await getDoc(doc(db, 'clubs', g.challengerClubId));
          return { ...g, challengerClubPhoto: clubSnap.data()?.photoUrl ?? '' };
        } catch { return g; }
      }));
      setPendingGoshOffs(enriched);
    }, () => {});
    return unsub;
  }, [myClubId]);

  // Listener temps réel — GoshOffs actifs impliquant mon club
  useEffect(() => {
    if (!myClubId) { setActiveGoshOffs([]); return; }
    const qC = query(collection(db, 'goshoffs'), where('challengerClubId', '==', myClubId), where('status', '==', 'active'));
    const qD = query(collection(db, 'goshoffs'), where('challengedClubId', '==', myClubId), where('status', '==', 'active'));
    let fromC: GoshOff[] = [];
    let fromD: GoshOff[] = [];
    const merge = () => setActiveGoshOffs([...fromC, ...fromD]);
    const unsubC = onSnapshot(qC, (snap) => { fromC = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GoshOff)); merge(); }, () => {});
    const unsubD = onSnapshot(qD, (snap) => { fromD = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GoshOff)); merge(); }, () => {});
    return () => { unsubC(); unsubD(); };
  }, [myClubId]);

  const loadGoshOffs = useCallback(async () => {
    setGoshOffLoading(true);
    fetchGoshOffReadyClubs().then(setGoshOffReadyClubs).catch(() => {});
    try {
      const [active, mine] = await Promise.all([
        fetchActiveGoshOffs(),
        myClubId ? fetchMyGoshOffs(myClubId) : Promise.resolve([]),
      ]);
      setGoshOffs(active);
      setMyGoshOffs(mine);
    } catch (e) { console.error('[loadGoshOffs]', e); }
    finally { setGoshOffLoading(false); }
  }, [myClubId]);

  useEffect(() => {
    if (tab === 'goshoff') {
      loadGoshOffs();
      AsyncStorage.getItem('goshoff_intro_seen').then((val) => {
        if (val !== 'true') setShowGoshOffIntro(true);
      });
    }
  }, [tab, loadGoshOffs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadClubs(), tab === 'goshoff' ? loadGoshOffs() : Promise.resolve()]);
    setRefreshing(false);
  };

  // ── Clubs handlers ───────────────────────────────────────────────────────────

  const handleJoin = async (clubId: string) => {
    if (!me) return;
    setJoining(clubId);
    try {
      if (pendingRequests.includes(clubId)) await cancelJoinRequest(clubId);
      else await sendJoinRequest(clubId);
    } catch {}
    finally { setJoining(null); }
  };

  // Listener temps réel — clubs déjà engagés dans un GoshOff (pour griser dans la recherche)
  useEffect(() => {
    const q = query(collection(db, 'goshoffs'), where('status', 'in', ['pending', 'active']));
    const unsub = onSnapshot(q, (snap) => {
      const ids = new Set<string>();
      snap.docs.forEach((d) => {
        const g = d.data();
        if (g.challengerClubId) ids.add(g.challengerClubId);
        if (g.challengedClubId) ids.add(g.challengedClubId);
      });
      setBusyClubIds(ids);
    }, () => {});
    return unsub;
  }, []);

  // ── GoshOff handlers ─────────────────────────────────────────────────────────

  const handleSearch = async (term: string) => {
    setSearchTerm(term);
    if (term.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await searchClubs(term);
      setSearchResults(results.filter((c) => c.id !== myClubId));
    } catch {}
    finally { setSearching(false); }
  };

  const handleLaunch = async (targetClubId: string, drawn: { slug: string; name: string }[]) => {
    if (!myClubId) return;
    setLaunching(true);
    try {
      await launchGoshOff(myClubId, targetClubId, drawn);
      setSlotModal(null);
      setShowLaunch(false);
      setSearchTerm('');
      setSearchResults([]);
      await loadGoshOffs();
      Alert.alert('GoshOff lancé !', 'La demande a été envoyée. En attente d\'acceptation.');
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setLaunching(false);
    }
  };

  const handleAccept = async (id: string) => {
    try {
      await acceptGoshOff(id);
      await loadGoshOffs();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleRefuse = async (id: string) => {
    try {
      await refuseGoshOff(id);
      await loadGoshOffs();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleDismissRefused = async (id: string) => {
    try {
      await updateDoc(doc(db, 'goshoffs', id), { cancelledReason: 'refused_seen' });
    } catch {}
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const MEDALS = [
    { rank: 1, color: '#FFB800', bg: '#FFB80018', idx: 0 },
    { rank: 2, color: '#A8A8A8', bg: '#A8A8A818', idx: 1 },
    { rank: 3, color: '#CD7F32', bg: '#CD7F3218', idx: 2 },
  ];
  const podiumOrder = [MEDALS[1], MEDALS[0], MEDALS[2]];
  const topOffsets = [20, 0, 36];
  const myClubRankIdx = myClub ? allClubs.findIndex((c) => c.id === myClub.id) : -1;
  const myClubMedal = myClubRankIdx >= 0 && myClubRankIdx < 3 ? MEDALS[myClubRankIdx] : null;

  const myUid = auth.currentUser?.uid ?? '';

  const isPendingForMe = (g: GoshOff) =>
    g.status === 'pending' && g.challengedClubId === myClubId && isOwnerOrAdmin;

  // ── Render ───────────────────────────────────────────────────────────────────

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
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' }}>
          {tab === 'clubs' ? 'Clubs' : 'GoshOff'}
        </Text>
        {tab === 'clubs' && !myClub && myAccountType !== 'student'
          ? <TouchableOpacity onPress={() => router.push('/club-create')} style={{ width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Ionicons name="add" size={26} color={colors.accent} />
            </TouchableOpacity>
          : <View style={{ width: 44 }} />}
      </View>

      {/* Onglets — style underline */}
      <View style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        {(['clubs', 'goshoff'] as Tab[]).map((t) => {
          const isActive = tab === t;
          const isGoshOff = t === 'goshoff';
          const activeColor = isGoshOff ? GOSHOFF_COLOR : colors.accent;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{
                flex: 1, paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: 6,
                borderBottomWidth: isActive ? 2 : 0,
                borderBottomColor: activeColor,
              }}
            >
              {isGoshOff && (
                <View>
                  <Image source={GOSHOFF_LOGO} style={{ width: 18, height: 18 }} resizeMode="contain" />
                  {pendingGoshOffs.length > 0 && (
                    <View style={{ position: 'absolute', top: -4, right: -6, backgroundColor: GOSHOFF_COLOR, borderRadius: 6, minWidth: 12, height: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }}>
                      <Text style={{ color: '#fff', fontSize: 8, fontWeight: '900' }}>{pendingGoshOffs.length}</Text>
                    </View>
                  )}
                </View>
              )}
              <Text style={{ color: isActive ? (isGoshOff ? GOSHOFF_COLOR : colors.text) : colors.textSecondary, fontWeight: isActive ? '700' : '500', fontSize: 14 }}>
                {t === 'clubs' ? 'Clubs' : 'GoshOff'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {myAccountType === 'coach' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 80, gap: 16 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="lock-closed-outline" size={28} color={colors.textSecondary} />
            </View>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>
              Fonctionnalité non disponible
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 21 }}>
              Les comptes coach n'ont pas accès aux clubs et aux GoshOffs. Cette fonctionnalité est réservée aux membres standard.
            </Text>
          </View>
        ) : tab === 'clubs' ? (
          <>
            {/* Mon club */}
            <View style={{ marginHorizontal: 16, marginTop: 20 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                Mon club
              </Text>
              {myClub ? (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/club', params: { clubId: myClub.id } })}
                  activeOpacity={0.85}
                  style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 }}>
                    <View style={{ position: 'relative' }}>
                      {myClub.photoUrl
                        ? <ExpoImage source={{ uri: myClub.photoUrl }} style={{ width: 56, height: 56, borderRadius: 28, borderWidth: myClubMedal ? 2 : 0, borderColor: myClubMedal?.color }} contentFit="cover" />
                        : <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: myClubMedal ? myClubMedal.bg : colors.bg, alignItems: 'center', justifyContent: 'center', borderWidth: myClubMedal ? 2 : 0, borderColor: myClubMedal?.color }}>
                            <Ionicons name="people" size={24} color={myClubMedal ? myClubMedal.color : colors.accent} />
                          </View>}
                      {myClubMedal && (
                        <View style={{ position: 'absolute', bottom: -3, right: -3, backgroundColor: myClubMedal.color, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1.5, borderColor: colors.card }}>
                          <Text style={{ color: '#000', fontSize: 9, fontWeight: '900' }}>#{myClubMedal.rank}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{myClub.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ backgroundColor: colors.accent + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                          <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '600' }}>{myClub.category}</Text>
                        </View>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{(myClub.memberIds ?? []).length} membre{(myClub.memberIds ?? []).length > 1 ? 's' : ''}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      {myNotifCount > 0 && (
                        <View style={{ backgroundColor: colors.accent, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{myNotifCount}</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </View>
                  </View>
                </TouchableOpacity>
              ) : myAccountType !== 'student' ? (
                <TouchableOpacity onPress={() => router.push('/club-create')} activeOpacity={0.85}
                  style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 20, alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="people-outline" size={22} color={colors.accent} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>Créer un club</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>Lance ta communauté autour de ta pratique</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Création non disponible</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                      La création de club n'est pas disponible pour ton compte.
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Clubs populaires */}
            <View style={{ marginHorizontal: 16, marginTop: 28 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 16 }}>
                Clubs populaires
              </Text>
              {loading ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />
              ) : allClubs.length === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 8 }}>Aucun club pour le moment.</Text>
              ) : allClubs.length >= 3 ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 }}>
                  {podiumOrder.map((medal, i) => {
                    const club = allClubs[medal.idx];
                    const isMyClub = myClub?.id === club.id;
                    const isPending = pendingRequests.includes(club.id);
                    const isJoining = joining === club.id;
                    const canAccess = isMyClub || isSuperAdmin;
                    return (
                      <TouchableOpacity key={club.id} onPress={() => router.push({ pathname: '/club', params: { clubId: club.id } })} activeOpacity={0.85}
                        style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1.5, borderColor: medal.color + '55', overflow: 'hidden', marginBottom: topOffsets[i], shadowColor: medal.color, shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}>
                        <View style={{ height: 3, backgroundColor: medal.color }} />
                        <View style={{ padding: 10, alignItems: 'center', gap: 8 }}>
                          <View style={{ backgroundColor: medal.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1.5, borderColor: medal.color + '88' }}>
                            <Text style={{ color: medal.color, fontSize: 11, fontWeight: '900' }}>#{medal.rank}</Text>
                          </View>
                          {club.photoUrl
                            ? <ExpoImage source={{ uri: club.photoUrl }} style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: medal.color + '66' }} contentFit="cover" />
                            : <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: medal.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: medal.color + '44' }}>
                                <Ionicons name="people" size={22} color={medal.color} />
                              </View>}
                          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'center' }} numberOfLines={2}>{club.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Ionicons name="people-outline" size={11} color={colors.textSecondary} />
                            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{(club.memberIds ?? []).length}</Text>
                          </View>
                          {!canAccess && !myClub && (
                            <TouchableOpacity onPress={() => handleJoin(club.id)} disabled={isJoining}
                              style={{ backgroundColor: isPending ? 'transparent' : medal.color, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: isPending ? 1 : 0, borderColor: medal.color }}>
                              {isJoining
                                ? <ActivityIndicator size="small" color={isPending ? colors.textSecondary : '#fff'} />
                                : <Text style={{ color: isPending ? medal.color : '#fff', fontSize: 11, fontWeight: '700' }}>{isPending ? 'Annuler' : 'Rejoindre'}</Text>}
                            </TouchableOpacity>
                          )}
                          {isMyClub && (
                            <View style={{ backgroundColor: medal.bg, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ color: medal.color, fontSize: 11, fontWeight: '700' }}>Mon club</Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                allClubs.map((club, idx) => {
                  const medal = MEDALS[idx];
                  const isMyClub = myClub?.id === club.id;
                  const isPending = pendingRequests.includes(club.id);
                  const isJoining = joining === club.id;
                  const canAccess = isMyClub || isSuperAdmin;
                  return (
                    <TouchableOpacity key={club.id} onPress={() => router.push({ pathname: '/club', params: { clubId: club.id } })} activeOpacity={0.85}
                      style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: medal.color + '44', padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: medal.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: medal.color, fontSize: 12, fontWeight: '900' }}>#{medal.rank}</Text>
                      </View>
                      {club.photoUrl
                        ? <ExpoImage source={{ uri: club.photoUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" />
                        : <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="people" size={18} color={colors.accent} />
                          </View>}
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{club.name}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{(club.memberIds ?? []).length} membre{(club.memberIds ?? []).length > 1 ? 's' : ''}</Text>
                      </View>
                      {!canAccess && !myClub && (
                        <TouchableOpacity onPress={() => handleJoin(club.id)} disabled={isJoining}
                          style={{ backgroundColor: isPending ? 'transparent' : colors.accent, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: isPending ? 1 : 0, borderColor: colors.accent }}>
                          <Text style={{ color: isPending ? colors.accent : '#fff', fontSize: 12, fontWeight: '700' }}>{isPending ? 'Annuler' : 'Rejoindre'}</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {/* Trouver un club */}
            <View style={{ marginHorizontal: 16, marginTop: 24, marginBottom: 8 }}>
              <TouchableOpacity onPress={() => router.push('/club-search')} activeOpacity={0.85}
                style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent + '15', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="search-outline" size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Trouver un club</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Rechercher par nom ou catégorie</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.accent} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* ── Onglet GoshOff ── */
          <View style={{ paddingBottom: 32 }}>

            {/* Hero banner */}
            <View style={{ marginHorizontal: 16, marginTop: 20, borderRadius: 20, overflow: 'hidden', backgroundColor: GOSHOFF_COLOR + '14', borderWidth: 1.5, borderColor: GOSHOFF_COLOR + '40' }}>
              <View style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <GoshOffLogoAnimated size={56} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 }}>GoshOff</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
                    Défiez d'autres clubs. Loggez vos séances. Le plus grand tonnage gagne.
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GOSHOFF_COLOR + '30' }}>
                {[
                  { icon: 'calendar-outline', label: 'Dimanche' },
                  { icon: 'barbell-outline', label: 'Tonnage' },
                  { icon: 'trophy-outline', label: 'Victoire' },
                ].map(({ icon, label }, i, arr) => (
                  <View key={icon} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, gap: 4, borderRightWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0, borderRightColor: GOSHOFF_COLOR + '30' }}>
                    <Ionicons name={icon as any} size={18} color={GOSHOFF_COLOR} />
                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* CTA lancer — owner/admin seulement */}
            {isOwnerOrAdmin && (() => {
              const alreadyEngaged = sentGoshOffs.length > 0 || pendingGoshOffs.length > 0 || activeGoshOffs.length > 0;
              const isSunday = new Date().getDay() === 0;
              const blocked = alreadyEngaged || !isSunday;
              const blockedReason = alreadyEngaged
                ? 'Ton club est déjà engagé dans un GoshOff'
                : 'Les défis se lancent le dimanche';
              return (
                <TouchableOpacity
                  onPress={blocked ? undefined : () => setShowLaunch(true)}
                  activeOpacity={blocked ? 1 : 0.82}
                  style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 14, overflow: 'hidden', opacity: blocked ? 0.45 : 1 }}
                >
                  <View style={{ backgroundColor: blocked ? colors.card : GOSHOFF_COLOR, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {blocked ? <GoshOffLogoOff size={32} /> : <GoshOffLogoAnimated size={32} />}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: blocked ? colors.textSecondary : '#fff', fontSize: 15, fontWeight: '800' }}>Lancer un GoshOff</Text>
                      {blocked && <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>{blockedReason}</Text>}
                    </View>
                    <Ionicons name={blocked ? 'lock-closed' : 'chevron-forward'} size={18} color={blocked ? colors.textSecondary : '#fff'} />
                  </View>
                </TouchableOpacity>
              );
            })()}

            {goshOffLoading ? (
              <ActivityIndicator color={GOSHOFF_COLOR} style={{ marginTop: 48 }} />
            ) : (
              <View style={{ gap: 28, marginTop: 28 }}>

                {/* ── Défis reçus ── */}
                {pendingGoshOffs.length > 0 && (
                  <View style={{ gap: 10, paddingHorizontal: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C3AED' }} />
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Défis reçus</Text>
                      <View style={{ backgroundColor: '#7C3AED', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{pendingGoshOffs.length}</Text>
                      </View>
                    </View>
                    {pendingGoshOffs.map((g) => {
                      const challengerRankIdx = allClubs.findIndex((c) => c.id === g.challengerClubId);
                      const challengerMedal = challengerRankIdx >= 0 && challengerRankIdx < 3 ? MEDALS[challengerRankIdx] : null;
                      return (
                        <View key={g.id} style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1.5, borderColor: '#9d66fb', overflow: 'hidden' }}>
                          <View style={{ backgroundColor: '#9d66fb18', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#9d66fb' }}>
                            <Ionicons name="flash" size={14} color="#7C3AED" />
                            <Text style={{ color: '#7C3AED', fontSize: 12, fontWeight: '700' }}>Défi reçu · En attente de réponse</Text>
                          </View>
                          <View style={{ padding: 16, gap: 14 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <View style={{ position: 'relative' }}>
                                {g.challengerClubPhoto
                                  ? <ExpoImage source={{ uri: g.challengerClubPhoto }} style={{ width: 48, height: 48, borderRadius: 24, borderWidth: challengerMedal ? 2 : 0, borderColor: challengerMedal?.color }} contentFit="cover" />
                                  : <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: GOSHOFF_COLOR + '18', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="people" size={20} color={GOSHOFF_COLOR} /></View>}
                                {challengerMedal && (
                                  <View style={{ position: 'absolute', bottom: -3, right: -3, backgroundColor: challengerMedal.color, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1.5, borderColor: colors.card }}>
                                    <Text style={{ color: '#000', fontSize: 8, fontWeight: '900' }}>#{challengerMedal.rank}</Text>
                                  </View>
                                )}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{g.challengerClubName}</Text>
                                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>vous lance un défi</Text>
                              </View>
                              <Image source={GOSHOFF_LOGO} style={{ width: 32, height: 32 }} resizeMode="contain" />
                            </View>
                            {/* Exercices tirés */}
                            {(g.exercises ?? []).length > 0 && (
                              <View style={{ backgroundColor: GOSHOFF_COLOR + '10', borderRadius: 12, borderWidth: 1, borderColor: GOSHOFF_COLOR + '25', overflow: 'hidden' }}>
                                <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: GOSHOFF_COLOR + '25', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Ionicons name="barbell-outline" size={13} color={GOSHOFF_COLOR} />
                                  <Text style={{ color: GOSHOFF_COLOR, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Exercices du défi</Text>
                                </View>
                                {(g.exercises ?? []).map((ex, i, arr) => (
                                  <View key={ex.slug} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: GOSHOFF_COLOR + '20' }}>
                                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: GOSHOFF_COLOR, alignItems: 'center', justifyContent: 'center' }}>
                                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{i + 1}</Text>
                                    </View>
                                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{ex.name}</Text>
                                  </View>
                                ))}
                              </View>
                            )}

                            {isOwnerOrAdmin ? (
                              <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity onPress={() => handleRefuse(g.id)}
                                  style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                                  <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 14 }}>Refuser</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => handleAccept(g.id)}
                                  style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: GOSHOFF_COLOR }}>
                                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Accepter</Text>
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <View style={{ backgroundColor: colors.bg, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Seuls les admins peuvent répondre</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* ── GoshOffs actifs ── */}
                {activeGoshOffs.length > 0 && (
                  <View style={{ gap: 10, paddingHorizontal: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#30D158' }} />
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>En cours</Text>
                    </View>
                    {activeGoshOffs.map((g) => {
                      const today = new Date().toISOString().split('T')[0];
                      if (g.weekEnd < today) { closeGoshOffIfExpired(g).catch(() => {}); }

                      const isMine = g.challengerClubId === myClubId || g.challengedClubId === myClubId;
                      const iAmChallenger = g.challengerClubId === myClubId;
                      const totalTonnage = (g.challengerTonnage ?? 0) + (g.challengedTonnage ?? 0);
                      const cPct = totalTonnage > 0 ? (g.challengerTonnage ?? 0) / totalTonnage : 0.5;

                      const timeLeft = (() => {
                        try {
                          const [sy, sm, sd] = g.weekEnd.split('-').map(Number);
                          const end = new Date(sy, sm - 1, sd, 23, 59, 59, 0);
                          const diffMs = end.getTime() - Date.now();
                          if (diffMs <= 0) return { label: 'Terminé', urgent: true };
                          const totalMins = Math.floor(diffMs / 60000);
                          const days = Math.floor(totalMins / 1440);
                          const hours = Math.floor((totalMins % 1440) / 60);
                          const mins = totalMins % 60;
                          if (days >= 1) return { label: `${days}j ${hours}h`, urgent: days === 0 };
                          if (hours >= 1) return { label: `${hours}h ${mins}min`, urgent: true };
                          return { label: `${mins} min`, urgent: true };
                        } catch { return null; }
                      })();

                      const cRankIdx = allClubs.findIndex((c) => c.id === g.challengerClubId);
                      const dRankIdx = allClubs.findIndex((c) => c.id === g.challengedClubId);
                      const cMedal = cRankIdx >= 0 && cRankIdx < 3 ? MEDALS[cRankIdx] : null;
                      const dMedal = dRankIdx >= 0 && dRankIdx < 3 ? MEDALS[dRankIdx] : null;

                      const prs = Object.values(g.prs ?? {}) as GoshOffPR[];

                      const mySubmittedSlugs = new Set(prs.filter((p) => p.uid === myUid).map((p) => p.exerciseSlug));

                      const myTonnage = iAmChallenger ? (g.challengerTonnage ?? 0) : (g.challengedTonnage ?? 0);
                      const oppTonnage = iAmChallenger ? (g.challengedTonnage ?? 0) : (g.challengerTonnage ?? 0);
                      const winning = isMine && myTonnage >= oppTonnage;

                      const cLeading = (g.challengerTonnage ?? 0) >= (g.challengedTonnage ?? 0);
                      const myClubLeading = isMine && ((iAmChallenger && cLeading) || (!iAmChallenger && !cLeading));
                      const INDIGO = '#6366F1';

                      return (
                        <View key={g.id} style={{ borderRadius: 20, overflow: 'hidden', borderWidth: isMine ? 1.5 : StyleSheet.hairlineWidth, borderColor: isMine ? GOSHOFF_COLOR + '80' : colors.border }}>

                          {/* ── Top header dark band ── */}
                          <View style={{ backgroundColor: isDark ? '#0F0A1E' : '#2D1B69', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20 }}>
                            {/* Logo + titre + timer */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={{ position: 'relative', width: 20, height: 20 }}>
                                  <Svg width={36} height={36} style={{ position: 'absolute', top: -8, left: -8 }}>
                                    <Defs>
                                      <RadialGradient id={`hg_${g.id}`} cx="50%" cy="50%" rx="50%" ry="50%">
                                        <Stop offset="0%" stopColor={GOSHOFF_COLOR} stopOpacity="0.55" />
                                        <Stop offset="100%" stopColor={GOSHOFF_COLOR} stopOpacity="0" />
                                      </RadialGradient>
                                    </Defs>
                                    <Ellipse cx={18} cy={18} rx={18} ry={18} fill={`url(#hg_${g.id})`} />
                                  </Svg>
                                  <Image source={GOSHOFF_LOGO} style={{ width: 20, height: 20 }} resizeMode="contain" />
                                </View>
                                <View>
                                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.2 }}>
                                    {isMine ? (myClubLeading ? 'Tu mènes ! 🏆' : 'Mon GoshOff') : 'GoshOff en cours'}
                                  </Text>
                                  <Text style={{ color: 'rgba(255,255,255,0.40)', fontSize: 11, marginTop: 1 }}>Défi actif</Text>
                                </View>
                              </View>
                              {timeLeft && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: timeLeft.urgent ? 'rgba(255,59,48,0.18)' : 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                                  <Ionicons name="time-outline" size={13} color={timeLeft.urgent ? '#FF3B30' : 'rgba(255,255,255,0.5)'} />
                                  <Text style={{ color: timeLeft.urgent ? '#FF3B30' : 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '800' }}>{timeLeft.label}</Text>
                                </View>
                              )}
                            </View>

                            {/* ── VS face-à-face ── */}
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              {/* Club challenger */}
                              <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
                                <View style={{ position: 'relative' }}>
                                  {g.challengerClubPhoto
                                    ? <ExpoImage source={{ uri: g.challengerClubPhoto }} style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, borderColor: cMedal?.color ?? GOSHOFF_COLOR }} contentFit="cover" />
                                    : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: GOSHOFF_COLOR + '25', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: GOSHOFF_COLOR }}><Ionicons name="people" size={26} color={GOSHOFF_COLOR} /></View>}
                                  {cMedal && (
                                    <View style={{ position: 'absolute', bottom: -2, right: -4, backgroundColor: cMedal.color, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1.5, borderColor: '#0F0A1E' }}>
                                      <Text style={{ color: '#000', fontSize: 8, fontWeight: '900' }}>#{cMedal.rank}</Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{g.challengerClubName}</Text>
                                <View style={{ alignItems: 'center' }}>
                                  <Text style={{ color: cLeading ? '#fff' : 'rgba(255,255,255,0.40)', fontSize: 30, fontWeight: '900', letterSpacing: -1, lineHeight: 34 }}>
                                    {(g.challengerTonnage ?? 0).toLocaleString('fr-FR')}
                                  </Text>
                                  <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '600' }}>kg</Text>
                                </View>
                                {cLeading && totalTonnage > 0 && (
                                  <View style={{ backgroundColor: GOSHOFF_COLOR + '30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: GOSHOFF_COLOR + '60' }}>
                                    <Text style={{ color: GOSHOFF_COLOR, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>EN TÊTE</Text>
                                  </View>
                                )}
                              </View>

                              {/* VS badge */}
                              <View style={{ width: 48, alignItems: 'center' }}>
                                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: GOSHOFF_COLOR, alignItems: 'center', justifyContent: 'center', shadowColor: GOSHOFF_COLOR, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 10 }}>
                                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1 }}>VS</Text>
                                </View>
                              </View>

                              {/* Club challengé */}
                              <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
                                <View style={{ position: 'relative' }}>
                                  {g.challengedClubPhoto
                                    ? <ExpoImage source={{ uri: g.challengedClubPhoto }} style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, borderColor: dMedal?.color ?? INDIGO }} contentFit="cover" />
                                    : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: INDIGO + '25', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: INDIGO }}><Ionicons name="people" size={26} color={INDIGO} /></View>}
                                  {dMedal && (
                                    <View style={{ position: 'absolute', bottom: -2, right: -4, backgroundColor: dMedal.color, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1.5, borderColor: '#0F0A1E' }}>
                                      <Text style={{ color: '#000', fontSize: 8, fontWeight: '900' }}>#{dMedal.rank}</Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{g.challengedClubName}</Text>
                                <View style={{ alignItems: 'center' }}>
                                  <Text style={{ color: !cLeading ? '#fff' : 'rgba(255,255,255,0.40)', fontSize: 30, fontWeight: '900', letterSpacing: -1, lineHeight: 34 }}>
                                    {(g.challengedTonnage ?? 0).toLocaleString('fr-FR')}
                                  </Text>
                                  <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '600' }}>kg</Text>
                                </View>
                                {!cLeading && totalTonnage > 0 && (
                                  <View style={{ backgroundColor: INDIGO + '30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: INDIGO + '60' }}>
                                    <Text style={{ color: INDIGO, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>EN TÊTE</Text>
                                  </View>
                                )}
                              </View>
                            </View>

                            {/* ── Barre de tonnage ── */}
                            <View style={{ marginTop: 20, gap: 8 }}>
                              <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', overflow: 'hidden' }}>
                                <View style={{ flexGrow: Math.max(1, Math.round(cPct * 100)), flexShrink: 1, flexBasis: 0, backgroundColor: GOSHOFF_COLOR }} />
                                <View style={{ flexGrow: Math.max(1, Math.round((1 - cPct) * 100)), flexShrink: 1, flexBasis: 0, backgroundColor: INDIGO }} />
                              </View>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={{ color: GOSHOFF_COLOR, fontSize: 11, fontWeight: '800' }}>{Math.round(cPct * 100)}%</Text>
                                <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '600' }}>TONNAGE</Text>
                                <Text style={{ color: INDIGO, fontSize: 11, fontWeight: '800' }}>{Math.round((1 - cPct) * 100)}%</Text>
                              </View>
                            </View>
                          </View>

                          {/* ── Exercices ── */}
                          <View style={{ backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 14, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(124,58,237,0.25)' }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>Exercices du défi</Text>
                            <View style={{ gap: 8 }}>
                              {(g.exercises ?? []).map((ex, exIdx) => (
                                <View key={ex.slug} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: GOSHOFF_COLOR, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{exIdx + 1}</Text>
                                  </View>
                                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{ex.name}</Text>
                                </View>
                              ))}
                            </View>
                          </View>

                          {/* ── Mon 1RM ── */}
                          {isMine && (
                            <View style={{ backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 14, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                              <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>Soumettre mon 1RM</Text>
                              <View style={{ gap: 8 }}>
                                {(g.exercises ?? []).map((ex) => {
                                  const already = mySubmittedSlugs.has(ex.slug);
                                  const myPr = prs.find((p) => p.uid === myUid && p.exerciseSlug === ex.slug);
                                  return (
                                    <TouchableOpacity
                                      key={ex.slug}
                                      onPress={() => { if (!already) { setPrModal({ goshOffId: g.id, exerciseSlug: ex.slug, exerciseName: ex.name }); setPrWeight(''); } }}
                                      activeOpacity={already ? 1 : 0.78}
                                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: already ? '#30D15812' : GOSHOFF_COLOR + '10', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: already ? '#30D15840' : GOSHOFF_COLOR + '30', gap: 12 }}
                                    >
                                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: already ? '#30D15820' : GOSHOFF_COLOR + '20', alignItems: 'center', justifyContent: 'center' }}>
                                        <Ionicons name={already ? 'checkmark-circle' : 'barbell-outline'} size={18} color={already ? '#30D158' : GOSHOFF_COLOR} />
                                      </View>
                                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }} numberOfLines={1}>{ex.name}</Text>
                                      {already
                                        ? <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                                            <Text style={{ color: '#30D158', fontSize: 18, fontWeight: '900' }}>{myPr?.weight}</Text>
                                            <Text style={{ color: '#30D15880', fontSize: 12, fontWeight: '600' }}>kg</Text>
                                          </View>
                                        : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GOSHOFF_COLOR + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                                            <Text style={{ color: GOSHOFF_COLOR, fontSize: 12, fontWeight: '700' }}>Ajouter</Text>
                                          </View>}
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>
                          )}

                          {/* ── Top PRs par exercice (aperçu) ── */}
                          <View style={{ backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>Meilleurs PRs</Text>
                              <TouchableOpacity
                                onPress={() => router.push({ pathname: '/goshoff-leaderboard', params: { goshOffId: g.id } })}
                                activeOpacity={0.75}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GOSHOFF_COLOR + '18', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                              >
                                <Text style={{ color: GOSHOFF_COLOR, fontSize: 12, fontWeight: '700' }}>Classement complet</Text>
                                <Ionicons name="chevron-forward" size={13} color={GOSHOFF_COLOR} />
                              </TouchableOpacity>
                            </View>
                            {(g.exercises ?? []).map((ex) => {
                              const exPrs = prs.filter((p) => p.exerciseSlug === ex.slug).sort((a, b) => b.weight - a.weight);
                              const top = exPrs[0];
                              return (
                                <View key={ex.slug} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GOSHOFF_COLOR + '80' }} />
                                  <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }} numberOfLines={1}>{ex.name}</Text>
                                  {top
                                    ? <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>{top.pseudo} · <Text style={{ color: GOSHOFF_COLOR }}>{top.weight} kg</Text></Text>
                                    : <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Aucun PR</Text>}
                                </View>
                              );
                            })}
                          </View>

                        </View>
                      );
                    })}
                  </View>
                )}

                {/* ── Défis refusés ── */}
                {refusedGoshOffs.length > 0 && (
                  <View style={{ gap: 10, paddingHorizontal: 16 }}>
                    {refusedGoshOffs.map((g) => (
                      <View key={g.id} style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: '#FF3B3040', overflow: 'hidden' }}>
                        <View style={{ backgroundColor: '#FF3B3012', paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FF3B3030' }}>
                          <Ionicons name="close-circle" size={14} color="#FF3B30" />
                          <Text style={{ color: '#FF3B30', fontSize: 12, fontWeight: '700', flex: 1 }}>Défi refusé</Text>
                          <TouchableOpacity onPress={() => handleDismissRefused(g.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="close" size={16} color={colors.textSecondary} />
                          </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                          {g.challengedClubPhoto
                            ? <ExpoImage source={{ uri: g.challengedClubPhoto }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
                            : <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="people" size={16} color={colors.textSecondary} /></View>}
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{g.challengedClubName}</Text>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>a refusé ton défi GoshOff</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* ── Défis envoyés en attente ── */}
                {sentGoshOffs.length > 0 && (
                  <View style={{ gap: 10, paddingHorizontal: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GOSHOFF_COLOR } } />
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>En attente</Text>
                    </View>
                    {sentGoshOffs.map((g) => {
                      const rankIdx = allClubs.findIndex((c) => c.id === g.challengedClubId);
                      const medal = rankIdx >= 0 && rankIdx < 3 ? MEDALS[rankIdx] : null;
                      return (
                        <View key={g.id} style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <View style={{ position: 'relative' }}>
                            {g.challengedClubPhoto
                              ? <ExpoImage source={{ uri: g.challengedClubPhoto }} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: medal ? 2 : 0, borderColor: medal?.color }} contentFit="cover" />
                              : <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="people" size={18} color={colors.textSecondary} /></View>}
                            {medal && (
                              <View style={{ position: 'absolute', bottom: -3, right: -3, backgroundColor: medal.color, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1.5, borderColor: colors.card }}>
                                <Text style={{ color: '#000', fontSize: 8, fontWeight: '900' }}>#{medal.rank}</Text>
                              </View>
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{g.challengedClubName}</Text>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>En attente d'acceptation</Text>
                          </View>
                          <View style={{ backgroundColor: GOSHOFF_COLOR + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                            <Text style={{ color: GOSHOFF_COLOR, fontSize: 11, fontWeight: '700' }}>Envoyé</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* ── État vide ── */}
                {activeGoshOffs.length === 0 && pendingGoshOffs.length === 0 && sentGoshOffs.length === 0 && (
                  <View style={{ alignItems: 'center', paddingVertical: 8, gap: 8 }}>
                    <GoshOffLogoOff size={52} />
                    <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>Aucun défi en cours</Text>
                  </View>
                )}

                {/* ── Clubs prêts ── */}
                <View style={{ gap: 12, paddingHorizontal: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <GoshOffLogoAnimated size={20} />
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Prêts à relever le défi</Text>
                  </View>
                  {goshOffReadyClubs.length === 0 ? (
                    <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 24, alignItems: 'center', gap: 6 }}>
                      <Ionicons name="shield-outline" size={28} color={colors.textSecondary} />
                      <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>Aucun club disponible</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, opacity: 0.6, textAlign: 'center', paddingHorizontal: 24 }}>Les clubs qui activent le mode défi apparaissent ici</Text>
                    </View>
                  ) : goshOffReadyClubs.filter((c) => c.id !== myClubId).map((club) => {
                    const isBusy = busyClubIds.has(club.id);
                    const rankIdx = allClubs.findIndex((c) => c.id === club.id);
                    const medal = rankIdx >= 0 && rankIdx < 3 ? MEDALS[rankIdx] : null;
                    // Préférer les données fraîches d'allClubs si disponibles
                    const live = rankIdx >= 0 ? allClubs[rankIdx] : club;
                    const memberCount = (live.memberIds ?? []).length || (live.memberCount ?? 0);
                    return (
                      <TouchableOpacity
                        key={club.id}
                        onPress={() => router.push({ pathname: '/club', params: { clubId: club.id } })}
                        activeOpacity={0.82}
                        style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1.5, borderColor: isBusy ? colors.border : GOSHOFF_COLOR + '44', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: isBusy ? 0.5 : 1 }}
                      >
                        <View style={{ position: 'relative' }}>
                          {live.photoUrl
                            ? <ExpoImage source={{ uri: live.photoUrl }} style={{ width: 46, height: 46, borderRadius: 23, borderWidth: medal ? 2.5 : 0, borderColor: medal?.color }} contentFit="cover" />
                            : <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: GOSHOFF_COLOR + '18', alignItems: 'center', justifyContent: 'center', borderWidth: medal ? 2.5 : 0, borderColor: medal?.color }}>
                                <Ionicons name="people" size={20} color={medal ? medal.color : GOSHOFF_COLOR} />
                              </View>}
                          {medal && (
                            <View style={{ position: 'absolute', bottom: -3, right: -3, backgroundColor: medal.color, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1.5, borderColor: colors.card }}>
                              <Text style={{ color: '#000', fontSize: 8, fontWeight: '900' }}>#{medal.rank}</Text>
                            </View>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{live.name}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            {memberCount} membre{memberCount > 1 ? 's' : ''}{live.category ? ` · ${live.category}` : ''}
                          </Text>
                        </View>
                        {isBusy
                          ? <View style={{ backgroundColor: colors.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>En défi</Text>
                            </View>
                          : <Ionicons name="chevron-forward" size={18} color={GOSHOFF_COLOR} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>

              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal — Lancer un GoshOff */}
      <Modal visible={showLaunch} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
          <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => { setShowLaunch(false); setSearchTerm(''); setSearchResults([]); }} style={{ width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' }}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' }}>Lancer un GoshOff</Text>
            <View style={{ width: 44 }} />
          </View>

          <View style={{ padding: 16, gap: 16 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Recherche le club que tu veux défier cette semaine.</Text>
            <View style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }}>
              <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
              <TextInput
                value={searchTerm}
                onChangeText={handleSearch}
                placeholder="Nom du club..."
                placeholderTextColor={colors.textSecondary}
                style={{ flex: 1, paddingVertical: 12, color: colors.text, fontSize: 15 }}
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color={GOSHOFF_COLOR} />}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {(() => {
                return searchResults.map((club) => {
                const rankIdx = allClubs.findIndex((c) => c.id === club.id);
                const medal = rankIdx >= 0 && rankIdx < 3 ? MEDALS[rankIdx] : null;
                const isBusy = busyClubIds.has(club.id);
                return (
                <TouchableOpacity key={club.id} activeOpacity={isBusy ? 1 : 0.85}
                  onPress={() => {
                    if (isBusy) {
                      Alert.alert('Club indisponible', `${club.name} participe déjà à un GoshOff cette semaine.`);
                      return;
                    }
                    setConfirmModal({ targetClubId: club.id, targetClubName: club.name });
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, opacity: isBusy ? 0.4 : 1 }}>
                  <View style={{ position: 'relative' }}>
                    {club.photoUrl
                      ? <ExpoImage source={{ uri: club.photoUrl }} style={{ width: 46, height: 46, borderRadius: 23, borderWidth: medal ? 2 : 0, borderColor: medal?.color }} contentFit="cover" />
                      : <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: medal ? 2 : 0, borderColor: medal?.color }}>
                          <Ionicons name="people" size={20} color={medal ? medal.color : colors.accent} />
                        </View>}
                    {medal && (
                      <View style={{ position: 'absolute', bottom: -3, right: -3, backgroundColor: medal.color, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1.5, borderColor: colors.bg }}>
                        <Text style={{ color: '#000', fontSize: 8, fontWeight: '900' }}>#{medal.rank}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{club.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{isBusy ? 'Déjà en GoshOff cette semaine' : `${club.category} · ${(club.memberIds ?? []).length} membre${(club.memberIds ?? []).length > 1 ? 's' : ''}`}</Text>
                  </View>
                  {launching
                    ? <ActivityIndicator size="small" color={GOSHOFF_COLOR} />
                    : isBusy
                      ? <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
                      : <Image source={GOSHOFF_LOGO} style={{ width: 24, height: 24 }} resizeMode="contain" />}
                </TouchableOpacity>
                );
              });
              })()}
            </ScrollView>
          </View>
          {/* Confirm modal — overlay absolu à l'intérieur du fullScreen modal */}
          {confirmModal !== null && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: 24, width: '100%', gap: 20, borderWidth: 1.5, borderColor: GOSHOFF_COLOR + '44' }}>

                {/* Logo + lueur */}
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ position: 'absolute', width: 140, height: 140 }}>
                      <Svg width={140} height={140}>
                        <Defs>
                          <RadialGradient id="glow_confirm" cx="50%" cy="50%" rx="50%" ry="50%">
                            <Stop offset="0%"   stopColor={GOSHOFF_COLOR} stopOpacity="0.7" />
                            <Stop offset="40%"  stopColor={GOSHOFF_COLOR} stopOpacity="0.25" />
                            <Stop offset="75%"  stopColor={GOSHOFF_COLOR} stopOpacity="0.06" />
                            <Stop offset="100%" stopColor={GOSHOFF_COLOR} stopOpacity="0" />
                          </RadialGradient>
                        </Defs>
                        <Ellipse cx={70} cy={70} rx={70} ry={70} fill="url(#glow_confirm)" />
                      </Svg>
                    </View>
                    <Image source={GOSHOFF_LOGO} style={{ width: 80, height: 80 }} resizeMode="contain" />
                  </View>
                  <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900', textAlign: 'center', marginTop: 12 }}>
                    Défier {confirmModal.targetClubName} ?
                  </Text>
                  <Text style={{ color: GOSHOFF_COLOR, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 4 }}>
                    Le tirage des exercices va commencer
                  </Text>
                </View>

                {/* Explication */}
                <View style={{ gap: 12 }}>
                  {[
                    { icon: 'shuffle-outline',          text: '3 exercices seront tirés au sort parmi les exercices polyarticulaires GoshOff.' },
                    { icon: 'flash-outline',            text: 'Une fois le tirage terminé, la demande de défi sera envoyée au club.' },
                    { icon: 'shield-checkmark-outline', text: 'L\'autre club devra accepter avant que le GoshOff ne démarre.' },
                  ].map(({ icon, text }) => (
                    <View key={icon} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: GOSHOFF_COLOR + '18', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                        <Ionicons name={icon as any} size={16} color={GOSHOFF_COLOR} />
                      </View>
                      <Text style={{ color: colors.text, fontSize: 14, lineHeight: 21, flex: 1 }}>{text}</Text>
                    </View>
                  ))}
                </View>

                {/* Boutons */}
                <View style={{ gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => {
                      const { targetClubId, targetClubName } = confirmModal;
                      const drawn = [...GOSHOFF_EXERCISES].sort(() => Math.random() - 0.5).slice(0, 3);
                      // Fermer confirm + modal recherche, puis ouvrir slot après la transition
                      setConfirmModal(null);
                      setShowLaunch(false);
                      setSearchTerm('');
                      setSearchResults([]);
                      setTimeout(() => setSlotModal({ targetClubId, targetClubName, drawn }), 450);
                    }}
                    activeOpacity={0.85}
                    style={{ backgroundColor: GOSHOFF_COLOR, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Lancer le tirage</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setConfirmModal(null)} activeOpacity={0.7} style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: '600' }}>Annuler</Text>
                  </TouchableOpacity>
                </View>

              </View>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Popup intro GoshOff — affichée une seule fois */}
      <Modal visible={showGoshOffIntro} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: 24, width: '100%', gap: 20, borderWidth: 1.5, borderColor: GOSHOFF_COLOR + '44' }}>

            {/* Logo + lueur */}
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ position: 'absolute', width: 140, height: 140 }}>
                  <Svg width={140} height={140}>
                    <Defs>
                      <RadialGradient id="glow_intro" cx="50%" cy="50%" rx="50%" ry="50%">
                        <Stop offset="0%"   stopColor={GOSHOFF_COLOR} stopOpacity="0.7" />
                        <Stop offset="40%"  stopColor={GOSHOFF_COLOR} stopOpacity="0.25" />
                        <Stop offset="75%"  stopColor={GOSHOFF_COLOR} stopOpacity="0.06" />
                        <Stop offset="100%" stopColor={GOSHOFF_COLOR} stopOpacity="0" />
                      </RadialGradient>
                    </Defs>
                    <Ellipse cx={70} cy={70} rx={70} ry={70} fill="url(#glow_intro)" />
                  </Svg>
                </View>
                <Image source={GOSHOFF_LOGO} style={{ width: 80, height: 80 }} resizeMode="contain" />
              </View>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900', textAlign: 'center', marginTop: 12 }}>
                Bienvenue dans les GoshOffs
              </Text>
              <Text style={{ color: GOSHOFF_COLOR, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 4 }}>
                Le défi inter-clubs de Gosh
              </Text>
            </View>

            {/* Règles */}
            <View style={{ gap: 12 }}>
              {[
                { icon: 'calendar-outline', text: 'Les GoshOff se lancent le dimanche pour la semaine suivante.' },
                { icon: 'flash-outline', text: 'Un GoshOff dure du lundi au samedi 23h59. 3 exercices polyarticulaires tirés au sort.' },
                { icon: 'barbell-outline', text: 'Chaque membre soumet son 1RM sur chacun des 3 exercices du défi.' },
                { icon: 'trophy-outline', text: 'Le club avec le plus grand tonnage total (somme des 1RM soumis) remporte le GoshOff.' },
                { icon: 'shield-outline', text: 'Un seul PR par exercice — pas de modification après soumission.' },
                { icon: 'people-outline', text: 'Seuls les propriétaires et admins peuvent lancer ou accepter un GoshOff.' },
              ].map(({ icon, text }) => (
                <View key={icon} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: GOSHOFF_COLOR + '18', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <Ionicons name={icon as any} size={16} color={GOSHOFF_COLOR} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: 14, lineHeight: 21, flex: 1 }}>{text}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            <TouchableOpacity
              onPress={() => {
                AsyncStorage.setItem('goshoff_intro_seen', 'true');
                setShowGoshOffIntro(false);
              }}
              activeOpacity={0.85}
              style={{ backgroundColor: GOSHOFF_COLOR, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>C'est parti !</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* Modal — Soumettre un PR */}
      <Modal visible={prModal !== null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 24, width: '100%', gap: 16 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Soumettre mon 1RM</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{prModal?.exerciseName}</Text>
            <TextInput
              value={prWeight}
              onChangeText={(v) => {
                const clean = v.replace(',', '.').replace(/[^0-9.]/g, '');
                const num = parseFloat(clean);
                if (!isNaN(num) && num > 500) return;
                setPrWeight(clean);
              }}
              placeholder="Poids en kg (ex: 120)"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              maxLength={6}
              style={{ backgroundColor: colors.bg, borderRadius: 12, padding: 14, color: colors.text, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setPrModal(null)} style={{ flex: 1, backgroundColor: colors.border, borderRadius: 12, padding: 14, alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!prModal) return;
                  const w = parseFloat(prWeight.replace(',', '.'));
                  if (isNaN(w) || w <= 0) { Alert.alert('Poids invalide', 'Saisis un poids valide en kg.'); return; }
                  setSubmittingPr(true);
                  try {
                    await submitGoshOffPR(prModal.goshOffId, prModal.exerciseSlug, prModal.exerciseName, w);
                    setPrModal(null);
                  } catch (e: any) {
                    Alert.alert('Erreur', e?.message ?? 'Impossible de soumettre le PR.');
                  } finally {
                    setSubmittingPr(false);
                  }
                }}
                disabled={submittingPr}
                style={{ flex: 1, backgroundColor: GOSHOFF_COLOR, borderRadius: 12, padding: 14, alignItems: 'center' }}
              >
                {submittingPr
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Valider</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Slot machine tirage exercices */}
      {slotModal && (
        <GoshOffSlotModal
          visible={!!slotModal}
          targetClubName={slotModal.targetClubName}
          drawn={slotModal.drawn}
          loading={launching}
          onConfirm={() => handleLaunch(slotModal.targetClubId, slotModal.drawn)}
          onCancel={() => setSlotModal(null)}
        />
      )}

    </SafeAreaView>
  );
}
