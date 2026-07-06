import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch,
  Alert, ActivityIndicator, FlatList, Modal, TextInput, KeyboardAvoidingView, Platform, Animated, Image,
} from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors, spacing, radius } from '../constants/theme';
import { auth, db } from '../utils/firebase';
import { doc, onSnapshot, collection, getDocs, getDoc, query, where, orderBy, limit, updateDoc, writeBatch, arrayRemove } from 'firebase/firestore';
import {
  Club, ClubNotif, CLUB_CATEGORIES, ClubCategory,
  sendJoinRequest, cancelJoinRequest, acceptRequest, refuseRequest,
  leaveClub, kickMember, kickOwnerByAdmin, promoteToAdmin, demoteAdmin,
  transferOwnership, deleteClub, updateClub,
} from '../utils/clubUtils';
import { uploadImage } from '../utils/uploadImage';
import { blockUser, sendReport, REPORT_REASONS } from '../utils/reportUser';
import { banUserCompletely } from '../utils/banUser';
import UserBadge from '../components/UserBadge';

const GOSHOFF_LOGO = require('../../assets/images/logo-goshoff.png');
const GOSHOFF_COLOR = '#7C3AED';

const GoshOffLogoAnimated = React.memo(({ size = 22 }: { size?: number }) => {
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
    aGlowOp.start(); aLogo.start();
    return () => { aGlowOp.stop(); aLogo.stop(); };
  }, []);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: glowSize, height: glowSize, opacity: glowOpacity }}>
        <Svg width={glowSize} height={glowSize}>
          <Defs>
            <RadialGradient id="glow_club_goshoff" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%"   stopColor={GOSHOFF_COLOR} stopOpacity="0.65" />
              <Stop offset="35%"  stopColor={GOSHOFF_COLOR} stopOpacity="0.25" />
              <Stop offset="65%"  stopColor={GOSHOFF_COLOR} stopOpacity="0.07" />
              <Stop offset="100%" stopColor={GOSHOFF_COLOR} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx={glowSize / 2} cy={glowSize / 2} rx={glowSize / 2} ry={glowSize / 2} fill="url(#glow_club_goshoff)" />
        </Svg>
      </Animated.View>
      <Animated.Image source={GOSHOFF_LOGO} style={{ width: size, height: size, transform: [{ scale: logoScale }] }} resizeMode="contain" />
    </View>
  );
});

type MemberInfo = { uid: string; pseudo: string; prenom?: string; photoUrl?: string; accountType?: string; verified?: boolean };

export default function ClubScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const me = auth.currentUser;

  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [pendingInfos, setPendingInfos] = useState<MemberInfo[]>([]);
  const [notifs, setNotifs] = useState<ClubNotif[]>([]);
  const [myBlockedUsers, setMyBlockedUsers] = useState<string[]>([]);
  const [myBlockedBy, setMyBlockedBy] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMembers, setShowMembers] = useState(false);
  const [showScoreDetail, setShowScoreDetail] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<ClubCategory>('Musculation');
  const [editPhotoUrl, setEditPhotoUrl] = useState('');
  const [editBannerUrl, setEditBannerUrl] = useState('');
  const [editGoshOffEnabled, setEditGoshOffEnabled] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editUploadingPhoto, setEditUploadingPhoto] = useState(false);
  const [editUploadingBanner, setEditUploadingBanner] = useState(false);
  const [clubRank, setClubRank] = useState<1 | 2 | 3 | null>(null);
  const [activeGoshOff, setActiveGoshOff] = useState<{ opponentName: string; opponentPhoto: string; opponentRank: number | null } | null>(null);

  const isOwner = club?.ownerId === me?.uid;
  const isAdmin = club?.adminIds?.includes(me?.uid ?? '') ?? false;
  const isMember = isSuperAdmin || (club?.memberIds?.includes(me?.uid ?? '') ?? false);
  const hasPending = club?.pendingRequests?.includes(me?.uid ?? '') ?? false;

  const allBlocked = new Set([...myBlockedUsers, ...myBlockedBy]);

  const RANK_COLORS: Record<1 | 2 | 3, string> = { 1: '#FFB800', 2: '#A8A8A8', 3: '#CD7F32' };
  const rankColor = clubRank ? RANK_COLORS[clubRank] : null;

  // Avatar membre avec pastille du club en bas à droite
  const MemberAvatar = ({ photoUrl, pseudo, size = 44 }: { photoUrl?: string; pseudo?: string; size?: number }) => {
    const r = size / 2;
    const badgeSize = Math.round(size * 0.42);
    const badgeR = badgeSize / 2;
    return (
      <View style={{ width: size, height: size, position: 'relative' }}>
        {photoUrl
          ? <ExpoImage source={{ uri: photoUrl }} style={{ width: size, height: size, borderRadius: r }} contentFit="cover" />
          : <View style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.accent, fontWeight: '700', fontSize: size * 0.38 }}>{pseudo?.[0]?.toUpperCase()}</Text>
            </View>}
        {/* Pastille club */}
        {club && (
          <View style={{
            position: 'absolute', bottom: -2, right: -2,
            width: badgeSize, height: badgeSize, borderRadius: badgeR,
            borderWidth: 1.5, borderColor: rankColor ?? colors.border,
            backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {club.photoUrl
              ? <ExpoImage source={{ uri: club.photoUrl }} style={{ width: badgeSize - 3, height: badgeSize - 3, borderRadius: badgeR }} contentFit="cover" />
              : <View style={{ width: badgeSize - 3, height: badgeSize - 3, borderRadius: badgeR, backgroundColor: rankColor ? rankColor + '22' : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="people" size={badgeSize * 0.45} color={rankColor ?? colors.textSecondary} />
                </View>}
          </View>
        )}
      </View>
    );
  };

  useEffect(() => {
    if (!me) return;
    const unsub = onSnapshot(doc(db, 'users', me.uid), (snap) => {
      setMyBlockedUsers(snap.data()?.blockedUsers ?? []);
      setMyBlockedBy(snap.data()?.blockedBy ?? []);
      setIsSuperAdmin(snap.data()?.accountType === 'admin');
    });
    return unsub;
  }, [me]);

  // GoshOff actif du club
  useEffect(() => {
    if (!clubId) return;

    const getRankedClubs = () =>
      getDocs(query(collection(db, 'clubs'), where('weeklyScore', '>', 0), orderBy('weeklyScore', 'desc'), limit(20)))
        .then((snap) => {
          const clubs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
          clubs.sort((a: any, b: any) => ((b.weeklyScore ?? 0) / Math.max(b.memberCount, 1)) - ((a.weeklyScore ?? 0) / Math.max(a.memberCount, 1)));
          return clubs;
        })
        .catch(() => [] as any[]);

    const qC = query(collection(db, 'goshoffs'), where('challengerClubId', '==', clubId), where('status', '==', 'active'));
    const qD = query(collection(db, 'goshoffs'), where('challengedClubId', '==', clubId), where('status', '==', 'active'));

    let fromC: any = undefined;
    let fromD: any = undefined;

    const resolve = async () => {
      if (fromC === undefined || fromD === undefined) return;
      const g = fromC || fromD;
      if (!g) { setActiveGoshOff(null); return; }
      const side = fromC ? 'challenger' : 'challenged';
      const opponentId = side === 'challenger' ? g.challengedClubId : g.challengerClubId;
      let opponentName = side === 'challenger' ? g.challengedClubName : g.challengerClubName;
      let opponentPhoto = side === 'challenger' ? (g.challengedClubPhoto ?? '') : (g.challengerClubPhoto ?? '');

      // Enrichir la photo si absente
      if (!opponentPhoto) {
        try {
          const snap = await getDoc(doc(db, 'clubs', opponentId));
          if (snap.exists()) opponentPhoto = snap.data()?.photoUrl ?? '';
        } catch {}
      }

      // Rang de l'adversaire
      const ranked = await getRankedClubs();
      const idx = ranked.findIndex((c: any) => c.id === opponentId);
      const opponentRank = idx >= 0 && idx < 3 ? idx + 1 : null;

      setActiveGoshOff({ opponentName, opponentPhoto, opponentRank });
    };

    const unsubC = onSnapshot(qC, (snap) => { fromC = snap.empty ? null : snap.docs[0].data(); resolve(); }, () => {});
    const unsubD = onSnapshot(qD, (snap) => { fromD = snap.empty ? null : snap.docs[0].data(); resolve(); }, () => {});
    return () => { unsubC(); unsubD(); };
  }, [clubId]);

  // Rang du club dans le classement général (top 3 uniquement)
  useEffect(() => {
    if (!clubId) return;
    getDocs(query(collection(db, 'clubs'), where('weeklyScore', '>', 0), orderBy('weeklyScore', 'desc'), limit(20))).then((snap) => {
      const clubs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      clubs.sort((a, b) => ((b.weeklyScore ?? 0) / Math.max(b.memberCount, 1)) - ((a.weeklyScore ?? 0) / Math.max(a.memberCount, 1)));
      const idx = clubs.findIndex((d) => d.id === clubId);
      setClubRank(idx === 0 ? 1 : idx === 1 ? 2 : idx === 2 ? 3 : null);
    }).catch(() => {});
  }, [clubId]);

  useEffect(() => {
    if (!clubId) return;
    const unsub = onSnapshot(doc(db, 'clubs', clubId), async (snap) => {
      if (!snap.exists()) { router.back(); return; }
      const data = { id: snap.id, ...snap.data() } as Club;
      setClub(data);

      const uids = data.memberIds ?? [];
      if (uids.length > 0) {
        const snaps = await Promise.all(uids.map((u) => getDoc(doc(db, 'users', u))));
        setMembers(snaps.filter((s) => s.exists()).map((s) => ({ uid: s.id, ...s.data() as any })));
      } else {
        setMembers([]);
      }

      if (isAdmin || isOwner) {
        const pending = data.pendingRequests ?? [];
        if (pending.length > 0) {
          const pSnaps = await Promise.all(pending.map((u) => getDoc(doc(db, 'users', u))));
          const existing = pSnaps.filter((s) => s.exists());
          setPendingInfos(existing.map((s) => ({ uid: s.id, ...s.data() as any })));
          // Nettoyer les uids orphelins (comptes supprimés)
          const orphans = pSnaps.filter((s) => !s.exists()).map((s) => s.id);
          if (orphans.length > 0) {
            const clubRef = doc(db, 'clubs', clubId as string);
            updateDoc(clubRef, { pendingRequests: arrayRemove(...orphans) }).catch(() => {});
          }
        } else {
          setPendingInfos([]);
        }
      }

      setLoading(false);
    });
    return unsub;
  }, [clubId, isAdmin, isOwner]);

  // Marquer les notifs comme lues en temps réel (onSnapshot pour attraper les nouvelles aussi)
  useEffect(() => {
    if (!clubId || !me) return;
    const q = query(
      collection(db, 'clubs', clubId, 'notifications'),
      where('toUid', '==', me.uid),
      where('read', '==', false),
    );
    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
      batch.commit().catch(() => {});
    }, () => {});
    return unsub;
  }, [clubId, me]);

  useEffect(() => {
    if (!clubId || !me) return;
    const q = query(
      collection(db, 'clubs', clubId, 'notifications'),
      where('toUid', '==', me.uid),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClubNotif)));
    });
    return unsub;
  }, [clubId, me]);

  const openMemberMenu = (m: MemberInfo) => {
    const isAdminMember = club?.adminIds?.includes(m.uid) ?? false;
    const isBlocked = myBlockedUsers.includes(m.uid);
    const options: any[] = [{ text: 'Annuler', style: 'cancel' }];

    if (isSuperAdmin) {
      // Compte admin app : exclure + bannir directement
      options.push({
        text: 'Exclure du club',
        style: 'destructive',
        onPress: () => {
          const isOwnerTarget = club?.ownerId === m.uid;
          const msg = isOwnerTarget
            ? 'Ce membre est propriétaire du club. La propriété sera transférée automatiquement au prochain admin, ou le club sera supprimé s\'il est seul membre.'
            : 'Ce membre sera retiré du club.';
          Alert.alert(`Exclure @${m.pseudo} ?`, msg, [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Exclure', style: 'destructive', onPress: async () => {
                try {
                  if (isOwnerTarget) {
                    const result = await kickOwnerByAdmin(clubId!);
                    if (result === 'deleted') {
                      Alert.alert('Club supprimé', 'Le propriétaire était le seul membre. Le club a été supprimé.');
                      router.back();
                    } else {
                      Alert.alert('Propriété transférée', 'Le propriétaire a été exclu et la propriété transférée au prochain admin.');
                    }
                  } else {
                    await kickMember(clubId!, m.uid);
                  }
                } catch (e: any) {
                  Alert.alert('Erreur', e.message);
                }
              },
            },
          ]);
        },
      });
      const memberIsBanned = (m as any).accountType === 'banned';
      options.push({
        text: memberIsBanned ? 'Débannir ce compte' : 'Bannir ce compte',
        style: 'destructive',
        onPress: () => Alert.alert(
          memberIsBanned ? `Débannir @${m.pseudo} ?` : `Bannir @${m.pseudo} ?`,
          memberIsBanned ? 'Ce compte retrouvera un accès normal.' : 'Ce compte sera suspendu immédiatement.',
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: memberIsBanned ? 'Débannir' : 'Bannir',
              style: memberIsBanned ? 'default' : 'destructive',
              onPress: async () => {
                try {
                  if (memberIsBanned) {
                    await updateDoc(doc(db, 'users', m.uid), { accountType: 'standard' });
                  } else {
                    await banUserCompletely(m.uid, m.pseudo);
                  }
                  Alert.alert(memberIsBanned ? 'Compte débanni' : 'Compte banni');
                } catch {
                  Alert.alert('Erreur', 'Impossible d\'effectuer cette action.');
                }
              },
            },
          ],
        ),
      });
    } else {
      // Actions modération (admin/owner du club)
      if ((isAdmin || isOwner) && club?.ownerId !== m.uid) {
        if (isOwner && !isAdminMember) options.push({ text: 'Promouvoir admin', onPress: () => promoteToAdmin(clubId!, m.uid).catch((e: any) => Alert.alert('Erreur', e.message)) });
        if (isOwner && isAdminMember) options.push({ text: 'Rétrograder', onPress: () => demoteAdmin(clubId!, m.uid).catch((e: any) => Alert.alert('Erreur', e.message)) });
        options.push({ text: 'Exclure du club', style: 'destructive', onPress: () =>
          Alert.alert(`Exclure @${m.pseudo} ?`, 'Cette personne recevra une notification.', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Exclure', style: 'destructive', onPress: () => kickMember(clubId!, m.uid).catch((e: any) => Alert.alert('Erreur', e.message)) },
          ])
        });
      }

      // Bloquer / Signaler — membres standard
      options.push({
        text: isBlocked ? 'Débloquer' : 'Bloquer',
        onPress: () => Alert.alert(
          isBlocked ? `Débloquer @${m.pseudo} ?` : `Bloquer @${m.pseudo} ?`,
          isBlocked ? 'Vous reverrez ses messages.' : 'Ses messages ne seront plus visibles.',
          [
            { text: 'Annuler', style: 'cancel' },
            { text: isBlocked ? 'Débloquer' : 'Bloquer', style: 'destructive', onPress: () => blockUser(m.uid).catch(() => {}) },
          ]
        ),
      });
      options.push({
        text: 'Signaler',
        onPress: () => Alert.alert('Signaler', 'Choisissez une raison', [
          { text: 'Annuler', style: 'cancel' },
          ...REPORT_REASONS.map((r) => ({
            text: r.label,
            onPress: () => sendReport({ reportedUid: m.uid, reportedPseudo: m.pseudo, contentType: 'user', clubId: clubId ?? undefined, reason: r.key })
              .then(() => Alert.alert('Signalement envoyé', 'Merci, notre équipe va examiner ce compte.'))
              .catch(() => {}),
          })),
        ]),
      });
    }

    Alert.alert(m.prenom ?? m.pseudo, `@${m.pseudo}`, options);
  };

  const openEdit = () => {
    if (!club) return;
    setEditName(club.name);
    setEditDescription(club.description ?? '');
    setEditCategory(club.category);
    setEditPhotoUrl(club.photoUrl ?? '');
    setEditBannerUrl(club.bannerUrl ?? '');
    setEditGoshOffEnabled(club.goshOffEnabled ?? false);
    setShowEdit(true);
  };

  const handleEditPhoto = async () => {
    const { launchImageLibraryAsync, requestMediaLibraryPermissionsAsync } = await import('expo-image-picker');
    const { status } = await requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission refusée'); return; }
    const result = await launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setEditUploadingPhoto(true);
    try {
      const url = await uploadImage(result.assets[0].uri, 'clubs');
      setEditPhotoUrl(url);
    } catch { Alert.alert('Erreur', 'Impossible d\'uploader la photo.'); }
    finally { setEditUploadingPhoto(false); }
  };

  const handleEditBanner = async () => {
    const { launchImageLibraryAsync, requestMediaLibraryPermissionsAsync } = await import('expo-image-picker');
    const { status } = await requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission refusée'); return; }
    const result = await launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [3, 1], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setEditUploadingBanner(true);
    try {
      const url = await uploadImage(result.assets[0].uri, 'clubs');
      setEditBannerUrl(url);
    } catch { Alert.alert('Erreur', 'Impossible d\'uploader la bannière.'); }
    finally { setEditUploadingBanner(false); }
  };

  const handleEditSave = async () => {
    if (!clubId || !editName.trim()) return;
    setEditSaving(true);
    try {
      await updateClub(clubId, {
        name: editName,
        description: editDescription,
        category: editCategory,
        photoUrl: editPhotoUrl,
        bannerUrl: editBannerUrl,
        goshOffEnabled: editGoshOffEnabled,
      });
      setShowEdit(false);
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleJoin = async () => {
    if (!clubId) return;
    try {
      await sendJoinRequest(clubId);
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    }
  };

  const handleCancel = async () => {
    if (!clubId) return;
    await cancelJoinRequest(clubId);
  };

  const handleLeave = async () => {
    if (!clubId) return;
    if (isOwner) {
      const admins = (club?.adminIds ?? []).filter((u) => u !== me?.uid);
      if (admins.length === 0) {
        Alert.alert('Impossible de quitter', 'Vous êtes le seul admin. Nommez un autre admin avant de quitter.');
        return;
      }
      setShowTransfer(true);
      return;
    }
    Alert.alert('Quitter le club', 'Tu pourras re-demander à rejoindre plus tard.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Quitter', style: 'destructive', onPress: async () => {
        try { await leaveClub(clubId); router.back(); }
        catch (e: any) { Alert.alert('Erreur', e.message); }
      }},
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Supprimer le club', 'Cette action est irréversible. Tous les membres seront notifiés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        if (!clubId) return;
        await deleteClub(clubId);
        router.back();
      }},
    ]);
  };

  const visibleMembers = members.filter((m) => !allBlocked.has(m.uid));

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
        <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={{ width: 44 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' }} numberOfLines={1}>
          {club?.name}
        </Text>
        <TouchableOpacity
          onPress={() => {
            if (isOwner || isSuperAdmin) {
              Alert.alert(club?.name ?? 'Club', undefined, [
                ...(isOwner ? [{ text: 'Modifier le club', onPress: openEdit }] : []),
                { text: 'Supprimer le club', style: 'destructive' as const, onPress: handleDelete },
                { text: 'Annuler', style: 'cancel' as const },
              ]);
            } else {
              Alert.alert(club?.name ?? 'Club', undefined, [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Signaler ce club',
                  style: 'destructive',
                  onPress: () => Alert.alert('Signaler', 'Motif du signalement', [
                    { text: 'Annuler', style: 'cancel' },
                    ...REPORT_REASONS.map((r) => ({
                      text: r.label,
                      onPress: () => sendReport({
                        reportedUid: club!.ownerId,
                        contentType: 'club',
                        contentId: clubId ?? undefined,
                        contentText: club!.name,
                        clubId: clubId ?? undefined,
                        reason: r.key,
                      }).catch(() => {}),
                    })),
                  ]),
                },
              ]);
            }
          }}
          style={{ width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Hero */}
        {(() => {
          const MEDAL: Record<1 | 2 | 3, { color: string; bg: string }> = {
            1: { color: '#FFB800', bg: '#FFB80020' },
            2: { color: '#A8A8A8', bg: '#A8A8A820' },
            3: { color: '#CD7F32', bg: '#CD7F3220' },
          };
          const medal = clubRank ? MEDAL[clubRank] : null;
          const BANNER_H = 160;
          const PHOTO_SIZE = 96;
          const OVERLAP = 32;
          return (
            <View style={{ marginBottom: 4 }}>
              {/* Bannière */}
              <View style={{ width: '100%', height: BANNER_H, backgroundColor: colors.card, overflow: 'hidden', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
                {club?.bannerUrl
                  ? <ExpoImage source={{ uri: club.bannerUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  : <View style={{ flex: 1, backgroundColor: colors.accent + '18' }} />}
              </View>

              {/* Photo de profil chevauchante */}
              <View style={{ alignItems: 'center', marginTop: -(PHOTO_SIZE / 2 + OVERLAP / 2), paddingBottom: 16, gap: 10 }}>
                <View style={{ position: 'relative' }}>
                  {/* Halo — anneau + ombre */}
                  <View style={{
                    position: 'absolute',
                    top: -4, left: -4, right: -4, bottom: -4,
                    borderRadius: (PHOTO_SIZE / 2) + 4,
                    backgroundColor: colors.bg,
                    shadowColor: '#000',
                    shadowOpacity: 0.35,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 6 },
                  }} />
                  {club?.photoUrl
                    ? <ExpoImage
                        source={{ uri: club.photoUrl }}
                        style={{ width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: PHOTO_SIZE / 2, borderWidth: medal ? 2.5 : 0, borderColor: medal?.color }}
                        contentFit="cover"
                      />
                    : <View style={{ width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: PHOTO_SIZE / 2, backgroundColor: medal ? medal.bg : colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: medal ? 2.5 : 0, borderColor: medal?.color }}>
                        <Ionicons name="people" size={40} color={medal ? medal.color : colors.accent} />
                      </View>}
                  {medal && (
                    <View style={{
                      position: 'absolute', bottom: 0, right: 0,
                      backgroundColor: medal.color, borderRadius: 14,
                      paddingHorizontal: 7, paddingVertical: 3,
                      borderWidth: 2, borderColor: colors.bg,
                      shadowColor: medal.color, shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
                    }}>
                      <Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>#{clubRank}</Text>
                    </View>
                  )}
                </View>

                <View style={{ alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{club?.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>{club?.category}</Text>
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{(club?.memberIds ?? []).length} membre{(club?.memberIds ?? []).length > 1 ? 's' : ''}</Text>
                  </View>
                  {activeGoshOff && (() => {
                    const MEDAL_COLORS: Record<number, string> = { 1: '#FFB800', 2: '#A8A8A8', 3: '#CD7F32' };
                    const medalColor = activeGoshOff.opponentRank ? MEDAL_COLORS[activeGoshOff.opponentRank] : null;
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#7C3AED18', borderRadius: 20, borderWidth: 1, borderColor: '#7C3AED55', paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ color: '#7C3AED', fontSize: 12, fontWeight: '700' }}>GoshOff en cours vs</Text>
                        <View style={{ position: 'relative' }}>
                          {activeGoshOff.opponentPhoto
                            ? <ExpoImage source={{ uri: activeGoshOff.opponentPhoto }} style={{ width: 22, height: 22, borderRadius: 11, borderWidth: medalColor ? 1.5 : 0, borderColor: medalColor ?? 'transparent' }} contentFit="cover" />
                            : <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#7C3AED22', alignItems: 'center', justifyContent: 'center', borderWidth: medalColor ? 1.5 : 0, borderColor: medalColor ?? 'transparent' }}>
                                <Ionicons name="people" size={11} color={medalColor ?? '#7C3AED'} />
                              </View>}
                          {medalColor && (
                            <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: medalColor, borderRadius: 6, paddingHorizontal: 2, paddingVertical: 0.5, borderWidth: 1, borderColor: '#7C3AED18' }}>
                              <Text style={{ color: '#000', fontSize: 7, fontWeight: '900' }}>#{activeGoshOff.opponentRank}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ color: '#7C3AED', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{activeGoshOff.opponentName}</Text>
                      </View>
                    );
                  })()}
                </View>

                {/* Slogan */}
                {club?.description ? (
                  <View style={{ alignItems: 'center', paddingHorizontal: 28 }}>
                    <Text style={{
                      color: colors.text,
                      fontSize: 15,
                      fontStyle: 'italic',
                      fontWeight: '500',
                      textAlign: 'center',
                      lineHeight: 22,
                      opacity: 0.85,
                    }}>
                      {`"${club.description}"`}
                    </Text>
                  </View>
                ) : null}

                {/* CTA */}
                {isMember ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={() => router.push({ pathname: '/club-chat', params: { clubId } })}
                      style={{ backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Chat du club</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleLeave}
                      style={{ backgroundColor: colors.card, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                      <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 15 }}>Quitter</Text>
                    </TouchableOpacity>
                  </View>
                ) : hasPending ? (
                  <TouchableOpacity onPress={handleCancel}
                    style={{ backgroundColor: colors.card, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                    <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 15 }}>Demande envoyée — Annuler</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={handleJoin}
                    style={{ backgroundColor: colors.accent, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Rejoindre</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })()}

        {/* Demandes en attente — admins/proprio */}
        {(isAdmin || isOwner) && pendingInfos.length > 0 && (
          <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <TouchableOpacity onPress={() => setShowRequests(true)}
              style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FF9500', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{pendingInfos.length}</Text>
                </View>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>Demandes en attente</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Score du club — accordéon */}
        {isMember && (
          <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>
            {/* Header — toujours visible */}
            <TouchableOpacity
              onPress={() => setShowScoreDetail((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 }}
              activeOpacity={0.7}
            >
              <Ionicons name="trophy-outline" size={18} color={colors.accent} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 }}>Score de la semaine</Text>
              <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '800' }}>{club?.weeklyScore ?? 0} pts</Text>
              <Ionicons name={showScoreDetail ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Détail déroulant */}
            {showScoreDetail && (
              <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                  Fais monter le classement de ton club en étant actif dans l'app chaque jour.
                </Text>
                <View style={{ gap: 7 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '800' }}>+10</Text>
                    </View>
                    <Text style={{ color: colors.text, fontSize: 13 }}>Valider une séance d'entraînement</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#FF6B3520', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#FF6B35', fontSize: 12, fontWeight: '800' }}>+2</Text>
                    </View>
                    <Text style={{ color: colors.text, fontSize: 13 }}>Maintenir ta streak quotidienne</Text>
                  </View>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 16 }}>
                  Le classement est basé sur le score moyen par membre — un petit club très actif peut battre un grand club passif. Repart à zéro chaque lundi.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Membres */}
        <View style={{ marginHorizontal: 16 }}>
          <TouchableOpacity onPress={() => setShowMembers(true)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>Membres</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {visibleMembers.slice(0, 5).map((m) => (
            <View key={m.uid} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <TouchableOpacity onPress={() => router.push({ pathname: '/profile', params: { uid: m.uid } })}>
                <MemberAvatar photoUrl={m.photoUrl} pseudo={m.pseudo} size={44} />
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push({ pathname: '/profile', params: { uid: m.uid } })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{m.prenom ?? m.pseudo}</Text>
                  <UserBadge accountType={m.accountType} verified={m.verified} size={14} />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>@{m.pseudo}</Text>
              </TouchableOpacity>
              {club?.ownerId === m.uid && <Ionicons name="star" size={16} color={colors.accent} />}
              {club?.adminIds?.includes(m.uid) && club.ownerId !== m.uid && <Ionicons name="shield-checkmark" size={16} color={colors.textSecondary} />}
              {((isAdmin || isOwner || isSuperAdmin) && m.uid !== me?.uid && (isSuperAdmin || club?.ownerId !== m.uid)) && (
                <TouchableOpacity onPress={() => openMemberMenu(m)} style={{ padding: 4 }}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {visibleMembers.length > 5 && (
            <TouchableOpacity onPress={() => setShowMembers(true)} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>Voir tous les membres ({visibleMembers.length})</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Modal membres */}
      <Modal visible={showMembers} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
          <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
            <TouchableOpacity onPress={() => setShowMembers(false)} style={{ width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </TouchableOpacity>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' }}>Membres</Text>
            <View style={{ width: 44 }} />
          </View>
          <FlatList
            data={visibleMembers}
            keyExtractor={(m) => m.uid}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: m }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, minHeight: 72 }}>
                <TouchableOpacity onPress={() => { setShowMembers(false); router.push({ pathname: '/profile', params: { uid: m.uid } }); }}>
                  <MemberAvatar photoUrl={m.photoUrl} pseudo={m.pseudo} size={48} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{m.prenom ?? m.pseudo}</Text>
                    <UserBadge accountType={m.accountType} verified={m.verified} size={14} />
                    {club?.ownerId === m.uid && <Ionicons name="star" size={15} color={colors.accent} />}
                    {club?.adminIds?.includes(m.uid) && club.ownerId !== m.uid && <Ionicons name="shield-checkmark" size={15} color={colors.textSecondary} />}
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>@{m.pseudo}</Text>
                </View>
                {(isAdmin || isOwner) && m.uid !== me?.uid && club?.ownerId !== m.uid && (
                  <TouchableOpacity onPress={() => openMemberMenu(m)} style={{ padding: 4 }}>
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* Modal demandes */}
      <Modal visible={showRequests} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
          <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
            <TouchableOpacity onPress={() => setShowRequests(false)} style={{ width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </TouchableOpacity>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' }}>Demandes</Text>
            <View style={{ width: 44 }} />
          </View>
          <FlatList
            data={pendingInfos.filter((p) => !allBlocked.has(p.uid))}
            keyExtractor={(m) => m.uid}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}><Text style={{ color: colors.textSecondary }}>Aucune demande</Text></View>}
            renderItem={({ item: m }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, minHeight: 72 }}>
                {m.photoUrl
                  ? <ExpoImage source={{ uri: m.photoUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} contentFit="cover" />
                  : <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '700' }}>{m.pseudo?.[0]?.toUpperCase()}</Text>
                    </View>}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{m.prenom ?? m.pseudo}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>@{m.pseudo}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => refuseRequest(clubId!, m.uid)}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                    <Ionicons name="close" size={20} color={colors.danger} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => acceptRequest(clubId!, m.uid).catch((e) => Alert.alert('Erreur', e.message))}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* Modal édition club — propriétaire uniquement */}
      <Modal visible={showEdit} animationType="slide" presentationStyle="fullScreen">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
            <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
              <TouchableOpacity onPress={() => setShowEdit(false)} style={{ width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' }}>Modifier le club</Text>
              <TouchableOpacity onPress={handleEditSave} disabled={editSaving || !editName.trim()} style={{ width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
                {editSaving
                  ? <ActivityIndicator size="small" color={colors.accent} />
                  : <Text style={{ color: editName.trim() ? colors.accent : colors.textSecondary, fontWeight: '700', fontSize: 16 }}>OK</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
              {/* Bannière */}
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>Bannière</Text>
                <TouchableOpacity onPress={handleEditBanner} activeOpacity={0.8} style={{ position: 'relative', width: '100%', height: 110, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  {editBannerUrl
                    ? <ExpoImage source={{ uri: editBannerUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    : <View style={{ alignItems: 'center', gap: 6 }}>
                        <Ionicons name="image-outline" size={28} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Ajouter une bannière</Text>
                      </View>}
                  <View style={{ position: 'absolute', bottom: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    {editUploadingBanner
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="camera" size={16} color="#fff" />}
                  </View>
                </TouchableOpacity>
              </View>

              {/* Photo */}
              <View style={{ alignItems: 'center' }}>
                <TouchableOpacity onPress={handleEditPhoto} activeOpacity={0.8} style={{ position: 'relative' }}>
                  {editPhotoUrl
                    ? <ExpoImage source={{ uri: editPhotoUrl }} style={{ width: 100, height: 100, borderRadius: 50 }} contentFit="cover" />
                    : <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                        <Ionicons name="people" size={40} color={colors.accent} />
                      </View>}
                  <View style={{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    {editUploadingPhoto
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="camera" size={16} color="#fff" />}
                  </View>
                </TouchableOpacity>
              </View>

              {/* Nom */}
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>Nom du club</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  maxLength={40}
                  placeholder="Nom du club"
                  placeholderTextColor={colors.textSecondary}
                  style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 15 }}
                />
              </View>

              {/* Description */}
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>Description</Text>
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  maxLength={200}
                  multiline
                  numberOfLines={4}
                  placeholder="Décris ton club…"
                  placeholderTextColor={colors.textSecondary}
                  style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 15, minHeight: 100, textAlignVertical: 'top' }}
                />
              </View>

              {/* Catégorie */}
              <View style={{ gap: 10 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>Catégorie</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {CLUB_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setEditCategory(cat)}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: editCategory === cat ? colors.accent : colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: editCategory === cat ? colors.accent : colors.border }}
                    >
                      <Text style={{ color: editCategory === cat ? '#fff' : colors.text, fontSize: 13, fontWeight: '500' }}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* GoshOff */}
              <View style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <GoshOffLogoAnimated size={20} />
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>GoshOff activé</Text>
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
                      Ton club apparaît dans la liste des clubs prêts à relever un défi
                    </Text>
                  </View>
                  <Switch
                    value={editGoshOffEnabled}
                    onValueChange={setEditGoshOffEnabled}
                    trackColor={{ false: colors.border, true: '#7C3AED' }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal transfert propriété */}
      <Modal visible={showTransfer} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
          <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
            <TouchableOpacity onPress={() => setShowTransfer(false)} style={{ width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </TouchableOpacity>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' }}>Transférer la propriété</Text>
            <View style={{ width: 44 }} />
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 14, padding: 16, lineHeight: 20 }}>
            Choisissez un admin à qui transférer la propriété du club avant de quitter.
          </Text>
          <FlatList
            data={members.filter((m) => club?.adminIds?.includes(m.uid) && m.uid !== me?.uid)}
            keyExtractor={(m) => m.uid}
            renderItem={({ item: m }) => (
              <TouchableOpacity onPress={() => Alert.alert(`Transférer à @${m.pseudo} ?`, 'Vous deviendrez simple membre.', [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Transférer', onPress: async () => {
                  await transferOwnership(clubId!, m.uid);
                  await leaveClub(clubId!);
                  router.back();
                }},
              ])}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, minHeight: 72 }}>
                {m.photoUrl
                  ? <ExpoImage source={{ uri: m.photoUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} contentFit="cover" />
                  : <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '700' }}>{m.pseudo?.[0]?.toUpperCase()}</Text>
                    </View>}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{m.prenom ?? m.pseudo}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>@{m.pseudo}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
