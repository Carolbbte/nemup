import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
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
import {
  ChevronRight,
  Clock,
  Play,
  Sparkles,
  Zap,
} from 'lucide-react-native';

const { height: SCREEN_H } = Dimensions.get('window');
const SM    = SCREEN_H < 740;
const BG    = '#F7F8FC';
const BRAND = '#5B3DF5';
const LIME  = '#C4F852';

const GRAD_CTA = ['#7C5AFF', '#B44EFF'] as const;

// ── NEM ─────────────────────────────────────────────────────────
const NEM_GOAL = 6.5;

// ── Gamification (only shown values) ─────────────────────────────
const LEVEL      = 12;
const CURRENT_XP = 2480;
const GEM_COUNT  = 340;
const LEAGUE_POS: number = 3;

// ── Mensajes de identidad ─────────────────────────────────────────
const IDENTITY_MSGS = [
  '🔥 14 días de racha',
  `🏆 Top ${LEAGUE_POS} en tu liga`,
  '🎯 Vas por buen camino académico',
  '📚 Cada sesión suma a tu futuro',
  '🚀 Vas camino a la universidad',
];

// ── Materias ─────────────────────────────────────────────────────
const SUBJECT_META: Record<string, { name: string; emoji: string; color: string }> = {
  math:      { name: 'Matemáticas', emoji: '🔢', color: BRAND },
  spanish:   { name: 'Lengua',      emoji: '📖', color: Colors.sky },
  english:   { name: 'Inglés',      emoji: '🌍', color: '#2563EB' },
  science:   { name: 'Ciencias',    emoji: '🔬', color: Colors.teal },
  history:   { name: 'Historia',    emoji: '📜', color: Colors.orange },
  biology:   { name: 'Biología',    emoji: '🧬', color: Colors.teal },
  chemistry: { name: 'Química',     emoji: '⚗️', color: Colors.sky },
  physics:   { name: 'Física',      emoji: '⚡', color: Colors.amber },
};

// ── Entrance animation ────────────────────────────────────────────
function FadeUp({ children, delay = 0, style }: {
  children: React.ReactNode; delay?: number; style?: object;
}) {
  const opacity = useSharedValue(0);
  const ty      = useSharedValue(14);
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    ty.value      = withDelay(delay, withSpring(0, { damping: 22, stiffness: 175 }));
  }, []);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: ty.value }] }));
  return <Animated.View style={[anim, style]}>{children}</Animated.View>;
}

// ── Animated NEM counter ──────────────────────────────────────────
function AnimatedNemValue({ from, to }: { from: number; to: number }) {
  const progress = useSharedValue(0);
  const [displayed, setDisplayed] = useState(from.toFixed(1));
  const fromInt = Math.round(from * 10);
  const range   = Math.round(to * 10) - fromInt;
  useAnimatedReaction(
    () => Math.round(fromInt + progress.value * range),
    (cur, prev) => { if (cur !== prev) runOnJS(setDisplayed)((cur / 10).toFixed(1)); },
  );
  useEffect(() => {
    progress.value = withDelay(400, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, []);
  return <Text style={s.nemValue}>{displayed}</Text>;
}

// ── Task row ──────────────────────────────────────────────────────
function TaskRow({ index, label, done }: { index: number; label: string; done: boolean }) {
  const checkScale = useSharedValue(0);
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));
  useEffect(() => {
    if (done) checkScale.value = withSpring(1, { damping: 11, stiffness: 260 });
  }, [done]);
  return (
    <View style={s.taskRow}>
      {done ? (
        <LinearGradient colors={[...GRAD_CTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.taskDoneBox}>
          <Animated.View style={checkStyle}>
            <Text style={s.taskDoneMark}>✓</Text>
          </Animated.View>
        </LinearGradient>
      ) : (
        <View style={s.taskTodoBox}>
          <Text style={s.taskTodoNum}>{index + 1}</Text>
        </View>
      )}
      <Text style={[s.taskLabel, done && s.taskLabelDone]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════
export default function HomeScreen() {
  const router    = useRouter();
  const { state } = useOnboarding();
  const insets    = useSafeAreaInsets();
  const name      = state.data.name ?? 'estudiante';

  const topSubjectId = state.data.subjects?.[0] ?? 'math';
  const topSubject   = SUBJECT_META[topSubjectId] ?? { name: 'Matemáticas', emoji: '🔢', color: BRAND };

  const [lastSession, setLastSession] = useState<{
    subject: string; topic: string; xpReward: number; estimatedDuration: number;
  } | null>(null);

  // Identity message rotation
  const [identityIdx, setIdentityIdx] = useState(0);
  const identityIdxRef = useRef(0);
  const identityOp     = useSharedValue(1);
  const identityStyle  = useAnimatedStyle(() => ({ opacity: identityOp.value }));

  useEffect(() => {
    AsyncStorage.getItem('nemup_last_session').then((raw) => {
      if (!raw) return;
      try {
        const p = JSON.parse(raw);
        setLastSession({ subject: p.subject, topic: p.topic, xpReward: p.xpReward, estimatedDuration: p.estimatedDuration });
      } catch {}
    });
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      identityOp.value = withTiming(0, { duration: 200 }, (done) => {
        if (!done) return;
        identityIdxRef.current = (identityIdxRef.current + 1) % IDENTITY_MSGS.length;
        runOnJS(setIdentityIdx)(identityIdxRef.current);
        identityOp.value = withTiming(1, { duration: 260 });
      });
    }, 3500);
    return () => clearInterval(t);
  }, []);

  const missionsDone = lastSession ? 1 : 0;
  const dailyTasks = [
    { label: 'Practica la materia de mayor impacto', done: lastSession !== null },
    { label: 'Sube apuntes de una asignatura',       done: false },
    { label: 'Responde 3 preguntas correctas',        done: false },
  ];

  const continueScale    = useSharedValue(1);
  const continueAnim     = useAnimatedStyle(() => ({ transform: [{ scale: continueScale.value }] }));
  const ctaScale         = useSharedValue(1);
  const ctaAnim          = useAnimatedStyle(() => ({ transform: [{ scale: ctaScale.value }] }));
  const subjectScale     = useSharedValue(1);
  const subjectAnim      = useAnimatedStyle(() => ({ transform: [{ scale: subjectScale.value }] }));
  const newSessionScale  = useSharedValue(1);
  const newSessionAnim   = useAnimatedStyle(() => ({ transform: [{ scale: newSessionScale.value }] }));

  // Entrance microanimations
  const avatarScale = useSharedValue(0.82);
  const avatarAnim  = useAnimatedStyle(() => ({ transform: [{ scale: avatarScale.value }] }));
  const badgeScale  = useSharedValue(0);
  const badgeAnim   = useAnimatedStyle(() => ({ transform: [{ scale: badgeScale.value }] }));
  const playScale   = useSharedValue(0.78);
  const playAnim    = useAnimatedStyle(() => ({ transform: [{ scale: playScale.value }] }));

  useEffect(() => {
    avatarScale.value = withDelay(80,  withSpring(1, { damping: 14, stiffness: 200 }));
    badgeScale.value  = withDelay(320, withSpring(1, { damping: 11, stiffness: 220 }));
    playScale.value   = withDelay(200, withSpring(1, { damping: 13, stiffness: 180 }));
  }, []);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ══ HEADER ════════════════════════════════════════════ */}
        <FadeUp delay={0}>
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Text style={s.greeting}>Hola, {name} 👋</Text>
              <Animated.View style={[s.identityWrap, identityStyle]}>
                <Text style={s.identityText}>{IDENTITY_MSGS[identityIdx]}</Text>
              </Animated.View>
            </View>
            <Animated.View style={[s.avatarWrap, avatarAnim]}>
              <View style={s.avatar}>
                <Text style={s.avatarLetter}>{(name[0] ?? 'U').toUpperCase()}</Text>
              </View>
              <Animated.View style={[s.avatarBadge, badgeAnim]}>
                <Text style={s.avatarBadgeText}>🔥14</Text>
              </Animated.View>
            </Animated.View>
          </View>
        </FadeUp>

        {/* ══ [1] META NEM ════════════════════════════════════ */}
        <FadeUp delay={40} style={{ marginBottom: 28 }}>
          <LinearGradient
            colors={['#4A2FE0', '#5B3DF5', '#7B61FF', '#9B6AF2']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.nemCard}
          >
            <View style={s.nemGlow1} pointerEvents="none" />
            <View style={s.nemGlow2} pointerEvents="none" />

            <Text style={s.nemLabel}>🎯 TU META NEM</Text>

            <View style={s.nemValueBlock}>
              <AnimatedNemValue from={6.0} to={NEM_GOAL} />
              <Text style={s.nemSubtitle}>Meta académica definida</Text>
            </View>

            <Text style={s.nemMotiv}>Cada sesión te acerca a tu meta</Text>

            <View style={s.nemStats}>
              <View style={s.nemStatItem}>
                <Text style={s.nemStatIcon}>🔥</Text>
                <Text style={s.nemStatValue}>14 días</Text>
                <Text style={s.nemStatLabel}>Racha activa</Text>
              </View>
              <View style={s.nemStatDivider} />
              <View style={s.nemStatItem}>
                <Text style={s.nemStatIcon}>⚡</Text>
                <Text style={s.nemStatValue}>{CURRENT_XP.toLocaleString()} XP</Text>
                <Text style={s.nemStatLabel}>acumulado</Text>
              </View>
              <View style={s.nemStatDivider} />
              <View style={s.nemStatItem}>
                <Text style={s.nemStatIcon}>🏆</Text>
                <Text style={s.nemStatValue}>Top {LEAGUE_POS}</Text>
                <Text style={s.nemStatLabel}>de tu liga</Text>
              </View>
            </View>

          </LinearGradient>
        </FadeUp>

        {/* ══ [2] CONTINUAR APRENDIENDO / CREAR ════════════════ */}
        {lastSession ? (
          <FadeUp delay={120} style={{ marginBottom: 12 }}>
            <Pressable
              onPressIn={() => { continueScale.value = withSpring(0.97, { damping: 20 }); }}
              onPressOut={() => { continueScale.value = withSpring(1,    { damping: 20 }); }}
              onPress={() => router.push('/modals/session' as any)}
            >
              <Animated.View style={[s.continueCard, continueAnim]}>
                <LinearGradient colors={[...GRAD_CTA]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.continueStripe} />
                <View style={s.continueBody}>
                  <Text style={s.continueTag}>📚 CONTINUAR APRENDIENDO</Text>
                  <Text style={s.continueSubject}>{lastSession.subject}</Text>
                  <Text style={s.continueTopic} numberOfLines={1}>{lastSession.topic}</Text>
                  <View style={s.continueImpactRow}>
                    <Text style={s.continueImpact}>↑ Te acerca a tu meta</Text>
                  </View>
                  <View style={s.continueMeta}>
                    <Zap size={11} color={BRAND} strokeWidth={2.5} />
                    <Text style={s.continueMetaTxt}>+{lastSession.xpReward} XP</Text>
                    <Text style={s.continueMetaDot}>·</Text>
                    <Clock size={10} color={Colors.muted} strokeWidth={2} />
                    <Text style={s.continueMetaTxt}>{lastSession.estimatedDuration} min</Text>
                  </View>
                </View>
                <Animated.View style={[s.continuePlayWrap, playAnim]}>
                  <LinearGradient colors={[...GRAD_CTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.continuePlayInner}>
                    <Play size={14} color="white" strokeWidth={2.5} fill="white" />
                  </LinearGradient>
                </Animated.View>
              </Animated.View>
            </Pressable>
            <Pressable
              onPressIn={() => { newSessionScale.value = withSpring(0.97, { damping: 20 }); }}
              onPressOut={() => { newSessionScale.value = withSpring(1,    { damping: 20 }); }}
              onPress={() => router.push('/modals/upload' as any)}
              style={{ marginTop: 10 }}
            >
              <Animated.View style={[s.newSessionCard, newSessionAnim]}>
                <View style={s.newSessionBody}>
                  <Text style={s.newSessionTitle}>📄 Nueva sesión</Text>
                  <Text style={s.newSessionSub}>Sube apuntes y genera práctica personalizada</Text>
                </View>
                <LinearGradient colors={[...GRAD_CTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.newSessionBtn}>
                  <Text style={s.newSessionBtnText}>Subir apuntes</Text>
                </LinearGradient>
              </Animated.View>
            </Pressable>
          </FadeUp>
        ) : (
          <FadeUp delay={120} style={{ marginBottom: 16 }}>
            <Pressable
              onPressIn={() => { ctaScale.value = withSpring(0.97, { damping: 20 }); }}
              onPressOut={() => { ctaScale.value = withSpring(1,    { damping: 20 }); }}
              onPress={() => router.push('/modals/upload' as any)}
            >
              <Animated.View style={[s.ctaWrap, ctaAnim]}>
                <LinearGradient colors={[...GRAD_CTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.ctaGradient}>
                  <View style={s.ctaShine} pointerEvents="none" />
                  <View style={s.ctaIconBox}>
                    <Sparkles size={24} color="white" strokeWidth={1.8} />
                  </View>
                  <View style={s.ctaTextBlock}>
                    <Text style={s.ctaTitle}>Sube tus apuntes y practica</Text>
                    <Text style={s.ctaSub}>NEMup crea sesiones que te acercan a tu objetivo</Text>
                  </View>
                  <ChevronRight size={20} color="white" strokeWidth={2.5} />
                </LinearGradient>
              </Animated.View>
            </Pressable>
          </FadeUp>
        )}

        {/* ══ [3] TU PRÓXIMA MEJORA ════════════════════════════ */}
        <FadeUp delay={160} style={{ marginBottom: 12 }}>
          <Text style={s.topPickLabel}>📈 TU PRÓXIMA MEJORA</Text>
          <Pressable
            onPressIn={() => { subjectScale.value = withSpring(0.98, { damping: 20 }); }}
            onPressOut={() => { subjectScale.value = withSpring(1,    { damping: 20 }); }}
            onPress={() => router.push('/modals/upload' as any)}
          >
            <Animated.View style={[s.topPickCard, { borderColor: topSubject.color + '28' }, subjectAnim]}>
              <LinearGradient colors={[...GRAD_CTA]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.topPickStripe} />
              <View style={s.topPickBody}>
                <Text style={s.topPickEmoji}>{topSubject.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.topPickName, { color: topSubject.color }]}>{topSubject.name}</Text>
                  <Text style={s.topPickReason}>Tu materia con menor práctica reciente</Text>
                </View>
                <LinearGradient colors={[...GRAD_CTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.topPickBtn}>
                  <Text style={s.topPickBtnText}>Mejorar {topSubject.name}</Text>
                </LinearGradient>
              </View>
            </Animated.View>
          </Pressable>
        </FadeUp>

        {/* ══ [4] MISIÓN DE HOY ═══════════════════════════════ */}
        <FadeUp delay={200} style={[s.card, { padding: 14 }]}>
          <View style={[s.cardHeaderRow, { marginBottom: 10 }]}>
            <Text style={s.cardTitle}>🎯 Misión de hoy</Text>
            <View style={s.missionBadge}>
              <Text style={s.missionBadgeText}>{missionsDone}/3 completadas</Text>
            </View>
          </View>
          <View style={s.taskList}>
            {dailyTasks.map((t, i) => (
              <TaskRow key={i} index={i} label={t.label} done={t.done} />
            ))}
          </View>
          <View style={s.missionFooter}>
            <Text style={s.missionFooterText}>🎁 +50 XP · +5 gemas al completar todo</Text>
          </View>
        </FadeUp>

        {/* ══ [5] PROGRESO COMPACTO ════════════════════════════ */}
        <FadeUp delay={240} style={{ marginBottom: 0 }}>
          <View style={s.bandCard}>
            <View style={s.bandItem}>
              <Text style={s.bandEmoji}>⭐</Text>
              <Text style={s.bandValue}>Nivel {LEVEL}</Text>
              <Text style={s.bandLabel}>{CURRENT_XP.toLocaleString()} XP</Text>
            </View>
            <View style={s.bandSep} />
            <View style={s.bandItem}>
              <Text style={s.bandEmoji}>🏆</Text>
              <Text style={[s.bandValue, { color: Colors.amber }]}>Liga Oro</Text>
              <Text style={s.bandLabel}>Posición #{LEAGUE_POS}</Text>
            </View>
            <View style={s.bandSep} />
            <View style={s.bandItem}>
              <Text style={s.bandEmoji}>💎</Text>
              <Text style={[s.bandValue, { color: Colors.teal }]}>{GEM_COUNT}</Text>
              <Text style={s.bandLabel}>Gemas</Text>
            </View>
          </View>
        </FadeUp>

      </ScrollView>
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: 20, paddingTop: 10 },

  // ── Header ──────────────────────────────────────────────────
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  headerLeft:   { flex: 1, paddingRight: 12 },
  streakPill:   { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,122,43,0.1)', paddingHorizontal: 11, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,122,43,0.2)', marginBottom: 7 },
  streakText:   { fontSize: 12, fontWeight: '700', color: Colors.orange },
  greeting:     { fontSize: SM ? 22 : 25, fontWeight: '800', color: Colors.ink, marginBottom: 5, letterSpacing: -0.3 },
  identityWrap: { alignSelf: 'flex-start', backgroundColor: 'rgba(196,248,82,0.12)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(196,248,82,0.28)' },
  identityText: { fontSize: 12, fontWeight: '700', color: '#2D6A00' },
  avatarWrap:       { alignItems: 'center', gap: 4 },
  avatar:           { width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: LIME, shadowColor: '#7C5AFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  avatarLetter:     { fontSize: 18, fontWeight: '800', color: 'white' },
  avatarBadge:      { backgroundColor: 'rgba(255,122,43,0.12)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(255,122,43,0.28)' },
  avatarBadgeText:  { fontSize: 10, fontWeight: '800', color: Colors.orange },

  // ── META NEM Hero ─────────────────────────────────────────────
  nemCard:       { borderRadius: 24, padding: SM ? 14 : 17, marginBottom: 10, overflow: 'hidden', shadowColor: BRAND, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 22, elevation: 12 },
  nemGlow1:      { position: 'absolute', top: -40, right: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(196,248,82,0.08)' },
  nemGlow2:      { position: 'absolute', bottom: -20, left: -20, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.04)' },
  nemLabel:      { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', marginBottom: 8 },
  nemValueBlock: { marginBottom: 2 },
  nemValue:      { fontSize: SM ? 54 : 64, fontWeight: '900', color: 'white', letterSpacing: -3, lineHeight: SM ? 60 : 70 },
  nemSubtitle:   { fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: '600', marginTop: 4 },
  nemMotiv:      { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginBottom: 18, marginTop: 10 },
  nemStats:      { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 9, paddingHorizontal: 8, marginBottom: 0 },
  nemStatItem:   { flex: 1, alignItems: 'center', gap: 2 },
  nemStatDivider:{ width: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 4 },
  nemStatIcon:   { fontSize: 16 },
  nemStatValue:  { fontSize: 12, fontWeight: '800', color: 'white', letterSpacing: -0.2 },
  nemStatLabel:  { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },
  // ── Continue card (primary CTA) ──────────────────────────────
  continueCard:    { backgroundColor: 'white', borderRadius: 20, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(91,61,245,0.25)', shadowColor: BRAND, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 22, elevation: 12, alignItems: 'stretch' },
  continueStripe:  { width: 7 },
  continueBody:    { flex: 1, paddingVertical: SM ? 10 : 12, paddingHorizontal: SM ? 10 : 12, gap: 3 },
  continueTag:     { fontSize: 10, fontWeight: '900', color: BRAND, letterSpacing: 0.6, marginBottom: 3 },
  continueSubject: { fontSize: 11, fontWeight: '800', color: BRAND, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5 },
  continueTopic:   { fontSize: 15, fontWeight: '800', color: Colors.ink, letterSpacing: -0.2 },
  continueImpactRow: { backgroundColor: 'rgba(196,248,82,0.12)', borderRadius: 7, paddingVertical: 3, paddingHorizontal: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(196,248,82,0.28)' },
  continueImpact:  { fontSize: 11, fontWeight: '700', color: '#4C8A00' },
  continueMeta:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  continueMetaTxt: { fontSize: 11, color: Colors.muted, fontWeight: '500' },
  continueMetaDot: { fontSize: 11, color: Colors.muted },
  continuePlayWrap:  { width: 50, alignSelf: 'stretch', margin: 12 },
  continuePlayInner: { flex: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 8 },

  // ── Nueva sesión card ─────────────────────────────────────────
  newSessionCard:    { backgroundColor: 'white', borderRadius: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.line, padding: 14, gap: 12, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  newSessionBody:    { flex: 1 },
  newSessionTitle:   { fontSize: 15, fontWeight: '800', color: Colors.ink, marginBottom: 3 },
  newSessionSub:     { fontSize: 12, color: Colors.muted, fontWeight: '500', lineHeight: 17 },
  newSessionBtn:     { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13 },
  newSessionBtnText: { fontSize: 12, fontWeight: '800', color: 'white' },

  // ── Create CTA ───────────────────────────────────────────────
  ctaWrap:      { borderRadius: 20, overflow: 'hidden', shadowColor: '#7C5AFF', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.32, shadowRadius: 18, elevation: 10 },
  ctaShine:     { position: 'absolute', top: 0, left: 0, right: 0, height: 24, backgroundColor: 'rgba(255,255,255,0.22)', zIndex: 1 },
  ctaGradient:  { flexDirection: 'row', alignItems: 'center', paddingVertical: SM ? 16 : 18, paddingHorizontal: 18, gap: 14 },
  ctaIconBox:   { width: 46, height: 46, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  ctaTextBlock: { flex: 1 },
  ctaTitle:     { fontSize: 15, fontWeight: '800', color: 'white', marginBottom: 3, lineHeight: 20, letterSpacing: -0.2 },
  ctaSub:       { fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 17 },

  // ── Tu próxima mejora ────────────────────────────────────────
  topPickLabel: { fontSize: 9, fontWeight: '800', color: Colors.muted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  topPickCard:  { backgroundColor: 'white', borderRadius: 18, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3, alignItems: 'stretch' },
  topPickStripe:{ width: 5 },
  topPickBody:  { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingLeft: 14, paddingRight: 12, gap: 12 },
  topPickEmoji: { fontSize: 26 },
  topPickName:  { fontSize: 15, fontWeight: '800', letterSpacing: -0.3, marginBottom: 3 },
  topPickReason:{ fontSize: 11, fontWeight: '500', color: Colors.muted, lineHeight: 15 },
  topPickBtn:   { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'center' },
  topPickBtnText: { fontSize: 12, fontWeight: '800', color: 'white' },

  // ── Shared card ──────────────────────────────────────────────
  card:          { backgroundColor: 'white', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: Colors.line, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3, marginBottom: 12 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle:     { fontSize: 16, fontWeight: '800', color: Colors.ink },

  // ── Misión de hoy ─────────────────────────────────────────────
  missionBadge:     { backgroundColor: 'rgba(196,248,82,0.12)', borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(196,248,82,0.28)' },
  missionBadgeText: { fontSize: 11, fontWeight: '800', color: '#2D6A00' },
  taskList:         { gap: 8 },
  taskRow:          { flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskDoneBox:      { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  taskDoneMark:     { fontSize: 11, color: 'white', fontWeight: '900' },
  taskTodoBox:      { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: 'rgba(91,61,245,0.28)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  taskTodoNum:      { fontSize: 11, fontWeight: '800', color: 'rgba(91,61,245,0.45)' },
  taskLabel:        { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.ink },
  taskLabelDone:    { color: Colors.muted, textDecorationLine: 'line-through' as const },
  missionFooter:    { backgroundColor: 'rgba(196,248,82,0.1)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center' as const, marginTop: 12, borderWidth: 1, borderColor: 'rgba(196,248,82,0.28)' },
  missionFooterText:{ fontSize: 12, fontWeight: '700', color: '#2D6A00' },

  // ── Progreso compacto (banda) ─────────────────────────────────
  bandCard:  { backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: Colors.line, flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  bandItem:  { flex: 1, alignItems: 'center', gap: 3 },
  bandSep:   { width: 1, height: 38, backgroundColor: Colors.line },
  bandEmoji: { fontSize: 20 },
  bandValue: { fontSize: 13, fontWeight: '800', color: Colors.ink, letterSpacing: -0.2 },
  bandLabel: { fontSize: 10, color: Colors.muted, fontWeight: '500' },
});
