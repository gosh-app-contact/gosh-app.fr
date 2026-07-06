import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useColors, spacing, radius } from '../constants/theme';
import { createClub, CLUB_CATEGORIES, ClubCategory } from '../utils/clubUtils';

export default function ClubCreateScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ClubCategory | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [bannerUri, setBannerUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission refusée'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const pickBanner = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission refusée'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true, aspect: [16, 9], quality: 0.8,
    });
    if (!result.canceled) setBannerUri(result.assets[0].uri);
  };

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert('Nom requis'); return; }
    if (!category) { Alert.alert('Catégorie requise'); return; }
    if (!description.trim()) { Alert.alert('Description requise'); return; }
    setLoading(true);
    try {
      const clubId = await createClub({ name, description, category, photoUri, bannerUri });
      router.replace({ pathname: '/club', params: { clubId } });
    } catch (e: any) {
      Alert.alert('Erreur', e.message ?? 'Impossible de créer le club.');
    } finally {
      setLoading(false);
    }
  };

  const c = colors;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['bottom']}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingBottom: 14, paddingTop: insets.top + 14,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, minHeight: 56,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' }}>
          Créer un club
        </Text>
        <TouchableOpacity onPress={handleCreate} disabled={loading}
          style={{ width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
          {loading
            ? <ActivityIndicator size="small" color={c.accent} />
            : <Text style={{ color: c.accent, fontSize: 15, fontWeight: '700' }}>Créer</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }} showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {/* Photo */}
          <TouchableOpacity onPress={pickPhoto} activeOpacity={0.85}
            style={{ alignSelf: 'center', width: 96, height: 96, borderRadius: 48 }}>
            {photoUri
              ? <ExpoImage source={{ uri: photoUri }} style={{ width: 96, height: 96, borderRadius: 48 }} contentFit="cover" />
              : <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }}>
                  <Ionicons name="camera" size={28} color={c.textSecondary} />
                </View>}
            <View style={{ position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: c.bg }}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={{ color: c.accent, fontSize: 13, textAlign: 'center', marginTop: -16 }}>Photo du club</Text>

          {/* Bannière */}
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Bannière <Text style={{ color: c.textSecondary, fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>(optionnelle)</Text>
            </Text>
            <TouchableOpacity onPress={pickBanner} activeOpacity={0.85}
              style={{ width: '100%', height: 110, borderRadius: 12, overflow: 'hidden', backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
              {bannerUri
                ? <ExpoImage source={{ uri: bannerUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                : <View style={{ alignItems: 'center', gap: 6 }}>
                    <Ionicons name="image-outline" size={28} color={c.textSecondary} />
                    <Text style={{ color: c.textSecondary, fontSize: 13 }}>Ajouter une bannière</Text>
                  </View>}
              <View style={{ position: 'absolute', bottom: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Nom */}
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Nom du club
            </Text>
            <TextInput
              style={{ backgroundColor: c.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: c.text, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }}
              value={name} onChangeText={setName}
              placeholder="Ex : Gosh Warriors" placeholderTextColor={c.textSecondary}
              maxLength={40} autoCorrect={false}
            />
          </View>

          {/* Description */}
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Description
            </Text>
            <TextInput
              style={{ backgroundColor: c.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: c.text, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, minHeight: 90, textAlignVertical: 'top' }}
              value={description} onChangeText={setDescription}
              placeholder="Décris ton club en quelques mots…" placeholderTextColor={c.textSecondary}
              multiline maxLength={200}
            />
            <Text style={{ color: c.textSecondary, fontSize: 11, textAlign: 'right' }}>{description.length}/200</Text>
          </View>

          {/* Catégorie */}
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Catégorie
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CLUB_CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat} onPress={() => setCategory(cat)} activeOpacity={0.8}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
                    backgroundColor: category === cat ? c.accent : c.card,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: category === cat ? c.accent : c.border,
                  }}>
                  <Text style={{ color: category === cat ? '#fff' : c.text, fontSize: 14, fontWeight: '500' }}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
