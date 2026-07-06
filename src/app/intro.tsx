import { useEffect, useRef } from 'react';
import { StyleSheet, Dimensions, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { auth, db } from '../utils/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, updateDoc } from 'firebase/firestore';
import { loadState, saveState, createInitialState, setStorageUid } from '../utils/storage';
import { setCachedPhoto, fetchAndCachePhotos } from '../utils/photoCache';
import { preloadHomeData } from '../utils/preloadCache';
import { seedCoachCodes } from '../utils/seedCoachCodes';
import { migrateCoachStudentFriends } from '../utils/coachStorage';
import { migrateStorageKeys } from '../utils/migrateStorage';
import { isOnboardingDone, setOnboardingDone } from '../utils/onboardingFlag';

const VIDEO = require('../../assets/animation/Introgosh-1080x1920.mp4');
const { width, height } = Dimensions.get('screen');
const FADE_DURATION = 600;

// Résultat du préchargement, partagé entre les deux promesses (vidéo + data)
type Destination = '/auth' | '/onboarding' | '/(tabs)';
let resolvedDestination: Destination | null = null;
let destinationResolvers: ((d: Destination) => void)[] = [];

function onDestinationReady(d: Destination) {
  resolvedDestination = d;
  destinationResolvers.forEach((r) => r(d));
  destinationResolvers = [];
}

export default function IntroScreen() {
  const router = useRouter();
  const navigated = useRef(false);
  const overlay = useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(VIDEO, (p) => {
    p.muted = true;
    p.playbackRate = 1.0;
    p.audioMixingMode = 'mixWithOthers';
    p.play();
  });

  // ── 1. Préchargement en parallèle pendant la vidéo ──────────────────────────
  useEffect(() => {
    resolvedDestination = null;

    // Seed coach codes on first run (idempotent — skips existing)
    seedCoachCodes().catch(() => {});
    migrateCoachStudentFriends().catch(() => {});

    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();

      if (!user) {
        onDestinationReady('/auth');
        return;
      }

      setStorageUid(user.uid);

      // Migration des données sauvegardées sous les anciennes clés sans uid
      await migrateStorageKeys(user.uid).catch(() => {});

      // Vérification locale du flag d'onboarding (indépendant de Firestore)
      const localDone = await isOnboardingDone(user.uid).catch(() => false);

      let state: any = null;
      let udata: any = {};
      let loadError = '';
      try {
        const [s, userDoc] = await Promise.all([
          loadState(),
          getDoc(doc(db, 'users', user.uid)),
        ]);
        state = s;
        udata = userDoc.data() ?? {};
      } catch (e: any) {
        loadError = e?.message ?? 'unknown';
        try { state = await loadState(); } catch {}
      }

      if (udata.accountType === 'banned') {
        onDestinationReady('/banned' as any);
        return;
      }

      const accountAgeMs = user.metadata?.creationTime
        ? Date.now() - new Date(user.metadata.creationTime).getTime()
        : 0;
      const isOldAccount = accountAgeMs > 10 * 60 * 1000;

      const onboardingDone =
        localDone ||
        (state !== null && (state.profiles?.length ?? 0) > 0) ||
        udata.onboardingComplete === true;

      if (!onboardingDone || user.email === 'onboarding@gmail.com') {
        onDestinationReady('/onboarding');
        return;
      }

      // Pose le flag local pour les prochains lancements — plus jamais besoin de Firestore
      if (!localDone) setOnboardingDone(user.uid).catch(() => {});

      // Fixe le champ onboardingComplete dans le state local si manquant
      if (state && !state.onboardingComplete) {
        state.onboardingComplete = true;
        saveState(state).catch(() => {});
      }

      // Si AsyncStorage vide mais onboarding complété en Firestore → reconstruire le state
      let activeState = state;
      if (!activeState && udata.onboardingComplete === true) {
        try {
          activeState = createInitialState(
            udata.pseudo ?? udata.prenom ?? '',
            udata.age ?? 25,
            udata.sex ?? 'male',
            udata.height ?? 175,
            udata.weight ?? 75,
            udata.activityLevel ?? 'moderate',
            udata.phase ?? 'maintenance',
          );
          activeState.onboardingComplete = true;
          if (udata.birthdate) activeState.profiles[0].birthdate = udata.birthdate;
          await saveState(activeState);
          await setOnboardingDone(user.uid);
        } catch {
          activeState = null;
        }
      }

      if (activeState && udata.accountType === 'student' && !udata.height && activeState.profiles.length > 0) {
        const p = activeState.profiles[0];
        const patch: Record<string, any> = {};
        if (p.height) patch.height = p.height;
        if (p.weight) patch.weight = p.weight;
        if (p.age) patch.age = p.age;
        if (p.sex) patch.sex = p.sex;
        if ((p as any).birthdate) patch.birthdate = (p as any).birthdate;
        if (p.phase) patch.phase = p.phase;
        if (!udata.joinedAt) patch.joinedAt = Date.now();
        if (Object.keys(patch).length > 0) {
          updateDoc(doc(db, 'users', user.uid), patch).catch(() => {});
        }
      }

      // Sync birthdate depuis Firestore si absente en local
      if (activeState && udata.birthdate && activeState.profiles.length > 0 && !activeState.profiles[0].birthdate) {
        activeState.profiles[0].birthdate = udata.birthdate;
        await saveState(activeState);
      }

      // Sync photo locale
      const photoUrl: string = udata.photoUrl ?? '';
      if (activeState && photoUrl.startsWith('https://') && activeState.profiles.length > 0 && activeState.profiles[0].photo !== photoUrl) {
        activeState.profiles[0].photo = photoUrl;
        await saveState(activeState);
      }

      // Préchauffer le cache : photo du user + photos du feed
      const myUid = user.uid;
      if (photoUrl) setCachedPhoto(myUid, photoUrl);

      // Tout en parallèle : photos du feed + données home
      try {
        const friends: string[] = udata.friends ?? [];
        const feedUids = [myUid, ...friends].slice(0, 20);
        await Promise.all([
          fetchAndCachePhotos(feedUids),
          preloadHomeData(),
        ]);
      } catch {}

      onDestinationReady('/(tabs)');
    });
  }, []);

  // ── 2. À la fin de la vidéo : attendre que les données soient prêtes ────────
  const goNext = async () => {
    if (navigated.current) return;
    navigated.current = true;

    // Attendre la destination si pas encore prête
    const destination = await new Promise<Destination>((resolve) => {
      if (resolvedDestination) {
        resolve(resolvedDestination);
      } else {
        destinationResolvers.push(resolve);
        // Fallback max 3s si firebase est lent
        setTimeout(() => resolve('/auth'), 3000);
      }
    });

    // Fade out vers le noir
    await new Promise<void>((resolve) => {
      Animated.timing(overlay, {
        toValue: 1,
        duration: FADE_DURATION,
        useNativeDriver: true,
      }).start(() => resolve());
    });

    router.replace(destination);
  };

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => { goNext(); });
    const timer = setTimeout(() => { goNext(); }, 8000);
    return () => { sub.remove(); clearTimeout(timer); };
  }, []);

  return (
    <>
      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, width, height }}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: overlay }]}
      />
    </>
  );
}

const styles = StyleSheet.create({});
