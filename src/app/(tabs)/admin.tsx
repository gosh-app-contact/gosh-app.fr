import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors, radius } from '../../constants/theme';
import { db, storage } from '../../utils/firebase';
import {
  collection, query, where, orderBy, getDocs,
  doc, updateDoc, deleteDoc, addDoc, serverTimestamp, getDoc, increment,
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { banUserCompletely } from '../../utils/banUser';

type Report = {
  id: string;
  reporterUid: string;
  reportedUid: string;
  reportedPseudo: string | null;
  contentType: 'post' | 'message' | 'user' | 'club' | 'coach';
  contentId: string | null;
  contentText: string | null;
  clubId: string | null;
  reason: string;
  status: 'pending' | 'resolved' | 'banned';
  decision?: 'validated' | 'removed' | 'banned';
  createdAt: any;
};

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  inappropriate: 'Contenu inapproprié',
  harassment: 'Harcèlement',
  fake: 'Faux compte',
  other: 'Autre',
};

const TYPE_LABELS: Record<string, string> = {
  post: 'Publication',
  message: 'Message',
  user: 'Utilisateur',
  club: 'Club',
  coach: 'Coach',
};

const TYPE_ICONS: Record<string, string> = {
  post: 'image-outline',
  message: 'chatbubble-outline',
  user: 'person-outline',
  club: 'people-outline',
  coach: 'ribbon-outline',
};

export default function AdminTab() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reports, setReports] = useState<Report[]>([]);
  const [violations, setViolations] = useState<Record<string, number>>({});
  const [reporterPseudos, setReporterPseudos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'banned' | 'coach'>('pending');

  const loadReports = useCallback(async () => {
    const q = filter === 'coach'
      ? query(
          collection(db, 'reports'),
          where('contentType', '==', 'coach'),
          where('status', '==', 'pending'),
          orderBy('createdAt', 'desc'),
        )
      : query(
          collection(db, 'reports'),
          where('status', '==', filter),
          orderBy('createdAt', 'desc'),
        );
    const snap = await getDocs(q);
    const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report));
    setReports(loaded);

    // Charger violations (reportedUid) et pseudos des signaleurs (reporterUid)
    const reportedUids = [...new Set(loaded.map((r) => r.reportedUid))];
    const reporterUids = [...new Set(loaded.map((r) => r.reporterUid).filter(Boolean))];
    const allUids = [...new Set([...reportedUids, ...reporterUids])];

    if (allUids.length > 0) {
      const snaps = await Promise.all(allUids.map((uid) => getDoc(doc(db, 'users', uid))));
      const vMap: Record<string, number> = {};
      const pMap: Record<string, string> = {};
      snaps.forEach((s, i) => {
        const uid = allUids[i];
        vMap[uid] = s.data()?.violationCount ?? 0;
        pMap[uid] = s.data()?.pseudo ?? s.data()?.prenom ?? uid;
      });
      setViolations(vMap);
      setReporterPseudos(pMap);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    loadReports().finally(() => setLoading(false));
  }, [loadReports]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  const handleIgnore = async (report: Report) => {
    setActionLoading(report.id);
    try {
      await Promise.all([
        updateDoc(doc(db, 'reports', report.id), { status: 'resolved', decision: 'validated' }),
        // Remettre le post visible si le signalement est ignoré
        report.contentType === 'post' && report.contentId
          ? updateDoc(doc(db, 'posts', report.contentId), { hidden: false })
          : Promise.resolve(),
      ]);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch {
      Alert.alert('Erreur', 'Impossible de résoudre ce signalement.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteContent = async (report: Report) => {
    Alert.alert(
      'Supprimer le contenu',
      'Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(report.id);
            try {
              if (report.contentType === 'post' && report.contentId) {
                const postSnap = await getDoc(doc(db, 'posts', report.contentId));
                const photoUrl: string = postSnap.data()?.photoUrl ?? '';
                // Supprimer tous les commentaires
                const commentsSnap = await getDocs(collection(db, 'posts', report.contentId, 'comments'));
                await Promise.all(commentsSnap.docs.map((c) => deleteDoc(c.ref)));
                // Supprimer le post
                await deleteDoc(doc(db, 'posts', report.contentId));
                // Supprimer la photo du Storage
                if (photoUrl && photoUrl.includes('firebasestorage')) {
                  try {
                    const pathMatch = photoUrl.match(/o\/(.+?)\?/);
                    if (pathMatch?.[1]) await deleteObject(ref(storage, decodeURIComponent(pathMatch[1])));
                  } catch {}
                }
              } else if (report.contentType === 'message' && report.contentId && report.clubId) {
                // Supprimer aussi l'image du message si elle existe
                const msgSnap = await getDoc(doc(db, 'clubs', report.clubId, 'messages', report.contentId));
                const msgPhoto: string = msgSnap.data()?.imageUrl ?? '';
                await deleteDoc(doc(db, 'clubs', report.clubId, 'messages', report.contentId));
                if (msgPhoto && msgPhoto.includes('firebasestorage')) {
                  try {
                    const pathMatch = msgPhoto.match(/o\/(.+?)\?/);
                    if (pathMatch?.[1]) await deleteObject(ref(storage, decodeURIComponent(pathMatch[1])));
                  } catch {}
                }
              } else if (report.contentType === 'club' && report.contentId) {
                await deleteDoc(doc(db, 'clubs', report.contentId));
              }
              await updateDoc(doc(db, 'reports', report.id), { status: 'resolved', decision: 'removed' });

              // Incrémenter le compteur de violations
              await updateDoc(doc(db, 'users', report.reportedUid), { violationCount: increment(1) }).catch(() => {});
              setViolations((prev) => ({ ...prev, [report.reportedUid]: (prev[report.reportedUid] ?? 0) + 1 }));

              // Notification à l'auteur du contenu supprimé
              const typeLabel = report.contentType === 'post' ? 'publication' : report.contentType === 'message' ? 'message' : 'club';
              await addDoc(collection(db, 'notifications', report.reportedUid, 'items'), {
                type: 'moderation',
                title: 'Contenu supprimé',
                body: `Ta ${typeLabel} a été supprimée car elle enfreignait les règles de Gosh. Merci de veiller à respecter notre communauté.`,
                read: false,
                createdAt: serverTimestamp(),
              }).catch(() => {});

              setReports((prev) => prev.filter((r) => r.id !== report.id));
              Alert.alert('Contenu supprimé', 'L\'auteur a été notifié.');
            } catch {
              Alert.alert('Erreur', 'Impossible de supprimer ce contenu.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  const handleBan = async (report: Report) => {
    Alert.alert(
      `Bannir @${report.reportedPseudo ?? report.reportedUid}`,
      "Ce compte sera suspendu et ne pourra plus accéder à l'application.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bannir',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(report.id);
            try {
              await banUserCompletely(report.reportedUid, report.reportedPseudo ?? undefined);
              await updateDoc(doc(db, 'reports', report.id), { status: 'banned', decision: 'banned' });
              setReports((prev) => prev.filter((r) => r.id !== report.id));
              Alert.alert('Compte banni', `@${report.reportedPseudo ?? report.reportedUid} a été banni.`);
            } catch {
              Alert.alert('Erreur', 'Impossible de bannir ce compte.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  const formatDate = (ts: any) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 14,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>Modération</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Espace administrateur</Text>
        </View>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#FF3B30' + '20', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="shield-checkmark" size={20} color="#FF3B30" />
        </View>
      </View>

      {/* Filtres */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        {(['pending', 'coach', 'resolved', 'banned'] as const).map((f) => {
          const labels = { pending: 'En attente', coach: 'Coachs', resolved: 'Traités', banned: 'Bannis' };
          const activeColors = { pending: '#FF3B30', coach: '#5856D6', resolved: colors.accent, banned: '#FF9500' };
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={{
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                backgroundColor: active ? activeColors[f] : colors.card,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: active ? 'transparent' : colors.border,
              }}
            >
              <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                {labels[f]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading
        ? <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
            contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }}
          >
            {reports.length === 0
              ? (
                <View style={{ alignItems: 'center', marginTop: 60, gap: 12 }}>
                  <Ionicons name="checkmark-circle-outline" size={48} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 15 }}>
                    {filter === 'coach' ? 'Aucun coach signalé' : `Aucun signalement ${filter === 'pending' ? 'en attente' : filter === 'resolved' ? 'traité' : 'banni'}`}
                  </Text>
                </View>
              )
              : reports.map((report) => (
                <View
                  key={report.id}
                  style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}
                >
                  {/* En-tête */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FF3B30' + '15', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={TYPE_ICONS[report.contentType] as any} size={18} color="#FF3B30" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                          {TYPE_LABELS[report.contentType]}
                        </Text>
                        <View style={{ backgroundColor: '#FF3B30' + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                          <Text style={{ color: '#FF3B30', fontSize: 11, fontWeight: '600' }}>
                            {REASON_LABELS[report.reason] ?? report.reason}
                          </Text>
                        </View>
                        {/* Badge décision — visible dans l'onglet Traités */}
                        {report.decision && (() => {
                          const cfg = {
                            validated: { label: 'Validé', color: colors.accentGreen },
                            removed: { label: 'Retiré', color: '#FF9500' },
                            banned: { label: 'Banni', color: '#FF3B30' },
                          }[report.decision];
                          return cfg ? (
                            <View style={{ backgroundColor: cfg.color + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                              <Text style={{ color: cfg.color, fontSize: 11, fontWeight: '700' }}>{cfg.label}</Text>
                            </View>
                          ) : null;
                        })()}
                        {/* Badge violations */}
                        {(violations[report.reportedUid] ?? 0) > 0 && (() => {
                          const count = violations[report.reportedUid];
                          const color = count >= 5 ? '#FF3B30' : count >= 3 ? '#FF9500' : '#8e8e93';
                          return (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: color + '18', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 }}>
                              <Ionicons name="warning-outline" size={11} color={color} />
                              <Text style={{ color, fontSize: 11, fontWeight: '700' }}>
                                {count} violation{count > 1 ? 's' : ''}
                              </Text>
                            </View>
                          );
                        })()}
                      </View>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                        {formatDate(report.createdAt)}
                      </Text>
                    </View>
                  </View>

                  {/* Infos */}
                  <View style={{ padding: 14, gap: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, width: 90 }}>Signalé :</Text>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/profile', params: { uid: report.reportedUid } } as any)}
                        activeOpacity={0.7}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>
                          @{report.reportedPseudo ?? report.reportedUid}
                        </Text>
                        <Ionicons name="open-outline" size={13} color={colors.accent} />
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, width: 90 }}>Signalé par :</Text>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/profile', params: { uid: report.reporterUid } } as any)}
                        activeOpacity={0.7}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                          @{reporterPseudos[report.reporterUid] ?? report.reporterUid}
                        </Text>
                        <Ionicons name="open-outline" size={13} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    {report.contentText && (
                      <View style={{ gap: 6 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Contenu signalé :</Text>
                        <View style={{ backgroundColor: colors.bg, borderRadius: 10, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                          <Text style={{ color: colors.text, fontSize: 13, fontStyle: 'italic', lineHeight: 19 }} numberOfLines={6}>
                            "{report.contentText}"
                          </Text>
                        </View>
                      </View>
                    )}
                    {/* Bouton Voir le contenu */}
                    {report.contentId && (
                      <TouchableOpacity
                        onPress={() => {
                          if (report.contentType === 'post') {
                            router.push({ pathname: '/post', params: { postId: report.contentId! } } as any);
                          } else if (report.contentType === 'message' && report.clubId) {
                            router.push({ pathname: '/club-chat', params: { clubId: report.clubId } } as any);
                          } else if (report.contentType === 'club') {
                            router.push({ pathname: '/club', params: { clubId: report.contentId! } } as any);
                          }
                        }}
                        activeOpacity={0.7}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.accent + '15', borderRadius: 10, alignSelf: 'flex-start' }}
                      >
                        <Ionicons name="eye-outline" size={15} color={colors.accent} />
                        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>
                          {report.contentType === 'post' ? 'Voir la publication' : report.contentType === 'message' ? 'Voir le chat du club' : 'Voir le club'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {(report.contentType === 'user' || report.contentType === 'coach') && (
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/profile', params: { uid: report.reportedUid } } as any)}
                        activeOpacity={0.7}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.accent + '15', borderRadius: 10, alignSelf: 'flex-start' }}
                      >
                        <Ionicons name="eye-outline" size={15} color={colors.accent} />
                        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>Voir le profil</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Actions — débannir */}
                  {filter === 'banned' && (
                    <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            `Débannir @${report.reportedPseudo ?? report.reportedUid}`,
                            'Ce compte retrouvera un accès normal à l\'application.',
                            [
                              { text: 'Annuler', style: 'cancel' },
                              {
                                text: 'Débannir',
                                onPress: async () => {
                                  setActionLoading(report.id);
                                  try {
                                    await updateDoc(doc(db, 'users', report.reportedUid), { accountType: 'standard' });
                                    await updateDoc(doc(db, 'reports', report.id), { status: 'resolved' });
                                    setReports((prev) => prev.filter((r) => r.id !== report.id));
                                    Alert.alert('Compte débanni', `@${report.reportedPseudo ?? report.reportedUid} peut à nouveau accéder à l'app.`);
                                  } catch {
                                    Alert.alert('Erreur', 'Impossible de débannir ce compte.');
                                  } finally {
                                    setActionLoading(null);
                                  }
                                },
                              },
                            ],
                          );
                        }}
                        disabled={actionLoading === report.id}
                        style={{ flex: 1, paddingVertical: 13, alignItems: 'center' }}
                      >
                        {actionLoading === report.id
                          ? <ActivityIndicator size="small" color={colors.textSecondary} />
                          : <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>Débannir</Text>}
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Actions — en attente */}
                  {filter === 'pending' && (
                    <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                      <TouchableOpacity
                        onPress={() => handleIgnore(report)}
                        disabled={actionLoading === report.id}
                        style={{ flex: 1, paddingVertical: 13, alignItems: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border }}
                      >
                        {actionLoading === report.id
                          ? <ActivityIndicator size="small" color={colors.textSecondary} />
                          : <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>Valider</Text>}
                      </TouchableOpacity>
                      {(report.contentType === 'post' || report.contentType === 'message' || report.contentType === 'club') && (
                        <TouchableOpacity
                          onPress={() => handleDeleteContent(report)}
                          disabled={actionLoading === report.id}
                          style={{ flex: 1, paddingVertical: 13, alignItems: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border }}
                        >
                          <Text style={{ color: '#FF9500', fontSize: 14, fontWeight: '600' }}>Retirer</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => handleBan(report)}
                        disabled={actionLoading === report.id}
                        style={{ flex: 1, paddingVertical: 13, alignItems: 'center' }}
                      >
                        <Text style={{ color: '#FF3B30', fontSize: 14, fontWeight: '600' }}>Bannir</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
          </ScrollView>
        )}
    </SafeAreaView>
  );
}
