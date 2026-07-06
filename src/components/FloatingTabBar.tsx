import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useNavigation } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useColors, colors, spacing } from '../constants/theme';
import { subscribeSocialBadge } from '../utils/socialBadge';

function HomeIcon({ color, focused }: { color: string; focused: boolean }) {
  return <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />;
}
function SuiviIcon({ color, focused }: { color: string; focused: boolean }) {
  return <Ionicons name={focused ? 'trending-up' : 'trending-up-outline'} size={22} color={color} />;
}
function RepasIcon({ color, focused }: { color: string; focused: boolean }) {
  return <Ionicons name={focused ? 'restaurant' : 'restaurant-outline'} size={22} color={color} />;
}
function TrainingIcon({ color, focused }: { color: string; focused: boolean }) {
  return <Ionicons name={focused ? 'barbell' : 'barbell-outline'} size={22} color={color} />;
}
function SocialIcon({ color, focused }: { color: string; focused: boolean }) {
  return <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />;
}

const TABS = [
  { name: 'index',    label: 'Accueil',  screen: 'index',    Icon: HomeIcon },
  { name: 'suivi',    label: 'Suivi',    screen: 'suivi',    Icon: SuiviIcon },
  { name: 'repas',    label: 'Repas',    screen: 'repas',    Icon: RepasIcon },
  { name: 'training', label: 'Training', screen: 'training', Icon: TrainingIcon },
  { name: 'social',   label: 'Social',   screen: 'social',   Icon: SocialIcon },
];

type Props = {
  activeTab?: string; // ex: 'social' pour le mettre en surbrillance
};

export default function FloatingTabBar({ activeTab = 'social' }: Props) {
  const colors = useColors();
  const styles = useMemo(() => StyleSheet.create({
    wrapper: { position: 'absolute' as const, bottom: Platform.OS === 'ios' ? 28 : 16, left: spacing.lg, right: spacing.lg },
    pill: { borderRadius: 36, overflow: 'hidden' as const, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
    blur: { width: '100%' },
    inner: { flexDirection: 'row' as const, paddingVertical: 10, paddingHorizontal: spacing.sm, backgroundColor: 'rgba(15,15,15,0.55)' },
    tab: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 3, paddingVertical: 4 },
    activeDot: { position: 'absolute' as const, top: -10, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
    badge: { position: 'absolute' as const, top: -4, right: -6, backgroundColor: colors.accent, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 3 },
    badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' as const },
    label: { fontSize: 10, fontWeight: '600' as const },
  }), [colors]);
  const navigation = useNavigation<any>();
  const [socialBadge, setSocialBadgeLocal] = useState(0);
  useEffect(() => subscribeSocialBadge(setSocialBadgeLocal), []);

  const goToTab = (screen: string) => {
    // Depuis le Stack, naviguer vers (tabs) en précisant l'onglet cible
    navigation.navigate('(tabs)' as never, { screen } as never);
  };

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.pill}>
        <BlurView intensity={60} tint="dark" style={styles.blur}>
          <View style={styles.inner}>
            {TABS.map((tab) => {
              const isFocused = tab.name === activeTab;
              const color = isFocused ? colors.accent : colors.textSecondary;
              return (
                <TouchableOpacity
                  key={tab.name}
                  style={styles.tab}
                  onPress={() => goToTab(tab.screen)}
                  activeOpacity={0.7}
                >
                  {isFocused && <View style={styles.activeDot} />}
                  <View>
                    <tab.Icon color={color} focused={isFocused} />
                    {tab.name === 'social' && socialBadge > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{socialBadge > 99 ? '99+' : socialBadge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.label, { color }]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

