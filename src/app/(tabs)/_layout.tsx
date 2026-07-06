import { Tabs, useRouter } from 'expo-router';
import { useColors, colors, radius, spacing } from '../../constants/theme';
import { Platform, View, Text, TouchableOpacity, StyleSheet, Image, useColorScheme, Animated } from 'react-native';
import { useState, useEffect, useMemo, useRef } from 'react';
import { subscribeSocialBadge, setSocialBadge } from '../../utils/socialBadge';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../utils/firebase';
import { collection, query, where, orderBy, onSnapshot, limit, doc } from 'firebase/firestore';
import { getMyAccountType } from '../../utils/coachStorage';
import { setStorageUid } from '../../utils/storage';
import { AccountType } from '../../types/coach';
// ─── Icônes ───────────────────────────────────────────────────────────────────

function HomeIcon({ color, size, isFocused }: { color: any; size: number; isFocused?: boolean }) {
  return <Ionicons name={isFocused ? 'home' : 'home-outline'} size={size} color={color} />;
}

function SuiviIcon({ color, size, isFocused }: { color: any; size: number; isFocused?: boolean }) {
  return <Ionicons name={isFocused ? 'trending-up' : 'trending-up-outline'} size={size} color={color} />;
}

function RepasIcon({ color, size, isFocused }: { color: any; size: number; isFocused?: boolean }) {
  return <Ionicons name={isFocused ? 'restaurant' : 'restaurant-outline'} size={size} color={color} />;
}

function TrainingIcon({ color, size, isFocused }: { color: any; size: number; isFocused?: boolean }) {
  return <Ionicons name={isFocused ? 'barbell' : 'barbell-outline'} size={size} color={color} />;
}

function SocialIcon({ color, size, isFocused }: { color: any; size: number; isFocused?: boolean }) {
  return <Ionicons name={isFocused ? 'people' : 'people-outline'} size={size} color={color} />;
}

function ElevesIcon({ color, size, isFocused }: { color: any; size: number; isFocused?: boolean }) {
  return <Ionicons name={isFocused ? 'clipboard' : 'clipboard-outline'} size={size} color={color} />;
}

function NutritionCoachIcon({ color, size, isFocused }: { color: any; size: number; isFocused?: boolean }) {
  return <Ionicons name={isFocused ? 'nutrition' : 'nutrition-outline'} size={size} color={color} />;
}

function AdminIcon({ color, size, isFocused }: { color: any; size: number; isFocused?: boolean }) {
  return (
    <Image
      source={require('../../../assets/images/logo-gosh-moderation.png')}
      style={{ width: size, height: size, opacity: isFocused ? 1 : 0.5 }}
      resizeMode="contain"
    />
  );
}

const TAB_ICONS: Record<string, (p: { color: any; size: number; isFocused?: boolean }) => React.ReactElement> = {
  index: HomeIcon,
  suivi: SuiviIcon,
  repas: RepasIcon,
  training: TrainingIcon,
  social: SocialIcon,
  eleves: ElevesIcon,
  'nutrition-coach': NutritionCoachIcon,
  admin: AdminIcon,
};

const TAB_LABELS: Record<string, string> = {
  index: 'Accueil',
  suivi: 'Suivi',
  repas: 'Repas',
  training: 'Training',
  social: 'Social',
  eleves: 'Coaching',
  'nutrition-coach': 'Nutrition',
  admin: 'Admin',
};

// ─── Tab bar flottante ────────────────────────────────────────────────────────

function FloatingTabBar({ state, descriptors, navigation, accountType }: any) {
  const colors = useColors();
  const scheme = useColorScheme();
  const [socialBadge, setSocialBadgeLocal] = useState(0);
  const [elevesBadge, setElevesBadge] = useState(0);
  const [adminBadge, setAdminBadge] = useState(0);
  const [innerWidth, setInnerWidth] = useState(0);
  const animX = useRef(new Animated.Value(0)).current;
  useEffect(() => subscribeSocialBadge(setSocialBadgeLocal), []);

  useEffect(() => {
    if (accountType !== 'coach') return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const { subscribeCoachRequests } = require('../../utils/coachStorage');
    const unsub = subscribeCoachRequests(uid, (requests: any[]) => setElevesBadge(requests.length));
    return unsub;
  }, [accountType]);

  useEffect(() => {
    if (accountType !== 'admin') return;
    const { collection: col, query: q, where, onSnapshot: ons } = require('firebase/firestore');
    const { db: firestoreDb } = require('../../utils/firebase');
    const unsub = ons(
      q(col(firestoreDb, 'reports'), where('status', '==', 'pending')),
      (snap: any) => setAdminBadge(snap.size),
      () => {},
    );
    return unsub;
  }, [accountType]);

  const tbStyles = useMemo(() => StyleSheet.create({
    wrapper: {
      position: 'absolute' as const,
      bottom: Platform.OS === 'ios' ? 28 : 16,
      left: spacing.xl,
      right: spacing.xl,
      // Ombre portée profonde — profondeur du verre
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: scheme === 'light' ? 0.16 : 0.6,
      shadowRadius: 32,
      elevation: 16,
    },
    pill: {
      borderRadius: 40,
      overflow: 'hidden' as const,
      // Bordure irisée — dessus lumineux
      borderWidth: 1,
      borderColor: scheme === 'light' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.14)',
    },
    blur: { width: '100%' },
    inner: {
      flexDirection: 'row' as const,
      paddingVertical: 4,
      paddingHorizontal: 5,
      // Fond très transparent pour laisser passer le contenu en dessous
      backgroundColor: scheme === 'light' ? 'rgba(255,255,255,0.28)' : 'rgba(18,18,18,0.3)',
    },
    // Reflet spéculaire horizontal — ligne de lumière en haut du verre
    specular: {
      position: 'absolute' as const,
      top: 0,
      left: 20,
      right: 20,
      height: 1,
      backgroundColor: scheme === 'light' ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.22)',
      borderRadius: 1,
    },
    tab: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: 4,
    },
    iconWrapper: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: 9,
    },
    // Bulle active : capsule en verre dépoli
    slidingBubble: {
      position: 'absolute' as const,
      top: 4,
      bottom: 4,
      borderRadius: 36,
      backgroundColor: scheme === 'light' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.13)',
      borderWidth: 1,
      borderColor: scheme === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
      shadowColor: scheme === 'light' ? '#000' : '#fff',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: scheme === 'light' ? 0.07 : 0.05,
      shadowRadius: 3,
    },
    label: { fontSize: 10, fontWeight: '600' as const },
  }), [colors, scheme]);

  const ALWAYS_HIDDEN = ['profile'];
  const isAdmin = accountType === 'admin';
  const eleveHidden = (accountType !== 'coach' || isAdmin) ? ['eleves', 'nutrition-coach'] : [];
  const coachHidden = accountType === 'coach' ? ['training', 'suivi', 'repas'] : ['nutrition-coach'];
  const adminHidden = !isAdmin ? ['admin'] : ['training'];
  const HIDDEN = [...ALWAYS_HIDDEN, ...eleveHidden, ...coachHidden, ...adminHidden];
  const visibleRoutes = state.routes.filter((r: any) => !HIDDEN.includes(r.name));

  const activeIdx = visibleRoutes.findIndex((r: any) => state.routes[state.index]?.key === r.key);

  useEffect(() => {
    if (!innerWidth || visibleRoutes.length === 0) return;
    const contentW = innerWidth - 8;
    const tabW = contentW / visibleRoutes.length;
    Animated.spring(animX, {
      toValue: 6 + activeIdx * tabW,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
      mass: 0.8,
    }).start();
  }, [activeIdx, innerWidth, visibleRoutes.length]);

  return (
    <View style={tbStyles.wrapper} pointerEvents="box-none">
      <View style={tbStyles.pill}>
        <BlurView intensity={85} tint={scheme === 'light' ? 'light' : 'dark'} style={tbStyles.blur}>
          <View style={tbStyles.inner} onLayout={(e) => setInnerWidth(e.nativeEvent.layout.width)}>
            {/* Reflet spéculaire — ligne de lumière en haut */}
            <View style={tbStyles.specular} pointerEvents="none" />
            {/* Bulle animée */}
            {innerWidth > 0 && (
              <Animated.View
                style={[
                  tbStyles.slidingBubble,
                  {
                    width: (innerWidth - 8) / visibleRoutes.length - 4,
                    left: 0,
                    transform: [{ translateX: animX }],
                  },
                ]}
              />
            )}
            {visibleRoutes.map((route: any) => {
              const isFocused = state.routes[state.index]?.key === route.key;
              const color = isFocused ? colors.accent : colors.textSecondary;
              const Icon = TAB_ICONS[route.name] ?? HomeIcon;

              return (
                <TouchableOpacity
                  key={route.key}
                  style={tbStyles.tab}
                  onPress={() => {
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={tbStyles.iconWrapper}>
                    <Icon color={color} size={22} isFocused={isFocused} />
                    {route.name === 'social' && socialBadge > 0 && (
                      <View style={{ position: 'absolute', top: -4, right: -6, backgroundColor: colors.accent, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{socialBadge > 99 ? '99+' : socialBadge}</Text>
                      </View>
                    )}
                    {route.name === 'eleves' && elevesBadge > 0 && (
                      <View style={{ position: 'absolute', top: -4, right: -6, backgroundColor: colors.accent, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{elevesBadge > 99 ? '99+' : elevesBadge}</Text>
                      </View>
                    )}
                    {route.name === 'admin' && adminBadge > 0 && (
                      <View style={{ position: 'absolute', top: -4, right: -6, backgroundColor: '#FF3B30', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{adminBadge > 99 ? '99+' : adminBadge}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}


// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabLayout() {
  const colors = useColors();
  const router = useRouter();
  const [accountType, setAccountType] = useState<AccountType>('standard');

  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    let unsubNotifs: (() => void) | null = null;
    let unsubMsgs: (() => void) | null = null;
    let unreadNotifs = 0;
    let unreadMsgs = 0;
    let pendingReqs = 0;

    const unsubAuth = auth.onAuthStateChanged((user) => {
      unsubUser?.();
      unsubNotifs?.();
      unsubMsgs?.();
      if (!user) { setAccountType('standard'); setSocialBadge(0, 0); router.replace('/auth'); return; }
      setStorageUid(user.uid);

      // Un seul listener sur users/{uid} pour accountType + friendRequests
      unsubUser = onSnapshot(doc(db, 'users', user.uid), (snap: any) => {
        const data = snap.data();
        setAccountType((data?.accountType as AccountType) ?? 'standard');
        pendingReqs = (data?.friendRequests ?? []).length;
        setSocialBadge(unreadNotifs + unreadMsgs + pendingReqs, unreadMsgs);
      });

      // Notifs non lues
      unsubNotifs = onSnapshot(
        query(collection(db, 'notifications', user.uid, 'items'), where('read', '==', false), limit(100)),
        (snap) => { unreadNotifs = snap.size; setSocialBadge(unreadNotifs + unreadMsgs + pendingReqs, unreadMsgs); }
      );

      // Messages non lus
      unsubMsgs = onSnapshot(
        query(collection(db, 'chats'), where('participants', 'array-contains', user.uid), orderBy('lastMessageAt', 'desc')),
        (snap) => {
          let count = 0;
          snap.docs.forEach((d) => {
            const data = d.data();
            const lastMsgAt = data.lastMessageAt?.toMillis?.() ?? 0;
            const lastSeenAt = data[`lastSeenAt_${user.uid}`]?.toMillis?.() ?? 0;
            if (lastMsgAt > lastSeenAt && data.lastSenderUid !== user.uid) count++;
          });
          unreadMsgs = count;
          setSocialBadge(unreadNotifs + unreadMsgs + pendingReqs, unreadMsgs);
        }
      );
    });

    return () => { unsubAuth(); unsubUser?.(); unsubNotifs?.(); unsubMsgs?.(); };
  }, []);

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} accountType={accountType} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarStyle: { height: 0, minHeight: 0, borderTopWidth: 0, borderTopColor: 'transparent', backgroundColor: 'transparent', elevation: 0, overflow: 'hidden' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ headerShown: false }}
      />
      <Tabs.Screen name="suivi" options={{ headerTitle: 'Suivi' }} />
      <Tabs.Screen name="repas" options={{ headerTitle: 'Repas' }} />
      <Tabs.Screen name="training" options={{ headerTitle: 'Training' }} />
      <Tabs.Screen name="eleves" options={{ headerShown: false }} />
      <Tabs.Screen name="nutrition-coach" options={{ headerShown: false }} />
      <Tabs.Screen name="social" options={{ headerShown: false }} />
      <Tabs.Screen name="admin" options={{ headerShown: false }} />
    </Tabs>
  );
}
