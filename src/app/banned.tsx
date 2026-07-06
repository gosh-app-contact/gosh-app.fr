import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '../constants/theme';
import { auth, db } from '../utils/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function BannedScreen() {
  const colors = useColors();
  const router = useRouter();
  const [userData, setUserData] = useState<{ prenom?: string; pseudo?: string } | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      if (snap.exists()) setUserData(snap.data() as any);
    });
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/auth');
  };

  const handleContact = () => {
    const prenom = userData?.prenom ?? '';
    const pseudo = userData?.pseudo ?? '';
    const subject = encodeURIComponent('Contestation suspension compte Gosh');
    const body = encodeURIComponent(
      `Bonjour,\n\nJe souhaite contester la suspension de mon compte.\n\nInformations du compte :\n- Prénom : ${prenom}\n- Pseudo : @${pseudo}\n\nMerci de bien vouloir examiner ma situation.`,
    );
    Linking.openURL(`mailto:gosh.app.contact@gmail.com?subject=${subject}&body=${body}`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      {/* Icône */}
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#FF3B30' + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
        <Ionicons name="ban-outline" size={44} color="#FF3B30" />
      </View>

      {/* Titre */}
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 12 }}>
        Compte suspendu
      </Text>

      {/* Description */}
      <Text style={{ color: colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 8 }}>
        Ton compte a été suspendu suite à une violation de nos conditions d'utilisation.
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 36 }}>
        Si tu penses qu'il s'agit d'une erreur, contacte notre support en indiquant les informations ci-dessous.
      </Text>

      {/* Infos du compte */}
      <View style={{ width: '100%', backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 28, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 10 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
          Informations du compte
        </Text>
        {userData?.prenom ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
            <Text style={{ color: colors.text, fontSize: 14 }}>{userData.prenom}</Text>
          </View>
        ) : null}
        {userData?.pseudo ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="at-outline" size={16} color={colors.textSecondary} />
            <Text style={{ color: colors.text, fontSize: 14 }}>@{userData.pseudo}</Text>
          </View>
        ) : null}
      </View>

      {/* Bouton contact */}
      <TouchableOpacity
        onPress={handleContact}
        style={{ backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'center' }}
        activeOpacity={0.8}
      >
        <Ionicons name="mail-outline" size={18} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Contacter le support</Text>
      </TouchableOpacity>

      {/* Déconnexion */}
      <TouchableOpacity onPress={handleSignOut} activeOpacity={0.7} style={{ paddingVertical: 12 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Se déconnecter</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
