import ScreenContainer from '@/components/ScreenContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { TIME_COMMITMENTS } from '@/types/onboarding';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const BG = '#09051A';
const NEON = '#7C5AFF';
const LIME = '#C4F852';
const GLASS = 'rgba(255,255,255,0.06)';
const GLASS_BORDER = 'rgba(255,255,255,0.12)';
const TOTAL_STEPS = 4;

// Only show 4 options — "2+ horas" removed so layout fits without scroll
const DISPLAY_COMMITMENTS = TIME_COMMITMENTS.filter((t) => t.id !== '2hours');

const TIME_ICONS = ['⚡', '🎯', '🔥', '💎'] as const;
const TIME_ICON_COLORS: [string, string][] = [
  ['#5B3DF5', '#9340FF'],
  ['#FF5B9F', '#FF3D8A'],
  ['#FF7A2B', '#FFB547'],
  ['#00C2A8', '#00A08A'],
];

// Individual card component so Reanimated hooks are per-instance, not in a loop
function TimeCard({
  time, isActive, onPress, icon, iconColors, enterDelay,
}: {
  time: (typeof DISPLAY_COMMITMENTS)[number];
  isActive: boolean;
  onPress: () => void;
  icon: string;
  iconColors: [string, string];
  enterDelay: number;
}) {
  const sc = useSharedValue(1);
  const fade = useSharedValue(0);
  const ty = useSharedValue(16);
  const wasActive = useRef(false);

  useEffect(() => {
    // Entrance stagger
    fade.value = withDelay(enterDelay, withTiming(1, { duration: 400 }));
    ty.value   = withDelay(enterDelay, withSpring(0, { mass: 0.5, stiffness: 200, damping: 18 }));
  }, []);

  useEffect(() => {
    if (isActive && !wasActive.current) {
      sc.value = withSequence(
        withSpring(0.97, { mass: 0.4, stiffness: 500, damping: 14 }),
        withSpring(1,    { mass: 0.4, stiffness: 320, damping: 16 })
      );
    }
    wasActive.current = isActive;
  }, [isActive]);

  const outerStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: ty.value }, { scale: sc.value }],
  }));

  return (
    <Animated.View style={outerStyle}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.timeCard, isActive && styles.timeCardActive, pressed && styles.timeCardPressed]}
        android_ripple={{ color: 'rgba(124,90,255,0.2)' }}
      >
        {isActive && (
          <LinearGradient
            colors={['rgba(91,61,245,0.28)', 'rgba(155,77,255,0.16)']}
            style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
          />
        )}
        <LinearGradient colors={iconColors} style={styles.timeIconCircle}>
          <Text style={styles.timeIconEmoji}>{icon}</Text>
        </LinearGradient>
        <View style={styles.timeInfo}>
          <View style={styles.timeTopRow}>
            <Text style={styles.timeAmount}>{time.amount}</Text>
            {time.tag && (
              <LinearGradient colors={[LIME, '#A8E020']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.timeBadge}>
                <Text style={styles.timeBadgeText}>★ {time.tag}</Text>
              </LinearGradient>
            )}
          </View>
          <Text style={styles.timeDesc}>{time.description}</Text>
        </View>
        {isActive && (
          <View style={styles.timeCheck}>
            <Text style={styles.timeCheckText}>✓</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function CommitmentScreen() {
  const { state, setDailyCommitment, nextStep, prevStep } = useOnboarding();

  const headerFade = useSharedValue(0);
  const headerTy   = useSharedValue(20);
  const tipFade    = useSharedValue(0);

  useEffect(() => {
    headerFade.value = withTiming(1, { duration: 600 });
    headerTy.value   = withSpring(0, { mass: 0.6, stiffness: 160, damping: 18 });
    tipFade.value    = withDelay(700, withTiming(1, { duration: 500 }));
  }, []);

  const canContinue = !!state.data.dailyCommitment;

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerFade.value,
    transform: [{ translateY: headerTy.value }],
  }));
  const tipStyle = useAnimatedStyle(() => ({ opacity: tipFade.value }));

  // CTA breathing shine
  const ctaShine = useSharedValue(0);
  useEffect(() => {
    if (canContinue) {
      ctaShine.value = withRepeat(
        withSequence(
          withTiming(0.2, { duration: 1400 }),
          withTiming(0,   { duration: 1400 })
        ),
        -1, false
      );
    }
  }, [canContinue]);
  const ctaShineStyle = useAnimatedStyle(() => ({ opacity: ctaShine.value }));

  return (
    <ScreenContainer style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <LinearGradient colors={[BG, '#120B2F', '#1A1045']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.orb1} />
      <View style={styles.orb2} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={prevStep} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        <View style={styles.progressWrap}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
            const done = i < state.currentStep;
            return done ? (
              <LinearGradient key={i} colors={[NEON, '#C44EFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.progressSeg} />
            ) : (
              <View key={i} style={[styles.progressSeg, styles.progressSegOff]} />
            );
          })}
        </View>
        <View style={styles.stepLbl}>
          <Text style={styles.stepLblText}>{state.currentStep}/{TOTAL_STEPS}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
        {/* Header */}
        <Animated.View style={[styles.header, headerStyle]}>
          <Text style={styles.emoji}>⚡</Text>
          <Text style={styles.title}>Elige tu <Text style={styles.lime}>modo</Text></Text>
          <Text style={styles.subtitle}>¿Cuánto tiempo puedes entrenar cada día?</Text>
        </Animated.View>

        {/* Time cards */}
        <View style={styles.timeList}>
          {DISPLAY_COMMITMENTS.map((time, i) => (
            <TimeCard
              key={time.id}
              time={time}
              isActive={state.data.dailyCommitment === time.id}
              onPress={() => setDailyCommitment(time.id)}
              icon={TIME_ICONS[i]}
              iconColors={TIME_ICON_COLORS[i]}
              enterDelay={200 + i * 110}
            />
          ))}
        </View>

        {/* Tip */}
        <Animated.View style={[styles.tip, tipStyle]}>
          <Text style={styles.tipEmoji}>💡</Text>
          <Text style={styles.tipText}>
            <Text style={styles.tipBold}>Consejo: </Text>
            15 min diarios superan a 2 horas el domingo.
          </Text>
        </Animated.View>
      </ScrollView>

      {/* CTA */}
      <View style={styles.bottom}>
        <Pressable
          onPress={nextStep}
          disabled={!canContinue}
          style={({ pressed }) => [
            styles.ctaWrap,
            !canContinue && styles.ctaDisabled,
            pressed && canContinue && styles.ctaPressed,
          ]}
        >
          <LinearGradient
            colors={canContinue ? [NEON, '#B44EFF'] : ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.07)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cta}
          >
            {canContinue && <Animated.View style={[styles.ctaShine, ctaShineStyle]} />}
            <Text style={[styles.ctaText, !canContinue && styles.ctaTextOff]}>Siguiente</Text>
            <Text style={[styles.ctaArrow, !canContinue && styles.ctaTextOff]}>→</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  orb1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(91,61,245,0.1)', top: -50, right: -50 },
  orb2: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(196,248,82,0.05)', bottom: 60, left: -60 },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.8)', lineHeight: 26 },
  progressWrap: { flex: 1, flexDirection: 'row', gap: 6 },
  progressSeg: { flex: 1, borderRadius: 3, height: 6 },
  progressSegOff: { backgroundColor: 'rgba(255,255,255,0.12)' },
  stepLbl: { backgroundColor: GLASS, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: GLASS_BORDER },
  stepLblText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },

  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 },

  header: { alignItems: 'center', paddingTop: 4, marginBottom: 12 },
  emoji: { fontSize: 44, marginBottom: 8 },
  title: { fontSize: 30, fontWeight: '900', color: '#FFF', textAlign: 'center', lineHeight: 38, marginBottom: 6 },
  lime: { color: LIME },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 19 },

  timeList: { gap: 8, marginBottom: 12 },

  timeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: GLASS,
    borderWidth: 1.5, borderColor: GLASS_BORDER,
    borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14,
    gap: 14, overflow: 'hidden',
  },
  timeCardActive: {
    borderColor: NEON,
    shadowColor: NEON, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  timeCardPressed: { opacity: 0.85 },
  timeIconCircle: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  timeIconEmoji: { fontSize: 20 },
  timeInfo: { flex: 1 },
  timeTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  timeAmount: { fontSize: 15, fontWeight: '800', color: '#FFF' },

  // Gaming-style badge with gradient
  timeBadge: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  timeBadgeText: { fontSize: 8, fontWeight: '900', color: '#09051A', letterSpacing: 0.5 },

  timeDesc: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  timeCheck: { width: 26, height: 26, borderRadius: 13, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  timeCheckText: { fontSize: 13, color: '#09051A', fontWeight: '900' },

  tip: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(196,248,82,0.05)',
    borderWidth: 1, borderColor: 'rgba(196,248,82,0.13)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
  },
  tipEmoji: { fontSize: 16, marginTop: 1 },
  tipText: { fontSize: 12, color: 'rgba(255,255,255,0.58)', lineHeight: 17, flex: 1 },
  tipBold: { fontWeight: '800', color: LIME },

  bottom: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 8 },
  ctaWrap: { borderRadius: 18, overflow: 'hidden', shadowColor: NEON, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 10 },
  ctaDisabled: { shadowOpacity: 0, elevation: 0 },
  ctaPressed: { opacity: 0.88 },
  cta: { paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  ctaShine: { position: 'absolute', top: 0, left: 0, right: 0, height: 22, backgroundColor: 'rgba(255,255,255,0.22)' },
  ctaText: { fontSize: 17, fontWeight: '900', color: '#FFF' },
  ctaArrow: { fontSize: 17, fontWeight: '900', color: '#FFF' },
  ctaTextOff: { color: 'rgba(255,255,255,0.35)' },
});
