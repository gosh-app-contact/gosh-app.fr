import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/Button';
import { auth, db } from '../utils/firebase';

const BG = '#000000';
const SURFACE = '#141414';
const ACCENT = '#FF6B35';
const BORDER = 'rgba(255,255,255,0.08)';

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const SOURCE = require('../../assets/images/logo-gosh-anime.MOV');
  const playerA = useVideoPlayer(SOURCE, p => { p.muted = true; p.play(); });
  const playerB = useVideoPlayer(SOURCE, p => { p.muted = true; });

  const opacityA = useRef(new Animated.Value(1)).current;
  const opacityB = useRef(new Animated.Value(0)).current;
  const activeRef = useRef<'A' | 'B'>('A');
  const crossfading = useRef(false);

  useEffect(() => {
    const CROSSFADE_MS = 800;
    let preseekDone = false;

    const interval = setInterval(() => {
      const active    = activeRef.current === 'A' ? playerA : playerB;
      const incoming  = activeRef.current === 'A' ? playerB : playerA;
      const inOpacity = activeRef.current === 'A' ? opacityB : opacityA;
      const outOpacity= activeRef.current === 'A' ? opacityA : opacityB;

      const { currentTime, duration } = active;
      if (!duration || crossfading.current) return;

      // Pre-seek le player entrant dès 50% pour qu'il soit prêt instantanément
      if (!preseekDone && currentTime >= duration * 0.5) {
        incoming.currentTime = 0;
        preseekDone = true;
      }

      // Crossfade à 80% de la vidéo
      if (currentTime >= duration * 0.80) {
        crossfading.current = true;
        preseekDone = false;
        incoming.play();
        Animated.parallel([
          Animated.timing(inOpacity,  { toValue: 1, duration: CROSSFADE_MS, useNativeDriver: true }),
          Animated.timing(outOpacity, { toValue: 0, duration: CROSSFADE_MS, useNativeDriver: true }),
        ]).start(() => {
          try { active.pause(); } catch {}
          activeRef.current = activeRef.current === 'A' ? 'B' : 'A';
          crossfading.current = false;
        });
      }
    }, 50);

    return () => clearInterval(interval);
  }, []);

  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(32)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, damping: 20, stiffness: 160, useNativeDriver: true }),
    ]).start();
  }, []);

  const computeAge = (d: number, m: number, y: number): number => {
    const today = new Date();
    let age = today.getFullYear() - y;
    if (today.getMonth() < m - 1 || (today.getMonth() === m - 1 && today.getDate() < d)) age--;
    return age;
  };

  const handleAuth = async () => {
    Keyboard.dismiss();
    if (!email.trim() || !password.trim()) {
      Alert.alert('Champs manquants', "Remplis l'email et le mot de passe.");
      return;
    }
    if (mode === 'register' && !pseudo.trim()) { Alert.alert('Pseudo requis'); return; }
    if (mode === 'register') {
      const d = parseInt(birthDay, 10);
      const m = parseInt(birthMonth, 10);
      const y = parseInt(birthYear, 10);
      const dateObj = new Date(y, m - 1, d);
      const isValidDate = !isNaN(dateObj.getTime())
        && dateObj.getFullYear() === y
        && dateObj.getMonth() === m - 1
        && dateObj.getDate() === d;
      if (!d || !m || !y || y < 1900 || y > new Date().getFullYear() || !isValidDate) {
        Alert.alert('Date invalide', 'Renseigne une date valide (JJ / MM / AAAA).');
        return;
      }
      if (computeAge(d, m, y) < 18) {
        Alert.alert('Âge requis', 'Tu dois avoir au moins 18 ans.');
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === 'register') {
        const d2 = parseInt(birthDay, 10), m2 = parseInt(birthMonth, 10), y2 = parseInt(birthYear, 10);
        const isoDate = `${y2}-${String(m2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          pseudo: pseudo.trim().toLowerCase(),
          email: email.trim(),
          isPublic: true,
          friends: [],
          birthdate: isoDate,
          age: computeAge(d2, m2, y2),
          createdAt: serverTimestamp(),
          termsConsentAt: Date.now(),
        });
        router.replace('/onboarding');
        return;
      }
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace('/intro');
    } catch (e: any) {
      const msg: Record<string, string> = {
        'auth/email-already-in-use': 'Email déjà utilisé.',
        'auth/invalid-email': 'Email invalide.',
        'auth/weak-password': 'Mot de passe trop faible (6 caractères min).',
        'auth/user-not-found': 'Aucun compte avec cet email.',
        'auth/wrong-password': 'Mot de passe incorrect.',
        'auth/invalid-credential': 'Email ou mot de passe incorrect.',
      };
      Alert.alert('Erreur', msg[e.code] ?? e.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (field: string) => [
    s.input,
    focusedField === field && s.inputFocused,
  ];
  const focus = (f: string) => () => setFocusedField(f);
  const blur = () => setFocusedField(null);

  const s = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: BG },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 28,
      paddingTop: 8,
      paddingBottom: 32,
    },
    // ── Hero ──────────────────────────────────────
    hero: { alignItems: 'center', paddingTop: 40, paddingBottom: 0 },
    videoLogo: { width: 380, height: 280, backgroundColor: 'transparent' },
    videoLogoCompact: { width: 220, height: 140, backgroundColor: 'transparent' },
    heroCompact: { paddingTop: 16, paddingBottom: 0 },
    appName: { fontSize: 42, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
    tagline: { fontSize: 14, color: 'rgba(255,255,255,0.28)', marginTop: 6, letterSpacing: 0.3 },
    // ── Inputs ────────────────────────────────────
    fieldStack: { gap: 12 },
    input: {
      height: 56,
      backgroundColor: SURFACE,
      borderRadius: 14,
      paddingHorizontal: 18,
      color: '#fff',
      fontSize: 16,
      borderWidth: 1.5,
      borderColor: BORDER,
    },
    inputFocused: { borderColor: ACCENT },
    dateRow: { flexDirection: 'row', gap: 8 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.3)',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginTop: 4,
    },
    // ── CTA ───────────────────────────────────────
    cta: { marginTop: 8 },
    // ── Separator ─────────────────────────────────
    sep: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginVertical: 8,
    },
    sepLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
    sepText: { fontSize: 12, color: 'rgba(255,255,255,0.2)', fontWeight: '500' },
    // ── Switch mode ───────────────────────────────
    switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 4 },
    switchLabel: { fontSize: 14, color: 'rgba(255,255,255,0.35)' },
    switchLink: { fontSize: 14, fontWeight: '700', color: ACCENT },
    // ── Consent ───────────────────────────────────
    consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    checkbox: {
      width: 22, height: 22, borderRadius: 7, borderWidth: 2,
      alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0,
    },
    consentText: { color: 'rgba(255,255,255,0.35)', fontSize: 12, lineHeight: 19, flex: 1 },
    consentLink: { color: 'rgba(255,255,255,0.6)', textDecorationLine: 'underline' },
  }), []);

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <Animated.View style={[s.hero, mode === 'register' && s.heroCompact, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
            <View style={mode === 'register' ? s.videoLogoCompact : s.videoLogo}>
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacityA }]}>
                <VideoView player={playerA} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacityB }]}>
                <VideoView player={playerB} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
              </Animated.View>
            </View>
          </Animated.View>

          {/* Formulaire */}
          <Animated.View style={[{ gap: 16 }, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>

            {/* Champs spécifiques à l'inscription */}
            {mode === 'register' && (
              <View style={s.fieldStack}>
                <TextInput
                  style={inputStyle('pseudo')}
                  value={pseudo} onChangeText={setPseudo}
                  placeholder="Pseudo"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  autoCapitalize="none"
                  onFocus={focus('pseudo')} onBlur={blur}
                />
                <View>
                  <Text style={s.sectionLabel}>Date de naissance</Text>
                  <View style={s.dateRow}>
                    <TextInput
                      style={[inputStyle('day'), { flex: 1, textAlign: 'center' }]}
                      value={birthDay} onChangeText={setBirthDay}
                      placeholder="JJ" placeholderTextColor="rgba(255,255,255,0.2)"
                      keyboardType="number-pad" maxLength={2}
                      onFocus={focus('day')} onBlur={blur}
                    />
                    <TextInput
                      style={[inputStyle('month'), { flex: 1, textAlign: 'center' }]}
                      value={birthMonth} onChangeText={setBirthMonth}
                      placeholder="MM" placeholderTextColor="rgba(255,255,255,0.2)"
                      keyboardType="number-pad" maxLength={2}
                      onFocus={focus('month')} onBlur={blur}
                    />
                    <TextInput
                      style={[inputStyle('year'), { flex: 2, textAlign: 'center' }]}
                      value={birthYear} onChangeText={setBirthYear}
                      placeholder="AAAA" placeholderTextColor="rgba(255,255,255,0.2)"
                      keyboardType="number-pad" maxLength={4}
                      onFocus={focus('year')} onBlur={blur}
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Email + Mot de passe */}
            <View style={s.fieldStack}>
              <TextInput
                style={inputStyle('email')}
                value={email} onChangeText={setEmail}
                placeholder="Adresse email"
                placeholderTextColor="rgba(255,255,255,0.2)"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                onFocus={focus('email')} onBlur={blur}
              />
              <TextInput
                style={inputStyle('password')}
                value={password} onChangeText={setPassword}
                placeholder="Mot de passe"
                placeholderTextColor="rgba(255,255,255,0.2)"
                secureTextEntry
                autoComplete={mode === 'login' ? 'password' : 'new-password'}
                onFocus={focus('password')} onBlur={blur}
              />
            </View>

            {/* Consentement */}
            {mode === 'register' && (
              <TouchableOpacity onPress={() => setConsentAccepted(v => !v)} activeOpacity={0.8} style={s.consentRow}>
                <View style={[s.checkbox, {
                  borderColor: consentAccepted ? ACCENT : 'rgba(255,255,255,0.2)',
                  backgroundColor: consentAccepted ? `${ACCENT}20` : 'transparent',
                }]}>
                  {consentAccepted && <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '800', lineHeight: 16 }}>✓</Text>}
                </View>
                <Text style={s.consentText}>
                  {'J\'ai 18 ans et j\'accepte les '}
                  <Text style={s.consentLink} onPress={e => { e.stopPropagation(); Linking.openURL('https://gosh-app-contact.github.io/gosh-app.fr/cgu'); }}>
                    conditions d'utilisation
                  </Text>
                  {' et la '}
                  <Text style={s.consentLink} onPress={e => { e.stopPropagation(); Linking.openURL('https://gosh-app-contact.github.io/gosh-app.fr/privacy'); }}>
                    politique de confidentialité
                  </Text>
                  {'.'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Bouton CTA */}
            <View style={s.cta}>
              <Button
                label={mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
                variant="primary"
                loading={loading}
                disabled={mode === 'register' && !consentAccepted}
                onPress={handleAuth}
              />
            </View>

            {/* Séparateur + switch mode */}
            <View style={s.sep}>
              <View style={s.sepLine} />
              <Text style={s.sepText}>ou</Text>
              <View style={s.sepLine} />
            </View>

            <View style={s.switchRow}>
              <Text style={s.switchLabel}>
                {mode === 'login' ? 'Pas encore de compte ?' : 'Déjà un compte ?'}
              </Text>
              <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'register' : 'login')} activeOpacity={0.7}>
                <Text style={s.switchLink}>
                  {mode === 'login' ? 'S\'inscrire' : 'Se connecter'}
                </Text>
              </TouchableOpacity>
            </View>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
