import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Image } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Modal, Dimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors, spacing } from '../constants/theme';
import { auth, db, storage } from '../utils/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp,
  doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc, where, limit, getDocs,
} from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { uploadImage } from '../utils/uploadImage';
import * as ImagePicker from 'expo-image-picker';
import { pinMessage } from '../utils/clubUtils';
import { blockUser, unblockUser, sendReport, REPORT_REASONS } from '../utils/reportUser';
import { filterContent } from '../utils/contentFilter';
import { banUserCompletely } from '../utils/banUser';

const { width: SW } = Dimensions.get('window');
const GIPHY_KEY: string = Constants.expoConfig?.extra?.giphyApiKey ?? '';

type WorkoutExerciseSnap = {
  name: string;
  mode: 'sets' | '1rm';
  sets: { reps: number; kg: number; done: boolean }[];
  oneRmKg: number | null;
};

type Message = {
  id: string;
  uid: string;
  text?: string;
  photoUrl?: string;
  gifUrl?: string;
  type?: 'poll' | 'workout';
  pollQuestion?: string;
  pollOptions?: string[];
  pollVotes?: Record<string, string[]>;
  // workout
  workoutSessionName?: string;
  workoutTonnage?: number;
  workoutDate?: string;
  workoutExercises?: WorkoutExerciseSnap[];
  createdAt: any;
  pseudo?: string;
  prenom?: string;
  senderPhoto?: string;
};

// ─── Carte résultat séance ────────────────────────────────────────────────────
function WorkoutMessageCard({ item, isMe, colors }: { item: Message; isMe: boolean; colors: any }) {
  const [expanded, setExpanded] = useState(false);
  const exercises = item.workoutExercises ?? [];

  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
      <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          {/* Photo profil */}
          {item.senderPhoto ? (
            <Image source={{ uri: item.senderPhoto }} style={{ width: 44, height: 44, borderRadius: 22 }} />
          ) : (
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person" size={22} color={colors.accent} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{item.prenom || item.pseudo}</Text>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{item.workoutSessionName}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}>
              {item.workoutDate ? new Date(item.workoutDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }) : ''}
            </Text>
          </View>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent + '15', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="barbell-outline" size={18} color={colors.accent} />
          </View>
        </View>

        {/* Stats */}
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

        {/* Bouton Détail */}
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          activeOpacity={0.75}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}
        >
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{expanded ? 'Masquer le détail' : 'Voir le détail'}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} />
        </TouchableOpacity>

        {/* Détail exercices */}
        {expanded && (
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: 14, paddingBottom: 12, gap: 10, paddingTop: 10 }}>
            {exercises.map((ex, i) => (
              <View key={i} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{ex.name}</Text>
                  {ex.mode === '1rm' && (
                    <View style={{ backgroundColor: '#FFB80020', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: '#FFB800', fontSize: 11, fontWeight: '800' }}>1RM</Text>
                    </View>
                  )}
                </View>
                {ex.mode === '1rm' ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 26 }}>
                    <Text style={{ color: '#FFB800', fontWeight: '700' }}>{ex.oneRmKg} kg</Text> · 1 répétition
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 26 }}>
                    {(ex.sets ?? []).filter((s) => s.done).map((s, si) => (
                      <View key={si} style={{ backgroundColor: colors.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                          {s.reps}×<Text style={{ color: colors.text, fontWeight: '700' }}>{s.kg}kg</Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function ClubChatScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clubId, clubName } = useLocalSearchParams<{ clubId: string; clubName: string }>();
  const me = auth.currentUser;
  const flatRef = useRef<FlatList>(null);
  const lastSendRef = useRef<number>(0);

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [myBlockedUsers, setMyBlockedUsers] = useState<string[]>([]);
  const [myBlockedBy, setMyBlockedBy] = useState<string[]>([]);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollSending, setPollSending] = useState(false);
  const [showCharte, setShowCharte] = useState(false);
  const [activeGoshOff, setActiveGoshOff] = useState<{ opponentName: string; opponentPhoto: string; opponentRank: number | null } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('club_charte_accepted').then((val) => {
      if (val !== 'true') setShowCharte(true);
    });
  }, []);

  const allBlocked = useMemo(() => new Set([...myBlockedUsers, ...myBlockedBy]), [myBlockedUsers, myBlockedBy]);

  const GOSHOFF_COLOR = '#7C3AED';
  const MEDAL_COLORS: Record<number, string> = { 1: '#FFB800', 2: '#A8A8A8', 3: '#CD7F32' };

  // GoshOff actif du club
  useEffect(() => {
    if (!clubId) return;
    const getRankedClubs = () =>
      getDocs(query(collection(db, 'clubs'), where('weeklyScore', '>', 0), orderBy('weeklyScore', 'desc'), limit(20)))
        .then((snap) => {
          const clubs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
          clubs.sort((a: any, b: any) => ((b.weeklyScore ?? 0) / Math.max(b.memberCount, 1)) - ((a.weeklyScore ?? 0) / Math.max(a.memberCount, 1)));
          return clubs;
        }).catch(() => [] as any[]);

    const qC = query(collection(db, 'goshoffs'), where('challengerClubId', '==', clubId), where('status', '==', 'active'));
    const qD = query(collection(db, 'goshoffs'), where('challengedClubId', '==', clubId), where('status', '==', 'active'));
    // undefined = pas encore reçu, null = reçu vide, objet = reçu avec données
    let fromC: any = undefined;
    let fromD: any = undefined;

    const resolve = async () => {
      // Attendre que les deux listeners aient répondu au moins une fois
      if (fromC === undefined || fromD === undefined) return;
      const g = fromC || fromD;
      if (!g) { setActiveGoshOff(null); return; }
      const side = fromC ? 'challenger' : 'challenged';
      const opponentId = side === 'challenger' ? g.challengedClubId : g.challengerClubId;
      let opponentName = side === 'challenger' ? g.challengedClubName : g.challengerClubName;
      let opponentPhoto = side === 'challenger' ? (g.challengedClubPhoto ?? '') : (g.challengerClubPhoto ?? '');
      if (!opponentPhoto) {
        try {
          const snap = await getDoc(doc(db, 'clubs', opponentId));
          if (snap.exists()) opponentPhoto = snap.data()?.photoUrl ?? '';
        } catch {}
      }
      const ranked = await getRankedClubs();
      const idx = ranked.findIndex((c: any) => c.id === opponentId);
      const opponentRank = idx >= 0 && idx < 3 ? idx + 1 : null;
      setActiveGoshOff({ opponentName, opponentPhoto, opponentRank });
    };

    const unsubC = onSnapshot(qC, (s) => { fromC = s.empty ? null : s.docs[0].data(); resolve(); }, () => {});
    const unsubD = onSnapshot(qD, (s) => { fromD = s.empty ? null : s.docs[0].data(); resolve(); }, () => {});
    return () => { unsubC(); unsubD(); };
  }, [clubId]);

  useEffect(() => {
    if (!me) return;
    const unsub = onSnapshot(
      doc(db, 'users', me.uid),
      (snap) => {
        setMyBlockedUsers(snap.data()?.blockedUsers ?? []);
        setMyBlockedBy(snap.data()?.blockedBy ?? []);
        setIsSuperAdmin(snap.data()?.accountType === 'admin');
      },
      () => {},
    );
    return unsub;
  }, [me]);

  useEffect(() => {
    if (!clubId || !me) return;
    const unsub = onSnapshot(
      doc(db, 'clubs', clubId),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setIsAdmin((data.adminIds ?? []).includes(me.uid));
        setIsOwner(data.ownerId === me.uid);
        setPinnedMessageId(data.pinnedMessageId ?? null);
      },
      () => {},
    );
    return unsub;
  }, [clubId, me]);

  useEffect(() => {
    if (!clubId) return;
    const q = query(collection(db, 'clubs', clubId, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)));
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
      },
      () => {},
    );
    return unsub;
  }, [clubId]);

  useEffect(() => {
    if (!pinnedMessageId || !clubId) { setPinnedMessage(null); return; }
    getDoc(doc(db, 'clubs', clubId, 'messages', pinnedMessageId)).then((snap) => {
      if (snap.exists()) setPinnedMessage({ id: snap.id, ...snap.data() } as Message);
      else setPinnedMessage(null);
    });
  }, [pinnedMessageId, clubId]);

  const send = async (payload: { text?: string; photoUrl?: string; gifUrl?: string }) => {
    if (!me || !clubId) return;
    // Rate limiting : 500ms minimum entre deux envois
    const now = Date.now();
    if (now - lastSendRef.current < 500) return;
    lastSendRef.current = now;
    if (payload.text) {
      const check = filterContent(payload.text);
      if (!check.allowed) {
        Alert.alert('Contenu inapproprié', 'Ton message contient des termes non autorisés sur Gosh. Merci de le modifier.');
        return;
      }
    }
    // Validation gifUrl : uniquement Giphy
    if (payload.gifUrl && !payload.gifUrl.startsWith('https://media.giphy.com/')) {
      return;
    }
    setSending(true);
    try {
      const mySnap = await getDoc(doc(db, 'users', me.uid));
      const myData = mySnap.data() ?? {};
      await addDoc(collection(db, 'clubs', clubId, 'messages'), {
        uid: me.uid,
        pseudo: myData.pseudo ?? '',
        prenom: myData.prenom ?? '',
        senderPhoto: myData.photoUrl ?? '',
        createdAt: serverTimestamp(),
        ...payload,
      });
      setText('');
    } finally {
      setSending(false);
    }
  };

  const sendText = async () => {
    if (!text.trim()) return;
    await send({ text: text.trim() });
  };

  const sendPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission refusée'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (result.canceled) return;
    setSending(true);
    try {
      const url = await uploadImage(result.assets[0].uri, 'club-chat');
      await send({ photoUrl: url });
    } finally {
      setSending(false);
    }
  };

  const searchGifs = async (q: string) => {
    if (!q.trim()) return;
    setGifLoading(true);
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=g`);
      const json = await res.json();
      setGifs(json.data ?? []);
    } finally {
      setGifLoading(false);
    }
  };

  const sendPoll = async () => {
    if (!me || !clubId || !pollQuestion.trim()) return;
    const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) return;
    setPollSending(true);
    try {
      const mySnap = await getDoc(doc(db, 'users', me.uid));
      const myData = mySnap.data() ?? {};
      const votes: Record<string, string[]> = {};
      opts.forEach((_, i) => { votes[String(i)] = []; });
      await addDoc(collection(db, 'clubs', clubId, 'messages'), {
        uid: me.uid,
        pseudo: myData.pseudo ?? '',
        prenom: myData.prenom ?? '',
        senderPhoto: myData.photoUrl ?? '',
        createdAt: serverTimestamp(),
        type: 'poll',
        pollQuestion: pollQuestion.trim(),
        pollOptions: opts,
        pollVotes: votes,
      });
      setShowPoll(false);
      setPollQuestion('');
      setPollOptions(['', '']);
    } finally {
      setPollSending(false);
    }
  };

  const votePoll = async (msgId: string, optionIndex: number, currentVotes: Record<string, string[]>) => {
    if (!me || !clubId) return;
    const ref = doc(db, 'clubs', clubId, 'messages', msgId);
    const patch: Record<string, any> = {};
    // Retirer le vote de toutes les autres options
    Object.entries(currentVotes).forEach(([key, uids]) => {
      if (uids.includes(me.uid)) patch[`pollVotes.${key}`] = arrayRemove(me.uid);
    });
    const alreadyVotedThis = (currentVotes[String(optionIndex)] ?? []).includes(me.uid);
    if (!alreadyVotedThis) patch[`pollVotes.${optionIndex}`] = arrayUnion(me.uid);
    await updateDoc(ref, patch);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.uid === me?.uid;
    const isBlocked = allBlocked.has(item.uid);

    if (isBlocked) {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 4, gap: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', opacity: 0.35 }}>
            <Ionicons name="person" size={16} color={colors.textSecondary} />
          </View>
          <View style={{ maxWidth: '70%' }}>
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 2, marginLeft: 4 }}>Utilisateur Gosh</Text>
            <View style={{ backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, borderBottomLeftRadius: 4 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14, fontStyle: 'italic' }}>Message indisponible</Text>
            </View>
          </View>
        </View>
      );
    }

    // Résultat de séance
    if (item.type === 'workout') {
      return <WorkoutMessageCard item={item} isMe={isMe} colors={colors} />;
    }

    // Sondage
    if (item.type === 'poll') {
      const votes = item.pollVotes ?? {};
      const totalVotes = Object.values(votes).reduce((s, uids) => s + uids.length, 0);
      const myVoteIndex = (item.pollOptions ?? []).findIndex((_, i) => (votes[String(i)] ?? []).includes(me?.uid ?? ''));
      const hasVoted = myVoteIndex >= 0;
      return (
        <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
          {!isMe && <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4, marginLeft: 4 }}>{item.prenom || item.pseudo}</Text>}
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, maxWidth: SW * 0.82 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Ionicons name="bar-chart-outline" size={15} color={colors.accent} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{item.pollQuestion}</Text>
            </View>
            {(item.pollOptions ?? []).map((opt, i) => {
              const count = (votes[String(i)] ?? []).length;
              const pct = totalVotes > 0 ? count / totalVotes : 0;
              const isMyVote = myVoteIndex === i;
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => votePoll(item.id, i, votes)}
                  activeOpacity={0.8}
                  style={{ marginBottom: 8, borderRadius: 10, overflow: 'hidden', borderWidth: 1.5, borderColor: isMyVote ? colors.accent : colors.border }}
                >
                  <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${Math.round(pct * 100)}%`, backgroundColor: isMyVote ? colors.accent + '33' : colors.bg }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, gap: 8 }}>
                    <Text style={{ flex: 1, color: colors.text, fontSize: 14, fontWeight: isMyVote ? '700' : '400' }}>{opt}</Text>
                    {hasVoted && <Text style={{ color: isMyVote ? colors.accent : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{Math.round(pct * 100)}%</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</Text>
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity
        onLongPress={() => {
          const senderPseudo = item.prenom || item.pseudo || 'Utilisateur';
          const alreadyBlocked = allBlocked.has(item.uid);
          const options: any[] = [{ text: 'Annuler', style: 'cancel' }];
          if ((isAdmin || isOwner) && !isMe) {
            options.push({
              text: pinnedMessageId === item.id ? 'Désépingler' : 'Épingler',
              onPress: () => pinMessage(clubId!, pinnedMessageId === item.id ? null : item.id),
            });
          }
          if (!isMe) {
            if (isSuperAdmin) {
              // Compte admin : suppression directe du message
              options.push({
                text: 'Supprimer le message',
                style: 'destructive',
                onPress: () => {
                  Alert.alert('Supprimer ce message ?', 'Cette action est irréversible.', [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Supprimer',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          // Supprimer l'image du Storage si elle existe
                          if (item.photoUrl && item.photoUrl.includes('firebasestorage')) {
                            try {
                              const match = item.photoUrl.match(/o\/(.+?)\?/);
                              if (match?.[1]) await deleteObject(storageRef(storage, decodeURIComponent(match[1])));
                            } catch {}
                          }
                          await deleteDoc(doc(db, 'clubs', clubId!, 'messages', item.id));
                        } catch {
                          Alert.alert('Erreur', 'Impossible de supprimer ce message.');
                        }
                      },
                    },
                  ]);
                },
              });
              options.push({
                text: 'Bannir ce compte',
                style: 'destructive',
                onPress: () => {
                  Alert.alert(`Bannir @${senderPseudo} ?`, 'Ce compte sera suspendu immédiatement.', [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Bannir',
                      style: 'destructive',
                      onPress: async () => {
                        await banUserCompletely(item.uid, item.pseudo ?? item.prenom).catch(() => {});
                        Alert.alert('Compte banni', `@${senderPseudo} a été banni.`);
                      },
                    },
                  ]);
                },
              });
            } else {
              // Compte standard
              options.push({
                text: alreadyBlocked ? 'Débloquer' : 'Bloquer',
                style: alreadyBlocked ? 'default' : 'destructive',
                onPress: async () => {
                  if (alreadyBlocked) await unblockUser(item.uid).catch(() => {});
                  else await blockUser(item.uid).catch(() => {});
                },
              });
              options.push({
                text: 'Signaler',
                onPress: () => {
                  Alert.alert('Signaler', 'Motif du signalement', [
                    { text: 'Annuler', style: 'cancel' },
                    ...REPORT_REASONS.map((r) => ({
                      text: r.label,
                      onPress: () => sendReport({ reportedUid: item.uid, reportedPseudo: senderPseudo, contentType: 'message', contentId: item.id, contentText: item.text ?? undefined, clubId: clubId ?? undefined, reason: r.key }).catch(() => {}),
                    })),
                  ]);
                },
              });
            }
          }
          if (options.length > 1) Alert.alert(senderPseudo, undefined, options);
        }}
        activeOpacity={0.85}
        style={{ flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 4, gap: 8 }}
      >
        {!isMe && (
          item.senderPhoto
            ? <ExpoImage source={{ uri: item.senderPhoto }} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }} contentFit="cover" />
            : <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{(item.pseudo ?? '?')[0]?.toUpperCase()}</Text>
              </View>
        )}
        <View style={{ maxWidth: SW * 0.72 }}>
          {!isMe && <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: 3, marginLeft: 6 }}>{item.prenom || item.pseudo}</Text>}
          <View style={{
            backgroundColor: isMe ? colors.accent : colors.card,
            borderRadius: 20,
            paddingHorizontal: 14, paddingVertical: 10,
            borderBottomRightRadius: isMe ? 5 : 20,
            borderBottomLeftRadius: isMe ? 20 : 5,
            borderWidth: isMe ? 0 : StyleSheet.hairlineWidth,
            borderColor: colors.border,
            ...(isMe ? { shadowColor: colors.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6 } : {}),
          }}>
            {item.text && <Text style={{ color: isMe ? '#fff' : colors.text, fontSize: 15, lineHeight: 22 }}>{item.text}</Text>}
            {item.photoUrl && <ExpoImage source={{ uri: item.photoUrl }} style={{ width: 200, height: 200, borderRadius: 12 }} contentFit="cover" />}
            {item.gifUrl && <ExpoImage source={{ uri: item.gifUrl }} style={{ width: 200, height: 150, borderRadius: 12 }} contentFit="cover" />}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.card }}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.2 }} numberOfLines={1}>{clubName ?? 'Messages'}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>Chat du club</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Banner GoshOff actif */}
      {activeGoshOff && (() => {
        const medalColor = activeGoshOff.opponentRank ? MEDAL_COLORS[activeGoshOff.opponentRank] : null;
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: GOSHOFF_COLOR + '12', paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: GOSHOFF_COLOR + '33' }}>
            <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ position: 'absolute', width: 52, height: 52 }}>
                <Svg width={52} height={52}>
                  <Defs>
                    <RadialGradient id="glow_chat_goshoff" cx="50%" cy="50%" rx="50%" ry="50%">
                      <Stop offset="0%"   stopColor={GOSHOFF_COLOR} stopOpacity="0.65" />
                      <Stop offset="35%"  stopColor={GOSHOFF_COLOR} stopOpacity="0.25" />
                      <Stop offset="65%"  stopColor={GOSHOFF_COLOR} stopOpacity="0.07" />
                      <Stop offset="100%" stopColor={GOSHOFF_COLOR} stopOpacity="0" />
                    </RadialGradient>
                  </Defs>
                  <Ellipse cx={26} cy={26} rx={26} ry={26} fill="url(#glow_chat_goshoff)" />
                </Svg>
              </View>
              <Image source={require('../../assets/images/logo-goshoff.png')} style={{ width: 28, height: 28 }} resizeMode="contain" />
            </View>
            <Text style={{ color: GOSHOFF_COLOR, fontSize: 13, fontWeight: '700' }}>GoshOff en cours vs</Text>
            <View style={{ position: 'relative' }}>
              {activeGoshOff.opponentPhoto
                ? <ExpoImage source={{ uri: activeGoshOff.opponentPhoto }} style={{ width: 24, height: 24, borderRadius: 12, borderWidth: medalColor ? 1.5 : 0, borderColor: medalColor ?? 'transparent' }} contentFit="cover" />
                : <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: GOSHOFF_COLOR + '22', alignItems: 'center', justifyContent: 'center', borderWidth: medalColor ? 1.5 : 0, borderColor: medalColor ?? 'transparent' }}>
                    <Ionicons name="people" size={12} color={medalColor ?? GOSHOFF_COLOR} />
                  </View>}
              {medalColor && (
                <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: medalColor, borderRadius: 5, paddingHorizontal: 2, borderWidth: 1, borderColor: colors.bg }}>
                  <Text style={{ color: '#000', fontSize: 7, fontWeight: '900' }}>#{activeGoshOff.opponentRank}</Text>
                </View>
              )}
            </View>
            <Text style={{ color: GOSHOFF_COLOR, fontSize: 13, fontWeight: '700', flex: 1 }} numberOfLines={1}>{activeGoshOff.opponentName}</Text>
          </View>
        );
      })()}

      {/* Message épinglé */}
      {pinnedMessage && (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent + '12', paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.accent + '33' }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="pin" size={13} color={colors.accent} />
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }} numberOfLines={1}>
            {pinnedMessage.text ?? (pinnedMessage.photoUrl ? 'Photo' : 'GIF')}
          </Text>
          {(isAdmin || isOwner) && (
            <TouchableOpacity onPress={() => pinMessage(clubId!, null)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 12 }}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Input */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10), gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg }}>
          <TouchableOpacity onPress={sendPhoto} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowGif(true)} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12 }}>GIF</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowPoll(true)} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="bar-chart-outline" size={21} color={colors.textSecondary} />
          </TouchableOpacity>
          <TextInput
            style={{ flex: 1, backgroundColor: colors.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, color: colors.text, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, maxHeight: 120, minHeight: 44 }}
            value={text} onChangeText={setText}
            placeholder="Message…" placeholderTextColor={colors.textSecondary}
            multiline returnKeyType="send" onSubmitEditing={sendText}
          />
          <TouchableOpacity onPress={sendText} disabled={!text.trim() || sending}
            style={{ width: 44, height: 44, backgroundColor: text.trim() ? colors.accent : colors.card, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: text.trim() ? colors.accent : 'transparent', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 6 }}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color={text.trim() ? '#fff' : colors.textSecondary} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Charte communautaire — affichée une seule fois */}
      <Modal visible={showCharte} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 24, width: '100%', gap: 16 }}>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield-checkmark-outline" size={26} color={colors.accent} />
              </View>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>Bienvenue dans ce club</Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>
              En participant à ce chat, je m'engage à respecter les règles de la communauté Gosh et à être bienveillant(e) envers tous les membres.{'\n\n'}Tout comportement irrespectueux pourra entraîner une exclusion du club ou la suspension du compte.
            </Text>
            <TouchableOpacity
              onPress={() => {
                AsyncStorage.setItem('club_charte_accepted', 'true');
                setShowCharte(false);
              }}
              activeOpacity={0.85}
              style={{ backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>J'accepte et je continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Poll creator */}
      <Modal visible={showPoll} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 8 }}>
            <TouchableOpacity
              onPress={() => setShowPoll(false)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <Ionicons name="bar-chart" size={18} color={colors.accent} />
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Nouveau sondage</Text>
            </View>
            <TouchableOpacity
              onPress={sendPoll}
              disabled={pollSending || !pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2}
              style={{
                width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                backgroundColor: pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2 ? colors.accent : colors.card,
              }}
            >
              {pollSending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={18} color={pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2 ? '#fff' : colors.textSecondary} />}
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ padding: 16, gap: 16 }}>
              {/* Question */}
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="help-circle-outline" size={16} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>Question</Text>
                </View>
                <TextInput
                  value={pollQuestion}
                  onChangeText={setPollQuestion}
                  placeholder="Posez votre question…"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={120}
                  style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 15 }}
                />
              </View>

              {/* Options */}
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="list-outline" size={16} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>Options</Text>
                </View>
                {pollOptions.map((opt, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{i + 1}</Text>
                    </View>
                    <TextInput
                      value={opt}
                      onChangeText={(v) => setPollOptions((prev) => prev.map((o, j) => j === i ? v : o))}
                      placeholder={`Option ${i + 1}`}
                      placeholderTextColor={colors.textSecondary}
                      maxLength={60}
                      style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 11, color: colors.text, fontSize: 15 }}
                    />
                    {pollOptions.length > 2 && (
                      <TouchableOpacity onPress={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                        style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="close" size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {pollOptions.length < 6 && (
                  <TouchableOpacity
                    onPress={() => setPollOptions((prev) => [...prev, ''])}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 4 }}
                  >
                    <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="add" size={16} color={colors.accent} />
                    </View>
                    <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>Ajouter une option</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* GIF picker */}
      <Modal visible={showGif} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            <TextInput
              style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14 }}
              value={gifSearch} onChangeText={setGifSearch}
              placeholder="Rechercher un GIF…" placeholderTextColor={colors.textSecondary}
              onSubmitEditing={() => searchGifs(gifSearch)} returnKeyType="search"
            />
            <TouchableOpacity onPress={() => setShowGif(false)}>
              <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>Fermer</Text>
            </TouchableOpacity>
          </View>
          {gifLoading
            ? <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
            : <FlatList
                data={gifs}
                keyExtractor={(g) => g.id}
                numColumns={2}
                contentContainerStyle={{ padding: 8, gap: 8 }}
                columnWrapperStyle={{ gap: 8 }}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={async () => {
                    setShowGif(false);
                    await send({ gifUrl: item.images.fixed_height.url });
                  }} style={{ flex: 1 }}>
                    <ExpoImage source={{ uri: item.images.fixed_height.url }} style={{ width: '100%', height: 120, borderRadius: 8 }} contentFit="cover" />
                  </TouchableOpacity>
                )}
              />}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
