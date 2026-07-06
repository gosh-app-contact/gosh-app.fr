import React, { useState, useEffect, useRef, useMemo } from 'react';
import Constants from 'expo-constants';
import Button from '../components/Button';
import ReportModal from '../components/ReportModal';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
  Alert, Modal, Dimensions,
} from 'react-native';

const GIPHY_KEY: string = Constants.expoConfig?.extra?.giphyApiKey ?? '';
const { width: SW } = Dimensions.get('window');
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { useColors, colors, spacing } from '../constants/theme';
import { auth, db } from '../utils/firebase';
import { blockUser } from '../utils/reportUser';
import { filterContent } from '../utils/contentFilter';
import { getCachedPhoto, fetchAndCachePhoto, fetchAndCachePhotos, setCachedPhoto } from '../utils/photoCache';
import {
  doc, getDoc, getDocs, collection, query, orderBy,
  onSnapshot, addDoc, serverTimestamp, updateDoc,
  arrayUnion, arrayRemove, increment, deleteDoc,
} from 'firebase/firestore';

const VERIFIED_UID = 'fxThG1K46kX0UEdCESkSVesAMJJ2';

function VerifiedBadge({ uid }: { uid?: string }) {
  if (uid !== VERIFIED_UID) return null;
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" style={{ marginLeft: 3 }}>
      <Circle cx="12" cy="12" r="12" fill="#1D9BF0" />
      <Path d="M6.5 12.5l3.5 3.5 7.5-8" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function BackIcon() {
  return <Ionicons name="chevron-back" size={24} color={colors.text} />;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return <Ionicons name={filled ? 'heart' : 'heart-outline'} size={22} color={filled ? colors.accent : colors.textSecondary} />;
}

function CommentIcon() {
  return <Ionicons name="chatbubble-outline" size={22} color={colors.textSecondary} />;
}

function timeAgo(ts: any): string {
  if (!ts?.toDate) return '';
  const diff = Date.now() - ts.toDate().getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'À l\'instant';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

type Post = {
  id: string;
  uid: string;
  pseudo: string;
  content: string;
  photoUrl?: string;
  type: string;
  createdAt: any;
  likes: string[];
  commentCount?: number;
  visibility: string;
};

type Comment = {
  id: string;
  uid: string;
  pseudo: string;
  content: string;
  gifUrl?: string;
  likes?: string[];
  createdAt: any;
};

export default function PostScreen() {
  const colors = useColors();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const me = auth.currentUser;

  const [post, setPost] = useState<Post | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [authorPhoto, setAuthorPhoto] = useState<string | null>(() => post ? getCachedPhoto(post.uid) ?? null : null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentPhotos, setCommentPhotos] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [myPseudo, setMyPseudo] = useState('');
  const [showGif, setShowGif] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ uid: string; contentType: 'post' | 'message'; contentId?: string } | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const listRef = useRef<FlatList>(null);
  const lastTap = useRef<Record<string, number>>({});

  // Load post real-time
  useEffect(() => {
    if (!postId) return;
    const unsub = onSnapshot(doc(db, "posts", postId), (snap) => {
      if (snap.exists()) {
        setPost({ id: snap.id, ...snap.data() } as Post);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
    }, () => {});
    return unsub;
  }, [postId]);

  // Load author photo + my pseudo — cache global d'abord
  useEffect(() => {
    if (!post || !me) return;
    const cached = getCachedPhoto(post.uid);
    if (cached) {
      setAuthorPhoto(cached);
    } else {
      fetchAndCachePhoto(post.uid).then((url) => { if (url) setAuthorPhoto(url); });
    }
    getDoc(doc(db, 'users', me.uid)).then((s) => {
      if (s.exists()) setMyPseudo(s.data().prenom ?? s.data().pseudo ?? '');
    });
  }, [post?.uid, me]);

  // Sync blockedUsers en temps réel pour masquer les commentaires au déblocage aussi
  useEffect(() => {
    if (!me) return;
    const unsub = onSnapshot(doc(db, 'users', me.uid), (snap) => {
      setBlockedUsers(snap.data()?.blockedUsers ?? []);
    }, () => {});
    return unsub;
  }, [me?.uid]);

  // Load comments real-time
  useEffect(() => {
    if (!postId) return;
    const q = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Comment));
      setComments(docs);
      // Load comment author photos via cache global
      const uids = [...new Set(docs.map((c) => c.uid))];
      await fetchAndCachePhotos(uids);
      const photos: Record<string, string> = {};
      uids.forEach((u) => { const p = getCachedPhoto(u); if (p) photos[u] = p; });
      setCommentPhotos(photos);
    }, () => {});
    return unsub;
  }, [postId]);

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

  const sendGifComment = async (gifUrl: string) => {
    if (!me || !post) return;
    setShowGif(false);
    try {
      await addDoc(collection(db, 'posts', post.id, 'comments'), {
        uid: me.uid, pseudo: myPseudo || me.email || 'Utilisateur',
        content: '', gifUrl, createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'posts', post.id), { commentCount: increment(1) });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 200);
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

  const toggleLike = async () => {
    if (!me || !post) return;
    const liked = post.likes.includes(me.uid);
    try {
      await updateDoc(doc(db, 'posts', post.id), { likes: liked ? arrayRemove(me.uid) : arrayUnion(me.uid) });
    } catch {}
  };

  const sendComment = async () => {
    if (!text.trim() || !me || !post) return;
    const check = filterContent(text.trim());
    if (!check.allowed) {
      Alert.alert('Contenu inapproprié', 'Ton commentaire contient des termes non autorisés sur Gosh.');
      return;
    }
    setSending(true);
    try {
      await addDoc(collection(db, 'posts', post.id, 'comments'), {
        uid: me.uid,
        pseudo: myPseudo || me.email || 'Utilisateur',
        content: text.trim(),
        createdAt: serverTimestamp(),
      });
      await Promise.all([
        updateDoc(doc(db, 'posts', post.id), { commentCount: increment(1) }),
        addDoc(collection(db, 'users', me.uid, 'sentComments'), { postId: post.id }),
      ]);
      setText('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 200);
    } finally {
      setSending(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!me || !post) return;
    Alert.alert('Supprimer', 'Supprimer ce commentaire ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'posts', post.id, 'comments', commentId));
          await updateDoc(doc(db, 'posts', post.id), { commentCount: increment(-1) });
        } catch { Alert.alert('Erreur', 'Impossible de supprimer le commentaire.'); }
      }},
    ]);
  };

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    backBtn: { width: 32 },
    headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' as const },
    postCard: { paddingTop: spacing.md },
    postAuthor: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.sm, paddingHorizontal: spacing.md },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const, borderWidth: 1.5, borderColor: colors.accent + '55' },
    avatarImg: { width: 42, height: 42 },
    avatarText: { color: colors.accent, fontSize: 16, fontWeight: '800' as const },
    pseudo: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
    time: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
    content: { color: colors.text, fontSize: 15, lineHeight: 22, marginBottom: spacing.sm, paddingHorizontal: spacing.md },
    postPhoto: { width: '100%', height: 420, marginBottom: spacing.sm },
    actions: { flexDirection: 'row' as const, gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 14 },
    actionBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
    actionCount: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' as const },
    separator: { height: 1, backgroundColor: colors.border },
    commentsTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' as const, paddingHorizontal: spacing.md, paddingVertical: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    commentRow: { flexDirection: 'row' as const, gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8, alignItems: 'flex-start' as const },
    commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const, flexShrink: 0 },
    commentAvatarText: { color: colors.accent, fontSize: 13, fontWeight: '700' as const },
    commentBubble: { flex: 1, backgroundColor: colors.card, borderRadius: 14, borderBottomLeftRadius: 4, padding: 10, borderWidth: 1, borderColor: colors.border },
    commentPseudo: { color: colors.accent, fontSize: 12, fontWeight: '700' as const },
    commentText: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 2 },
    commentTime: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
    noComments: { color: colors.textSecondary, textAlign: 'center' as const, marginTop: 24, fontSize: 14 },
    inputRow: { flexDirection: 'row' as const, gap: 8, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'center' as const },
    input: { flex: 1, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border, maxHeight: 100 },
    sendBtn: { backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
    sendText: { color: '#fff', fontWeight: '700' as const, fontSize: 14 },
  }), [colors]);

  if (notFound) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: spacing.xl }}>
        <Ionicons name="alert-circle-outline" size={52} color={colors.textSecondary} />
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Ce contenu n'est plus disponible</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center' }}>Cette publication a été supprimée ou n'existe plus.</Text>
        <Button label="Retour à l'accueil" variant="primary" fullWidth={false} onPress={() => router.replace('/(tabs)')} style={{ alignSelf: 'center' }} />
      </View>
    </SafeAreaView>
  );

  if (!post) return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View>;

  const liked = me ? post.likes.includes(me.uid) : false;
  const isOwner = me?.uid === post.uid;

  const deletePost = () => {
    Alert.alert('Supprimer', 'Supprimer cette publication ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            // Commentaires
            const commentsSnap = await getDocs(collection(db, 'posts', post.id, 'comments'));
            await Promise.all(commentsSnap.docs.map((c) => deleteDoc(c.ref)));
            // Photo Storage
            if (post.photoUrl) {
              const { ref: storageRef, deleteObject } = await import('firebase/storage');
              const { storage } = await import('../utils/firebase');
              deleteObject(storageRef(storage, post.photoUrl)).catch(() => {});
            }
            // Notifications like/comment reçues liées à ce post
            if (me) {
              const notifsSnap = await getDocs(collection(db, 'notifications', me.uid, 'items')).catch(() => null);
              const toDelete = notifsSnap?.docs.filter((d) => d.data().postId === post.id) ?? [];
              await Promise.all(toDelete.map((d) => deleteDoc(d.ref)));
            }
            // Post lui-même
            await deleteDoc(doc(db, 'posts', post.id));
            router.back();
          } catch { Alert.alert('Erreur', 'Impossible de supprimer la publication.'); }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Publication</Text>
        {isOwner
          ? (
            <TouchableOpacity onPress={deletePost} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 32, alignItems: 'flex-end' }}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path d="M12 13a1 1 0 100-2 1 1 0 000 2zM19 13a1 1 0 100-2 1 1 0 000 2zM5 13a1 1 0 100-2 1 1 0 000 2z" fill={colors.text} />
              </Svg>
            </TouchableOpacity>
          )
          : <View style={{ width: 32 }} />}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={comments.filter((c) => !blockedUsers.includes(c.uid))}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListHeaderComponent={() => (
            <View>
              {/* Post */}
              <View style={styles.postCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[styles.postAuthor, { flex: 1 }]}
                    onPress={() => router.push({ pathname: '/profile', params: { uid: post.uid } })}
                    activeOpacity={0.8}
                  >
                    <View style={styles.avatar}>
                      {authorPhoto
                        ? <ExpoImage source={{ uri: authorPhoto }} style={styles.avatarImg} contentFit="cover" />
                        : <Text style={styles.avatarText}>{post.pseudo?.[0]?.toUpperCase() ?? '?'}</Text>}
                    </View>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.pseudo}>{post.pseudo}</Text>
                        <VerifiedBadge uid={post.uid} />
                      </View>
                      <Text style={styles.time}>{timeAgo(post.createdAt)}{post.visibility === 'private' ? ' · Amis' : ''}</Text>
                    </View>
                  </TouchableOpacity>
                  {me && post.uid !== me.uid && (
                    <TouchableOpacity
                      onPress={() => Alert.alert(post.pseudo ?? 'Ce compte', undefined, [
                        { text: 'Signaler', style: 'destructive', onPress: () => setReportTarget({ uid: post.uid, contentType: 'post', contentId: post.id }) },
                        { text: 'Bloquer', style: 'destructive', onPress: () => Alert.alert(`Bloquer @${post.pseudo} ?`, 'Tu ne verras plus ses publications et il ne pourra plus te contacter.', [
                          { text: 'Annuler', style: 'cancel' },
                          { text: 'Bloquer', style: 'destructive', onPress: async () => { await blockUser(post.uid); router.back(); } },
                        ]) },
                        { text: 'À propos de ce compte', onPress: async () => {
                          const snap = await getDoc(doc(db, 'users', post.uid));
                          const since = snap.data()?.createdAt ? new Date(snap.data()!.createdAt.seconds * 1000).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : 'N/A';
                          Alert.alert('À propos de ce compte', `Pseudo : @${post.pseudo}\nMembre depuis : ${since}\n\nGosh vérifie l'identité des coaches certifiés. Si ce compte te semble frauduleux, utilise l'option "Signaler".`, [{ text: 'Fermer' }]);
                        }},
                        { text: 'Annuler', style: 'cancel' },
                      ])}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 6 }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>

                {post.content.trim().length > 0 && (
                  <Text style={styles.content}>{post.content}</Text>
                )}

                {post.photoUrl && (
                  <ExpoImage source={{ uri: post.photoUrl }} style={styles.postPhoto} contentFit="cover" />
                )}

                {/* Actions */}
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={toggleLike} activeOpacity={0.7}>
                    <HeartIcon filled={liked} />
                    <Text style={[styles.actionCount, liked && { color: colors.accent }]}>{post.likes.length}</Text>
                  </TouchableOpacity>
                  <View style={styles.actionBtn}>
                    <CommentIcon />
                    <Text style={styles.actionCount}>{comments.filter((c) => !blockedUsers.includes(c.uid)).length}</Text>
                  </View>
                </View>
              </View>

              {/* Separator */}
              <View style={styles.separator} />
              <Text style={styles.commentsTitle}>Commentaires</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.commentRow}
              onLongPress={() => {
                if (me && item.uid === me.uid) {
                  deleteComment(item.id);
                } else if (me && item.uid !== me.uid) {
                  Alert.alert(`@${item.pseudo ?? 'Ce compte'}`, undefined, [
                    { text: 'Signaler', style: 'destructive', onPress: () => setReportTarget({ uid: item.uid, contentType: 'message', contentId: item.id }) },
                    { text: 'Bloquer', style: 'destructive', onPress: () => Alert.alert(`Bloquer @${item.pseudo} ?`, 'Tu ne verras plus ses contenus et il ne pourra plus te contacter.', [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Bloquer', style: 'destructive', onPress: async () => { await blockUser(item.uid); } },
                    ]) },
                    { text: 'Annuler', style: 'cancel' },
                  ]);
                }
              }}
              onPress={(e) => {
                if (e.nativeEvent.timestamp - (lastTap.current[item.id] ?? 0) < 300) {
                  toggleCommentLike(item.id, item.likes ?? []);
                }
                lastTap.current[item.id] = e.nativeEvent.timestamp;
              }}
              activeOpacity={0.9}
            >
              <TouchableOpacity onPress={() => router.push({ pathname: '/profile', params: { uid: item.uid } })} activeOpacity={0.8}>
                <View style={styles.commentAvatar}>
                  {commentPhotos[item.uid]
                    ? <ExpoImage source={{ uri: commentPhotos[item.uid] }} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit="cover" />
                    : <Text style={styles.commentAvatarText}>{item.pseudo?.[0]?.toUpperCase() ?? '?'}</Text>}
                </View>
              </TouchableOpacity>
              <View style={styles.commentBubble}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.commentPseudo}>{item.uid === me?.uid ? myPseudo || item.pseudo : item.pseudo}</Text>
                  <VerifiedBadge uid={item.uid} />
                </View>
                {item.gifUrl
                  ? <ExpoImage source={{ uri: item.gifUrl }} style={{ width: 180, height: 120, borderRadius: 10, marginTop: 4 }} contentFit="cover" />
                  : <Text style={styles.commentText}>{item.content}</Text>}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={styles.commentTime}>{timeAgo(item.createdAt)}{me && item.uid === me.uid ? ' · Maintenir pour supprimer' : ' · Maintenir pour signaler'}</Text>
                  {(item.likes?.length ?? 0) > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="heart" size={13} color={colors.accent} />
                      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>{item.likes!.length}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.noComments}>Sois le premier à commenter !</Text>}
        />

        {/* Input commentaire */}
        <View style={styles.inputRow}>
          <TouchableOpacity onPress={() => { setShowGif(true); searchGifs(''); }} activeOpacity={0.7} style={{ padding: 6 }}>
            <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12 }}>GIF</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Ajouter un commentaire..."
            placeholderTextColor={colors.textSecondary}
            returnKeyType="send"
            onSubmitEditing={sendComment}
          />
          <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]} onPress={sendComment} disabled={!text.trim() || sending} activeOpacity={0.8}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendText}>Envoyer</Text>}
          </TouchableOpacity>
        </View>

        {/* GIF Modal */}
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
              <Button label="Fermer" variant="ghost" size="sm" fullWidth={false} onPress={() => setShowGif(false)} />
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
                      <TouchableOpacity onPress={() => sendGifComment(url)} activeOpacity={0.8}>
                        <ExpoImage source={{ uri: url }} style={{ width: (SW - 16) / 2, height: 120, borderRadius: 10 }} contentFit="cover" />
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
          </View>
        </Modal>
      </KeyboardAvoidingView>

      <ReportModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        reportedUid={reportTarget?.uid ?? ''}
        contentType={reportTarget?.contentType ?? 'post'}
        contentId={reportTarget?.contentId}
        onBlocked={() => { setReportTarget(null); router.back(); }}
      />
    </SafeAreaView>
  );
}

