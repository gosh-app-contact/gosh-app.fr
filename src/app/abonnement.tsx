import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, Dimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '../constants/theme';
import { auth, db } from '../utils/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Image } from 'react-native';

const ACCENT = '#FF6B35';
const GOLD = '#C4973A';
const GOSH_PRO_LOGO = require('../../assets/images/logo-gosh-pro.png');

const SCREEN_W = Dimensions.get('window').width;
const CARD_W = SCREEN_W * 0.72;

const GlowLogo = React.memo(() => {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: 200, height: 200 }}>
        <Svg width={200} height={200}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor={GOLD} stopOpacity="0.65" />
              <Stop offset="40%" stopColor={GOLD} stopOpacity="0.2" />
              <Stop offset="75%" stopColor={GOLD} stopOpacity="0.05" />
              <Stop offset="100%" stopColor={GOLD} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx="100" cy="100" rx="100" ry="100" fill="url(#glow)" />
        </Svg>
      </View>
      <Animated.Image
        source={GOSH_PRO_LOGO}
        style={{ width: 100, height: 100, transform: [{ scale: pulse }] }}
        resizeMode="contain"
      />
    </View>
  );
});

type AccountType = 'standard' | 'coach' | 'student' | 'admin';

const STANDARD_FREE = [
  { icon: 'restaurant-outline', label: 'Journal nutrition complet' },
  { icon: 'barbell-outline', label: 'Séances d\'entraînement' },
  { icon: 'people-outline', label: 'Social & clubs' },
  { icon: 'search-outline', label: 'Recherche de coachs' },
];

const STANDARD_PLUS = [
  { icon: 'calendar-outline', label: 'Historique poids illimité', detail: 'Calendrier mois par mois, stats min/max/moyenne, filtres jusqu\'à tout l\'historique' },
  { icon: 'alert-circle-outline', label: 'Détection stagnation + suggestions', detail: 'Alerte automatique si plateau, rééquilibrage calorique calculé pour toi' },
  { icon: 'trophy-outline', label: 'Estimateur 1RM + courbe de progression', detail: 'Graphique historique par exercice, badge PR automatique' },
  { icon: 'body-outline', label: 'Analyse volume musculaire', detail: 'Volume par groupe musculaire, cibles min/max, alertes sur/sous-charge' },
  { icon: 'bar-chart-outline', label: 'Comparaison de séances', detail: 'Tonnage, durée, évolution séance après séance pour progresser' },
];

const STUDENT_FEATURES = [
  { icon: 'calendar-outline', label: 'Planning de ton coach en temps réel' },
  { icon: 'chatbubble-outline', label: 'Messagerie avec ton coach' },
  { icon: 'people-outline', label: 'Accès aux clubs' },
  { icon: 'search-outline', label: 'Recherche de coachs' },
];

type CoachTier = {
  name: string;
  subtitle: string;
  monthly: string | null;
  annual: string | null;
  annualNote: string | null;
  maxStudents: string;
  features: { icon: string; label: string; detail?: string }[];
  color: string;
  highlighted?: boolean;
};

const COACH_TIERS: CoachTier[] = [
  {
    name: 'Gosh Discovery',
    subtitle: 'Pour démarrer',
    monthly: null,
    annual: null,
    annualNote: null,
    maxStudents: '3 élèves max',
    color: 'rgba(255,255,255,0.5)',
    features: [
      { icon: 'person-outline', label: 'Jusqu\'à 3 élèves' },
      { icon: 'calendar-outline', label: 'Planning hebdomadaire' },
      { icon: 'chatbubble-outline', label: 'Messagerie privée' },
      { icon: 'flame-outline', label: 'Objectif calorique par élève' },
      { icon: 'library-outline', label: '2 séances dans la bibliothèque' },
    ],
  },
  {
    name: 'Gosh Starter',
    subtitle: 'Pour les coachs actifs',
    monthly: '9,99€',
    annual: '95,90€',
    annualNote: '-20% · 7,99€/mois',
    maxStudents: '10 élèves max',
    color: ACCENT,
    features: [
      { icon: 'people-outline', label: 'Jusqu\'à 10 élèves' },
      { icon: 'pizza-outline', label: 'Plan macros sur-mesure', detail: 'Protéines, lipides, glucides par élève' },
      { icon: 'scale-outline', label: 'Suivi poids de l\'élève', detail: 'Courbe de progression et assiduité' },
      { icon: 'library-outline', label: 'Bibliothèque illimitée', detail: '2 séances max en Discovery' },
      { icon: 'ribbon-outline', label: 'Priorité dans la recherche' },
    ],
  },
  {
    name: 'Gosh Pro',
    subtitle: 'Pour développer ta clientèle',
    monthly: '24,99€',
    annual: '239,90€',
    annualNote: '-20% · 19,99€/mois',
    maxStudents: '30 élèves max',
    color: GOLD,
    highlighted: true,
    features: [
      { icon: 'people-outline', label: 'Jusqu\'à 30 élèves' },
      { icon: 'pizza-outline', label: 'Plan macros sur-mesure', detail: 'Protéines, lipides, glucides par élève' },
      { icon: 'scale-outline', label: 'Suivi poids de l\'élève', detail: 'Courbe de progression et assiduité' },
      { icon: 'library-outline', label: 'Bibliothèque illimitée' },
      { icon: 'ribbon-outline', label: 'Priorité dans la recherche' },
      { icon: 'stats-chart-outline', label: 'Statistiques avancées', detail: 'Dashboard performance globale de ta clientèle' },
    ],
  },
  {
    name: 'Gosh Elite',
    subtitle: 'Pour les pros sans limite',
    monthly: '49,99€',
    annual: '479,90€',
    annualNote: '-20% · 39,99€/mois',
    maxStudents: 'Élèves illimités',
    color: '#A78BFA',
    features: [
      { icon: 'infinite-outline', label: 'Élèves illimités' },
      { icon: 'pizza-outline', label: 'Plan macros sur-mesure' },
      { icon: 'scale-outline', label: 'Suivi poids de l\'élève' },
      { icon: 'library-outline', label: 'Bibliothèque illimitée' },
      { icon: 'ribbon-outline', label: 'Priorité maximale dans la recherche' },
      { icon: 'stats-chart-outline', label: 'Statistiques avancées' },
      { icon: 'star-outline', label: 'Badge Elite coach vérifié' },
    ],
  },
];

export default function AbonnementScreen() {
  const colors = useColors();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accountType, setAccountType] = useState<AccountType>('standard');

  useEffect(() => {
    const me = auth.currentUser;
    if (!me) { setLoading(false); return; }
    getDoc(doc(db, 'users', me.uid)).then((snap) => {
      setAccountType((snap.data()?.accountType ?? 'standard') as AccountType);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }} edges={['top', 'bottom']}>
        <ActivityIndicator color={GOLD} />
      </SafeAreaView>
    );
  }

  const isStudent = accountType === 'student';
  const isCoach = accountType === 'coach';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={[styles.backBtn, { backgroundColor: colors.card }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Hero */}
        <View style={styles.hero}>
          <GlowLogo />
          {isStudent ? (
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.text }]}>Tout est gratuit pour toi</Text>
              <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
                En tant qu'élève, tu as accès à toutes les fonctionnalités sans rien payer.
              </Text>
            </View>
          ) : isCoach ? (
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.text }]}>Abonnements Coach</Text>
              <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
                Choisis le palier adapté à ta clientèle. -20% avec l'abonnement annuel.
              </Text>
            </View>
          ) : (
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.text }]}>Gosh Plus</Text>
              <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
                Passe au niveau supérieur pour 2,99€ / mois
              </Text>
            </View>
          )}
        </View>

        {/* Contenu élève */}
        {isStudent && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: GOLD + '30', borderWidth: 1 }]}>
            <Text style={[styles.cardTitle, { color: GOLD }]}>Ce que tu as inclus</Text>
            {STUDENT_FEATURES.map((f, i) => (
              <React.Fragment key={f.label}>
                {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                <View style={styles.featureRow}>
                  <View style={[styles.featureIcon, { backgroundColor: GOLD + '18' }]}>
                    <Ionicons name={f.icon as any} size={16} color={GOLD} />
                  </View>
                  <Text style={[styles.featureLabel, { color: colors.text }]}>{f.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Contenu standard */}
        {!isStudent && !isCoach && (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <View style={styles.planHeader}>
                <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>Gratuit</Text>
                <Text style={[styles.planPrice, { color: colors.textSecondary }]}>0€</Text>
              </View>
              {STANDARD_FREE.map((f, i) => (
                <React.Fragment key={f.label}>
                  {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                  <View style={styles.featureRow}>
                    <View style={[styles.featureIcon, { backgroundColor: colors.surface }]}>
                      <Ionicons name={f.icon as any} size={16} color={colors.textSecondary} />
                    </View>
                    <Text style={[styles.featureLabel, { color: colors.text }]}>{f.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: ACCENT + '40', borderWidth: 1.5 }]}>
              <View style={styles.planHeader}>
                <Text style={[styles.cardTitle, { color: ACCENT }]}>Gosh Plus</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.planPrice, { color: ACCENT }]}>2,99€<Text style={{ fontSize: 13, fontWeight: '500' }}> / mois</Text></Text>
                </View>
              </View>
              <Text style={[styles.proIncludes, { color: colors.textSecondary }]}>Tout le gratuit, plus :</Text>
              {STANDARD_PLUS.map((f, i) => (
                <React.Fragment key={f.label}>
                  {i > 0 && <View style={[styles.sep, { backgroundColor: ACCENT + '20' }]} />}
                  <View style={styles.featureRow}>
                    <View style={[styles.featureIcon, { backgroundColor: ACCENT + '18' }]}>
                      <Ionicons name={f.icon as any} size={16} color={ACCENT} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.featureLabel, { color: colors.text }]}>{f.label}</Text>
                      {f.detail && <Text style={[styles.featureDetail, { color: colors.textSecondary }]}>{f.detail}</Text>}
                    </View>
                  </View>
                </React.Fragment>
              ))}
            </View>

            <TouchableOpacity activeOpacity={0.8} style={[styles.cta, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.ctaText, { color: colors.textSecondary }]}>Bientôt disponible</Text>
            </TouchableOpacity>
            <Text style={[styles.ctaNote, { color: colors.textSecondary }]}>
              Les abonnements seront disponibles lors du lancement officiel de Gosh.
            </Text>
          </>
        )}

        {/* Contenu coach — scroll horizontal des tiers */}
        {isCoach && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tierScroll}
              snapToInterval={CARD_W + 12}
              decelerationRate="fast"
            >
              {COACH_TIERS.map((tier) => (
                <CoachTierCard key={tier.name} tier={tier} colors={colors} />
              ))}
            </ScrollView>

            <View style={[styles.annualBanner, { backgroundColor: colors.card, borderColor: GOLD + '30' }]}>
              <Ionicons name="gift-outline" size={18} color={GOLD} />
              <Text style={[styles.annualBannerText, { color: colors.text }]}>
                <Text style={{ color: GOLD, fontWeight: '700' }}>-20% </Text>
                sur tous les paliers avec l'abonnement annuel
              </Text>
            </View>

            <TouchableOpacity activeOpacity={0.8} style={[styles.cta, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.ctaText, { color: colors.textSecondary }]}>Bientôt disponible</Text>
            </TouchableOpacity>
            <Text style={[styles.ctaNote, { color: colors.textSecondary }]}>
              Les abonnements seront disponibles lors du lancement officiel de Gosh.
            </Text>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function CoachTierCard({ tier, colors }: { tier: CoachTier; colors: any }) {
  const isFree = !tier.monthly;
  return (
    <View style={[
      styles.tierCard,
      { backgroundColor: colors.card, borderColor: tier.color + (tier.highlighted ? '60' : '30'), borderWidth: tier.highlighted ? 1.5 : 1 },
    ]}>
      {tier.highlighted && (
        <View style={[styles.tierBadge, { backgroundColor: tier.color }]}>
          <Text style={styles.tierBadgeText}>Populaire</Text>
        </View>
      )}

      <View style={{ gap: 4 }}>
        <Text style={[styles.tierName, { color: tier.color }]}>{tier.name}</Text>
        <Text style={[styles.tierSubtitle, { color: colors.textSecondary }]}>{tier.subtitle}</Text>
      </View>

      <View style={{ gap: 2 }}>
        {isFree ? (
          <Text style={[styles.tierPrice, { color: colors.text }]}>Gratuit</Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={[styles.tierPrice, { color: tier.color }]}>{tier.monthly}</Text>
              <Text style={[styles.tierPriceSub, { color: colors.textSecondary }]}>/mois</Text>
            </View>
            {tier.annualNote && (
              <Text style={[styles.tierAnnual, { color: colors.textSecondary }]}>
                Annuel : {tier.annual} · {tier.annualNote}
              </Text>
            )}
          </>
        )}
        <View style={[styles.tierMaxStudents, { backgroundColor: tier.color + '15' }]}>
          <Text style={[styles.tierMaxStudentsText, { color: tier.color }]}>{tier.maxStudents}</Text>
        </View>
      </View>

      <View style={[styles.sep, { backgroundColor: tier.color + '20' }]} />

      <View style={{ gap: 10 }}>
        {tier.features.map((f) => (
          <View key={f.label} style={styles.featureRow}>
            <View style={[styles.featureIcon, { backgroundColor: tier.color + '18' }]}>
              <Ionicons name={f.icon as any} size={14} color={tier.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.featureLabel, { color: colors.text, fontSize: 13 }]}>{f.label}</Text>
              {f.detail && <Text style={[styles.featureDetail, { color: colors.textSecondary }]}>{f.detail}</Text>}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 56, paddingBottom: 40, gap: 16 },
  backBtn: {
    position: 'absolute', top: 56, left: 20, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  hero: { alignItems: 'center', gap: 16, marginBottom: 8, paddingHorizontal: 20 },
  heroText: { alignItems: 'center', gap: 6 },
  heroTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  heroSub: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  card: { borderRadius: 18, padding: 20, gap: 14, marginHorizontal: 20 },
  cardTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  planPrice: { fontSize: 22, fontWeight: '800' },
  proIncludes: { fontSize: 12, marginTop: -4, marginBottom: 2 },
  sep: { height: StyleSheet.hairlineWidth },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  featureLabel: { fontSize: 14, flex: 1 },
  featureDetail: { fontSize: 12, marginTop: 1 },
  cta: {
    borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
  },
  ctaText: { fontSize: 16, fontWeight: '700' },
  ctaNote: { fontSize: 12, textAlign: 'center', lineHeight: 17, paddingHorizontal: 28 },
  // Coach tiers
  tierScroll: { paddingHorizontal: 20, gap: 12, paddingBottom: 4 },
  tierCard: {
    width: CARD_W,
    borderRadius: 18,
    padding: 20,
    gap: 14,
    position: 'relative',
  },
  tierBadge: {
    position: 'absolute', top: -10, left: '50%', transform: [{ translateX: -36 }],
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 3,
  },
  tierBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  tierName: { fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  tierSubtitle: { fontSize: 12 },
  tierPrice: { fontSize: 28, fontWeight: '900' },
  tierPriceSub: { fontSize: 13, fontWeight: '500' },
  tierAnnual: { fontSize: 11, lineHeight: 15 },
  tierMaxStudents: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 4 },
  tierMaxStudentsText: { fontSize: 12, fontWeight: '700' },
  annualBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, borderRadius: 12, padding: 14, borderWidth: 1,
  },
  annualBannerText: { fontSize: 14, flex: 1, lineHeight: 19 },
});
