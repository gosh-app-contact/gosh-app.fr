import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Constants from 'expo-constants';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Button from '../../components/Button';
import PulsingLoader from '../../components/PulsingLoader';
import UserPlusIcon from '../../components/icons/UserPlusIcon';
import UserBadge from '../../components/UserBadge';
import ReportModal from '../../components/ReportModal';
import { getBadgeInfo } from '../../utils/badgeCache';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, Alert, Image, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useColors, colors, spacing } from '../../constants/theme';
import { db, auth, storage } from '../../utils/firebase';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { banUserCompletely } from '../../utils/banUser';
import { uploadImage as uploadToStorage } from '../../utils/uploadImage';
import { getCurrentUid } from '../../utils/currentUser';
import { getCachedPhoto, fetchAndCachePhotos, setCachedPhoto } from '../../utils/photoCache';
import { subscribeMessagesBadge, setSocialBadge } from '../../utils/socialBadge';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image as ExpoImage } from 'expo-image';
import { PanResponder, GestureResponderEvent, PanResponderGestureState, Animated } from 'react-native';
import {
  collection, query, where, getDocs, doc, updateDoc,
  arrayUnion, getDoc, addDoc, serverTimestamp, orderBy,
  onSnapshot, arrayRemove, deleteDoc, increment, writeBatch, limit,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';

import { writeNotif, deleteNotif } from '../../utils/writeNotif';
import { blockUser } from '../../utils/reportUser';
import { filterContent } from '../../utils/contentFilter';

function VerifiedBadge({ uid }: { uid?: string }) {
  const [info, setInfo] = useState<{ accountType?: string; verified?: boolean } | null>(null);
  useEffect(() => { if (uid) getBadgeInfo(uid).then(setInfo); }, [uid]);
  if (!info || (!info.accountType && !info.verified)) return null;
  return <UserBadge accountType={info.accountType} verified={info.verified} size={16} />;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SearchIcon() {
  return <Ionicons name="search-outline" size={18} color={colors.textSecondary} />;
}

function UserIcon({ size = 28, color = colors.textSecondary }: { size?: number; color?: string }) {
  return <Ionicons name="person-outline" size={size} color={color} />;
}

function HeartIcon({ filled, size = 18 }: { filled: boolean; size?: number }) {
  return <Ionicons name={filled ? 'heart' : 'heart-outline'} size={size} color={filled ? colors.accent : colors.textSecondary} />;
}

function CommentIcon({ size = 18 }: { size?: number }) {
  return <Ionicons name="chatbubble-outline" size={size} color={colors.textSecondary} />;
}


const POST_TYPE_META: Record<PostType, { label: string; icon: string; color: string }> = {
  workout:  { label: 'Séance',      icon: 'barbell-outline',        color: colors.accent },
  meal:     { label: 'Repas',       icon: 'restaurant-outline',     color: '#4CAF50' },
  weight:   { label: 'Poids',       icon: 'scale-outline',          color: '#64B5F6' },
  text:     { label: 'Post',        icon: 'chatbubble-outline',     color: colors.textSecondary },
  progress: { label: 'Progression', icon: 'body-outline',           color: '#8B5CF6' },
  pr:       { label: 'PR',          icon: 'trophy-outline',         color: '#F59E0B' },
  recovery: { label: 'Récupération',icon: 'bed-outline',            color: '#06B6D4' },
};

// ─── Types ────────────────────────────────────────────────────────────────────

type PostType = 'workout' | 'meal' | 'weight' | 'text' | 'progress' | 'pr' | 'recovery';

type Post = {
  id: string;
  uid: string;
  pseudo: string;
  type: PostType;
  content: string;
  likes: string[];
  commentCount?: number;
  photoUrl?: string;
  visibility?: 'public' | 'private';
  hidden?: boolean;
  createdAt: any;
  accountType?: string;
  verified?: boolean;
};

type Comment = {
  id: string;
  uid: string;
  pseudo: string;
  content: string;
  gifUrl?: string;
  likes?: string[];
  createdAt: any;
  accountType?: string;
  verified?: boolean;
};

type UserResult = {
  uid: string;
  pseudo: string;
  prenom?: string;
  email: string;
  friends: string[];
  photoUrl?: string;
  accountType?: string;
  verified?: boolean;
  badge?: string;
  blockedUsers?: string[];
  friendRequests?: string[];
};

const TABS = ['Feed', 'Messages'] as const;
type Tab = (typeof TABS)[number];

type Conversation = {
  chatId: string;
  otherUid: string;
  otherPseudo: string;
  lastMessage: string;
  lastMessageAt: any;
  isUnread?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: any) {
  if (!ts?.toDate) return '';
  const diff = (Date.now() - ts.toDate().getTime()) / 1000;
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

// ─── Comments Modal ───────────────────────────────────────────────────────────

function CommentsModal({ post, visible, onClose, onOpenProfile, blockedUsers = [], blockedBy = [] }: { post: Post | null; visible: boolean; onClose: () => void; photoCache?: Record<string, string>; onOpenProfile: (uid: string) => void; blockedUsers?: string[]; blockedBy?: string[] }) {
  const colors = useColors();
  const cmStyles = useMemo(() => StyleSheet.create({
    wrapper: { flex: 1, justifyContent: 'flex-end' as const },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, paddingBottom: 34, maxHeight: '80%', borderWidth: 1, borderColor: colors.border },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' as const, marginBottom: spacing.md },
    header: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: spacing.md },
    title: { color: colors.text, fontSize: 17, fontWeight: '800' as const },
    close: { color: colors.accent, fontSize: 14, fontWeight: '700' as const },
    empty: { color: colors.textSecondary, textAlign: 'center' as const, marginTop: 20, marginBottom: 20 },
    commentRow: { flexDirection: 'row' as const, gap: spacing.sm, alignItems: 'flex-start' as const },
    avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent + '33', alignItems: 'center' as const, justifyContent: 'center' as const, flexShrink: 0 },
    avatarText: { color: colors.accent, fontSize: 13, fontWeight: '800' as const },
    bubble: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: spacing.sm, gap: 2 },
    pseudo: { color: colors.accent, fontSize: 12, fontWeight: '700' as const },
    content: { color: colors.text, fontSize: 14, lineHeight: 20 },
    time: { color: colors.textSecondary, fontSize: 11 },
    inputRow: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' as const },
    input: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border },
    sendBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 10 },
    sendText: { color: colors.text, fontWeight: '700' as const, fontSize: 13 },
  }), [colors]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentReportTarget, setCommentReportTarget] = useState<{ uid: string; commentId: string } | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [, forceUpdate] = useState(0);
  const [showGif, setShowGif] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [myCurrentPseudo, setMyCurrentPseudo] = useState('');
  const me = auth.currentUser;
  const lastTapRef = useRef<Record<string, number>>({});

  const GIPHY_KEY: string = Constants.expoConfig?.extra?.giphyApiKey ?? '';

  const searchGifs = async (q: string) => {
    setGifLoading(true);
    try {
      const url = q.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=24&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=g`;
      const res = await fetch(url);
      const json = await res.json();
      setGifs(json.data ?? []);
    } finally { setGifLoading(false); }
  };

  const sendGifComment = async (gifUrl: string) => {
    if (!me || !post) return;
    setShowGif(false);
    try {
      const myDoc = await getDoc(doc(db, 'users', me.uid));
      const prenom = myDoc.data()?.prenom ?? myDoc.data()?.pseudo ?? 'Utilisateur';
      await addDoc(collection(db, 'posts', post.id, 'comments'), {
        uid: me.uid, pseudo: prenom, gifUrl, createdAt: serverTimestamp(),
      });
      await Promise.all([
        updateDoc(doc(db, 'posts', post.id), { commentCount: increment(1) }),
        addDoc(collection(db, 'users', me.uid, 'sentComments'), { postId: post.id }),
      ]);
    } catch { Alert.alert('Erreur', 'Impossible d\'envoyer le GIF.'); }
  };

  const toggleCommentLike = async (commentId: string, likes: string[]) => {
    if (!me || !post) return;
    const liked = likes.includes(me.uid);
    try {
      await updateDoc(doc(db, 'posts', post.id, 'comments', commentId), {
        likes: liked ? arrayRemove(me.uid) : arrayUnion(me.uid),
      });
    } catch {}
  };

  useEffect(() => {
    if (!visible || !me) return;
    getDoc(doc(db, 'users', me.uid)).then((s) => {
      if (s.exists()) setMyCurrentPseudo(s.data().prenom ?? s.data().pseudo ?? '');
    });
  }, [visible]);

  useEffect(() => {
    if (!visible || !post) return;
    setLoading(true);
    const q = query(
      collection(db, 'posts', post.id, 'comments'),
      orderBy('createdAt', 'asc'),
      limit(50),
    );
    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Comment))
        .filter((c) => !blockedUsers.includes(c.uid) && !blockedBy.includes(c.uid));
      setComments(docs);
      setLoading(false);
      const uids = [...new Set(docs.map((c) => c.uid))];
      Promise.all(uids.map((uid) => getBadgeInfo(uid))).then((infos) => {
        const infoMap: Record<string, { accountType?: string; verified?: boolean }> = {};
        uids.forEach((uid, i) => { infoMap[uid] = infos[i]; });
        setComments((prev) => prev.map((c) => ({ ...c, ...infoMap[c.uid] })));
      });
      if (uids.length > 0) {
        await fetchAndCachePhotos(uids);
        forceUpdate((n) => n + 1);
      }
    }, () => {});
    return unsub;
  }, [visible, post]);

  const sendComment = async () => {
    if (!text.trim() || !me || !post) return;
    const check = filterContent(text.trim());
    if (!check.allowed) {
      Alert.alert('Contenu inapproprié', 'Ton commentaire contient des termes non autorisés sur Gosh.');
      return;
    }
    setSending(true);
    try {
      const myDoc = await getDoc(doc(db, 'users', me.uid));
      const prenom = myDoc.data()?.prenom ?? myDoc.data()?.pseudo ?? 'Utilisateur';
      await addDoc(collection(db, 'posts', post.id, 'comments'), {
        uid: me.uid,
        pseudo: prenom,
        content: text.trim(),
        createdAt: serverTimestamp(),
      });
      await Promise.all([
        updateDoc(doc(db, 'posts', post.id), { commentCount: increment(1) }),
        addDoc(collection(db, 'users', me.uid, 'sentComments'), { postId: post.id }),
      ]);
      const myPhoto = myDoc.data()?.photoUrl ?? '';
      writeNotif(post.uid, me.uid, prenom, myPhoto, 'comment', post.id, text.trim().slice(0, 60), post.photoUrl);
      setText('');
    } finally {
      setSending(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!me || !post) return;
    Alert.alert('Supprimer', 'Supprimer ce commentaire ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, 'posts', post.id, 'comments', commentId));
            await updateDoc(doc(db, 'posts', post.id), { commentCount: increment(-1) });
          } catch { Alert.alert('Erreur', 'Impossible de supprimer le commentaire.'); }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={cmStyles.wrapper}>
        <View style={cmStyles.sheet}>
          <View style={cmStyles.handle} />
          <View style={cmStyles.header}>
            <Text style={cmStyles.title}>Commentaires</Text>
            <Button label="Fermer" variant="ghost" size="sm" fullWidth={false} onPress={onClose} />
          </View>

          {loading
            ? <PulsingLoader size={44} style={{ marginTop: 20 }} />
            : comments.length === 0
              ? <Text style={cmStyles.empty}>Sois le premier à commenter !</Text>
              : (
                <FlatList
                  data={comments}
                  keyExtractor={(c) => c.id}
                  contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}
                  renderItem={({ item }) => {
                    const commentLiked = me ? (item.likes ?? []).includes(me.uid) : false;
                    return (
                      <View style={cmStyles.commentRow}>
                        {/* Avatar → profil */}
                        <TouchableOpacity onPress={() => { onClose(); onOpenProfile(item.uid); }} activeOpacity={0.8}>
                          <View style={cmStyles.avatar}>
                            {getCachedPhoto(item.uid)
                              ? <ExpoImage source={{ uri: getCachedPhoto(item.uid) }} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit="cover" cachePolicy="memory-disk" />
                              : <Text style={cmStyles.avatarText}>{item.pseudo?.[0]?.toUpperCase() ?? '?'}</Text>}
                          </View>
                        </TouchableOpacity>
                        {/* Bulle : double tap → like, long press → supprimer */}
                        <TouchableOpacity
                          style={cmStyles.bubble}
                          onPress={(e) => {
                            const now = e.nativeEvent.timestamp;
                            if (now - (lastTapRef.current[item.id] ?? 0) < 300) {
                              toggleCommentLike(item.id, item.likes ?? []);
                            }
                            lastTapRef.current[item.id] = now;
                          }}
                          onLongPress={() => {
                            if (me && item.uid === me.uid) {
                              deleteComment(item.id);
                            } else if (me && item.uid !== me.uid) {
                              Alert.alert(`@${item.pseudo ?? 'Ce compte'}`, undefined, [
                                { text: 'Signaler', style: 'destructive', onPress: () => setCommentReportTarget({ uid: item.uid, commentId: item.id }) },
                                { text: 'Bloquer', style: 'destructive', onPress: () => Alert.alert(`Bloquer @${item.pseudo} ?`, 'Tu ne verras plus ses contenus et il ne pourra plus te contacter.', [
                                  { text: 'Annuler', style: 'cancel' },
                                  { text: 'Bloquer', style: 'destructive', onPress: async () => { await blockUser(item.uid); } },
                                ]) },
                                { text: 'Annuler', style: 'cancel' },
                              ]);
                            }
                          }}
                          activeOpacity={0.9}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={cmStyles.pseudo}>{item.uid === me?.uid ? myCurrentPseudo || item.pseudo : item.pseudo}</Text>
                            <VerifiedBadge uid={item.uid} />
                          </View>
                          {item.gifUrl
                            ? <ExpoImage source={{ uri: item.gifUrl }} style={{ width: 160, height: 100, borderRadius: 8, marginTop: 4 }} contentFit="cover" />
                            : <Text style={cmStyles.content}>{item.content}</Text>}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                            <Text style={cmStyles.time}>{timeAgo(item.createdAt)}{me && item.uid === me.uid ? ' · Maintenir pour supprimer' : ' · Maintenir pour signaler'}</Text>
                            {(item.likes?.length ?? 0) > 0 && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Ionicons name="heart" size={12} color={colors.accent} />
                                <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '600' }}>{item.likes!.length}</Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                />
              )
          }

          <View style={cmStyles.inputRow}>
            <TouchableOpacity onPress={() => { setShowGif(true); searchGifs(''); }} activeOpacity={0.7} style={{ padding: 6 }}>
              <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12 }}>GIF</Text>
            </TouchableOpacity>
            <TextInput
              style={cmStyles.input}
              value={text}
              onChangeText={setText}
              placeholder="Ajouter un commentaire..."
              placeholderTextColor={colors.textSecondary}
              returnKeyType="send"
              onSubmitEditing={sendComment}
            />
            <TouchableOpacity style={cmStyles.sendBtn} onPress={sendComment} disabled={sending || !text.trim()} activeOpacity={0.8}>
              {sending
                ? <ActivityIndicator color={colors.text} size="small" />
                : <Text style={cmStyles.sendText}>Envoyer</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* GIF Picker */}
      <Modal visible={showGif} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowGif(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TextInput
              style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 10, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border }}
              placeholder="Rechercher un GIF..."
              placeholderTextColor={colors.textSecondary}
              value={gifSearch}
              onChangeText={setGifSearch}
              onSubmitEditing={() => searchGifs(gifSearch)}
              returnKeyType="search"
            />
            <TouchableOpacity onPress={() => setShowGif(false)}>
              <Text style={{ color: colors.accent, fontWeight: '700' }}>Annuler</Text>
            </TouchableOpacity>
          </View>
          {gifLoading
            ? <PulsingLoader size={44} style={{ marginTop: 40 }} />
            : (
              <FlatList
                data={gifs}
                keyExtractor={(g) => g.id}
                numColumns={2}
                contentContainerStyle={{ padding: 4 }}
                renderItem={({ item }) => {
                  const url = item.images?.fixed_height?.url ?? '';
                  return (
                    <TouchableOpacity onPress={() => sendGifComment(url)} style={{ flex: 1, margin: 2 }} activeOpacity={0.8}>
                      <ExpoImage source={{ uri: url }} style={{ width: '100%', height: 120, borderRadius: 8 }} contentFit="cover" cachePolicy="memory-disk" />
                    </TouchableOpacity>
                  );
                }}
              />
            )}
        </View>
      </Modal>

      <ReportModal
        visible={!!commentReportTarget}
        onClose={() => setCommentReportTarget(null)}
        reportedUid={commentReportTarget?.uid ?? ''}
        contentType="message"
        contentId={commentReportTarget?.commentId}
        onBlocked={() => setCommentReportTarget(null)}
      />
    </Modal>
  );
}


// ─── Post Card ────────────────────────────────────────────────────────────────

function DotsIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="5" cy="12" r="1.5" fill={colors.textSecondary} />
      <Circle cx="12" cy="12" r="1.5" fill={colors.textSecondary} />
      <Circle cx="19" cy="12" r="1.5" fill={colors.textSecondary} />
    </Svg>
  );
}

function PostCard({ post, onLike, onComment, onDelete, onReport, onAbout, onBan, photo }: { post: Post; onLike: (id: string) => void; onComment: (post: Post) => void; onDelete: (postId: string) => void; onReport: (uid: string, postId: string, pseudo?: string, text?: string) => void; onAbout: (uid: string, pseudo: string) => void; onBan?: (uid: string, pseudo: string, isBanned: boolean) => void; photo?: string | null }) {
  const colors = useColors();
  const pStyles = useMemo(() => StyleSheet.create({
    card: { backgroundColor: colors.bg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
    top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingHorizontal: spacing.md },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent + '22', alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const, borderWidth: 1.5, borderColor: colors.accent + '44' },
    avatarImg: { width: 44, height: 44, borderRadius: 22 },
    avatarText: { color: colors.accent, fontSize: 17, fontWeight: '800' as const },
    pseudo: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    metaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 2 },
    meta: { color: colors.textSecondary, fontSize: 12 },
    content: { color: colors.text, fontSize: 15, lineHeight: 22, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    postImg: { width: '100%', height: 380, resizeMode: 'cover' as const, marginTop: 6 },
    actions: { flexDirection: 'row' as const, gap: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
    actionBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
    actionCount: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' as const },
  }), [colors]);
  const me = auth.currentUser;
  const router = useRouter();
  const liked = me ? post.likes.includes(me.uid) : false;
  const isOwner = me?.uid === post.uid;
  const lastTapRef = useRef<number>(0);

  const typeMeta = POST_TYPE_META[post.type] ?? POST_TYPE_META.text;
  const typeIcon = () => <Ionicons name={typeMeta.icon as any} size={16} color={typeMeta.color} />;
  const typeLabel = () => typeMeta.label;

  const showMenu = () => {
    if (isOwner) {
      Alert.alert('Options', undefined, [
        { text: 'Supprimer le post', style: 'destructive', onPress: () => onDelete(post.id) },
        { text: 'Annuler', style: 'cancel' },
      ]);
    } else {
      const isBanned = (post as any).accountType === 'banned';
      const options: any[] = [];
      if (onBan) {
        // Compte admin : actions directes
        options.push({ text: 'Supprimer la publication', style: 'destructive', onPress: () => onDelete(post.id) });
        options.push({ text: isBanned ? 'Débannir ce compte' : 'Bannir ce compte', style: 'destructive', onPress: () => onBan(post.uid, post.pseudo ?? '', isBanned) });
      } else {
        // Compte standard
        options.push({ text: 'Signaler', style: 'destructive', onPress: () => onReport(post.uid, post.id, post.pseudo, post.content) });
        options.push({ text: 'Bloquer', style: 'destructive', onPress: () => Alert.alert(`Bloquer @${post.pseudo} ?`, 'Tu ne verras plus ses publications et il ne pourra plus te contacter.', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Bloquer', style: 'destructive', onPress: async () => { await blockUser(post.uid); } },
        ]) });
        options.push({ text: 'À propos de ce compte', onPress: () => onAbout(post.uid, post.pseudo ?? '') });
      }
      options.push({ text: 'Annuler', style: 'cancel' });
      Alert.alert(post.pseudo ?? 'Ce compte', undefined, options);
    }
  };

  return (
    <View style={pStyles.card}>
      {/* Header */}
      <View style={pStyles.top}>
        <TouchableOpacity onPress={() => router.push({ pathname: '/profile', params: { uid: post.uid } })} activeOpacity={0.8}>
          <View style={pStyles.avatar}>
            {photo
              ? <ExpoImage source={{ uri: photo }} style={pStyles.avatarImg} contentFit="cover" cachePolicy="memory-disk" />
              : <Text style={pStyles.avatarText}>{post.pseudo?.[0]?.toUpperCase() ?? '?'}</Text>}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push({ pathname: '/profile', params: { uid: post.uid } })} style={{ flex: 1 }} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={pStyles.pseudo}>{post.pseudo}</Text>
            <VerifiedBadge uid={post.uid} />
            {post.visibility === 'private' && (
              <Svg width={11} height={11} viewBox="0 0 24 24">
                <Path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" fill={colors.accent} />
              </Svg>
            )}
          </View>
          <View style={pStyles.metaRow}>
            {typeIcon()}
            <Text style={pStyles.meta}>{typeLabel()} · {timeAgo(post.createdAt)}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={showMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <DotsIcon />
        </TouchableOpacity>
      </View>

      {/* Contenu */}
      <TouchableOpacity
        onPress={(e) => {
          const now = e.nativeEvent.timestamp;
          if (now - lastTapRef.current < 300) {
            onLike(post.id);
          } else {
            router.push({ pathname: '/post', params: { postId: post.id } });
          }
          lastTapRef.current = now;
        }}
        activeOpacity={0.95}
      >
        {post.photoUrl
          ? (
            <View>
              {!!post.content && <Text style={pStyles.content}>{post.content}</Text>}
              <ExpoImage source={{ uri: post.photoUrl }} style={pStyles.postImg} contentFit="cover" cachePolicy="memory-disk" />
            </View>
          )
          : !!post.content && <Text style={pStyles.content}>{post.content}</Text>}
      </TouchableOpacity>

      {/* Actions */}
      <View style={pStyles.actions}>
        <TouchableOpacity style={pStyles.actionBtn} onPress={() => onLike(post.id)} activeOpacity={0.7}>
          <HeartIcon filled={liked} />
          <Text style={[pStyles.actionCount, liked && { color: colors.accent }]}>{post.likes.length}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={pStyles.actionBtn} onPress={() => onComment(post)} activeOpacity={0.7}>
          <CommentIcon />
          <Text style={pStyles.actionCount}>{post.commentCount ?? 0}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}


// ─── New Post Modal ───────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const THUMB = (SCREEN_W - 3) / 3;
const PREVIEW_H = SCREEN_W * 0.75;

const CROP_W = SCREEN_W;
const CROP_H = 380;
const SCREEN_H = Dimensions.get('window').height;

function CropView({ uri, originalSize, onDone, onClose }: {
  uri: string;
  originalSize: { w: number; h: number };
  onClose: () => void;
  onDone: (originX: number, originY: number, cropW: number, cropH: number) => void;
}) {
  const [imgSize] = useState({ w: originalSize.w || 1, h: originalSize.h || 1 });
  const pan = useRef(new Animated.ValueXY()).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const currentOffset = useRef({ x: 0, y: 0 });
  const currentScale = useRef(1);
  const lastDist = useRef(0);
  const lastScale = useRef(1);

  const displayH = imgSize.w > 0 ? (CROP_W / imgSize.w) * imgSize.h : CROP_W;

  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      pan.stopAnimation((v) => { currentOffset.current = v; });
      lastDist.current = 0;
      lastScale.current = currentScale.current;
    },
    onPanResponderMove: (e: GestureResponderEvent, gs: PanResponderGestureState) => {
      const touches = e.nativeEvent.touches;
      if (touches.length === 2) {
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastDist.current > 0) {
          const newScale = clamp(lastScale.current * (dist / lastDist.current), 1, 5);
          currentScale.current = newScale;
          scaleAnim.setValue(newScale);
        }
        lastDist.current = dist;
      } else {
        const sc = currentScale.current;
        const maxX = Math.max(0, (CROP_W * sc - CROP_W) / 2);
        const maxY = Math.max(0, (displayH * sc - CROP_H) / 2);
        const nx = clamp(currentOffset.current.x + gs.dx, -maxX, maxX);
        const ny = clamp(currentOffset.current.y + gs.dy, -maxY, maxY);
        pan.setValue({ x: nx, y: ny });
      }
    },
    onPanResponderRelease: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
      const sc = currentScale.current;
      const maxX = Math.max(0, (CROP_W * sc - CROP_W) / 2);
      const maxY = Math.max(0, (displayH * sc - CROP_H) / 2);
      const nx = clamp(currentOffset.current.x + gs.dx, -maxX, maxX);
      const ny = clamp(currentOffset.current.y + gs.dy, -maxY, maxY);
      currentOffset.current = { x: nx, y: ny };
      pan.setValue({ x: nx, y: ny });
    },
  })).current;

  const handleDone = () => {
    const sc = currentScale.current;
    const ox = currentOffset.current.x;
    const oy = currentOffset.current.y;
    // Image affichée à l'écran : centrée + scale
    const scaledW = CROP_W * sc;
    const scaledH = displayH * sc;
    // Coin haut-gauche de l'image dans le conteneur display
    const imgLeft = (CROP_W - scaledW) / 2 + ox;
    const imgTop = (displayH - scaledH) / 2 + oy;
    // Cadre crop centré verticalement dans le conteneur
    const frameTop = (displayH - CROP_H) / 2;
    // Origine du crop en coords display (relatif au coin de l'image)
    const cropOriginXDisplay = 0 - imgLeft;          // frameLeft = 0
    const cropOriginYDisplay = frameTop - imgTop;
    // Facteur de conversion display → pixels réels
    const pxPerDisplayPx = imgSize.w / scaledW;
    onDone(
      Math.max(0, cropOriginXDisplay * pxPerDisplayPx),
      Math.max(0, cropOriginYDisplay * pxPerDisplayPx),
      Math.min(imgSize.w, CROP_W * pxPerDisplayPx),
      Math.min(imgSize.h, CROP_H * pxPerDisplayPx),
    );
  };

  const topOverlay = Math.max(0, (displayH - CROP_H) / 2);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View
        {...panResponder.panHandlers}
        style={{ width: CROP_W, height: displayH, alignSelf: 'center', marginTop: (SCREEN_H - displayH) / 4, overflow: 'hidden' }}
      >
        <Animated.View style={{
          width: CROP_W, height: displayH,
          transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: scaleAnim }],
        }}>
          <ExpoImage
            source={{ uri }}
            style={{ width: CROP_W, height: displayH }}
            contentFit="fill"
          />
        </Animated.View>

        {/* Overlay gris hors cadre */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ height: topOverlay, backgroundColor: 'rgba(0,0,0,0.72)', width: '100%' }} />
          <View style={{ height: CROP_H, flexDirection: 'row' }}>
            <View style={{ flex: 0, backgroundColor: 'rgba(0,0,0,0.72)' }} />
            <View style={{ width: CROP_W, height: CROP_H, borderWidth: 1.5, borderColor: colors.accent }}>
              {[1, 2].map(i => (
                <View key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: `${i * 33.33}%` as any, height: 1, backgroundColor: 'rgba(255,107,53,0.35)' }} />
              ))}
              {[1, 2].map(i => (
                <View key={`v${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${i * 33.33}%` as any, width: 1, backgroundColor: 'rgba(255,107,53,0.35)' }} />
              ))}
            </View>
            <View style={{ flex: 0, backgroundColor: 'rgba(0,0,0,0.72)' }} />
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', width: '100%' }} />
        </View>
      </View>

      {/* Bulle fermer */}
      <TouchableOpacity
        style={{ position: 'absolute', top: 56, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
        onPress={onClose}
        activeOpacity={0.85}
      >
        <Ionicons name="close" size={16} color="#fff" />
      </TouchableOpacity>

      {/* Bulle appliquer */}
      <TouchableOpacity
        style={{ position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: colors.accent, borderRadius: 28, paddingHorizontal: 44, paddingVertical: 14 }}
        onPress={handleDone}
        activeOpacity={0.85}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Appliquer</Text>
      </TouchableOpacity>
    </View>
  );
}

function NewPostModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const mStyles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
      paddingHorizontal: spacing.md, paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    headerBtn: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 22, backgroundColor: colors.card },
    headerBtnText: { color: colors.textSecondary, fontSize: 20 },
    headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.3 },
    headerNext: { color: colors.accent, fontSize: 16, fontWeight: '700' as const },
    publishBtn: { backgroundColor: colors.accent, borderRadius: 22, paddingHorizontal: 18, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
    publishText: { color: '#fff', fontSize: 15, fontWeight: '700' as const },
    preview: { width: SCREEN_W, height: 360, backgroundColor: colors.surface },
    previewImg: { width: '100%', height: '100%' },
    cropBtn: {
      position: 'absolute' as const, bottom: 14, right: 14,
      backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 22,
      paddingHorizontal: 14, height: 36,
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    },
    cropBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' as const },
    recentsBar: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
      paddingHorizontal: spacing.md, paddingVertical: 12,
      backgroundColor: colors.bg,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    },
    recentsLabel: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    recentsArrow: { color: colors.accent, fontSize: 18, fontWeight: '600' as const },
    thumbCheck: {
      position: 'absolute' as const, bottom: 6, right: 6,
      backgroundColor: colors.accent, borderRadius: 12,
      width: 24, height: 24,
      alignItems: 'center' as const, justifyContent: 'center' as const,
      borderWidth: 2, borderColor: '#fff',
    },
    compose: { flex: 1, padding: spacing.md, gap: 24 },
    composeTop: { flexDirection: 'row' as const, gap: 14, alignItems: 'flex-start' as const },
    miniPreview: { width: 88, height: 88, borderRadius: 12 },
    input: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 24, minHeight: 100, textAlignVertical: 'top' as const },
    section: { gap: 10 },
    sectionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
    typeRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
    typeBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
    typeBtnActive: { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
    typeText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' as const },
    typeTextActive: { color: colors.accent },
  }), [colors]);
  const [step, setStep] = useState<'pick' | 'compose'>('pick');
  const [showCrop, setShowCrop] = useState(false);
  const [type, setType] = useState<PostType>('workout');
  const [content, setContent] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<MediaLibrary.Asset | null>(null);
  const [originalLocalUri, setOriginalLocalUri] = useState<string | null>(null);
  const [croppedUri, setCroppedUri] = useState<string | null>(null);

  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<MediaLibrary.Asset[]>([]);
  const me = auth.currentUser;

  const POST_TYPES = (Object.entries(POST_TYPE_META) as [PostType, typeof POST_TYPE_META[PostType]][])
    .map(([key, meta]) => ({ key, label: meta.label, icon: meta.icon, color: meta.color }));

  useEffect(() => {
    if (!visible) return;
    setStep('pick');
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') return;
      const { assets } = await MediaLibrary.getAssetsAsync({ mediaType: 'photo', first: 500, sortBy: 'creationTime' });
      setPhotos(assets);
      if (assets.length > 0) setSelectedAsset(assets[0]);
    })();
  }, [visible]);

  const goCompose = async () => {
    if (!selectedAsset) { setStep('compose'); return; }
    const info = await MediaLibrary.getAssetInfoAsync(selectedAsset);
    const localUri = info.localUri ?? selectedAsset.uri;
    setOriginalLocalUri(localUri);
    setStep('compose');
  };


  const handlePost = async () => {
    if (!content.trim() && !selectedAsset || !me) return;
    if (content.trim()) {
      const check = filterContent(content.trim());
      if (!check.allowed) {
        Alert.alert('Contenu inapproprié', 'Ton message contient des termes non autorisés sur Gosh. Merci de le modifier avant de publier.');
        return;
      }
    }
    setLoading(true);
    try {
      const myDoc = await getDoc(doc(db, 'users', me.uid));
      const prenom = myDoc.data()?.prenom ?? myDoc.data()?.pseudo ?? 'Utilisateur';
      let photoUrl: string | null = null;
      const imageUri = croppedUri ?? originalLocalUri;
      if (imageUri) photoUrl = await uploadToStorage(imageUri, 'posts');
      await addDoc(collection(db, 'posts'), {
        uid: me.uid, pseudo: prenom, type,
        content: content.trim(),
        visibility,
        ...(photoUrl ? { photoUrl } : {}),
        likes: [], commentCount: 0,
        createdAt: serverTimestamp(),
      });
      setContent(''); setType('workout'); setVisibility('public');
      setSelectedAsset(null); setCroppedUri(null); setOriginalLocalUri(null); setStep('pick');
      onClose();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de publier.');
    } finally { setLoading(false); }
  };

  const reset = () => { setStep('pick'); setContent(''); setSelectedAsset(null); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={reset}>
      <View style={mStyles.screen}>
        {/* Header */}
        <View style={mStyles.header}>
          <TouchableOpacity onPress={step === 'pick' ? reset : () => setStep('pick')} style={mStyles.headerBtn}>
            {step === 'pick' ? <Ionicons name="close" size={20} color={colors.text} /> : <Ionicons name="chevron-back" size={20} color={colors.text} />}
          </TouchableOpacity>
          <Text style={mStyles.headerTitle}>Nouveau post</Text>
          {step === 'pick' ? (
            <TouchableOpacity onPress={goCompose} style={[mStyles.headerBtn, { backgroundColor: colors.accent }]} disabled={loading}>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handlePost} disabled={loading} style={[mStyles.publishBtn, loading && { opacity: 0.5 }]}>
              <Text style={mStyles.publishText}>Publier</Text>
            </TouchableOpacity>
          )}
        </View>

        {step === 'pick' ? (
          <>
            {/* Grande preview */}
            <View style={mStyles.preview}>
              {selectedAsset
                ? <>
                    <ExpoImage source={{ uri: croppedUri ?? selectedAsset.uri }} style={mStyles.previewImg} contentFit="cover" cachePolicy="none" />
                    <TouchableOpacity style={mStyles.cropBtn} onPress={() => setShowCrop(true)} activeOpacity={0.8}>
                      <Ionicons name="crop-outline" size={14} color="#fff" />
                      <Text style={mStyles.cropBtnText}>Recadrer</Text>
                    </TouchableOpacity>
                  </>
                : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="image-outline" size={30} color={colors.textSecondary} />
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Sélectionne une photo</Text>
                  </View>}
            </View>
            {/* Bandeau */}
            <View style={mStyles.recentsBar}>
              <Text style={mStyles.recentsLabel}>Récents</Text>
              <Text style={mStyles.recentsArrow}>›</Text>
            </View>
            {/* Grille */}
            <FlatList
              data={photos}
              keyExtractor={(a) => a.id}
              numColumns={3}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  onPress={() => { setSelectedAsset(item); setCroppedUri(null); setOriginalLocalUri(null); }}
                  activeOpacity={0.8}
                  style={{ marginRight: index % 3 === 2 ? 0 : 1.5, marginBottom: 1.5 }}
                >
                  <ExpoImage source={{ uri: item.uri }} style={{ width: THUMB, height: THUMB }} contentFit="cover" />
                  {selectedAsset?.id === item.id && (
                    <View style={mStyles.thumbCheck}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            />
          </>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={mStyles.compose}>
              <View style={mStyles.composeTop}>
                {selectedAsset && <ExpoImage source={{ uri: croppedUri ?? selectedAsset.uri }} style={mStyles.miniPreview} contentFit="cover" cachePolicy="none" />}
                <TextInput
                  style={mStyles.input}
                  value={content}
                  onChangeText={setContent}
                  placeholder="Partage quelque chose..."
                  placeholderTextColor={colors.textSecondary}
                  multiline autoFocus maxLength={500}
                />
              </View>
              <View style={mStyles.section}>
                <Text style={mStyles.sectionLabel}>TYPE</Text>
                <View style={mStyles.typeRow}>
                  {POST_TYPES.map((t) => (
                    <TouchableOpacity key={t.key} style={[mStyles.typeBtn, type === t.key && { borderColor: t.color, backgroundColor: t.color + '18' }]} onPress={() => setType(t.key)}>
                      <Text style={[mStyles.typeText, type === t.key && { color: t.color }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={mStyles.section}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={mStyles.sectionLabel}>AUDIENCE</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name={visibility === 'public' ? 'globe-outline' : 'lock-closed-outline'} size={13} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{visibility === 'public' ? 'Visible par tous' : 'Amis uniquement'}</Text>
                      </View>
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setVisibility(v => v === 'public' ? 'private' : 'public')}
                    activeOpacity={0.85}
                    style={{
                      width: 56, height: 30, borderRadius: 15,
                      backgroundColor: visibility === 'private' ? colors.accent : colors.surface,
                      borderWidth: 1, borderColor: visibility === 'private' ? colors.accent : colors.border,
                      justifyContent: 'center', padding: 2,
                    }}
                  >
                    <View style={{
                      width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff',
                      alignSelf: visibility === 'private' ? 'flex-end' : 'flex-start',
                      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2,
                    }} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>

      {/* Modal crop séparé — plein écran fixe, pas de drag-to-dismiss */}
      <Modal visible={showCrop && !!selectedAsset} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowCrop(false)}>
        {selectedAsset && (
          <CropView
            uri={originalLocalUri ?? selectedAsset.uri}
            originalSize={{ w: selectedAsset.width, h: selectedAsset.height }}
            onClose={() => setShowCrop(false)}
            onDone={async (originX, originY, cropW, cropH) => {
              let localUri = originalLocalUri;
              if (!localUri) {
                const info = await MediaLibrary.getAssetInfoAsync(selectedAsset);
                localUri = info.localUri ?? selectedAsset.uri;
                setOriginalLocalUri(localUri);
              }
              const result = await ImageManipulator.manipulateAsync(
                localUri,
                [{ crop: { originX: Math.max(0, Math.round(originX)), originY: Math.max(0, Math.round(originY)), width: Math.round(Math.max(1, cropW)), height: Math.round(Math.max(1, cropH)) } }],
                { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
              );
              setCroppedUri(result.uri);
              setShowCrop(false);
            }}
          />
        )}
      </Modal>
    </Modal>
  );
}


// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SocialScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ openNotifs?: string }>();
  const [tab, setTab] = useState<Tab>('Feed');
  const [feedFilter, setFeedFilter] = useState<'all' | PostType>('all');
  const [followBackSent, setFollowBackSent] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [myAccountType, setMyAccountType] = useState<string>('standard');
  const [myFriends, setMyFriends] = useState<string[]>([]);
  const [myFriendsData, setMyFriendsData] = useState<{ uid: string; pseudo: string; prenom?: string; accountType?: string; verified?: boolean }[]>([]);
  const [friendRequests, setFriendRequests] = useState<{ uid: string; pseudo: string; prenom?: string; photoUrl?: string }[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [showNewPost, setShowNewPost] = useState(false);
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convsLoading, setConvsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => subscribeMessagesBadge(setUnreadCount), []);
  const [, forceUpdate] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [notifMeta, setNotifMeta] = useState<Record<string, { accountType?: string; verified?: boolean }>>({});
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [blockedBy, setBlockedBy] = useState<string[]>([]);
  const visibleConversations = useMemo(() => conversations, [conversations]);
  const visibleUnreadCount = useMemo(() => visibleConversations.filter((c) => c.isUnread).length, [visibleConversations]);
  const visibleNotifs = useMemo(() => notifs.filter((n) => !blockedUsers.includes(n.fromUid) && !blockedBy.includes(n.fromUid)), [notifs, blockedUsers, blockedBy]);
  const visibleUnreadNotifs = useMemo(() => visibleNotifs.filter((n) => !n.read).length, [visibleNotifs]);
  const visibleFriendRequests = useMemo(() => friendRequests.filter((r) => !blockedUsers.includes(r.uid) && !blockedBy.includes(r.uid)), [friendRequests, blockedUsers, blockedBy]);
  const [reportTarget, setReportTarget] = useState<{ uid: string; contentType: 'post' | 'message' | 'user' | 'club'; contentId?: string; contentText?: string; reportedPseudo?: string } | null>(null);

  const me = auth.currentUser;
  const unsubRef = useRef<(() => void) | null>(null);
  const unsubConvRef = useRef<(() => void) | null>(null);
  const unsubMeRef = useRef<(() => void) | null>(null);

  const getPhoto = (uid: string) => getCachedPhoto(uid) ?? null;

  const loadPhotos = async (uids: string[], _force = false) => {
    await fetchAndCachePhotos(uids);
    forceUpdate((n) => n + 1);
  };

  const unsubRef2 = useRef<(() => void) | null>(null);

  // Écoute des utilisateurs bloqués en temps réel
  useEffect(() => {
    if (!me) return;
    const unsub = onSnapshot(doc(db, 'users', me.uid), (snap) => {
      setBlockedUsers(snap.data()?.blockedUsers ?? []);
      setBlockedBy(snap.data()?.blockedBy ?? []);
      setMyAccountType(snap.data()?.accountType ?? 'standard');
    }, () => {});
    return unsub;
  }, [me]);

  // Rouvrir les notifs au retour depuis le profil
  useFocusEffect(useCallback(() => {
    if (params.openNotifs === '1') {
      setShowNotifs(true);
      markNotifsRead();
    }
  }, [params.openNotifs]));

  // Rafraîchit l'état "demande envoyée" depuis Firestore quand l'onglet reprend le focus
  useFocusEffect(useCallback(() => {
    if (!me || results.length === 0) return;
    Promise.all(results.map((u) => getDoc(doc(db, 'users', u.uid)))).then((snaps) => {
      const alreadySent = new Set<string>();
      snaps.forEach((snap) => {
        if ((snap.data()?.friendRequests ?? []).includes(me.uid)) {
          alreadySent.add(snap.id);
        }
      });
      setSent(alreadySent);
    }).catch(() => {});
  }, [me, results]));

  // Recharge toutes les photos au montage du composant
  useEffect(() => {
    if (!me) return;
    (async () => {
      const myDoc = await getDoc(doc(db, 'users', me.uid));
      const friends: string[] = myDoc.data()?.friends ?? [];
      const allUids = [me.uid, ...friends];
      loadPhotos(allUids, true);
    })();
  }, [me]);

  useEffect(() => {
    if (tab !== 'Feed' || !me) return;
    setFeedLoading(true);

    let friendPosts: Post[] = [];
    let publicPosts: Post[] = [];

    const merge = () => {
      const map = new Map<string, Post>();
      [...friendPosts, ...publicPosts].forEach((p) => map.set(p.id, p));
      const merged = Array.from(map.values()).sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      // Enrichir avec les badges en arrière-plan
      const uids = [...new Set(merged.map((p) => p.uid))];
      Promise.all(uids.map((uid) => getBadgeInfo(uid))).then((infos) => {
        const infoMap: Record<string, { accountType?: string; verified?: boolean }> = {};
        uids.forEach((uid, i) => { infoMap[uid] = infos[i]; });
        setPosts((prev) => prev.map((p) => ({ ...p, ...infoMap[p.uid] })));
      });
      setPosts(merged);
      setFeedLoading(false);
      loadPhotos(uids);
    };

    const setup = async () => {
      const myDoc = await getDoc(doc(db, 'users', me.uid));
      const friends: string[] = myDoc.data()?.friends ?? [];
      const following: string[] = myDoc.data()?.following ?? [];
      // Amis + comptes suivis + moi
      const uids = [...new Set([me.uid, ...friends, ...following])].slice(0, 30);

      // Posts des amis + suivis
      const q1 = query(collection(db, 'posts'), where('uid', 'in', uids), orderBy('createdAt', 'desc'), limit(40));
      unsubRef.current = onSnapshot(q1, { includeMetadataChanges: false }, (snap) => {
        friendPosts = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Post))
          .filter((p) => (friends.includes(p.uid) || p.uid === me.uid || p.visibility === 'public') && (!p.hidden || p.uid === me.uid));
        merge();
      });

      // Posts publics de tout le monde
      const q2 = query(collection(db, 'posts'), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(40));
      unsubRef2.current = onSnapshot(q2, { includeMetadataChanges: false }, (snap) => {
        publicPosts = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post)).filter((p) => !p.hidden || p.uid === me.uid);
        merge();
      });
    };
    setup();
    return () => { unsubRef.current?.(); unsubRef2.current?.(); };
  }, [tab, me]);

  const handleAboutAccount = async (uid: string, pseudo: string) => {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.data();
      const since = data?.createdAt
        ? new Date(data.createdAt.seconds * 1000).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        : 'N/A';
      Alert.alert(
        'À propos de ce compte',
        `Pseudo : @${pseudo}\nMembre depuis : ${since}\n\nGosh vérifie l'identité des coaches certifiés. Si ce compte te semble frauduleux, utilise l'option "Signaler".`,
        [{ text: 'Fermer' }],
      );
    } catch {
      Alert.alert('À propos de ce compte', `Pseudo : @${pseudo}\n\nGosh vérifie l'identité des coaches certifiés.`, [{ text: 'Fermer' }]);
    }
  };

  const deleteStorageFile = async (url: string) => {
    if (!url || !url.includes('firebasestorage')) return;
    try {
      const match = url.match(/o\/(.+?)\?/);
      if (match?.[1]) await deleteObject(storageRef(storage, decodeURIComponent(match[1])));
    } catch {}
  };

  const deletePostWithCleanup = async (postId: string) => {
    const postSnap = await getDoc(doc(db, 'posts', postId));
    const photoUrl = postSnap.data()?.photoUrl ?? '';
    // Supprimer tous les commentaires
    const commentsSnap = await getDocs(collection(db, 'posts', postId, 'comments'));
    await Promise.all(commentsSnap.docs.map((c) => deleteDoc(c.ref)));
    // Supprimer le post
    await deleteDoc(doc(db, 'posts', postId));
    // Supprimer la photo du Storage
    await deleteStorageFile(photoUrl);
    // Supprimer les notifications like/comment liées à ce post chez l'auteur
    if (me) {
      const notifsSnap = await getDocs(collection(db, 'notifications', me.uid, 'items')).catch(() => null);
      const toDelete = notifsSnap?.docs.filter((d) => d.data().postId === postId) ?? [];
      await Promise.all(toDelete.map((d) => deleteDoc(d.ref)));
    }
  };

  const handleDeletePost = (postId: string) => {
    Alert.alert('Supprimer le post', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: () => deletePostWithCleanup(postId),
      },
    ]);
  };

  useEffect(() => {
    if (!me) return;
    setConvsLoading(true);
    const q = query(collection(db, 'chats'), where('participants', 'array-contains', me.uid), orderBy('lastMessageAt', 'desc'));
    unsubConvRef.current = onSnapshot(q, async (snap) => {
      let unread = 0;
      const convs = snap.docs.map((d) => {
        const data = d.data();
        const otherUid = data.participants.find((u: string) => u !== me.uid);
        const lastMsgAt = data.lastMessageAt?.toMillis?.() ?? 0;
        const lastSeenAt = data[`lastSeenAt_${me.uid}`]?.toMillis?.() ?? 0;
        const isUnread = lastMsgAt > lastSeenAt && data.lastSenderUid !== me.uid;
        if (isUnread) unread++;
        return {
          chatId: d.id,
          otherUid,
          otherPseudo: data[`pseudo_${otherUid}`] ?? '?',
          lastMessage: data.lastMessage ?? '',
          lastMessageAt: data.lastMessageAt,
          isUnread,
        };
      });
      const uids = convs.map((c) => c.otherUid).filter(Boolean);
      // Pseudos + photos en parallèle via cache global
      const [userDocs] = await Promise.all([
        Promise.all(uids.map((uid) => getDoc(doc(db, 'users', uid)))),
        fetchAndCachePhotos(uids),
      ]);
      userDocs.forEach((d, i) => {
        if (d.exists()) {
          convs[i].otherPseudo = d.data().prenom ?? d.data().pseudo ?? convs[i].otherPseudo;
        }
      });
      setConversations(convs);
      setUnreadCount(unread);
      setConvsLoading(false);
      forceUpdate((n) => n + 1);
    });
    return () => { unsubConvRef.current?.(); };
  }, [me]);

  useEffect(() => {
    if (!me) return;
    unsubMeRef.current = onSnapshot(doc(db, 'users', me.uid), async (snap) => {
      const data = snap.data();
      const friendUids: string[] = data?.friends ?? [];
      const requestUids: string[] = data?.friendRequests ?? [];
      // Mettre à jour la photo de l'utilisateur courant en temps réel
      if (data?.photoUrl && data.photoUrl.startsWith('https://')) {
        setCachedPhoto(me.uid, data.photoUrl);
        // Sync local AsyncStorage with latest Cloudinary URL
        try {
          const { loadState: ls, saveState: ss } = await import('../../utils/storage');
          const st = await ls();
          if (st && st.profiles.length > 0 && st.profiles[0].photo !== data.photoUrl) {
            st.profiles[0].photo = data.photoUrl;
            await ss(st);
          }
        } catch {}
      }

      if (friendUids.length > 0) {
        const q = query(collection(db, 'users'), where('uid', 'in', friendUids.slice(0, 30)));
        const s = await getDocs(q);
        setMyFriendsData(s.docs.map((d) => ({ uid: d.data().uid, pseudo: d.data().pseudo, prenom: d.data().prenom, accountType: d.data().accountType, verified: d.data().verified })));
        setMyFriends(friendUids);
        loadPhotos(friendUids);
      } else {
        setMyFriendsData([]);
        setMyFriends([]);
      }

      if (requestUids.length > 0) {
        const q2 = query(collection(db, 'users'), where('uid', 'in', requestUids.slice(0, 30)));
        const s2 = await getDocs(q2);
        const reqs = s2.docs.map((d) => ({ uid: d.data().uid, pseudo: d.data().pseudo, prenom: d.data().prenom, photoUrl: d.data().photoUrl }));
        setFriendRequests(reqs);
        loadPhotos(requestUids.slice(0, 30));
        setSocialBadge(unreadNotifs + reqs.length, unreadCount);
      } else {
        setFriendRequests([]);
        setSocialBadge(unreadNotifs, unreadCount);
      }
    });
    return () => { unsubMeRef.current?.(); };
  }, [me]);

  // Notifications listener
  useEffect(() => {
    if (!me) return;
    const q = query(
      collection(db, 'notifications', me.uid, 'items'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const unread = items.filter((n: any) => !n.read).length;
      setNotifs(items);
      setUnreadNotifs(unread);
      setSocialBadge(unread + visibleFriendRequests.length, unreadCount);
      // Charger photos + accountType/verified de tous les expéditeurs
      const uids = [...new Set(items.map((n: any) => n.fromUid).filter(Boolean))] as string[];
      if (uids.length > 0) {
        fetchAndCachePhotos(uids).then(async () => {
          const snaps = await Promise.all(uids.map((u) => getDoc(doc(db, 'users', u))));
          const meta: Record<string, { accountType?: string; verified?: boolean }> = {};
          snaps.forEach((s) => { if (s.exists()) meta[s.id] = { accountType: s.data().accountType, verified: s.data().verified }; });
          setNotifMeta(meta);
          forceUpdate((n) => n + 1);
        });
      }
    }, () => {});
    return unsub;
  }, [me]);

  // Badge tab bar — toujours à jour via useMemo (évite les closures stale)
  useEffect(() => {
    setSocialBadge(visibleUnreadNotifs + visibleFriendRequests.length, unreadCount);
  }, [visibleUnreadNotifs, visibleFriendRequests.length, unreadCount]);

  const markNotifsRead = async () => {
    if (!me || visibleUnreadNotifs === 0) return;
    const batch = writeBatch(db);
    notifs.filter((n) => !n.read).forEach((n) => {
      batch.update(doc(db, 'notifications', me.uid, 'items', n.id), { read: true });
    });
    await batch.commit();
  };

  const handleLike = async (postId: string) => {
    if (!me) return;
    const ref = doc(db, 'posts', postId);
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (post.likes.includes(me.uid)) {
      await updateDoc(ref, { likes: arrayRemove(me.uid) });
      deleteNotif(post.uid, me.uid, 'like', postId);
    } else {
      await updateDoc(ref, { likes: arrayUnion(me.uid) });
      const mySnap = await getDoc(doc(db, 'users', me.uid));
      const myPseudo = mySnap.data()?.prenom ?? mySnap.data()?.pseudo ?? 'Quelqu\'un';
      const myPhoto = mySnap.data()?.photoUrl ?? '';
      writeNotif(post.uid, me.uid, myPseudo, myPhoto, 'like', postId, post.content?.slice(0, 60) ?? '', post.photoUrl);
    }
  };

  const handleSearch = useCallback(async () => {
    if (!search.trim() || !me) return;
    if (!search.trim().startsWith('@')) return; // exiger le @
    setSearchLoading(true);
    try {
      const handle = search.trim().slice(1).toLowerCase();
      const q = query(collection(db, 'users'), where('pseudo', '==', handle));
      const snap = await getDocs(q);
      const myDoc = await getDoc(doc(db, 'users', me.uid));
      const friends: string[] = myDoc.data()?.friends ?? [];
      setMyFriends(friends);
      const filtered = snap.docs.map((d) => d.data() as UserResult).filter((u) => u.uid !== me.uid && u.accountType !== 'banned' && !blockedUsers.includes(u.uid) && !blockedBy.includes(u.uid) && !(u.blockedUsers ?? []).includes(me.uid));
      setResults(filtered);
      // Initialiser l'état "demande envoyée" depuis Firestore pour chaque résultat
      const alreadySent = new Set<string>();
      filtered.forEach((u) => {
        if ((u.friendRequests ?? []).includes(me.uid)) alreadySent.add(u.uid);
      });
      setSent((prev) => new Set([...prev, ...alreadySent]));
    } finally {
      setSearchLoading(false);
    }
  }, [search, me]);

  const sendRequest = async (uid: string) => {
    if (!me) return;
    await updateDoc(doc(db, 'users', uid), { friendRequests: arrayUnion(me.uid) });
    setSent((prev) => new Set(prev).add(uid));
    const myDoc = await getDoc(doc(db, 'users', me.uid));
    const myData = myDoc.data();
    await writeNotif(uid, me.uid, myData?.prenom ?? myData?.pseudo ?? me.uid, myData?.photoUrl ?? '', 'friendRequest');
  };

  const cancelRequest = async (uid: string) => {
    if (!me) return;
    await updateDoc(doc(db, 'users', uid), { friendRequests: arrayRemove(me.uid) });
    setSent((prev) => { const s = new Set(prev); s.delete(uid); return s; });
    deleteNotif(uid, me.uid, 'friendRequest');
  };

  const unfollow = async (uid: string) => {
    if (!me) return;
    await updateDoc(doc(db, 'users', me.uid), { friends: arrayRemove(uid) });
    await updateDoc(doc(db, 'users', uid), { friends: arrayRemove(me.uid) });
    setFollowBackSent((prev) => { const s = new Set(prev); s.delete(uid); return s; });
    setMyFriends((prev) => prev.filter((id) => id !== uid));
  };

  const acceptRequest = async (uid: string) => {
    if (!me) return;
    await updateDoc(doc(db, 'users', me.uid), {
      friends: arrayUnion(uid),
      friendRequests: arrayRemove(uid),
    });
    await updateDoc(doc(db, 'users', uid), {
      friends: arrayUnion(me.uid),
    });
  };

  const declineRequest = async (uid: string) => {
    if (!me) return;
    await updateDoc(doc(db, 'users', me.uid), {
      friendRequests: arrayRemove(uid),
    });
  };

  const dismissNotif = async (notifId: string) => {
    if (!me) return;
    await deleteDoc(doc(db, 'notifications', me.uid, 'items', notifId));
  };

  const statusFor = (uid: string) => {
    if (myFriends.includes(uid)) return 'ami';
    if (sent.has(uid)) return 'envoyé';
    return 'none';
  };

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
    title: { color: colors.text, fontSize: 28, fontWeight: '800' as const },
    newPostBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.accent, alignItems: 'center' as const, justifyContent: 'center' as const },
    newPostText: { color: colors.accent, fontWeight: '300' as const, fontSize: 20, lineHeight: 22 },
    tabRow: { flexDirection: 'row' as const, borderBottomWidth: 1, borderBottomColor: colors.border },
    tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' as const, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
    tabBtnActive: { borderBottomColor: colors.accent },
    tabText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' as const },
    tabTextActive: { color: colors.text },
    searchRow: { flexDirection: 'row' as const, gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.md },
    searchBox: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border },
    searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 12 },
    searchBtn: { backgroundColor: colors.accent, borderRadius: 14, paddingHorizontal: spacing.md, justifyContent: 'center' as const },
    searchBtnText: { color: colors.text, fontWeight: '700' as const, fontSize: 14 },
    empty: { alignItems: 'center' as const, marginTop: 60, gap: spacing.sm },
    emptyText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' as const },
    emptyHint: { color: colors.textSecondary + '88', fontSize: 13 },
    userCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
    pseudo: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    email: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    addBtn: { backgroundColor: colors.accent + '22', borderRadius: 10, paddingHorizontal: spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: colors.accent },
    addBtnText: { color: colors.accent, fontSize: 13, fontWeight: '700' as const },
    friendBadge: { borderRadius: 10, paddingHorizontal: spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: colors.accent },
    friendBadgeText: { color: colors.accent, fontSize: 13, fontWeight: '700' as const },
    badge: { position: 'absolute' as const, top: -6, right: -10, backgroundColor: colors.accent, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 3 },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' as const },
    requestsSection: { marginHorizontal: spacing.md, marginBottom: spacing.md, backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.accent + '44' },
    requestsTitle: { color: colors.accent, fontSize: 13, fontWeight: '700' as const, marginBottom: 4 },
    requestCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
    requestInitial: { color: colors.accent, fontSize: 16, fontWeight: '800' as const },
    acceptBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: spacing.sm, paddingVertical: 6 },
    acceptText: { color: '#fff', fontSize: 13, fontWeight: '700' as const },
    declineBtn: { backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
    declineText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' as const },
    msgSectionTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 8 },
    friendChip: { alignItems: 'center' as const, gap: 5 },
    friendChipAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent + '22', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2, borderColor: colors.accent + '55', overflow: 'hidden' as const },
    friendChipAvatarImg: { width: 56, height: 56, borderRadius: 28 },
    friendChipAvatarText: { color: colors.accent, fontSize: 20, fontWeight: '800' as const },
    friendChipName: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' as const, maxWidth: 60 },
    convCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, backgroundColor: colors.card, borderRadius: 18, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    convAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.accent + '22', alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
    convAvatarImg: { width: 50, height: 50, borderRadius: 25 },
    convAvatarText: { color: colors.accent, fontSize: 19, fontWeight: '800' as const },
    convName: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    convLast: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  }), [colors]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={[styles.header, { position: 'relative' }]}>
        {/* Titre centré absolument — ne bouge pas selon les boutons */}
        <Text style={[styles.title, { position: 'absolute', left: 0, right: 0, textAlign: 'center' }]} pointerEvents="none">
          {tab === ('Amis' as any) ? 'Amis' : 'Social'}
        </Text>

        {/* Gauche — avatar profil */}
        <TouchableOpacity onPress={() => me && router.push({ pathname: '/profile', params: { uid: me.uid } })} activeOpacity={0.8}>
          {getPhoto(me?.uid ?? '') ? (
            <ExpoImage source={{ uri: getPhoto(me?.uid ?? '') ?? '' }} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.accent }} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person-outline" size={18} color={colors.accent} />
            </View>
          )}
        </TouchableOpacity>

        {/* Droite — actions selon onglet */}
        {tab === 'Feed' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={() => { setShowNotifs(true); markNotifsRead(); }} activeOpacity={0.8} style={{ position: 'relative' }}>
              <Ionicons name="notifications-outline" size={24} color={colors.text} />
              {(visibleUnreadNotifs + visibleFriendRequests.length) > 0 && (
                <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: colors.accent, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{(visibleUnreadNotifs + visibleFriendRequests.length) > 99 ? '99+' : visibleUnreadNotifs + visibleFriendRequests.length}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.newPostBtn} onPress={() => setShowNewPost(true)} activeOpacity={0.8}>
              <Ionicons name="add" size={20} color={colors.accent} />
            </TouchableOpacity>
          </View>
        )}
        {(tab === 'Messages' || tab === ('Amis' as any)) && (
          <TouchableOpacity style={styles.newPostBtn} onPress={() => setTab(tab === ('Amis' as any) ? 'Messages' : 'Amis' as any)} activeOpacity={0.8}>
            {tab === ('Amis' as any) ? (
              <Ionicons name="chevron-back" size={20} color={colors.accent} />
            ) : (
              <Ionicons name="person-add-outline" size={20} color={colors.accent} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {tab !== ('Amis' as any) && <View style={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)} activeOpacity={0.7}>
            <View>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
              {t === 'Messages' && visibleUnreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{visibleUnreadCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>}

      {tab === 'Feed' && (() => {
        const CHIPS: { key: 'all' | PostType; label: string; icon: string; color: string }[] = [
          { key: 'all',      label: 'Tout',        icon: 'apps-outline',         color: colors.textSecondary },
          { key: 'workout',  label: 'Séance',      icon: 'barbell-outline',      color: colors.accent },
          { key: 'meal',     label: 'Repas',       icon: 'restaurant-outline',   color: '#4CAF50' },
          { key: 'weight',   label: 'Poids',       icon: 'scale-outline',        color: '#64B5F6' },
          { key: 'progress', label: 'Progression', icon: 'body-outline',         color: '#8B5CF6' },
          { key: 'pr',       label: 'PR',           icon: 'trophy-outline',       color: '#F59E0B' },
          { key: 'recovery', label: 'Récup',       icon: 'bed-outline',          color: '#06B6D4' },
        ];
        const filtered = (feedFilter === 'all' ? posts : posts.filter((p) => p.type === feedFilter))
          .filter((p) => !blockedUsers.includes(p.uid) && !blockedBy.includes(p.uid));
        return (
          <View style={{ flex: 1 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm }}
              style={{ flexGrow: 0, flexShrink: 0 }}
            >
              {CHIPS.map((chip) => {
                const active = feedFilter === chip.key;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    onPress={() => setFeedFilter(chip.key)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 12, paddingVertical: 7,
                      borderRadius: 20, borderWidth: 1.5,
                      borderColor: active ? chip.color : colors.border,
                      backgroundColor: active ? chip.color + '18' : colors.card,
                    }}
                  >
                    <Ionicons name={chip.icon as any} size={13} color={active ? chip.color : colors.textSecondary} />
                    <Text style={{ color: active ? chip.color : colors.textSecondary, fontSize: 13, fontWeight: '600' }}>{chip.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {feedLoading
              ? <PulsingLoader size={44} style={{ marginTop: 40 }} />
              : filtered.length === 0
                ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>{feedFilter === 'all' ? 'Aucun post pour l\'instant' : 'Aucun post dans cette catégorie'}</Text>
                    <Text style={styles.emptyHint}>{feedFilter === 'all' ? 'Ajoute des amis ou publie quelque chose !' : 'Sois le premier à publier ici !'}</Text>
                  </View>
                )
                : (
                  <FlatList
                    data={filtered}
                    keyExtractor={(p) => p.id}
                    contentContainerStyle={{ paddingBottom: 120 }}
                    renderItem={({ item }) => (
                      <PostCard post={item} onLike={handleLike} onComment={(p) => setCommentPost(p)} onDelete={handleDeletePost} onReport={(uid, postId, pseudo, text) => setReportTarget({ uid, contentType: 'post', contentId: postId, reportedPseudo: pseudo, contentText: text })} onAbout={(uid, pseudo) => handleAboutAccount(uid, pseudo)} photo={getPhoto(item.uid)} onBan={myAccountType === 'admin' ? (uid, pseudo, isBanned) => {
                        Alert.alert(
                          isBanned ? `Débannir @${pseudo}` : `Bannir @${pseudo}`,
                          isBanned ? 'Ce compte retrouvera un accès normal.' : 'Ce compte sera suspendu immédiatement.',
                          [
                            { text: 'Annuler', style: 'cancel' },
                            { text: isBanned ? 'Débannir' : 'Bannir', style: isBanned ? 'default' : 'destructive', onPress: async () => {
                              try {
                                if (isBanned) {
                                  await updateDoc(doc(db, 'users', uid), { accountType: 'standard' });
                                } else {
                                  await banUserCompletely(uid, pseudo);
                                }
                                Alert.alert(isBanned ? 'Compte débanni' : 'Compte banni');
                              } catch { Alert.alert('Erreur', 'Impossible d\'effectuer cette action.'); }
                            }},
                          ],
                        );
                      } : undefined} />
                    )}
                  />
                )}
          </View>
        );
      })()}

      {(tab as string) === 'Amis' && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <SearchIcon />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="@pseudo..."
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setResults([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <Button label="Chercher" variant="primary" fullWidth={false} onPress={handleSearch} style={{ paddingVertical: 12 }} />
          </View>

          {searchLoading && <PulsingLoader size={44} style={{ marginTop: spacing.lg }} />}

          {!searchLoading && search.length > 0 && !search.startsWith('@') && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Commence par @ pour rechercher un utilisateur</Text>
            </View>
          )}
          {!searchLoading && results.length === 0 && search.startsWith('@') && search.length > 1 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Aucun utilisateur trouvé</Text>
            </View>
          )}

          <FlatList
            data={results}
            keyExtractor={(item) => item.uid}
            contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: 120 }}
            renderItem={({ item }) => {
              const status = statusFor(item.uid);
              return (
                <TouchableOpacity
                  style={styles.userCard}
                  activeOpacity={0.75}
                  onPress={() => router.push({ pathname: '/profile', params: { uid: item.uid, from: 'search' } })}
                  onLongPress={() => {
                    Alert.alert(item.prenom ?? item.pseudo, undefined, [
                      { text: 'Signaler', style: 'destructive', onPress: () => setReportTarget({ uid: item.uid, contentType: 'user' }) },
                      { text: 'Bloquer', style: 'destructive', onPress: () => Alert.alert(`Bloquer @${item.pseudo} ?`, 'Tu ne verras plus ses contenus et il ne pourra plus te contacter.', [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Bloquer', style: 'destructive', onPress: async () => { await blockUser(item.uid); } },
                      ]) },
                      { text: 'À propos de ce compte', onPress: async () => {
                        const snap = await getDoc(doc(db, 'users', item.uid));
                        const since = snap.data()?.createdAt ? new Date(snap.data()!.createdAt.seconds * 1000).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : 'N/A';
                        Alert.alert('À propos de ce compte', `Pseudo : @${item.pseudo}\nMembre depuis : ${since}\n\nGosh vérifie l'identité des coaches certifiés. Si ce compte te semble frauduleux, utilise l'option "Signaler".`, [{ text: 'Fermer' }]);
                      }},
                      { text: 'Annuler', style: 'cancel' },
                    ]);
                  }}
                >
                  <View style={styles.avatar}>
                    {item.photoUrl
                      ? <ExpoImage source={{ uri: item.photoUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" cachePolicy="memory-disk" />
                      : <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '700' }}>{item.pseudo?.[0]?.toUpperCase() ?? '?'}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{item.prenom}</Text>
                      <UserBadge accountType={item.accountType} verified={item.verified} size={18} />
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>@{item.pseudo}</Text>
                  </View>
                  {status === 'ami' ? (
                    <View style={styles.friendBadge}><Text style={styles.friendBadgeText}>Ami</Text></View>
                  ) : status === 'envoyé' ? (
                    <TouchableOpacity
                      onPress={() => cancelRequest(item.uid)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: colors.textSecondary }}
                    >
                      <Ionicons name="hourglass-outline" size={14} color={colors.textSecondary} />
                      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>En attente</Text>
                    </TouchableOpacity>
                  ) : (
                    <UserPlusIcon size={36} onPress={() => sendRequest(item.uid)} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </KeyboardAvoidingView>
      )}

      {tab === 'Messages' && (
        <View style={{ flex: 1 }}>
          {/* Amis à contacter */}
          {myFriendsData.length > 0 && (
            <View>
              <Text style={styles.msgSectionTitle}>Amis</Text>
              <FlatList
                horizontal
                data={myFriendsData}
                keyExtractor={(f) => f.uid}
                contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.md, paddingBottom: spacing.sm }}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.friendChip}
                    onPress={() => router.push({ pathname: '/profile', params: { uid: item.uid } })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.friendChipAvatar}>
                      {getPhoto(item.uid)
                        ? <ExpoImage source={{ uri: getPhoto(item.uid)! }} style={styles.friendChipAvatarImg} contentFit="cover" cachePolicy="memory-disk" />
                        : <Text style={styles.friendChipAvatarText}>{item.pseudo?.[0]?.toUpperCase()}</Text>}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Text style={styles.friendChipName}>{item.prenom ?? item.pseudo}</Text>
                      <UserBadge accountType={item.accountType} verified={item.verified} size={13} />
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          <Text style={styles.msgSectionTitle}>Conversations</Text>
          {convsLoading
            ? <PulsingLoader size={44} style={{ marginTop: 20 }} />
            : visibleConversations.length === 0
              ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>Aucune conversation</Text>
                  <Text style={styles.emptyHint}>Clique sur un ami pour lui écrire !</Text>
                </View>
              )
              : (
                <FlatList
                  data={visibleConversations}
                  keyExtractor={(c) => c.chatId}
                  contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: 120 }}
                  renderItem={({ item }) => {
                    const isBlocked = blockedUsers.includes(item.otherUid) || blockedBy.includes(item.otherUid);
                    return (
                      <TouchableOpacity
                        style={[styles.convCard, item.isUnread && !isBlocked && { borderColor: colors.accent + '66', borderWidth: 1.5 }]}
                        onPress={() => router.push({ pathname: '/chat', params: { otherUid: item.otherUid, otherPseudo: item.otherPseudo } })}
                        activeOpacity={0.7}
                      >
                        {/* Avatar avec point non-lu */}
                        <View style={{ position: 'relative' }}>
                          <View style={[styles.convAvatar, isBlocked && { opacity: 0.35 }]}>
                            {!isBlocked && getPhoto(item.otherUid)
                              ? <ExpoImage source={{ uri: getPhoto(item.otherUid)! }} style={styles.convAvatarImg} contentFit="cover" cachePolicy="memory-disk" />
                              : isBlocked
                                ? <Ionicons name="person" size={22} color={colors.textSecondary} />
                                : <Text style={styles.convAvatarText}>{item.otherPseudo?.[0]?.toUpperCase() ?? '?'}</Text>}
                          </View>
                          {item.isUnread && !isBlocked && (
                            <View style={{ position: 'absolute', bottom: 0, right: 0, width: 13, height: 13, borderRadius: 6.5, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg }} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                              <Text style={[styles.convName, isBlocked && { color: colors.textSecondary }]}>
                                {isBlocked ? 'Utilisateur Gosh' : item.otherPseudo}
                              </Text>
                              {!isBlocked && <VerifiedBadge uid={item.otherUid} />}
                            </View>
                            {item.lastMessageAt && !isBlocked && (
                              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{timeAgo(item.lastMessageAt)}</Text>
                            )}
                          </View>
                          <Text style={[styles.convLast, item.isUnread && !isBlocked && { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
                            {isBlocked ? 'Conversation archivée' : item.lastMessage}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              )
          }
        </View>
      )}

      <NewPostModal visible={showNewPost} onClose={() => setShowNewPost(false)} />
      <CommentsModal post={commentPost} visible={!!commentPost} onClose={() => setCommentPost(null)} photoCache={{}} onOpenProfile={(uid) => router.push({ pathname: '/profile', params: { uid } })} blockedUsers={blockedUsers} blockedBy={blockedBy} />

      <ReportModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        reportedUid={reportTarget?.uid ?? ''}
        contentType={reportTarget?.contentType ?? 'post'}
        contentId={reportTarget?.contentId}
        contentText={reportTarget?.contentText}
        reportedPseudo={reportTarget?.reportedPseudo}
        onBlocked={() => { setReportTarget(null); setPosts((prev) => prev.filter((p) => p.uid !== reportTarget?.uid)); }}
      />

      {/* Modal Notifications */}
      <Modal visible={showNotifs} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNotifs(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            <View style={{ width: 44 }} />
            <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>Notifications</Text>
            </View>
            <TouchableOpacity onPress={() => setShowNotifs(false)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.card }} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={[
              ...visibleFriendRequests.map((r) => ({ ...r, _type: 'friendRequest' as const })),
              ...visibleNotifs.map((n) => ({ ...n, _type: 'notif' as const })),
            ]}
            keyExtractor={(item) => ('_type' in item && item._type === 'friendRequest') ? `req-${item.uid}` : (item as any).id}
            contentContainerStyle={{ paddingBottom: 60 }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 100, gap: 14 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="notifications-outline" size={34} color={colors.textSecondary} />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '500' }}>Aucune notification</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: 40, lineHeight: 18 }}>Les likes, commentaires et demandes d'amis apparaîtront ici.</Text>
              </View>
            }
            renderItem={({ item }) => {
              if (item._type === 'friendRequest') {
                const req = item as typeof friendRequests[0] & { _type: 'friendRequest' };
                const photo = req.photoUrl || getCachedPhoto(req.uid);
                return (
                  <Swipeable
                    renderRightActions={() => (
                      <View style={{ width: 80, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="trash-outline" size={22} color="#fff" />
                      </View>
                    )}
                    onSwipeableOpen={() => declineRequest(req.uid)}
                    overshootRight={false}
                  >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.md, paddingVertical: 14, backgroundColor: colors.accent + '0d', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                    <TouchableOpacity onPress={() => { setShowNotifs(false); router.push({ pathname: '/profile', params: { uid: req.uid, from: 'notif' } }); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.accent, overflow: 'hidden' }}>
                        {photo
                          ? <Image source={{ uri: photo }} style={{ width: 52, height: 52 }} />
                          : <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '800' }}>{(req.prenom ?? req.pseudo)?.[0]?.toUpperCase()}</Text>}
                      </View>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>
                        <Text style={{ fontWeight: '700' }}>{req.prenom ?? req.pseudo}</Text>
                        <Text style={{ color: colors.textSecondary }}>{' t\'a envoyé une demande d\'ami'}</Text>
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={{ backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 14, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => acceptRequest(req.uid)}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Accepter</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
                        onPress={() => declineRequest(req.uid)}>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Refuser</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  </Swipeable>
                );
              }

              const notif = item as any;
              // Notification de modération (suppression de contenu par admin)
              if (notif.type === 'moderation') {
                return (
                  <Swipeable
                    key={notif.id}
                    renderRightActions={() => (
                      <View style={{ width: 80, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="trash-outline" size={22} color="#fff" />
                      </View>
                    )}
                    onSwipeableOpen={() => dismissNotif(notif.id)}
                    overshootRight={false}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.md, paddingVertical: 14, backgroundColor: notif.read ? colors.bg : '#FF3B30' + '0d', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#FF3B30' + '18', alignItems: 'center', justifyContent: 'center' }}>
                        <Image source={require('../../../assets/images/logo-gosh-moderation.png')} style={{ width: 30, height: 30 }} resizeMode="contain" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 3 }}>{notif.title ?? 'Modération'}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>{notif.body}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 5 }}>{(() => {
                          const diff = Date.now() - (notif.createdAt?.toMillis?.() ?? notif.createdAt ?? 0);
                          const m = Math.floor(diff / 60000);
                          if (m < 1) return 'à l\'instant';
                          if (m < 60) return `${m}min`;
                          const h = Math.floor(m / 60);
                          if (h < 24) return `${h}h`;
                          return `${Math.floor(h / 24)}j`;
                        })()}</Text>
                      </View>
                    </View>
                  </Swipeable>
                );
              }

              const isFollow = notif.type === 'follow';
              const stillFollowing = myFriends.includes(notif.fromUid) || visibleFriendRequests.some((r) => r.uid === notif.fromUid);
              if (isFollow && !stillFollowing) return null;
              const followedBack = followBackSent.has(notif.fromUid) || myFriends.includes(notif.fromUid);

              const notifLabel =
                notif.type === 'like' ? 'a aimé ta publication.' :
                notif.type === 'comment' ? 'a commenté ta publication.' :
                notif.type === 'friendRequest' ? 't\'a envoyé une demande d\'ami.' :
                notif.type === 'follow' ? 's\'est abonné à ton compte.' :
                notif.type === 'coach_request' ? 't\'a envoyé une demande de coaching.' :
                notif.type === 'coach_accepted' ? 'a accepté ta demande de coaching.' :
                notif.type === 'coach_rejected' ? 'a refusé ta demande de coaching.' :
                notif.type === 'coaching_stopped' ? 'a arrêté le coaching avec toi.' :
                notif.type === 'training_plan_updated' ? 'a mis à jour ton programme d\'entraînement.' :
                'a interagi avec ton compte.';

              const timeAgo = (() => {
                const diff = Date.now() - (notif.createdAt?.toMillis?.() ?? notif.createdAt ?? 0);
                const m = Math.floor(diff / 60000);
                if (m < 1) return 'à l\'instant';
                if (m < 60) return `${m}min`;
                const h = Math.floor(m / 60);
                if (h < 24) return `${h}h`;
                return `${Math.floor(h / 24)}j`;
              })();

              return (
                <Swipeable
                  renderRightActions={() => (
                    <View style={{ width: 80, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="trash-outline" size={22} color="#fff" />
                    </View>
                  )}
                  onSwipeableOpen={() => dismissNotif(notif.id)}
                  overshootRight={false}
                >
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.md, paddingVertical: 14, backgroundColor: notif.read ? colors.bg : colors.accent + '0d', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
                  onPress={() => { if (notif.postId) { setShowNotifs(false); router.push({ pathname: '/post', params: { postId: notif.postId } }); } }}
                  activeOpacity={notif.postId ? 0.7 : 1}
                >
                  {/* Avatar */}
                  <TouchableOpacity onPress={() => { setShowNotifs(false); router.push({ pathname: '/profile', params: { uid: notif.fromUid, from: 'notif' } }); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <View style={{ position: 'relative' }}>
                      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {(getCachedPhoto(notif.fromUid) || notif.fromPhoto)
                          ? <ExpoImage source={{ uri: getCachedPhoto(notif.fromUid) || notif.fromPhoto }} style={{ width: 52, height: 52 }} contentFit="cover" cachePolicy="memory-disk" />
                          : <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '800' }}>{notif.fromPseudo?.[0]?.toUpperCase()}</Text>}
                      </View>
                      {/* Icône type notif */}
                      <View style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: notif.type === 'like' ? '#e74c3c' : notif.type === 'comment' ? colors.accent : notif.type === 'friendRequest' ? '#3498db' : notif.type === 'coach_request' || notif.type === 'coach_accepted' || notif.type === 'coach_rejected' || notif.type === 'coaching_stopped' || notif.type === 'training_plan_updated' ? colors.accent : colors.accentGreen, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg }}>
                        <Ionicons
                          name={notif.type === 'like' ? 'heart' : notif.type === 'comment' ? 'chatbubble' : notif.type === 'friendRequest' ? 'person-add' : notif.type === 'coach_request' ? 'barbell' : notif.type === 'coach_accepted' ? 'checkmark-circle' : notif.type === 'coach_rejected' ? 'close-circle' : notif.type === 'coaching_stopped' ? 'remove-circle' : notif.type === 'training_plan_updated' ? 'barbell' : 'person-add'}
                          size={11} color="#fff"
                        />
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Texte */}
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{notif.fromPseudo}</Text>
                      {notifMeta[notif.fromUid]?.accountType && (
                        <UserBadge
                          accountType={notifMeta[notif.fromUid].accountType}
                          verified={notifMeta[notif.fromUid].verified}
                          size={14}
                        />
                      )}
                      <Text style={{ color: colors.textSecondary, fontSize: 15 }}>{notifLabel}</Text>
                    </View>
                    {!!notif.postPreview && (
                      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={1}>{notif.postPreview}</Text>
                    )}
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>{timeAgo}</Text>
                  </View>

                  {/* Droite : photo post ou bouton follow ou point non lu */}
                  {isFollow ? (
                    <TouchableOpacity
                      style={{ backgroundColor: followedBack ? colors.card : colors.accent, borderRadius: 10, paddingHorizontal: 14, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: followedBack ? colors.border : colors.accent }}
                      onPress={async () => {
                        if (followedBack) { await unfollow(notif.fromUid); }
                        else { await sendRequest(notif.fromUid); setFollowBackSent((prev) => new Set(prev).add(notif.fromUid)); }
                      }}
                    >
                      <Text style={{ color: followedBack ? colors.textSecondary : '#fff', fontSize: 14, fontWeight: '700' }}>
                        {followedBack ? 'Suivi' : 'Suivre'}
                      </Text>
                    </TouchableOpacity>
                  ) : notif.postPhotoUrl ? (
                    <Image source={{ uri: notif.postPhotoUrl }} style={{ width: 52, height: 52, borderRadius: 8 }} />
                  ) : !notif.read ? (
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />
                  ) : null}
                </TouchableOpacity>
                </Swipeable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

