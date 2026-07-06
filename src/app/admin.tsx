import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors, spacing, radius } from '../constants/theme';
import { auth, db } from '../utils/firebase';
import { banUserCompletely } from '../utils/banUser';
import {
  collection, query, where, orderBy, getDocs,
  doc, updateDoc, deleteDoc, getDoc,
} from 'firebase/firestore';

type Report = {
  id: string;
  reporterUid: string;
  reportedUid: string;
  reportedPseudo: string | null;
  contentType: 'post' | 'message' | 'user' | 'club';
  contentId: string | null;
  contentText: string | null;
  clubId: string | null;
  reason: string;
  status: 'pending' | 'resolved' | 'banned';
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
};

const TYPE_ICONS: Record<string, string> = {
  post: 'image-outline',
  message: 'chatbubble-outline',
  user: 'person-outline',
  club: 'people-outline',
};

export default function AdminScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'banned'>('pending');

  const loadReports = useCallback(async () => {
    const q = query(
      collection(db, 'reports'),
      where('status', '==', filter),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report)));
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
      await updateDoc(doc(db, 'reports', report.id), { status: 'resolved' });
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
      'Cette action est irréversible. Le contenu sera définitivement supprimé.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(report.id);
            try {
              if (report.contentType === 'post' && report.contentId) {
                await deleteDoc(doc(db, 'posts', report.contentId));
              } else if (report.contentType === 'message' && report.contentId && report.clubId) {
                await deleteDoc(doc(db, 'clubs', report.clubId, 'messages', report.contentId));
              } else if (report.contentType === 'message' && report.contentId) {
                // Message privé — on ne peut pas le supprimer directement sans le chatId
                Alert.alert('Info', 'La suppression de messages privés nécessite le chatId. Signalez manuellement.');
                return;
              } else if (report.contentType === 'club' && report.contentId) {
                await deleteDoc(doc(db, 'clubs', report.contentId));
              }
              await updateDoc(doc(db, 'reports', report.id), { status: 'resolved' });
              setReports((prev) => prev.filter((r) => r.id !== report.id));
              Alert.alert('Contenu supprimé', 'Le contenu a été supprimé avec succès.');
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
      'Ce compte sera suspendu et ne pourra plus accéder à l\'application.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bannir',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(report.id);
            try {
              await banUserCompletely(report.reportedUid, report.reportedPseudo ?? undefined);
              await updateDoc(doc(db, 'reports', report.id), { status: 'banned' });
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
        <TouchableOpacity onPress={() => router.back()} style={{ width: 44, height: 44, justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Modération</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Espace administrateur</Text>
        </View>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FF3B30' + '20', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="shield-checkmark" size={18} color="#FF3B30" />
        </View>
      </View>

      {/* Filtres */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        {(['pending', 'resolved', 'banned'] as const).map((f) => {
          const labels = { pending: 'En attente', resolved: 'Traités', banned: 'Bannis' };
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={{
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                backgroundColor: active ? (f === 'pending' ? '#FF3B30' : f === 'banned' ? '#FF9500' : colors.accent) : colors.card,
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
            contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
          >
            {reports.length === 0
              ? (
                <View style={{ alignItems: 'center', marginTop: 60, gap: 12 }}>
                  <Ionicons name="checkmark-circle-outline" size={48} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Aucun signalement {filter === 'pending' ? 'en attente' : filter === 'resolved' ? 'traité' : 'banni'}</Text>
                </View>
              )
              : reports.map((report) => (
                <View
                  key={report.id}
                  style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}
                >
                  {/* En-tête du signalement */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FF3B30' + '15', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={TYPE_ICONS[report.contentType] as any} size={18} color="#FF3B30" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                          {TYPE_LABELS[report.contentType]}
                        </Text>
                        <View style={{ backgroundColor: '#FF3B30' + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                          <Text style={{ color: '#FF3B30', fontSize: 11, fontWeight: '600' }}>
                            {REASON_LABELS[report.reason] ?? report.reason}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                        {formatDate(report.createdAt)}
                      </Text>
                    </View>
                  </View>

                  {/* Infos */}
                  <View style={{ padding: 14, gap: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, width: 90 }}>Signalé :</Text>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', flex: 1 }}>
                        @{report.reportedPseudo ?? report.reportedUid}
                      </Text>
                    </View>
                    {report.contentText && (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 13, width: 90 }}>Contenu :</Text>
                        <Text style={{ color: colors.text, fontSize: 13, flex: 1, fontStyle: 'italic' }} numberOfLines={3}>
                          "{report.contentText}"
                        </Text>
                      </View>
                    )}
                    {report.clubId && (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 13, width: 90 }}>Club ID :</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={1}>
                          {report.clubId}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Actions */}
                  {filter === 'pending' && (
                    <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                      <TouchableOpacity
                        onPress={() => handleIgnore(report)}
                        disabled={actionLoading === report.id}
                        style={{ flex: 1, paddingVertical: 13, alignItems: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border }}
                      >
                        {actionLoading === report.id
                          ? <ActivityIndicator size="small" color={colors.textSecondary} />
                          : <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>Ignorer</Text>}
                      </TouchableOpacity>
                      {(report.contentType === 'post' || report.contentType === 'message' || report.contentType === 'club') && (
                        <TouchableOpacity
                          onPress={() => handleDeleteContent(report)}
                          disabled={actionLoading === report.id}
                          style={{ flex: 1, paddingVertical: 13, alignItems: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border }}
                        >
                          <Text style={{ color: '#FF9500', fontSize: 14, fontWeight: '600' }}>Supprimer</Text>
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
