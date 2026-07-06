import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Modal,
  Platform, Animated, Easing, ActivityIndicator, Alert, ScrollView, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { useColors, spacing, radius } from '../constants/theme';
import { findCoachByCode, sendCoachRequest, cancelCoachRequest } from '../utils/coachStorage';
import { fetchAndCachePhoto } from '../utils/photoCache';
import { auth, db } from '../utils/firebase';
import { getDoc, doc } from 'firebase/firestore';
import UserBadge from '../components/UserBadge';
import Button from '../components/Button';
import ReportModal from '../components/ReportModal';
import { blockUser } from '../utils/reportUser';

type CoachResult = { uid: string; pseudo: string; firstName?: string; photoUrl?: string };

export default function FindCoachScreen() {
  const colors = useColors();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [coach, setCoach] = useState<CoachResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Card entry animations
  const cardY = useRef(new Animated.Value(40)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const avatarScale = useRef(new Animated.Value(0)).current;

  const animateCard = () => {
    cardY.setValue(40);
    cardOpacity.setValue(0);
    avatarScale.setValue(0);
    Animated.parallel([
      Animated.spring(cardY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(avatarScale, { toValue: 1, useNativeDriver: true, delay: 120, tension: 80, friction: 8 }),
    ]).start();
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    setSearching(true);
    setCoach(null);
    setNotFound(false);
    setSent(false);
    try {
      const result = await findCoachByCode(query.trim());
      if (!result) { setNotFound(true); return; }
      // Vérifier si ce coach est bloqué (dans les deux sens)
      const me = auth.currentUser;
      if (me) {
        const mySnap = await getDoc(doc(db, 'users', me.uid));
        const myData = mySnap.data() ?? {};
        const blockedByMe = (myData.blockedUsers ?? []).includes(result.uid);
        const blockedByCoach = (myData.blockedBy ?? []).includes(result.uid);
        if (blockedByMe || blockedByCoach) { setNotFound(true); return; }
      }
      // Refresh photo
      const freshPhoto = await fetchAndCachePhoto(result.uid).catch(() => result.photoUrl);
      setCoach({ ...result, photoUrl: freshPhoto ?? result.photoUrl });
      animateCard();
    } catch {
      Alert.alert('Erreur', 'Impossible de chercher ce coach.');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async () => {
    if (!coach) return;
    const me = auth.currentUser;
    if (!me) return;
    setSending(true);
    try {
      const mySnap = await getDoc(doc(db, 'users', me.uid));
      const myData = mySnap.data();
      const pseudo = myData?.pseudo ?? myData?.prenom ?? me.uid;
      const photoUrl = myData?.photoUrl ?? '';
      await sendCoachRequest(me.uid, pseudo, photoUrl, coach.uid, coach.pseudo);
      setSent(true);
    } catch {
      Alert.alert('Erreur', "Impossible d'envoyer la demande.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      {/* Nav header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6, marginRight: 8 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', flex: 1 }}>Trouver un coach</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, gap: spacing.xl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 26, fontWeight: '900' }}>Trouver un coach</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
              Entre le code de ton coach pour lui envoyer une demande de suivi.
            </Text>
          </View>

          {/* Barre de recherche */}
          <View style={{ gap: 10 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.card,
              borderRadius: radius.md,
              borderWidth: 1.5,
              borderColor: query.length > 0 ? colors.accent : colors.border,
              paddingHorizontal: 14,
              gap: 10,
            }}>
              <Ionicons name="search-outline" size={20} color={query.length > 0 ? colors.accent : colors.textSecondary} />
              <TextInput
                style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14, fontWeight: '500' }}
                value={query}
                onChangeText={(v) => { setQuery(v); setCoach(null); setNotFound(false); setSent(false); }}
                placeholder="Code coach (ex: thomas.gosh)"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => { setQuery(''); setCoach(null); setNotFound(false); setSent(false); }}>
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              onPress={handleSearch}
              disabled={!query.trim() || searching}
              activeOpacity={0.85}
              style={{
                backgroundColor: query.trim() ? colors.accent : colors.surface,
                borderRadius: radius.md,
                paddingVertical: 14,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {searching
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="search" size={16} color={query.trim() ? '#fff' : colors.textSecondary} />
                    <Text style={{ color: query.trim() ? '#fff' : colors.textSecondary, fontSize: 15, fontWeight: '700' }}>Rechercher</Text>
                  </>}
            </TouchableOpacity>
          </View>

          {/* Pas trouvé */}
          {notFound && !searching && (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: spacing.xl }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person-outline" size={24} color={colors.textSecondary} />
              </View>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Aucun coach trouvé</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
                Vérifie le code ou demande à ton coach de le partager depuis son profil.
              </Text>
            </View>
          )}

          {/* Carte coach trouvé */}
          {coach && (
            <Animated.View style={{ opacity: cardOpacity, transform: [{ translateY: cardY }] }}>
              <View style={{
                backgroundColor: colors.card,
                borderRadius: radius.lg,
                borderWidth: 1.5,
                borderColor: colors.accent + '40',
                overflow: 'hidden',
              }}>
                {/* Bandeau accent */}
                <View style={{ height: 4, backgroundColor: colors.accent }} />

                <View style={{ padding: spacing.lg, gap: spacing.lg }}>
                  {/* Profil coach */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <TouchableOpacity
                      onPress={() => setShowActionSheet(true)}
                      style={{ position: 'absolute', top: -spacing.md, right: -spacing.md, padding: 8, zIndex: 1 }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <Animated.View style={{ transform: [{ scale: avatarScale }] }}>
                      {coach.photoUrl ? (
                        <ExpoImage
                          source={{ uri: coach.photoUrl }}
                          style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: colors.accent }}
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.accent }}>
                          <Ionicons name="person" size={28} color={colors.accent} />
                        </View>
                      )}
                    </Animated.View>

                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>
                          {coach.firstName ?? coach.pseudo}
                        </Text>
                        <UserBadge accountType="coach" verified={false} size={18} />
                      </View>
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>@{coach.pseudo}</Text>
                    </View>
                  </View>

                  {/* Infos */}
                  <View style={{ gap: 10 }}>
                    {/* Ligne badge coach */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <UserBadge accountType="coach" verified={false} size={16} />
                      <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}>Compte coach vérifié sur Gosh</Text>
                    </View>
                    {[
                      { icon: 'lock-closed-outline', text: 'Ta demande sera visible uniquement par ce coach' },
                      { icon: 'notifications-outline', text: 'Tu seras notifié dès qu\'il accepte' },
                    ].map(({ icon, text }) => (
                      <View key={icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name={icon as any} size={16} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}>{text}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Bouton */}
                  {sent ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accentGreen + '18', borderRadius: radius.md, paddingVertical: 14, borderWidth: 1, borderColor: colors.accentGreen + '40' }}>
                      <Ionicons name="checkmark-circle" size={20} color={colors.accentGreen} />
                      <Text style={{ color: colors.accentGreen, fontSize: 15, fontWeight: '700' }}>Demande envoyée !</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={handleSendRequest}
                      disabled={sending}
                      activeOpacity={0.85}
                      style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                    >
                      {sending
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <>
                            <Ionicons name="paper-plane-outline" size={18} color="#fff" />
                            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Envoyer la demande</Text>
                          </>}
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Retour après envoi */}
              {sent && (
                <TouchableOpacity
                  onPress={() => router.back()}
                  style={{ marginTop: spacing.md, alignItems: 'center', paddingVertical: 12 }}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Retour à l'accueil →</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

          {/* Action sheet coach */}
          {coach && (
            <Modal visible={showActionSheet} transparent animationType="slide" onRequestClose={() => setShowActionSheet(false)}>
              <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowActionSheet(false)}>
                <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                  <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingBottom: 34, overflow: 'hidden' }}>
                    <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
                      <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
                    </View>
                    <View style={{ paddingHorizontal: spacing.lg, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{coach.firstName ?? coach.pseudo}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 2 }}>@{coach.pseudo}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { setShowActionSheet(false); setTimeout(() => setShowReportModal(true), 300); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.lg, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="flag-outline" size={22} color="#FF3B30" />
                      <Text style={{ color: '#FF3B30', fontSize: 16, fontWeight: '600' }}>Signaler ce coach</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setShowActionSheet(false);
                        Alert.alert('Bloquer ce coach ?', `${coach.firstName ?? coach.pseudo} ne pourra plus te contacter.`, [
                          { text: 'Annuler', style: 'cancel' },
                          { text: 'Bloquer', style: 'destructive', onPress: async () => { await blockUser(coach.uid); setCoach(null); } },
                        ]);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.lg, paddingVertical: 16 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="ban-outline" size={22} color={colors.text} />
                      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Bloquer</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Tips — visible quand rien n'est encore cherché */}
          {!coach && !notFound && !searching && (
            <View style={{ gap: 10, marginTop: spacing.sm }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Comment ça marche</Text>
              {[
                { icon: 'search-outline', title: 'Cherche ton coach', desc: 'Entre le code que ton coach t\'a donné' },
                { icon: 'paper-plane-outline', title: 'Envoie une demande', desc: 'Il recevra une notification et pourra accepter' },
                { icon: 'barbell-outline', title: 'Accède à ton programme', desc: 'Dès l\'acceptation ton plan apparaît dans Training' },
              ].map(({ icon, title, desc }) => (
                <View key={icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, minHeight: 64 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent + '12', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name={icon as any} size={20} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{title}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>{desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {coach && (
        <ReportModal
          visible={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportedUid={coach.uid}
          reportedPseudo={coach.pseudo}
          contentType="coach"
          onBlocked={() => { setShowReportModal(false); setCoach(null); }}
        />
      )}
    </SafeAreaView>
  );
}

