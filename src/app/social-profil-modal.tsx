import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '../constants/theme';
import { auth, db } from '../utils/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { updateUserName } from '../utils/updateUserName';
import { uploadImage } from '../utils/uploadImage';

export default function SocialProfilModal() {
  const colors = useColors();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [bio, setBio] = useState('');

  useFocusEffect(useCallback(() => {
    (async () => {
      const me = auth.currentUser;
      if (!me) return;
      const snap = await getDoc(doc(db, 'users', me.uid));
      const data = snap.data() ?? {};
      setPhotoUrl(data.photoUrl ?? null);
      setDisplayName(data.displayName ?? data.prenom ?? '');
      setPseudo(data.pseudo ?? '');
      setBio(data.bio ?? '');
      setLoading(false);
    })();
  }, []));

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission refusée'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    setSaving(true);
    try {
      const url = await uploadImage(result.assets[0].uri, 'avatars');
      await updateDoc(doc(db, 'users', auth.currentUser!.uid), { photoUrl: url });
      setPhotoUrl(url);
    } catch {
      Alert.alert('Erreur', 'Impossible de télécharger la photo.');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const me = auth.currentUser;
    if (!me) return;
    setSaving(true);
    try {
      await updateUserName(me.uid, displayName.trim());
      await setDoc(doc(db, 'users', me.uid), { bio: bio.trim() }, { merge: true });
      router.back();
    } catch {
      Alert.alert('Erreur', 'Sauvegarde impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        minHeight: 56,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' }}
          accessibilityLabel="Retour"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>

        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' }}>
          Modifier le profil
        </Text>

        <TouchableOpacity
          onPress={save}
          disabled={saving}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}
          accessibilityLabel="Enregistrer"
          accessibilityRole="button"
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.accent} />
            : <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>OK</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* Avatar hero */}
          <View style={{ alignItems: 'center', paddingTop: 32, paddingBottom: 28 }}>
            <TouchableOpacity onPress={pickPhoto} activeOpacity={0.85}>
              <View style={{ width: 96, height: 96, borderRadius: 48 }}>
                {loading ? (
                  <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color={colors.accent} />
                  </View>
                ) : photoUrl ? (
                  <ExpoImage source={{ uri: photoUrl }} style={{ width: 96, height: 96, borderRadius: 48 }} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.accent, fontSize: 36, fontWeight: '700' }}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                )}
                {/* Badge caméra */}
                <View style={{
                  position: 'absolute', bottom: 2, right: 2,
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: colors.accent,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2.5, borderColor: colors.bg,
                }}>
                  <Ionicons name="camera" size={14} color="#fff" />
                </View>
              </View>
            </TouchableOpacity>
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '500', marginTop: 10 }}>
              Changer la photo
            </Text>
          </View>

          {/* Champs groupés style iOS */}
          <View style={{ marginHorizontal: 16, gap: 24 }}>

            {/* Groupe identité */}
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 4 }}>
                Identité
              </Text>
              <View style={{ backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                {/* Prénom */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 52 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 15, width: 80 }}>Prénom</Text>
                  <TextInput
                    style={{ flex: 1, color: colors.text, fontSize: 15, textAlign: 'right' }}
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Ton prénom"
                    placeholderTextColor={colors.textSecondary}
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </View>

                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 16 }} />

                {/* Pseudo — non modifiable */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 52 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 15, width: 80 }}>Pseudo</Text>
                  <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 15, textAlign: 'right' }}>@{pseudo}</Text>
                  <Ionicons name="lock-closed" size={13} color={colors.border} style={{ marginLeft: 8 }} />
                </View>
              </View>
            </View>

            {/* Bio */}
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 4 }}>
                Bio
              </Text>
              <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 16 }}>
                <TextInput
                  style={{ color: colors.text, fontSize: 15, minHeight: 80, textAlignVertical: 'top', lineHeight: 22 }}
                  value={bio}
                  onChangeText={(t) => t.length <= 100 && setBio(t)}
                  placeholder="Dis quelque chose sur toi…"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />
                <Text style={{ color: bio.length >= 90 ? colors.accent : colors.textSecondary, fontSize: 12, textAlign: 'right', marginTop: 8 }}>
                  {bio.length}/100
                </Text>
              </View>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
