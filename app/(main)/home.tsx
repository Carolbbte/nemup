import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { useOnboarding } from '@/contexts/OnboardingContext';

const { height: SCREEN_H } = Dimensions.get('window');
const SM = SCREEN_H < 740;

const BG = '#F7F8FC';
const BRAND = '#5B3DF5';
const BRAND2 = '#7C5AFF';

// ── Fade-up entrance wrapper ─────────────────────────────────────
function FadeUp({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: object;
}) {
  const opacity = useSharedValue(0);
  const ty = useSharedValue(20);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 360 }));
    ty.value = withDelay(delay, withSpring(0, { damping: 22, stiffness: 175 }));
  }, []);

  const anim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }],
  }));

  return <Animated.View style={[anim, style]}>{children}</Animated.View>;
}

// ── Animated decimal count-up (e.g. 5.8 → 6.2) ──────────────────
function AnimatedNemValue({ from, to }: { from: number; to: number }) {
  const progress = useSharedValue(0);
  const [displayed, setDisplayed] = useState(from.toFixed(1));

  const fromInt = Math.round(from * 10);
  const range = Math.round(to * 10) - fromInt;

  useAnimatedReaction(
    () => Math.round(fromInt + progress.value * range),
    (cur, prev) => {
      if (cur !== prev) runOnJS(setDisplayed)((cur / 10).toFixed(1));
    },
  );

  useEffect(() => {
    progress.value = withDelay(
      400,
      withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  return <Text style={styles.nemValue}>{displayed}</Text>;
}

// ── Mini ascending sparkline bars ────────────────────────────────
const SPARK = [8, 11, 9, 15, 13, 21, 30];
function Sparkline() {
  return (
    <View style={styles.sparkWrap}>
      {SPARK.map((h, i) => (
        <View
          key={i}
          style={[
            styles.sparkBar,
            { height: h, opacity: 0.3 + (i / SPARK.length) * 0.7 },
          ]}
        />
      ))}
    </View>
  );
}

// ── Mission card (horizontal carousel) ──────────────────────────
type Difficulty = 'Fácil' | 'Medio' | 'Difícil';
type Mission = {
  emoji: string;
  subject: string;
  topic: string;
  xp: number;
  time: number;
  difficulty: Difficulty;
  color: string;
  tint: string;
};

const MISSIONS: Mission[] = [
  {
    emoji: '📐',
    subject: 'Matemáticas',
    topic: 'Funciones cuadráticas',
    xp: 80,
    time: 8,
    difficulty: 'Medio',
    color: BRAND,
    tint: 'rgba(91,61,245,0.06)',
  },
  {
    emoji: '🧬',
    subject: 'Biología',
    topic: 'Genética y herencia',
    xp: 60,
    time: 6,
    difficulty: 'Fácil',
    color: Colors.teal,
    tint: 'rgba(0,194,168,0.06)',
  },
  {
    emoji: '📜',
    subject: 'Historia',
    topic: 'Chile siglo XX',
    xp: 90,
    time: 10,
    difficulty: 'Difícil',
    color: Colors.orange,
    tint: 'rgba(255,122,43,0.06)',
  },
  {
    emoji: '⚗️',
    subject: 'Química',
    topic: 'Tabla periódica',
    xp: 70,
    time: 7,
    difficulty: 'Medio',
    color: Colors.sky,
    tint: 'rgba(91,200,255,0.06)',
  },
];

const DIFF_COLOR: Record<Difficulty, string> = {
  Fácil: Colors.teal,
  Medio: Colors.amber,
  Difícil: Colors.rose,
};

function MissionCard({ m, onPress }: { m: Mission; onPress: () => void }) {
  const scale = useSharedValue(1);
  const scaleAnim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 20 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 20 }); }}
      onPress={onPress}
    >
      <Animated.View
        style={[
          styles.missionCard,
          { backgroundColor: m.tint, borderColor: m.color + '28' },
          scaleAnim,
        ]}
      >
        <View style={[styles.missionIconWrap, { backgroundColor: m.color + '18' }]}>
          <Text style={styles.missionEmoji}>{m.emoji}</Text>
        </View>
        <Text style={[styles.missionSubject, { color: m.color }]}>{m.subject}</Text>
        <Text style={styles.missionTopic} numberOfLines={2}>
          {m.topic}
        </Text>
        <View style={styles.missionMeta}>
          <View style={[styles.diffPill, { backgroundColor: DIFF_COLOR[m.difficulty] + '1A' }]}>
            <Text style={[styles.diffText, { color: DIFF_COLOR[m.difficulty] }]}>
              {m.difficulty}
            </Text>
          </View>
        </View>
        <View style={styles.missionFooter}>
          <Text style={[styles.missionXp, { color: m.color }]}>⚡ +{m.xp} XP</Text>
          <Text style={styles.missionTime}>⏱ {m.time} min</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ── Main screen ──────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const { state } = useOnboarding();
  const insets = useSafeAreaInsets();

  const name = state.data.name ?? 'estudiante';
  const goal = state.data.goal ?? 6;

  const ctaScale = useSharedValue(1);
  const ctaAnim = useAnimatedStyle(() => ({ transform: [{ scale: ctaScale.value }] }));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Header ───────────────────────────────────────── */}
        <FadeUp delay={0}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.streakPill}>
                <Text style={styles.streakText}>🔥 14 días seguidos</Text>
              </View>
              <Text style={styles.greeting}>Hola, {name} 👋</Text>
              <Text style={styles.subGreeting}>Tu NEM sigue subiendo.</Text>
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarLetter}>
                {(name[0] ?? 'U').toUpperCase()}
              </Text>
            </View>
          </View>
        </FadeUp>

        {/* ─── NEM Card ─────────────────────────────────────── */}
        <FadeUp delay={80}>
          <LinearGradient
            colors={['#6552F0', '#5240DC', '#7252E0', '#9B6AF2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.nemCard}
          >
            <View style={styles.nemTop}>
              <Text style={styles.nemLabel}>NEM PROYECTADO</Text>
              <Sparkline />
            </View>
            <AnimatedNemValue from={5.8} to={6.2} />
            <Text style={styles.nemSub}>Basado en tus notas y práctica</Text>
            <View style={styles.nemBadges}>
              <View style={styles.nemBadge}>
                <Text style={styles.nemBadgeGreenText}>↑ +0.7 este año</Text>
              </View>
              <View style={[styles.nemBadge, styles.nemBadgeWhite]}>
                <Text style={styles.nemBadgeWhiteText}>Meta: {goal}.0</Text>
              </View>
            </View>
          </LinearGradient>
        </FadeUp>

        {/* ─── CTA principal ────────────────────────────────── */}
        <FadeUp delay={150}>
          <Pressable
            onPressIn={() => { ctaScale.value = withSpring(0.97, { damping: 20 }); }}
            onPressOut={() => { ctaScale.value = withSpring(1, { damping: 20 }); }}
            onPress={() => router.push('/modals/upload' as any)}
          >
            <Animated.View style={[styles.ctaWrap, ctaAnim]}>
              <LinearGradient
                colors={[BRAND, BRAND2]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                <View style={styles.ctaIconBox}>
                  <Text style={styles.ctaIconText}>✨</Text>
                </View>
                <View style={styles.ctaBody}>
                  <Text style={styles.ctaTitle}>
                    Crea una sesión desde tus apuntes
                  </Text>
                  <Text style={styles.ctaSub}>
                    La IA convierte tu materia en práctica interactiva
                  </Text>
                </View>
                <Text style={styles.ctaChevron}>→</Text>
              </LinearGradient>
            </Animated.View>
          </Pressable>
        </FadeUp>

        {/* ─── Continúa donde quedaste ──────────────────────── */}
        <FadeUp delay={210} style={styles.section}>
          <Text style={styles.sectionTitle}>Continúa donde quedaste</Text>
          <Pressable
            style={({ pressed }) => [
              styles.continueCard,
              pressed && styles.continueCardPressed,
            ]}
          >
            <View style={styles.continueRow}>
              <Text style={styles.continueEmoji}>🧬</Text>
              <View style={styles.continueInfo}>
                <Text style={styles.continueSubject}>Biología</Text>
                <Text style={styles.continueTopic}>División Celular</Text>
                <Text style={styles.continueMeta}>⚡ +60 XP · ⏱ 5 min restantes</Text>
              </View>
              <View style={styles.continueRight}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: '60%' }]} />
                </View>
                <Text style={styles.progressPct}>60%</Text>
                <Text style={styles.continueChevron}>›</Text>
              </View>
            </View>
          </Pressable>
        </FadeUp>

        {/* ─── Stats ────────────────────────────────────────── */}
        <FadeUp delay={270}>
          <View style={styles.statsRow}>
            <View
              style={[
                styles.statCard,
                { backgroundColor: 'rgba(91,61,245,0.07)', borderColor: 'rgba(91,61,245,0.13)' },
              ]}
            >
              <Text style={styles.statIcon}>⚡</Text>
              <Text style={[styles.statValue, { color: BRAND }]}>2.480</Text>
              <Text style={styles.statLabel}>XP TOTAL</Text>
            </View>
            <View
              style={[
                styles.statCard,
                { backgroundColor: 'rgba(0,194,168,0.07)', borderColor: 'rgba(0,194,168,0.13)' },
              ]}
            >
              <Text style={styles.statIcon}>💎</Text>
              <Text style={[styles.statValue, { color: Colors.teal }]}>340</Text>
              <Text style={styles.statLabel}>GEMAS</Text>
            </View>
            <View
              style={[
                styles.statCard,
                {
                  backgroundColor: 'rgba(255,181,71,0.07)',
                  borderColor: 'rgba(255,181,71,0.13)',
                },
              ]}
            >
              <Text style={styles.statIcon}>🏆</Text>
              <Text style={[styles.statValue, { color: Colors.amber }]}>#3</Text>
              <Text style={styles.statLabel}>EN TU LIGA</Text>
            </View>
          </View>
        </FadeUp>

        {/* ─── Missions header ──────────────────────────────── */}
        <FadeUp delay={320}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Misiones de hoy</Text>
            <Pressable>
              <Text style={styles.seeAll}>Ver todas →</Text>
            </Pressable>
          </View>
        </FadeUp>

        {/* ─── Missions horizontal carousel ─────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.missionsScroll}
          contentContainerStyle={styles.missionsContent}
        >
          {MISSIONS.map((m, i) => (
            <MissionCard
              key={i}
              m={m}
              onPress={() => console.log('Mission:', m.subject)}
            />
          ))}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  headerLeft: { flex: 1, paddingRight: 12 },
  streakPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,122,43,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,122,43,0.22)',
    marginBottom: 10,
  },
  streakText: { fontSize: 13, fontWeight: '700', color: Colors.orange },
  greeting: {
    fontSize: SM ? 22 : 26,
    fontWeight: '800',
    color: Colors.ink,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  subGreeting: { fontSize: 14, fontWeight: '500', color: Colors.ink3 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: BRAND,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarLetter: { fontSize: 19, fontWeight: '800', color: 'white' },

  // NEM Card
  nemCard: {
    borderRadius: 24,
    padding: SM ? 18 : 22,
    marginBottom: 16,
    shadowColor: '#5240DC',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 10,
    overflow: 'hidden',
  },
  nemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  nemLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },
  sparkWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  sparkBar: { width: 5, backgroundColor: Colors.lime, borderRadius: 2 },
  nemValue: {
    fontSize: SM ? 50 : 62,
    fontWeight: '900',
    color: 'white',
    lineHeight: SM ? 56 : 68,
    marginBottom: 6,
    letterSpacing: -1,
  },
  nemSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 14 },
  nemBadges: { flexDirection: 'row', gap: 8 },
  nemBadge: {
    backgroundColor: 'rgba(196,248,82,0.18)',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(196,248,82,0.32)',
  },
  nemBadgeGreenText: { fontSize: 12, fontWeight: '700', color: Colors.lime },
  nemBadgeWhite: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  nemBadgeWhiteText: { fontSize: 12, fontWeight: '700', color: 'white' },

  // CTA
  ctaWrap: {
    borderRadius: 20,
    marginBottom: 24,
    overflow: 'hidden',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 10,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SM ? 18 : 22,
    paddingHorizontal: 18,
    gap: 14,
  },
  ctaIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaIconText: { fontSize: 28 },
  ctaBody: { flex: 1 },
  ctaTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: 'white',
    marginBottom: 5,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  ctaSub: { fontSize: 12, color: 'rgba(255,255,255,0.74)', lineHeight: 17 },
  ctaChevron: { fontSize: 22, fontWeight: '700', color: 'white' },

  // Continue section
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: Colors.ink, marginBottom: 12 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAll: { fontSize: 13, fontWeight: '600', color: BRAND },
  continueCard: {
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    shadowColor: '#0B0B1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  continueCardPressed: { opacity: 0.82 },
  continueRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  continueEmoji: { fontSize: 34 },
  continueInfo: { flex: 1 },
  continueSubject: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  continueTopic: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.ink,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  continueMeta: { fontSize: 12, color: Colors.ink3, fontWeight: '500' },
  continueRight: { alignItems: 'flex-end', gap: 5 },
  progressTrack: {
    width: 52,
    height: 4,
    backgroundColor: Colors.line,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: Colors.teal, borderRadius: 2 },
  progressPct: { fontSize: 11, fontWeight: '700', color: Colors.teal },
  continueChevron: { fontSize: 24, color: Colors.muted, lineHeight: 24 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  statIcon: { fontSize: 20, marginBottom: 6 },
  statValue: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
  statLabel: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: Colors.muted,
    textAlign: 'center',
  },

  // Missions
  missionsScroll: { marginHorizontal: -20 },
  missionsContent: { paddingHorizontal: 20, gap: 12 },
  missionCard: {
    width: 184,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  missionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  missionEmoji: { fontSize: 24 },
  missionSubject: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  missionTopic: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink,
    marginBottom: 10,
    lineHeight: 19,
  },
  missionMeta: { marginBottom: 12 },
  diffPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  diffText: { fontSize: 10, fontWeight: '700' },
  missionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  missionXp: { fontSize: 13, fontWeight: '800' },
  missionTime: { fontSize: 11, fontWeight: '500', color: Colors.ink3 },
});
