import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColors } from '../constants/theme';
import { auth, db } from '../utils/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { setStorageUid, loadState } from '../utils/storage';
import { setTrainingStorageUid } from '../utils/trainingStorage';
import { setRepasStorageUid } from '../utils/repasStorage';
import { setCurrentUid } from '../utils/currentUser';

// Enregistré au niveau module — s'exécute avant tout effet React
// Garantit que setStorageUid est appelé avant n'importe quel subscriber enfant
onAuthStateChanged(auth, (user) => {
  setStorageUid(user?.uid ?? null);
  setCurrentUid(user?.uid ?? null);
  setTrainingStorageUid(user?.uid ?? null);
  setRepasStorageUid(user?.uid ?? null);
});

export default function RootLayout() {
  const colors = useColors();
  const router = useRouter();

  // Navigation gérée par intro.tsx au démarrage
  useEffect(() => {
    router.replace('/intro');
  }, []);

  // Listener temps réel : redirige vers /banned si le compte est suspendu en cours de session
  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubUser?.();
      if (!user) return;
      unsubUser = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.data()?.accountType === 'banned') {
          router.replace('/banned');
        }
      });
    });
    return () => { unsubAuth(); unsubUser?.(); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { initHealthKit } = await import('../utils/healthKit');
        await initHealthKit();
      } catch {}
    })();
  }, []);

  // Notifications demandées uniquement après connexion (règle Apple 2.5.13)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const { requestPermissions, setupNotificationCategories, scheduleWeighReminder, scheduleWeeklyPlanningReminder, scheduleStreakDangerReminder, cancelStreakDangerReminder, saveFcmToken } = await import('../utils/notifications');
        const granted = await requestPermissions();
        if (granted) {
          await setupNotificationCategories();
          saveFcmToken(user.uid).catch(() => {});
          const state = await loadState();
          const profile = state?.profiles.find((p) => p.id === state.activeProfileId);
          if (profile?.notificationsEnabled.weigh) await scheduleWeighReminder(true);
          await scheduleWeeklyPlanningReminder();
        }
        // Mise à jour du streak de connexion quotidien
        const { updateLoginStreak } = await import('../utils/streakUtils');
        const { streakData, newBadges } = await updateLoginStreak(user.uid);
        // Annule le rappel du jour (l'utilisateur vient de se connecter)
        const { cancelStreakDangerReminder: cancel } = await import('../utils/notifications');
        await cancel().catch(() => {});
        // Replanifie pour demain si streak > 0
        if (streakData.current > 0) {
          const { scheduleStreakDangerReminder: schedule } = await import('../utils/notifications');
          await schedule(streakData.current).catch(() => {});
        }
      } catch {}
    });
    return unsub;
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="profil-modal"
            options={{
              presentation: 'fullScreenModal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="social-profil-modal"
            options={{
              presentation: 'modal',
              headerShown: false,
            }}
          />
          <Stack.Screen name="profile" options={{ headerShown: false }} />
          <Stack.Screen name="chat" options={{ headerShown: false }} />
          <Stack.Screen name="abonnement" options={{ headerShown: false }} />
          <Stack.Screen name="clubs" options={{ headerShown: false }} />
          <Stack.Screen name="club" options={{ headerShown: false }} />
          <Stack.Screen name="club-create" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="club-chat" options={{ headerShown: false }} />
          <Stack.Screen name="club-search" options={{ headerShown: false }} />
          <Stack.Screen name="post" options={{ headerShown: false }} />
          <Stack.Screen name="find-coach" options={{ headerShown: false }} />
          <Stack.Screen name="coach-library" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="intro" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="admin" options={{ headerShown: false }} />
          <Stack.Screen name="banned" options={{ headerShown: false }} />
          <Stack.Screen name="workout-session" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="goshoff-leaderboard" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
