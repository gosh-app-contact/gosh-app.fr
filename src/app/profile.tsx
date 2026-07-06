import React, { useState, useEffect, useMemo } from 'react';
import Button from '../components/Button';
import PulsingLoader from '../components/PulsingLoader';
import UserBadge from '../components/UserBadge';
import UserPlusIcon from '../components/icons/UserPlusIcon';
import ReportModal from '../components/ReportModal';
import { blockUser, unblockUser, getBlockedUsers } from '../utils/reportUser';
import { getBadgeInfo } from '../utils/badgeCache';
import { getStreakLevel, getEarnedBadges, type StreakData } from '../utils/streakUtils';
import FlameIcon from '../components/FlameIcon';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Dimensions, ScrollView, Modal, Share, Alert, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useColors, colors, spacing } from '../constants/theme';
import { auth, db } from '../utils/firebase';
import { getCachedPhoto, setCachedPhoto, fetchAndCachePhotos } from '../utils/photoCache';
import { writeNotif, deleteNotif } from '../utils/writeNotif';
import { banUserCompletely } from '../utils/banUser';
import {
  doc, getDoc, collection, query, where, orderBy, limit,
  updateDoc, arrayUnion, arrayRemove, onSnapshot, getDocs,
} from 'firebase/firestore';

const { width: SW, height: SH } = Dimensions.get('window');
const GRID_SIZE = (SW - 3) / 3;

function VerifiedBadge({ uid }: { uid?: string }) {
  const [info, setInfo] = useState<{ accountType?: string; verified?: boolean } | null>(null);
  useEffect(() => { if (uid) getBadgeInfo(uid).then(setInfo); }, [uid]);
  if (!info) return null;
  return <UserBadge accountType={info.accountType} verified={info.verified} size={18} />;
}

function BackIcon() {
  return <Ionicons name="chevron-back" size={24} color={colors.text} />;
}

type UserProfile = {
  uid: string;
  pseudo: string;
  prenom?: string;
  displayName?: string;
  photoUrl?: string;
  friends?: string[];
  followers?: string[];
  following?: string[];
  friendRequests?: string[];
  accountType?: string;
  coachCode?: string;
  createdAt?: any;
  trainingStats?: {
    weeklyDone: number;
    weeklyPlanned: number;
    streak: number;
  };
  loginStreak?: StreakData;
};

type Post = {
  id: string;
  uid: string;
  pseudo: string;
  content: string;
  photoUrl?: string;
  type: string;
  createdAt: any;
  likes: string[];
  visibility: string;
};

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { uid, from } = useLocalSearchParams<{ uid: string; from?: string }>();
  const backDest = from === 'notif'
    ? () => router.navigate({ pathname: '/(tabs)/social', params: { openNotifs: '1' } } as any)
    : from === 'search'
    ? () => router.navigate('/(tabs)/social' as any)
    : null;
  const router = useRouter();
  const me = auth.currentUser;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [theyFollowMe, setTheyFollowMe] = useState(false);
  const [isFriend, setIsFriend] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [theyRequestedMe, setTheyRequestedMe] = useState(false);
  const [listModal, setListModal] = useState<'friends' | 'followers' | null>(null);
  const [listUsers, setListUsers] = useState<{ uid: string; prenom?: string; pseudo: string; photoUrl?: string }[]>([]);
  const [myBlockedUsers, setMyBlockedUsers] = useState<string[]>([]);
  const [myBlockedBy, setMyBlockedBy] = useState<string[]>([]);
  const [myAccountType, setMyAccountType] = useState<string>('standard');
  const [myCoachUid, setMyCoachUid] = useState<string | null>(null);
  const [myCoachStatus, setMyCoachStatus] = useState<string | null>(null);
  const [coachRequestSent, setCoachRequestSent] = useState(false);
  const [coachRequestLoading, setCoachRequestLoading] = useState(false);
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [stopCoachingLoading, setStopCoachingLoading] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showMyActionSheet, setShowMyActionSheet] = useState(false);
  const [blockedList, setBlockedList] = useState<{ uid: string; pseudo: string; prenom?: string; photoUrl?: string }[]>([]);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [userClub, setUserClub] = useState<{ id: string; name: string; photoUrl?: string } | null>(null);
  const [userClubRank, setUserClubRank] = useState<1 | 2 | 3 | null>(null);
  const [isProfilePremium, setIsProfilePremium] = useState(false);

  const isMe = me?.uid === uid;

  // Charge le type de compte + coach actuel + demandes reçues du visiteur
  useEffect(() => {
    if (!me || !uid) return;
    getBlockedUsers().then((list) => setIsBlocked(list.includes(uid as string)));
  }, [me, uid]);

  // Club du profil affiché + rang dans le classement
  useEffect(() => {
    if (!uid) return;
    setUserClub(null);
    setUserClubRank(null);
    getDocs(query(collection(db, 'clubs'), where('memberIds', 'array-contains', uid))).then(async (clubSnap) => {
      if (clubSnap.empty) return;
      const d = clubSnap.docs[0];
      const data = d.data();
      setUserClub({ id: d.id, name: data.name, photoUrl: data.photoUrl });
      // Rang global
      const top3Snap = await getDocs(query(collection(db, 'clubs'), where('weeklyScore', '>', 0), orderBy('weeklyScore', 'desc'), limit(20)));
      const ranked = top3Snap.docs.map((r) => ({ id: r.id, ...r.data() })) as any[];
      ranked.sort((a, b) => ((b.weeklyScore ?? 0) / Math.max(b.memberCount, 1)) - ((a.weeklyScore ?? 0) / Math.max(a.memberCount, 1)));
      const idx = ranked.findIndex((r) => r.id === d.id);
      setUserClubRank(idx === 0 ? 1 : idx === 1 ? 2 : idx === 2 ? 3 : null);
    }).catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (!me) return;
    const unsub = onSnapshot(doc(db, 'users', me.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setMyAccountType(data?.accountType ?? 'standard');
      setMyCoachUid(data?.coachUid ?? null);
      setMyCoachStatus(data?.coachStatus ?? null);
      setIsBlocked((data?.blockedUsers ?? []).includes(uid));
      setMyBlockedUsers(data?.blockedUsers ?? []);
      setMyBlockedBy(data?.blockedBy ?? []);
      // Est-ce que le propriétaire de ce profil m'a envoyé une demande ?
      if (uid) setTheyRequestedMe((data?.friendRequests ?? []).includes(uid));
    }, () => {});
    return unsub;
  }, [me, uid]);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);

    // Pré-remplir la photo depuis le cache global pour affichage immédiat
    const cachedPhoto = getCachedPhoto(uid);
    if (cachedPhoto) {
      setProfile((prev) => prev ? { ...prev, photoUrl: cachedPhoto } : { uid, pseudo: '', photoUrl: cachedPhoto });
    }

    // Écouter en temps réel si une demande de coaching existe
    let unsubReq: (() => void) | null = null;
    if (me) {
      unsubReq = onSnapshot(
        query(collection(db, 'coachRequests'), where('studentUid', '==', me.uid), where('coachUid', '==', uid)),
        (snap) => setCoachRequestSent(!snap.empty),
        () => {},
      );
    }

    // Profil + posts lancés en parallèle
    const unsubProfile = onSnapshot(doc(db, 'users', uid), { includeMetadataChanges: false }, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        setProfile({ ...data, uid: snap.id });
        if (data.photoUrl) setCachedPhoto(uid, data.photoUrl);
        if (me) {
          setIsFollowing((data.followers ?? []).includes(me.uid));
          setTheyFollowMe((data.following ?? []).includes(me.uid));
          setIsFriend((data.friends ?? []).includes(me.uid));
          setRequestSent((data.friendRequests ?? []).includes(me.uid));
        }
        const sub = (data as any).subscription;
        const accountType = (data as any).accountType ?? 'standard';
        setIsProfilePremium(
          accountType === 'standard' &&
          sub?.plan === 'standard_premium' &&
          sub?.status === 'active'
        );
      }
    }, () => {});

    const canSeePrivate = isMe || isFriend;
    const q = canSeePrivate
      ? query(collection(db, 'posts'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(30))
      : query(collection(db, 'posts'), where('uid', '==', uid), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(30));

    const unsubPosts = onSnapshot(q, { includeMetadataChanges: false }, (snap) => {
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post)));
      setLoading(false);
    }, () => {});

    return () => { unsubProfile(); unsubPosts(); unsubReq?.(); };
  }, [uid, me, isFriend, isMe]);

  const openList = async (type: 'friends' | 'followers') => {
    const uids: string[] = type === 'friends' ? (profile?.friends ?? []) : (profile?.followers ?? []);
    if (uids.length === 0) { setListUsers([]); setListModal(type); return; }
    const snaps = await Promise.all(uids.slice(0, 50).map((u) => getDoc(doc(db, 'users', u))));
    const users = snaps
      .filter((s) => s.exists())
      .map((s) => ({ uid: s.id, ...s.data() as any }))
      .filter((u) => !myBlockedUsers.includes(u.uid) && !myBlockedBy.includes(u.uid));
    users.forEach((u) => { if (u.photoUrl) setCachedPhoto(u.uid, u.photoUrl); });
    setListUsers(users);
    setListModal(type);
  };

  const toggleFollow = async () => {
    if (!me || !uid || isMe) return;
    setFollowLoading(true);
    try {
      const myRef = doc(db, 'users', me.uid);
      const otherRef = doc(db, 'users', uid);
      if (isFollowing) {
        await updateDoc(myRef, { following: arrayRemove(uid) });
        await updateDoc(otherRef, { followers: arrayRemove(me.uid) });
        deleteNotif(uid, me.uid, 'follow');
      } else {
        await updateDoc(myRef, { following: arrayUnion(uid) });
        await updateDoc(otherRef, { followers: arrayUnion(me.uid) });
        const mySnap = await getDoc(myRef);
        const myPseudo = mySnap.data()?.prenom ?? mySnap.data()?.pseudo ?? 'Quelqu\'un';
        const myPhoto = mySnap.data()?.photoUrl ?? '';
        writeNotif(uid, me.uid, myPseudo, myPhoto, 'follow');
      }
    } finally {
      setFollowLoading(false);
    }
  };

  const sendFriendRequest = async () => {
    if (!me || !uid || isMe) return;
    await updateDoc(doc(db, 'users', uid), { friendRequests: arrayUnion(me.uid) });
    setRequestSent(true);
  };

  const cancelFriendRequest = async () => {
    if (!me || !uid) return;
    await updateDoc(doc(db, 'users', uid), { friendRequests: arrayRemove(me.uid) });
    deleteNotif(uid, me.uid, 'friendRequest');
    setRequestSent(false);
  };

  const acceptFriendRequest = async () => {
    if (!me || !uid) return;
    await Promise.all([
      // Ajouter en amis des deux côtés
      updateDoc(doc(db, 'users', me.uid), { friends: arrayUnion(uid), friendRequests: arrayRemove(uid) }),
      updateDoc(doc(db, 'users', uid), { friends: arrayUnion(me.uid) }),
    ]);
    // Supprimer la notif de demande d'ami dans mes notifications
    deleteNotif(me.uid, uid, 'friendRequest');
    setTheyRequestedMe(false);
    setIsFriend(true);
  };

  const sendCoachingRequest = async () => {
    if (!me || !uid || !profile?.coachCode) return;
    setCoachRequestLoading(true);
    try {
      const mySnap = await getDoc(doc(db, 'users', me.uid));
      const myPseudo = mySnap.data()?.pseudo ?? '';
      const myPhoto = mySnap.data()?.photoUrl ?? '';
      const { sendCoachRequest } = await import('../utils/coachStorage');
      await sendCoachRequest(me.uid, myPseudo, myPhoto, uid, profile.coachCode);
      setCoachRequestSent(true);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'envoyer la demande.');
    } finally {
      setCoachRequestLoading(false);
    }
  };

  const cancelCoachingRequest = async () => {
    if (!me || !uid) return;
    try {
      const { getDocs, query: fsQuery, where: fsWhere, deleteDoc } = await import('firebase/firestore');
      const snap = await getDocs(fsQuery(collection(db, 'coachRequests'), fsWhere('studentUid', '==', me.uid), fsWhere('coachUid', '==', uid)));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      await updateDoc(doc(db, 'users', me.uid), { coachStatus: null, coachUid: null, coachCode: null, coachRequestId: null, accountType: 'standard' });
      setCoachRequestSent(false);
    } catch {}
  };

  const stopCoaching = async () => {
    if (!me || !uid) return;
    Alert.alert(
      'Arrêter le coaching ?',
      'Tu vas quitter le coaching de ce coach. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer', style: 'destructive', onPress: async () => {
            setStopCoachingLoading(true);
            try {
              const { getDocs, query: fsQuery, where: fsWhere, deleteDoc } = await import('firebase/firestore');
              // Supprimer la relation élève chez le coach
              const { deleteDoc: del } = await import('firebase/firestore');
              await del(doc(db, 'coachStudents', uid, 'students', me.uid)).catch(() => {});
              // Supprimer les demandes associées
              const snap = await getDocs(fsQuery(collection(db, 'coachRequests'), fsWhere('studentUid', '==', me.uid), fsWhere('coachUid', '==', uid)));
              await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
              // Remettre le compte en standard
              await updateDoc(doc(db, 'users', me.uid), { coachStatus: null, coachUid: null, coachCode: null, coachRequestId: null, accountType: 'standard' });
              setMyCoachUid(null);
              setMyCoachStatus(null);
            } catch {
              Alert.alert('Erreur', 'Impossible d\'arrêter le coaching.');
            } finally {
              setStopCoachingLoading(false);
            }
          },
        },
      ]
    );
  };

  const allBlocked = useMemo(() => new Set([...myBlockedUsers, ...myBlockedBy]), [myBlockedUsers, myBlockedBy]);
  const followersCount = useMemo(() => (profile?.followers ?? []).filter((u) => !allBlocked.has(u)).length, [profile?.followers, allBlocked]);
  const friendsCount = useMemo(() => (profile?.friends ?? []).filter((u) => !allBlocked.has(u)).length, [profile?.friends, allBlocked]);
  const postsCount = posts.length;
  const displayName = profile?.prenom ?? profile?.displayName ?? profile?.pseudo ?? '?';

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
      paddingHorizontal: spacing.md, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    backBtn: { width: 32 },
    headerTitle: { color: colors.text, fontSize: 16, fontWeight: '700' as const },

    // Hero section
    profileTopRow: {
      flexDirection: 'row' as const, alignItems: 'center' as const,
      paddingHorizontal: spacing.md, paddingTop: 20, paddingBottom: 14, gap: 20,
    },
    avatarWrap: {
      width: 96, height: 96, borderRadius: 48,
      borderWidth: 2.5, borderColor: colors.accent + '70',
      alignItems: 'center' as const, justifyContent: 'center' as const,
      shadowColor: colors.accent, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    },
    avatar: { width: 88, height: 88, borderRadius: 44 },
    avatarPlaceholder: {
      width: 88, height: 88, borderRadius: 44,
      backgroundColor: colors.accent + '18', alignItems: 'center' as const, justifyContent: 'center' as const,
    },
    avatarInitial: { color: colors.accent, fontSize: 36, fontWeight: '800' as const },

    // Stats
    statsRow: { flex: 1, flexDirection: 'row' as const, justifyContent: 'space-around' as const, alignItems: 'center' as const },
    stat: { alignItems: 'center' as const, gap: 2 },
    statNum: { color: colors.text, fontSize: 20, fontWeight: '800' as const },
    statLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '500' as const },
    statDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.border },

    // Name block
    nameBlock: { paddingHorizontal: spacing.md, paddingBottom: 4, gap: 2 },
    displayName: { color: colors.text, fontSize: 18, fontWeight: '800' as const, letterSpacing: -0.3 },
    handle: { color: colors.textSecondary, fontSize: 13 },

    // Training cards
    trainingRow: { flexDirection: 'row' as const, gap: 10, paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 12 },
    trainingCard: {
      flex: 1, backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden' as const,
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    },
    trainingCardInner: { padding: 12, gap: 4 },
    trainingCardNum: { color: colors.text, fontSize: 20, fontWeight: '800' as const, marginTop: 2 },
    trainingCardSub: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' as const },
    trainingCardLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' as const },
    progressBarWrap: { height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' as const, marginTop: 6 },
    progressBarFill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },

    // Actions
    actionsRow: { flexDirection: 'row' as const, gap: 8, paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: 14 },
    actionBtn: {
      flex: 1, backgroundColor: colors.accent, borderRadius: 12,
      paddingVertical: 10, alignItems: 'center' as const, justifyContent: 'center' as const,
      shadowColor: colors.accent, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    },
    actionBtnActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, shadowOpacity: 0 },
    actionBtnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.accent, shadowOpacity: 0 },
    actionBtnText: { color: '#fff', fontWeight: '700' as const, fontSize: 14 },
    actionBtnTextActive: { color: colors.text },

    // Grid
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 2, marginTop: 6 },
    empty: { color: colors.textSecondary, textAlign: 'center' as const, marginTop: 48, fontSize: 14 },
    grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 1.5 },
    gridItem: { width: GRID_SIZE, height: GRID_SIZE },
    gridImg: { width: GRID_SIZE, height: GRID_SIZE },
    gridTextPost: { backgroundColor: colors.card, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 8 },
    gridText: { color: colors.text, fontSize: 12, textAlign: 'center' as const },
  }), [colors]);

  if (!isMe && uid && myBlockedBy.includes(uid as string)) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profil</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
          <Ionicons name="ban-outline" size={56} color={colors.textSecondary} />
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>
            Ce compte n'est pas disponible
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
            Ce compte est introuvable ou son contenu n'est pas accessible.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{displayName}</Text>
        {!isMe ? (
          <TouchableOpacity onPress={() => setShowActionSheet(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setShowMyActionSheet(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Avatar + stats row */}
        <View style={styles.profileTopRow}>
          <View style={{ position: 'relative' }}>
            <View style={styles.avatarWrap}>
              {profile?.photoUrl
                ? <ExpoImage source={{ uri: profile.photoUrl }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
                : <View style={styles.avatarPlaceholder}><Text style={styles.avatarInitial}>{displayName[0]?.toUpperCase() ?? '?'}</Text></View>}
            </View>
            {isProfilePremium && (
              <View style={{
                position: 'absolute', bottom: -1, right: -1,
                width: 24, height: 24, borderRadius: 12,
                backgroundColor: colors.bg, borderWidth: 2, borderColor: '#C4973A',
                alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              }}>
                <Image source={require('../../assets/images/logo-gosh-pro.png')} style={{ width: 16, height: 16 }} resizeMode="contain" />
              </View>
            )}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{postsCount}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.statDivider} />
            <TouchableOpacity style={styles.stat} onPress={() => openList('friends')} activeOpacity={0.7}>
              <Text style={styles.statNum}>{friendsCount}</Text>
              <Text style={styles.statLabel}>Amis</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity style={styles.stat} onPress={() => openList('followers')} activeOpacity={0.7}>
              <Text style={styles.statNum}>{followersCount}</Text>
              <Text style={styles.statLabel}>Abonnés</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Nom + handle */}
        <View style={styles.nameBlock}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.displayName}>{displayName}</Text>
            <VerifiedBadge uid={uid} />
            {profile?.accountType === 'coach' && (
              <View style={{ backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>COACH</Text>
              </View>
            )}
          </View>
          {profile?.pseudo && <Text style={styles.handle}>@{profile.pseudo}</Text>}
        </View>

        {/* Bio */}
        {(profile as any)?.bio ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, paddingHorizontal: spacing.md, marginTop: 2 }}>
            {(profile as any).bio}
          </Text>
        ) : null}

        {/* Chip club */}
        {userClub && (() => {
          const RANK_COLOR: Record<1 | 2 | 3, string> = { 1: '#FFB800', 2: '#A8A8A8', 3: '#CD7F32' };
          const rankColor = userClubRank ? RANK_COLOR[userClubRank] : null;
          return (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/club', params: { clubId: userClub.id } })}
              activeOpacity={0.8}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                marginTop: 8, marginHorizontal: spacing.md,
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                backgroundColor: rankColor ? rankColor + '12' : colors.card,
                borderWidth: 1.5, borderColor: rankColor ?? colors.border,
              }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: rankColor ?? colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: rankColor ? rankColor + '15' : colors.surface }}>
                {userClub.photoUrl
                  ? <ExpoImage source={{ uri: userClub.photoUrl }} style={{ width: 15, height: 15, borderRadius: 7.5 }} contentFit="cover" />
                  : <Ionicons name="people" size={9} color={rankColor ?? colors.textSecondary} />}
              </View>
              {userClubRank && (
                <Text style={{ color: rankColor!, fontSize: 10, fontWeight: '900' }}>#{userClubRank}</Text>
              )}
              <Text style={{ color: rankColor ?? colors.text, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{userClub.name}</Text>
              <Ionicons name="chevron-forward" size={11} color={rankColor ?? colors.textSecondary} />
            </TouchableOpacity>
          );
        })()}

        {/* Boutons Modifier/Partager pleine largeur */}
        {isMe && (
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: spacing.md, marginTop: 10, marginBottom: 8 }}>
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.card, flexDirection: 'row', justifyContent: 'center', gap: 6 }}
              onPress={() => router.push('/social-profil-modal')}
              activeOpacity={0.8}
            >
              <Ionicons name="pencil-outline" size={14} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>Modifier</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.card, flexDirection: 'row', justifyContent: 'center', gap: 6 }}
              activeOpacity={0.8}
              onPress={() => {
                const pseudo = profile?.pseudo ?? 'utilisateur';
                Share.share({
                  message: `Retrouve-moi sur Gosh @${pseudo}`,
                  url: `https://fluide.app/profile/${pseudo}`,
                  title: `Profil de @${pseudo}`,
                });
              }}
            >
              <Ionicons name="share-outline" size={14} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>Partager</Text>
            </TouchableOpacity>
          </View>
        )}


        {/* Streak + Badges — standard/student uniquement */}
        {profile?.accountType !== 'coach' && profile?.accountType !== 'admin' && (() => {
          const s = profile?.loginStreak?.current ?? 0;
          const longest = profile?.loginStreak?.longest ?? 0;
          const lvl = getStreakLevel(s);
          const earnedBadges = getEarnedBadges(s);
          return (
            <View style={{ paddingHorizontal: spacing.md, paddingTop: 6, paddingBottom: 4, gap: 10 }}>
              {/* Card streak */}
              <View style={{
                borderRadius: 16, padding: 14, gap: 10,
                backgroundColor: s > 0 ? colors.accent + '18' : colors.card,
                borderWidth: 1,
                borderColor: s > 0 ? colors.accent + '55' : colors.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <FlameIcon size={lvl.iconSize} color={lvl.iconColor} glowColor={lvl.glowColor} active={s >= 7} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>
                      {s === 0 ? 'Pas encore de streak' : `${s} jour${s > 1 ? 's' : ''} de streak`}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {longest > 0 ? `Record : ${longest} jour${longest > 1 ? 's' : ''}` : 'Aucun record pour l\'instant'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {s > 0 && (
                      <View style={{ backgroundColor: lvl.bgColor, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 }}>
                        <Text style={{ color: lvl.iconColor, fontSize: 14, fontWeight: '800' }}>{s}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => setShowBadgeModal(true)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Badges débloqués */}
                {earnedBadges.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {earnedBadges.map((b) => (
                      <View key={b.days} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: b.color + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                        <Ionicons name={b.icon as any} size={12} color={b.color} />
                        <Text style={{ color: b.color, fontSize: 11, fontWeight: '700' }}>{b.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        })()}

        {/* Action buttons */}
        {!isMe && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, isFollowing && styles.actionBtnActive]}
              onPress={toggleFollow}
              disabled={followLoading}
              activeOpacity={0.8}
            >
              {followLoading
                ? <ActivityIndicator size="small" color={isFollowing ? colors.accent : '#fff'} />
                : <Text style={[styles.actionBtnText, isFollowing && styles.actionBtnTextActive]}>
                    {isFollowing ? 'Abonné' : theyFollowMe ? 'Suivre en retour' : 'Suivre'}
                  </Text>}
            </TouchableOpacity>

            {!isFriend && (
              theyRequestedMe ? (
                <TouchableOpacity
                  onPress={acceptFriendRequest}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.accent + '15' }}
                >
                  <Ionicons name="checkmark-circle-outline" size={14} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>Accepter</Text>
                </TouchableOpacity>
              ) : requestSent ? (
                <TouchableOpacity
                  onPress={cancelFriendRequest}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: colors.textSecondary }}
                >
                  <Ionicons name="hourglass-outline" size={14} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>En attente</Text>
                </TouchableOpacity>
              ) : (
                <UserPlusIcon onPress={sendFriendRequest} />
              )
            )}

            {isFriend && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnOutline]}
                onPress={() => router.push({ pathname: '/chat', params: { otherUid: uid, otherPseudo: displayName } })}
                activeOpacity={0.8}
              >
                <Text style={[styles.actionBtnText, { color: colors.accent }]}>Message</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Zone coaching — sous les boutons Suivre/Message */}
        {profile?.accountType === 'coach' && !isMe && myAccountType !== 'coach' && (() => {
          const isMyCoach = myCoachUid === uid && myCoachStatus === 'accepted';
          const isPendingThisCoach = myCoachUid === uid && myCoachStatus === 'pending';
          const hasOtherCoach = myCoachUid && myCoachUid !== uid;
          // Un compte élève ne peut pas initier de nouvelle demande
          const isStudent = myAccountType === 'student';

          if (isMyCoach) return (
            <View style={{ marginHorizontal: spacing.md, marginBottom: 8, flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: colors.accentGreen + '55', backgroundColor: colors.accentGreen + '10' }}>
                <Ionicons name="checkmark-circle" size={15} color={colors.accentGreen} />
                <Text style={{ color: colors.accentGreen, fontSize: 13, fontWeight: '700' }}>Coach actuel</Text>
              </View>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: colors.danger, backgroundColor: colors.danger + '12' }}
                onPress={stopCoaching}
                disabled={stopCoachingLoading}
                activeOpacity={0.7}
              >
                {stopCoachingLoading
                  ? <ActivityIndicator size="small" color={colors.danger} />
                  : <>
                      <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
                      <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Arrêter</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          );

          if (isPendingThisCoach || (coachRequestSent && myCoachUid === uid)) return (
            <TouchableOpacity
              style={{ marginHorizontal: spacing.md, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.textSecondary }}
              onPress={cancelCoachingRequest}
              activeOpacity={0.8}
            >
              <Ionicons name="hourglass-outline" size={14} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>Demande envoyée · Annuler</Text>
            </TouchableOpacity>
          );

          if (hasOtherCoach || isStudent) return null;

          return (
            <TouchableOpacity
              style={{ marginHorizontal: spacing.md, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accent + '12' }}
              onPress={sendCoachingRequest}
              disabled={coachRequestLoading}
              activeOpacity={0.8}
            >
              {coachRequestLoading
                ? <ActivityIndicator size="small" color={colors.accent} />
                : <>
                    <Ionicons name="person-add-outline" size={14} color={colors.accent} />
                    <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>Demander un coaching</Text>
                  </>
              }
            </TouchableOpacity>
          );
        })()}

        {/* Separator */}
        <View style={styles.divider} />

        {/* Posts grid */}
        {loading
          ? <PulsingLoader size={44} style={{ marginTop: 40 }} />
          : posts.length === 0
            ? <Text style={styles.empty}>Aucun post public</Text>
            : (
              <View style={styles.grid}>
                {posts.map((post) => (
                  <TouchableOpacity key={post.id} style={styles.gridItem} onPress={() => router.push({ pathname: '/post', params: { postId: post.id } })} activeOpacity={0.85}>
                    {post.photoUrl
                      ? <ExpoImage source={{ uri: post.photoUrl }} style={styles.gridImg} contentFit="cover" cachePolicy="memory-disk" />
                      : (
                        <View style={[styles.gridImg, styles.gridTextPost]}>
                          <Text style={styles.gridText} numberOfLines={4}>{post.content}</Text>
                        </View>
                      )}
                    {post.visibility === 'private' && (
                      <View style={{ position: 'absolute', top: 4, right: 4 }}>
                        <Svg width={14} height={14} viewBox="0 0 24 24" fill={colors.accent}>
                          <Path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" fill={colors.accent} />
                        </Svg>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
      </ScrollView>

      {/* Modal liste amis / abonnés */}
      <Modal visible={!!listModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setListModal(null)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
              {listModal === 'friends' ? 'Amis' : 'Abonnés'}
            </Text>
            <TouchableOpacity onPress={() => setListModal(null)}>
              <Text style={{ color: colors.accent, fontWeight: '700' }}>Fermer</Text>
            </TouchableOpacity>
          </View>
          {listUsers.length === 0
            ? <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>Aucun utilisateur</Text>
            : (
              <FlatList
                data={listUsers}
                keyExtractor={(u) => u.uid}
                contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
                renderItem={({ item }) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}
                      onPress={() => { setListModal(null); router.push({ pathname: '/profile', params: { uid: item.uid } }); }}
                      activeOpacity={0.8}
                    >
                      <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.accent + '55' }}>
                        {item.photoUrl
                          ? <ExpoImage source={{ uri: item.photoUrl }} style={{ width: 44, height: 44 }} contentFit="cover" cachePolicy="memory-disk" />
                          : <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '800' }}>{(item.prenom ?? item.pseudo)?.[0]?.toUpperCase()}</Text>}
                      </View>
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{item.prenom ?? item.pseudo}</Text>
                          <VerifiedBadge uid={item.uid} />
                        </View>
                        {item.pseudo && <Text style={{ color: colors.textSecondary, fontSize: 12 }}>@{item.pseudo}</Text>}
                      </View>
                    </TouchableOpacity>
                    {listModal === 'friends' && isMe && (
                      <TouchableOpacity
                        onPress={() => Alert.alert(
                          item.prenom ?? item.pseudo,
                          'Retirer cet ami ?',
                          [
                            { text: 'Annuler', style: 'cancel' },
                            { text: 'Retirer', style: 'destructive', onPress: async () => {
                              const { updateDoc, doc: fsDoc, arrayRemove: fsRemove } = await import('firebase/firestore');
                              const { db: fsDb } = await import('../utils/firebase');
                              await updateDoc(fsDoc(fsDb, 'users', me!.uid), { friends: fsRemove(item.uid) });
                              await updateDoc(fsDoc(fsDb, 'users', item.uid), { friends: fsRemove(me!.uid) });
                              setListUsers((prev) => prev.filter((u) => u.uid !== item.uid));
                            }},
                          ]
                        )}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ padding: 8 }}
                      >
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              />
            )}
        </View>
      </Modal>

      {/* ── Action Sheet ── */}
      <Modal visible={showActionSheet} transparent animationType="slide" onRequestClose={() => setShowActionSheet(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowActionSheet(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingBottom: 34, overflow: 'hidden' }}>

              {/* Handle */}
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>

              {/* Titre */}
              <View style={{ paddingHorizontal: spacing.lg, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{displayName}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 2 }}>@{profile?.pseudo ?? ''}</Text>
              </View>

              {/* Option : Signaler (masqué pour l'admin qui peut bannir directement) */}
              {myAccountType !== 'admin' && (
                <TouchableOpacity
                  onPress={() => { setShowActionSheet(false); setTimeout(() => setShowReportModal(true), 300); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.lg, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="flag-outline" size={22} color="#FF3B30" />
                  <Text style={{ color: '#FF3B30', fontSize: 16, fontWeight: '600' }}>
                    {profile?.accountType === 'coach' ? 'Signaler ce coach' : 'Signaler'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Option : Bloquer / Débloquer */}
              <TouchableOpacity
                onPress={() => {
                  setShowActionSheet(false);
                  const action = isBlocked ? 'débloquer' : 'bloquer';
                  Alert.alert(
                    isBlocked ? `Débloquer ${displayName} ?` : `Bloquer ${displayName} ?`,
                    isBlocked
                      ? `${displayName} pourra à nouveau te suivre, voir tes posts et t'envoyer des messages.`
                      : `${displayName} ne pourra plus voir tes posts, te suivre ni t'envoyer de messages. Il ne sera pas notifié.`,
                    [
                      { text: 'Annuler', style: 'cancel' },
                      {
                        text: isBlocked ? 'Débloquer' : 'Bloquer',
                        style: isBlocked ? 'default' : 'destructive',
                        onPress: async () => {
                          if (isBlocked) {
                            await unblockUser(uid as string);
                            setIsBlocked(false);
                          } else {
                            await blockUser(uid as string);
                            setIsBlocked(true);
                            router.back();
                          }
                        },
                      },
                    ],
                  );
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.lg, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
                activeOpacity={0.7}
              >
                <Ionicons name={isBlocked ? 'checkmark-circle-outline' : 'ban-outline'} size={22} color={isBlocked ? colors.accentGreen : colors.text} />
                <Text style={{ color: isBlocked ? colors.accentGreen : colors.text, fontSize: 16, fontWeight: '600' }}>
                  {isBlocked ? 'Débloquer' : 'Bloquer'}
                </Text>
              </TouchableOpacity>

              {/* Option : Bannir (admin uniquement) */}
              {myAccountType === 'admin' && (
                <TouchableOpacity
                  onPress={() => {
                    setShowActionSheet(false);
                    const isBanned = profile?.accountType === 'banned';
                    Alert.alert(
                      isBanned ? `Débannir @${profile?.pseudo}` : `Bannir @${profile?.pseudo}`,
                      isBanned
                        ? 'Ce compte retrouvera un accès normal à l\'application.'
                        : 'Ce compte sera suspendu et ne pourra plus accéder à l\'application.',
                      [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: isBanned ? 'Débannir' : 'Bannir',
                          style: isBanned ? 'default' : 'destructive',
                          onPress: async () => {
                            try {
                              if (isBanned) {
                                await updateDoc(doc(db, 'users', uid as string), { accountType: 'standard' });
                              } else {
                                await banUserCompletely(uid as string, profile?.pseudo);
                              }
                              Alert.alert(
                                isBanned ? 'Compte débanni' : 'Compte banni',
                                isBanned ? `@${profile?.pseudo} peut à nouveau accéder à l'app.` : `@${profile?.pseudo} a été banni.`,
                              );
                              router.back();
                            } catch {
                              Alert.alert('Erreur', 'Impossible d\'effectuer cette action.');
                            }
                          },
                        },
                      ],
                    );
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.lg, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={profile?.accountType === 'banned' ? 'checkmark-circle-outline' : 'hammer-outline'}
                    size={22}
                    color={profile?.accountType === 'banned' ? colors.accentGreen : '#FF3B30'}
                  />
                  <Text style={{ color: profile?.accountType === 'banned' ? colors.accentGreen : '#FF3B30', fontSize: 16, fontWeight: '600' }}>
                    {profile?.accountType === 'banned' ? 'Débannir ce compte' : 'Bannir ce compte'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Option : À propos de ce compte (exigence Apple 1.2) */}
              <TouchableOpacity
                onPress={() => {
                  setShowActionSheet(false);
                  Alert.alert(
                    'À propos de ce compte',
                    `Pseudo : @${profile?.pseudo ?? ''}\nMembre depuis : ${profile?.createdAt ? new Date((profile.createdAt as any)?.seconds * 1000).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : 'N/A'}\n\nGosh vérifie l'identité des coaches certifiés. Si ce compte te semble frauduleux, utilise l'option "Signaler".`,
                    [{ text: 'Fermer' }],
                  );
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.lg, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
                activeOpacity={0.7}
              >
                <Ionicons name="information-circle-outline" size={22} color={colors.text} />
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>À propos de ce compte</Text>
              </TouchableOpacity>

              {/* Annuler */}
              <TouchableOpacity
                onPress={() => setShowActionSheet(false)}
                style={{ paddingVertical: 16, alignItems: 'center', marginTop: 4 }}
                activeOpacity={0.7}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>

            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Report Modal ── */}
      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        reportedUid={uid as string}
        contentType={profile?.accountType === 'coach' ? 'coach' : 'user'}
        onBlocked={() => { setShowReportModal(false); router.back(); }}
      />

      {/* ── Action sheet mon profil ── */}
      <Modal visible={showMyActionSheet} transparent animationType="slide" onRequestClose={() => setShowMyActionSheet(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowMyActionSheet(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingBottom: 34, overflow: 'hidden' }}>
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>
              <TouchableOpacity
                onPress={async () => {
                  setShowMyActionSheet(false);
                  setBlockedLoading(true);
                  await new Promise((r) => setTimeout(r, 350));
                  setShowBlockedModal(true);
                  try {
                    const myUid = me?.uid;
                    if (!myUid) return;
                    const snap = await getDoc(doc(db, 'users', myUid));
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
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16 }}
                activeOpacity={0.7}
              >
                <Ionicons name="ban-outline" size={22} color={colors.text} />
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Comptes bloqués</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowMyActionSheet(false)} style={{ paddingVertical: 16, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: colors.border }} activeOpacity={0.7}>
                <Text style={{ color: colors.textSecondary, fontSize: 16 }}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Modal comptes bloqués ── */}
      <Modal visible={showBlockedModal} animationType="slide" onRequestClose={() => setShowBlockedModal(false)}>
        <View style={{ width: SW, height: SH, backgroundColor: colors.bg }}>
        <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
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
              <ScrollView
                contentContainerStyle={{ paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
              >
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
                    {/* Avatar — 48pt, zone tactile min 44pt */}
                    <View style={{
                      width: 48, height: 48, borderRadius: 24,
                      backgroundColor: colors.card,
                      alignItems: 'center', justifyContent: 'center',
                      marginRight: 14, overflow: 'hidden',
                    }}>
                      {u.photoUrl
                        ? <ExpoImage source={{ uri: u.photoUrl }} style={{ width: 48, height: 48 }} contentFit="cover" />
                        : <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '700' }}>{u.pseudo?.[0]?.toUpperCase() ?? '?'}</Text>}
                    </View>

                    {/* Identité */}
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', lineHeight: 20 }} numberOfLines={1}>
                        {u.prenom && u.prenom.trim() ? u.prenom : u.pseudo}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={1}>
                        @{u.pseudo}
                      </Text>
                    </View>

                    {/* Bouton débloquer — min 44pt hauteur, min 44pt largeur HIG */}
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
        </View>
      </Modal>
      {/* Modal badges streak */}
      <Modal visible={showBadgeModal} transparent animationType="fade" onRequestClose={() => setShowBadgeModal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 }} activeOpacity={1} onPress={() => setShowBadgeModal(false)}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, width: '100%', gap: 16 }}>
            {/* Titre avec logo semaine parfaite */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <FlameIcon size={28} color="#FF8C00" glowColor="#FF8C0050" active={true} />
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', flex: 1 }}>Badges de streak</Text>
              <TouchableOpacity onPress={() => setShowBadgeModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Aperçu des 4 badges en ligne */}
            {(() => {
              const { STREAK_MILESTONES, getStreakLevel } = require('../utils/streakUtils');
              const flameLevels = [7, 30, 100, 365];
              return (
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4 }}>
                  {STREAK_MILESTONES.map((b: any, i: number) => {
                    const lvl = getStreakLevel(flameLevels[i]);
                    return (
                      <View key={b.days} style={{ alignItems: 'center', gap: 4 }}>
                        <FlameIcon size={38} color={lvl.iconColor} glowColor={lvl.glowColor} active={true} />
                        <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '600' }}>{b.days}j</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })()}

            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              Connecte-toi chaque jour pour faire grandir ta streak et débloquer des badges.
            </Text>

            {/* Liste détaillée */}
            <View style={{ gap: 12 }}>
              {(() => {
                const s = profile?.loginStreak?.current ?? 0;
                const { STREAK_MILESTONES, getStreakLevel } = require('../utils/streakUtils');
                const flameLevels = [7, 30, 100, 365];
                return STREAK_MILESTONES.map((b: any, i: number) => {
                  const unlocked = s >= b.days;
                  const lvl = getStreakLevel(flameLevels[i]);
                  return (
                    <View key={b.days} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <FlameIcon size={lvl.iconSize} color={lvl.iconColor} glowColor={lvl.glowColor} active={unlocked} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: unlocked ? colors.text : colors.textSecondary, fontSize: 14, fontWeight: '700' }}>{b.label}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>{b.days} jours de connexion consécutifs</Text>
                      </View>
                      {unlocked
                        ? <Ionicons name="checkmark-circle" size={20} color={lvl.iconColor} />
                        : <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{b.days - s} j</Text>
                      }
                    </View>
                  );
                });
              })()}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

