import React, { useState, useEffect, useRef, useMemo } from 'react';
import Constants from 'expo-constants';
import UserBadge from '../components/UserBadge';
import ReportModal from '../components/ReportModal';
import { blockUser } from '../utils/reportUser';
import { getBadgeInfo } from '../utils/badgeCache';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Alert,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Dimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
const { width: SW } = Dimensions.get('window');

function VerifiedBadge({ uid }: { uid?: string }) {
  const [info, setInfo] = useState<{ accountType?: string; verified?: boolean } | null>(null);
  useEffect(() => { if (uid) getBadgeInfo(uid).then(setInfo); }, [uid]);
  if (!info) return null;
  return <UserBadge accountType={info.accountType} verified={info.verified} size={16} />;
}
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors, colors, spacing } from '../constants/theme';
import { auth, db } from '../utils/firebase';
import { getCachedPhoto, fetchAndCachePhoto, setCachedPhoto } from '../utils/photoCache';
import {
  collection, query, orderBy, onSnapshot, addDoc,
  serverTimestamp, doc, setDoc, updateDoc, getDoc,
} from 'firebase/firestore';

function BackIcon() {
  return <Ionicons name="chevron-back" size={24} color={colors.text} />;
}

function PhotoIcon() {
  return <Ionicons name="image-outline" size={24} color={colors.textSecondary} />;
}

function GifIcon() {
  return <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12 }}>GIF</Text>;
}

function SendIcon() {
  return <Ionicons name="send" size={20} color={colors.text} />;
}

const GIPHY_KEY: string = Constants.expoConfig?.extra?.giphyApiKey ?? '';

type WorkoutExerciseSnap = { name: string; mode: 'sets' | '1rm'; sets?: { reps: number; kg: number; done: boolean }[]; oneRmKg?: number };

type Message = {
  id: string;
  uid: string;
  pseudo: string;
  prenom?: string;
  senderPhoto?: string;
  photoUrl?: string;
  content: string;
  imageUrl?: string;
  gifUrl?: string;
  type?: 'workout';
  workoutSessionName?: string;
  workoutTonnage?: number;
  workoutDate?: string;
  workoutExercises?: WorkoutExerciseSnap[];
  createdAt: any;
};

function WorkoutMessageCard({ item, colors }: { item: Message; colors: any }) {
  const [expanded, setExpanded] = useState(false);
  const exercises = item.workoutExercises ?? [];
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden', maxWidth: '90%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        {item.senderPhoto
          ? <ExpoImage source={{ uri: item.senderPhoto }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
          : <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person" size={20} color={colors.accent} /></View>
        }
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{item.prenom || item.pseudo}</Text>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{item.workoutSessionName}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}>
            {item.workoutDate ? new Date(item.workoutDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }) : ''}
          </Text>
        </View>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent + '15', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="barbell-outline" size={16} color={colors.accent} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
        <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 12, padding: 10, alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '600' }}>TONNAGE</Text>
          <Text style={{ color: colors.accent, fontSize: 17, fontWeight: '800', marginTop: 2 }}>{item.workoutTonnage ?? 0} kg</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 12, padding: 10, alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '600' }}>EXERCICES</Text>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 2 }}>{exercises.length}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.75}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{expanded ? 'Masquer le détail' : 'Voir le détail'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} />
      </TouchableOpacity>
      {expanded && (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: 14, paddingBottom: 12, gap: 10, paddingTop: 10 }}>
          {exercises.map((ex, i) => (
            <View key={i} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800' }}>{i + 1}</Text>
                </View>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{ex.name}</Text>
              </View>
              {ex.mode === '1rm' ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 26 }}>
                  <Text style={{ color: '#FFB800', fontWeight: '700' }}>{ex.oneRmKg} kg</Text> · 1 répétition
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 26 }}>
                  {(ex.sets ?? []).filter(s => s.done).map((s, si) => (
                    <View key={si} style={{ backgroundColor: colors.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{s.reps}×<Text style={{ color: colors.text, fontWeight: '700' }}>{s.kg}kg</Text></Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function getChatId(uid1: string, uid2: string) {
  return [uid1, uid2].sort().join('_');
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { otherUid, otherPseudo } = useLocalSearchParams<{ otherUid: string; otherPseudo: string }>();
  const router = useRouter();
  const me = auth.currentUser;
  const chatId = me && otherUid ? getChatId(me.uid, otherUid) : '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [myPseudo, setMyPseudo] = useState('');
  const [myPhoto, setMyPhoto] = useState<string | null>(null);
  const [otherPhoto, setOtherPhoto] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [iBlockedThem, setIBlockedThem] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [reportMessageText, setReportMessageText] = useState<string | undefined>(undefined);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showCoachPopup, setShowCoachPopup] = useState(false);
  const listRef = useRef<FlatList>(null);

  // Load pseudos and photos — cache global d'abord, puis listener temps réel
  useEffect(() => {
    if (!me || !otherUid) return;

    // Affichage immédiat depuis cache si dispo
    const cachedMy = getCachedPhoto(me.uid);
    if (cachedMy) setMyPhoto(cachedMy);
    const cachedOther = getCachedPhoto(otherUid);
    if (cachedOther) setOtherPhoto(cachedOther);

    const unsubMe = onSnapshot(doc(db, 'users', me.uid), (s) => {
      if (s.exists()) {
        setMyPseudo(s.data().pseudo ?? '');
        const url = s.data().photoUrl ?? null;
        setMyPhoto(url);
        if (url) setCachedPhoto(me.uid, url);
        const blocked: string[] = s.data().blockedUsers ?? [];
        const blockedBy: string[] = s.data().blockedBy ?? [];
        setIBlockedThem(blocked.includes(otherUid));
        setIsBlocked(blocked.includes(otherUid) || blockedBy.includes(otherUid));
      }
    }, () => {});
    const unsubOther = onSnapshot(doc(db, 'users', otherUid), async (s) => {
      if (s.exists()) {
        const url = s.data().photoUrl ?? null;
        setOtherPhoto(url);
        if (url) setCachedPhoto(otherUid, url);
        if (s.data().accountType === 'coach' && chatId) {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          const seen = await AsyncStorage.getItem(`coach_chat_popup_${chatId}`);
          if (!seen) setShowCoachPopup(true);
        }
      }
    }, () => {});
    return () => { unsubMe(); unsubOther(); };
  }, [me, otherUid]);

  useEffect(() => {
    if (!chatId || !me) return;
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'));
    const markRead = () => updateDoc(doc(db, 'chats', chatId), {
      [`lastSeenAt_${me.uid}`]: serverTimestamp(),
    }).catch(() => {});
    markRead();
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)));
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      markRead();
    }, () => {});
    return unsub;
  }, [chatId, me]);

  const sendPhoto = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const FileSystem = await import('expo-file-system/legacy');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images' as any, quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      setUploadingMedia(true);
      const base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      const resp = await fetch('https://api.cloudinary.com/v1_1/dwxlslwfv/image/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: `data:image/jpeg;base64,${base64}`, upload_preset: 'fluide_posts', folder: 'chat' }),
      });
      const data = await resp.json();
      if (data.secure_url) {
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          uid: me!.uid, pseudo: myPseudo, imageUrl: data.secure_url, content: '', createdAt: serverTimestamp(),
        });
        await setDoc(doc(db, 'chats', chatId), {
          participants: [me!.uid, otherUid], lastMessage: '📷 Photo', lastMessageAt: serverTimestamp(),
          lastSenderUid: me!.uid, [`pseudo_${me!.uid}`]: myPseudo, [`pseudo_${otherUid}`]: otherPseudo,
          [`lastSeenAt_${me!.uid}`]: serverTimestamp(),
        }, { merge: true });
      }
    } catch {}
    finally { setUploadingMedia(false); }
  };

  const searchGifs = async (q: string) => {
    setGifLoading(true);
    try {
      const endpoint = q.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=24&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=g`;
      const r = await fetch(endpoint);
      const d = await r.json();
      setGifs(d.data ?? []);
    } catch {}
    setGifLoading(false);
  };

  const sendGif = async (gifUrl: string) => {
    setShowGif(false);
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      uid: me!.uid, pseudo: myPseudo, gifUrl, content: '', createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'chats', chatId), {
      participants: [me!.uid, otherUid], lastMessage: '🎞 GIF', lastMessageAt: serverTimestamp(),
      lastSenderUid: me!.uid, [`pseudo_${me!.uid}`]: myPseudo, [`pseudo_${otherUid}`]: otherPseudo,
      [`lastSeenAt_${me!.uid}`]: serverTimestamp(),
    }, { merge: true });
  };

  const sendMessage = async () => {
    if (!text.trim() || !me || !chatId) return;
    setSending(true);
    const content = text.trim();
    setText('');
    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        uid: me.uid,
        pseudo: myPseudo || me.email || 'Moi',
        photoUrl: myPhoto,
        content,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'chats', chatId), {
        participants: [me.uid, otherUid],
        lastMessage: content,
        lastMessageAt: serverTimestamp(),
        lastSenderUid: me.uid,
        [`pseudo_${me.uid}`]: myPseudo || me.email || 'Moi',
        [`pseudo_${otherUid}`]: otherPseudo,
        [`lastSeenAt_${me.uid}`]: serverTimestamp(),
      }, { merge: true });
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ts: any) => {
    if (!ts?.toDate) return '';
    const d = ts.toDate();
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row' as const, alignItems: 'center' as const,
      paddingHorizontal: spacing.md, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
      gap: spacing.sm,
      backgroundColor: colors.bg,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
    headerInfo: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
    headerAvatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: colors.accent + '22',
      alignItems: 'center' as const, justifyContent: 'center' as const,
      borderWidth: 2, borderColor: colors.accent + '55',
    },
    headerAvatarImg: { width: 36, height: 36, borderRadius: 18 },
    headerAvatarText: { color: colors.accent, fontSize: 15, fontWeight: '800' as const },
    headerName: { color: colors.text, fontSize: 16, fontWeight: '700' as const, letterSpacing: -0.2 },
    msgRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 8 },
    msgRowMe: { flexDirection: 'row-reverse' as const },
    senderName: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' as const, marginBottom: 3, marginLeft: 6 },
    msgAvatar: {
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: colors.card,
      alignItems: 'center' as const, justifyContent: 'center' as const,
      flexShrink: 0,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    },
    msgAvatarImg: { width: 30, height: 30, borderRadius: 15 },
    msgAvatarText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' as const },
    bubble: {
      alignSelf: 'flex-start' as const,
      backgroundColor: colors.card,
      borderRadius: 20, borderBottomLeftRadius: 5,
      paddingHorizontal: 14, paddingVertical: 10,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    },
    bubbleMe: {
      alignSelf: 'flex-end' as const,
      backgroundColor: colors.accent,
      borderColor: 'transparent',
      borderBottomLeftRadius: 20, borderBottomRightRadius: 5,
      shadowColor: colors.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6,
    },
    bubbleText: { color: colors.text, fontSize: 15, lineHeight: 22 },
    bubbleTextMe: { color: '#fff' },
    bubbleTime: { color: colors.textSecondary, fontSize: 10, marginTop: 4, textAlign: 'right' as const },
    bubbleTimeMe: { color: 'rgba(255,255,255,0.65)' },
    inputRow: {
      flexDirection: 'row' as const, gap: 8, paddingHorizontal: spacing.md, paddingTop: 10,
      paddingBottom: 10,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
      alignItems: 'flex-end' as const, backgroundColor: colors.bg,
    },
    rightActions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2, marginBottom: 2 },
    mediaBtn: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
    input: {
      flex: 1, backgroundColor: colors.card, borderRadius: 22,
      paddingHorizontal: 16, paddingVertical: 12,
      color: colors.text, fontSize: 16,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
      maxHeight: 120, minHeight: 44,
    },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center' as const, justifyContent: 'center' as const },
    sendBtnDisabled: { opacity: 0.35 },
  }), [colors]);

  const dismissCoachPopup = async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(`coach_chat_popup_${chatId}`, '1');
    setShowCoachPopup(false);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>

      {/* ── Pop-up coaching ── */}
      <Modal visible={showCoachPopup} transparent animationType="fade" onRequestClose={dismissCoachPopup}>
        <View style={{ flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 24, width: '100%', overflow: 'hidden' }}>
            {/* Bande accent */}
            <View style={{ height: 4, backgroundColor: colors.accent }} />
            <View style={{ padding: 24, gap: 16 }}>
              {/* Titre */}
              <View style={{ alignItems: 'center', gap: 8 }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="shield-checkmark-outline" size={26} color={colors.accent} />
                </View>
                <Text style={{ color: colors.text, fontSize: 19, fontWeight: '900', textAlign: 'center', letterSpacing: -0.3 }}>
                  Gosh Coaching
                </Text>
              </View>
              {/* Corps */}
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.accent} style={{ marginTop: 1 }} />
                  <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, flex: 1 }}>
                    <Text style={{ fontWeight: '700' }}>@{otherPseudo}</Text> est un coach certifié vérifié par Gosh. Son diplôme a été contrôlé avant l'activation de son compte.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <Ionicons name="ribbon-outline" size={18} color={colors.accent} style={{ marginTop: 1 }} />
                  <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, flex: 1 }}>
                    En rejoignant Gosh, ce coach s'est engagé à respecter une charte de professionnalisme et de bienveillance envers ses élèves.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <Ionicons name="flag-outline" size={18} color={colors.textSecondary} style={{ marginTop: 1 }} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, flex: 1 }}>
                    Un problème ? Signale ce coach via le menu en haut à droite de la conversation.
                  </Text>
                </View>
              </View>
              {/* Bouton */}
              <TouchableOpacity
                onPress={dismissCoachPopup}
                activeOpacity={0.85}
                style={{ backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Commencer la conversation</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <BackIcon />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.headerInfo, { flex: 1 }]} onPress={() => !isBlocked && router.push({ pathname: '/profile', params: { uid: otherUid } })} activeOpacity={isBlocked ? 1 : 0.8}>
          <View style={[styles.headerAvatar, isBlocked && { opacity: 0.35 }]}>
            {!isBlocked && otherPhoto
              ? <ExpoImage source={{ uri: otherPhoto }} style={styles.headerAvatarImg} contentFit="cover" cachePolicy="memory-disk" />
              : isBlocked
                ? <Ionicons name="person" size={20} color={colors.textSecondary} />
                : <Text style={styles.headerAvatarText}>{otherPseudo?.[0]?.toUpperCase() ?? '?'}</Text>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.headerName, isBlocked && { color: colors.textSecondary }]}>{isBlocked ? 'Utilisateur Gosh' : otherPseudo}</Text>
            {!isBlocked && <VerifiedBadge uid={otherUid} />}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowActionSheet(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        {loading
          ? <ActivityIndicator color={colors.accent} style={{ flex: 1 }} />
          : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg }}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              renderItem={({ item }) => {
                const isMe = item.uid === me?.uid;
                return (
                  <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                    {/* Carte workout : pleine largeur, sans avatar ni contrainte de bulle */}
                    {item.type === 'workout' ? (
                      <View style={{ flex: 1 }}>
                        {!isMe && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, marginLeft: 4 }}>
                            <Text style={styles.senderName}>{isBlocked ? 'Utilisateur Gosh' : otherPseudo}</Text>
                            {!isBlocked && <VerifiedBadge uid={otherUid} />}
                          </View>
                        )}
                        <WorkoutMessageCard item={item} colors={colors} />
                      </View>
                    ) : (
                    <>
                    {!isMe && (
                      <TouchableOpacity onPress={() => !isBlocked && router.push({ pathname: '/profile', params: { uid: otherUid } })} activeOpacity={isBlocked ? 1 : 0.8}>
                        <View style={[styles.msgAvatar, isBlocked && { opacity: 0.35 }]}>
                          {!isBlocked && otherPhoto
                            ? <ExpoImage source={{ uri: otherPhoto }} style={styles.msgAvatarImg} contentFit="cover" cachePolicy="memory-disk" />
                            : isBlocked
                              ? <Ionicons name="person" size={16} color={colors.textSecondary} />
                              : <Text style={styles.msgAvatarText}>{otherPseudo?.[0]?.toUpperCase() ?? '?'}</Text>}
                        </View>
                      </TouchableOpacity>
                    )}
                    <View style={{ maxWidth: '75%', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      {!isMe && (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.senderName}>{isBlocked ? 'Utilisateur Gosh' : otherPseudo}</Text>
                          {!isBlocked && <VerifiedBadge uid={otherUid} />}
                        </View>
                      )}
                      {item.imageUrl ? (
                        <TouchableOpacity onLongPress={() => { if (!isMe) { setReportMessageId(item.id); setReportMessageText(item.content ?? undefined); } }} activeOpacity={1}>
                          <View style={[styles.bubble, isMe && styles.bubbleMe, { padding: 3 }]}>
                            <ExpoImage source={{ uri: item.imageUrl }} style={{ width: 200, height: 200, borderRadius: 14 }} contentFit="cover" />
                            <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe, { paddingHorizontal: 6, paddingBottom: 3 }]}>{formatTime(item.createdAt)}</Text>
                          </View>
                        </TouchableOpacity>
                      ) : item.gifUrl ? (
                        <TouchableOpacity onLongPress={() => { if (!isMe) { setReportMessageId(item.id); setReportMessageText(item.content ?? undefined); } }} activeOpacity={1}>
                          <View style={[styles.bubble, isMe && styles.bubbleMe, { padding: 3 }]}>
                            <ExpoImage source={{ uri: item.gifUrl }} style={{ width: 200, height: 150, borderRadius: 14 }} contentFit="cover" />
                            <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe, { paddingHorizontal: 6, paddingBottom: 3 }]}>{formatTime(item.createdAt)}</Text>
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity onLongPress={() => { if (!isMe) { setReportMessageId(item.id); setReportMessageText(item.content ?? undefined); } }} activeOpacity={1}>
                          <View style={[styles.bubble, isMe && styles.bubbleMe]}>
                            <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.content}</Text>
                            <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{formatTime(item.createdAt)}</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    </View>
                    </>
                    )}
                  </View>
                );
              }}
            />
          )
        }

        {/* Input ou banner bloqué */}
        {isBlocked ? (
          <View style={{ paddingHorizontal: spacing.md, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'center', gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.textSecondary + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="ban-outline" size={22} color={colors.textSecondary} />
            </View>
            {iBlockedThem ? (
              <>
                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 18 }}>
                  Tu as bloqué cet utilisateur.{'\n'}Tu ne peux plus envoyer de messages.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert('Débloquer ?', `Débloquer cet utilisateur te permettra à nouveau d'échanger des messages.`, [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Débloquer', onPress: async () => { await import('../utils/reportUser').then(m => m.unblockUser(otherUid)); } },
                    ]);
                  }}
                  style={{ backgroundColor: colors.accent + '18', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 }}
                >
                  <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>Débloquer</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 18 }}>
                Tu ne peux plus envoyer de messages.
              </Text>
            )}
          </View>
        ) : (
          <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Message..."
              placeholderTextColor={colors.textSecondary}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
              multiline
            />
            <View style={styles.rightActions}>
              <TouchableOpacity onPress={sendPhoto} style={styles.mediaBtn} disabled={uploadingMedia} activeOpacity={0.7}>
                {uploadingMedia ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <PhotoIcon />}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowGif(true); searchGifs(''); }} style={styles.mediaBtn} activeOpacity={0.7}>
                <GifIcon />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
                onPress={sendMessage}
                disabled={!text.trim() || sending}
                activeOpacity={0.8}
              >
                <SendIcon />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* GIF Picker Modal */}
        <Modal visible={showGif} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowGif(false)}>
          <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <TextInput
                style={{ flex: 1, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border }}
                value={gifSearch}
                onChangeText={setGifSearch}
                placeholder="Rechercher un GIF..."
                placeholderTextColor={colors.textSecondary}
                returnKeyType="search"
                onSubmitEditing={() => searchGifs(gifSearch)}
                autoFocus
              />
              <TouchableOpacity onPress={() => setShowGif(false)} style={{ padding: 6 }}>
                <Text style={{ color: colors.accent, fontWeight: '700' }}>Fermer</Text>
              </TouchableOpacity>
            </View>
            {gifLoading
              ? <ActivityIndicator color={colors.accent} style={{ flex: 1 }} />
              : (
                <FlatList
                  data={gifs}
                  keyExtractor={(g) => g.id}
                  numColumns={2}
                  contentContainerStyle={{ padding: 4, gap: 4 }}
                  columnWrapperStyle={{ gap: 4 }}
                  renderItem={({ item }) => {
                    const url = item.images?.fixed_height?.url ?? item.images?.original?.url;
                    if (!url) return null;
                    return (
                      <TouchableOpacity onPress={() => sendGif(url)} activeOpacity={0.8}>
                        <ExpoImage source={{ uri: url }} style={{ width: (SW - 16) / 2, height: 120, borderRadius: 10 }} contentFit="cover" />
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
          </View>
        </Modal>
      </KeyboardAvoidingView>
      {/* Action sheet header "···" */}
      <Modal visible={showActionSheet} transparent animationType="slide" onRequestClose={() => setShowActionSheet(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowActionSheet(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingBottom: 34, overflow: 'hidden' }}>
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>
              <View style={{ paddingHorizontal: spacing.lg, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{otherPseudo}</Text>
              </View>

              <TouchableOpacity
                onPress={() => { setShowActionSheet(false); setTimeout(() => setReportMessageId('_user'), 300); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.lg, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
                activeOpacity={0.7}
              >
                <Ionicons name="flag-outline" size={22} color="#FF3B30" />
                <Text style={{ color: '#FF3B30', fontSize: 16, fontWeight: '600' }}>Signaler</Text>
              </TouchableOpacity>

              {!isBlocked && (
                <TouchableOpacity
                  onPress={() => {
                    setShowActionSheet(false);
                    Alert.alert(`Bloquer ${otherPseudo} ?`, `${otherPseudo} ne pourra plus te voir ni t'envoyer de messages. Il ne sera pas notifié.`, [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Bloquer', style: 'destructive', onPress: async () => { await blockUser(otherUid); router.back(); } },
                    ]);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.lg, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="ban-outline" size={22} color={colors.text} />
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Bloquer</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={async () => {
                  setShowActionSheet(false);
                  try {
                    const snap = await getDoc(doc(db, 'users', otherUid));
                    const data = snap.data();
                    const since = data?.createdAt
                      ? new Date(data.createdAt.seconds * 1000).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                      : 'N/A';
                    Alert.alert('À propos de ce compte', `Pseudo : @${otherPseudo}\nMembre depuis : ${since}\n\nGosh vérifie l'identité des coaches certifiés. Si ce compte te semble frauduleux, utilise l'option "Signaler".`, [{ text: 'Fermer' }]);
                  } catch {
                    Alert.alert('À propos de ce compte', `Pseudo : @${otherPseudo}\n\nGosh vérifie l'identité des coaches certifiés.`, [{ text: 'Fermer' }]);
                  }
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.lg, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
                activeOpacity={0.7}
              >
                <Ionicons name="information-circle-outline" size={22} color={colors.text} />
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>À propos de ce compte</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setShowActionSheet(false)} style={{ paddingVertical: 16, alignItems: 'center', marginTop: 4 }} activeOpacity={0.7}>
                <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <ReportModal
        visible={!!reportMessageId}
        onClose={() => setReportMessageId(null)}
        reportedUid={otherUid}
        reportedPseudo={otherPseudo}
        contentType={reportMessageId === '_user' ? 'user' : 'message'}
        contentId={reportMessageId !== '_user' ? (reportMessageId ?? undefined) : undefined}
        contentText={reportMessageId !== '_user' ? reportMessageText : undefined}
        onBlocked={() => { setReportMessageId(null); router.back(); }}
      />
    </SafeAreaView>
  );
}

