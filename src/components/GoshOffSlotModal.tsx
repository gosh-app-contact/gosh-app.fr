import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useColors } from '../constants/theme';

const GOSHOFF_LOGO = require('../../assets/images/logo-goshoff.png');
const GC = '#7C3AED';

const ALL_NAMES = [
  'Squat barre', 'Deadlift', 'Bench press', 'Rowing barre',
  'Hip thrust barre', 'Romanian deadlift', 'Front squat',
];

// ms entre chaque frame : rapide → lent
const SPEEDS = [48, 48, 52, 56, 60, 66, 76, 90, 110, 138, 170, 210, 260, 320, 395];
const PAUSE_BETWEEN = 700;

type Exercise = { slug: string; name: string };

type Props = {
  visible: boolean;
  targetClubName: string;
  drawn: Exercise[]; // 3 exercices pré-tirés — source de vérité
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
};

export default function GoshOffSlotModal({ visible, targetClubName, drawn, onConfirm, onCancel, loading }: Props) {
  const colors = useColors();

  // On snapshote `drawn` à l'ouverture pour qu'aucune re-render ne le change
  const drawnRef = useRef<Exercise[]>(drawn);

  const [ticker, setTicker]       = useState(ALL_NAMES[0]);
  const [spinning, setSpinning]   = useState(false);
  const [lockedCount, setLockedCount] = useState(0);
  const [done, setDone]           = useState(false);

  const tickerScale    = useRef(new Animated.Value(1)).current;
  const glowOpacity    = useRef(new Animated.Value(0)).current;
  const confirmOpacity = useRef(new Animated.Value(0)).current;
  const lockScale0     = useRef(new Animated.Value(0)).current;
  const lockScale1     = useRef(new Animated.Value(0)).current;
  const lockScale2     = useRef(new Animated.Value(0)).current;
  const lockScales     = [lockScale0, lockScale1, lockScale2];

  // Annule tous les timeouts en cours si le modal se ferme
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const addTimer = (t: ReturnType<typeof setTimeout>) => { timers.current.push(t); return t; };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const spinForExercise = (targetName: string, onDone: () => void) => {
    let speedIdx = 0;
    let exIdx    = Math.floor(Math.random() * ALL_NAMES.length);

    setSpinning(true);
    glowOpacity.setValue(0);
    tickerScale.setValue(1);

    const tick = () => {
      exIdx = (exIdx + 1) % ALL_NAMES.length;
      setTicker(ALL_NAMES[exIdx]);
      speedIdx++;

      if (speedIdx < SPEEDS.length) {
        addTimer(setTimeout(tick, SPEEDS[speedIdx]));
      } else {
        // Atterrir sur la cible
        setTicker(targetName);
        setSpinning(false);
        Animated.sequence([
          Animated.parallel([
            Animated.timing(glowOpacity,  { toValue: 1,    duration: 140, useNativeDriver: true }),
            Animated.spring(tickerScale,  { toValue: 1.14, damping: 7,  stiffness: 220, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(glowOpacity,  { toValue: 0, duration: 320, useNativeDriver: true }),
            Animated.spring(tickerScale,  { toValue: 1, damping: 11, stiffness: 160, useNativeDriver: true }),
          ]),
        ]).start(() => addTimer(setTimeout(onDone, 180)));
      }
    };

    addTimer(setTimeout(tick, SPEEDS[0]));
  };

  const lockIn = (idx: number, onDone: () => void) => {
    setLockedCount(idx + 1);
    Animated.spring(lockScales[idx], {
      toValue: 1, damping: 11, stiffness: 190, useNativeDriver: true,
    }).start(() => addTimer(setTimeout(onDone, PAUSE_BETWEEN)));
  };

  useEffect(() => {
    if (!visible) {
      clearTimers();
      setTicker(ALL_NAMES[0]);
      setSpinning(false);
      setLockedCount(0);
      setDone(false);
      lockScales.forEach((s) => s.setValue(0));
      confirmOpacity.setValue(0);
      return;
    }

    // Snapshot drawn au moment de l'ouverture
    drawnRef.current = drawn;

    const t = addTimer(setTimeout(() => {
      const d = drawnRef.current;
      spinForExercise(d[0].name, () =>
        lockIn(0, () =>
          spinForExercise(d[1].name, () =>
            lockIn(1, () =>
              spinForExercise(d[2].name, () =>
                lockIn(2, () => {
                  setDone(true);
                  Animated.timing(confirmOpacity, { toValue: 1, duration: 380, useNativeDriver: true }).start();
                })
              )
            )
          )
        )
      );
    }, 400));

    return clearTimers;
  }, [visible]);

  const d = drawnRef.current;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={s.overlay}>

        {/* Header */}
        <View style={s.header}>
          <Image source={GOSHOFF_LOGO} style={{ width: 48, height: 48 }} resizeMode="contain" />
          <Text style={s.title}>Tirage des exercices</Text>
          <Text style={s.subtitle}>vs {targetClubName}</Text>
        </View>

        {/* Slot machine */}
        <View style={s.slotWrapper}>
          <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: glowOpacity }]}>
            <Svg width={320} height={110}>
              <Defs>
                <RadialGradient id="slotGlow" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0%"   stopColor={GC} stopOpacity="0.9" />
                  <Stop offset="45%"  stopColor={GC} stopOpacity="0.3" />
                  <Stop offset="100%" stopColor={GC} stopOpacity="0"   />
                </RadialGradient>
              </Defs>
              <Ellipse cx={160} cy={55} rx={160} ry={55} fill="url(#slotGlow)" />
            </Svg>
          </Animated.View>

          <View style={[s.slotBox, spinning && s.slotBoxActive]}>
            <View style={[s.slotLine, { top: 0 }]} />
            <View style={[s.slotLine, { bottom: 0 }]} />
            <Animated.Text style={[s.slotText, { transform: [{ scale: tickerScale }] }]} numberOfLines={1}>
              {ticker}
            </Animated.Text>
            {spinning && <Text style={s.slotSub}>tirage en cours…</Text>}
          </View>
        </View>

        {/* Exercices verrouillés — toujours 3 slots fixes pour éviter les sauts */}
        <View style={s.lockedList}>
          {([0, 1, 2] as const).map((i) => (
            <Animated.View key={i} style={{ transform: [{ scale: lockScales[i] }], opacity: lockScales[i] }}>
              <View style={s.lockedCard}>
                <View style={s.lockedBadge}>
                  <Text style={s.lockedBadgeText}>{i + 1}</Text>
                </View>
                <Text style={s.lockedName}>{d[i]?.name ?? ''}</Text>
                <Text style={s.lockedCheck}>✓</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        {/* Boutons */}
        <Animated.View style={[s.actions, { opacity: confirmOpacity }]}>
          <TouchableOpacity
            onPress={onConfirm}
            disabled={!done || loading}
            activeOpacity={0.82}
            style={s.confirmBtn}
          >
            <Text style={s.confirmText}>{loading ? 'Envoi…' : 'Lancer le GoshOff'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCancel} disabled={loading} activeOpacity={0.7} style={{ paddingVertical: 8 }}>
            <Text style={s.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </Animated.View>

      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.90)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 24,
  },
  header:   { alignItems: 'center', gap: 6 },
  title:    { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.3 },
  subtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },

  slotWrapper: { width: '100%', alignItems: 'center', justifyContent: 'center', height: 100 },
  slotBox: {
    width: '100%',
    backgroundColor: 'rgba(124,58,237,0.10)',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: GC + '50',
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    overflow: 'hidden',
  },
  slotBoxActive: { borderColor: GC + '90' },
  slotLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: GC, opacity: 0.55 },
  slotText: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  slotSub:  { color: GC, fontSize: 11, fontWeight: '600', marginTop: 4, letterSpacing: 1.2, textTransform: 'uppercase' },

  lockedList: { width: '100%', gap: 10 },
  lockedCard: {
    backgroundColor: GC + '18',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: GC + '55',
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
  },
  lockedBadge:     { width: 30, height: 30, borderRadius: 15, backgroundColor: GC, alignItems: 'center', justifyContent: 'center' },
  lockedBadgeText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  lockedName:      { color: '#fff', fontSize: 16, fontWeight: '800', flex: 1 },
  lockedCheck:     { color: GC, fontSize: 20 },

  actions:    { width: '100%', gap: 8 },
  confirmBtn: { backgroundColor: GC, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelText:  { color: 'rgba(255,255,255,0.35)', fontSize: 14, textAlign: 'center' },
});
