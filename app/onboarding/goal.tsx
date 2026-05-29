import ScreenContainer from '@/components/ScreenContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, ChevronLeft, Dumbbell, Target } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Dimensions, PanResponder, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
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
const PRESETS = [4, 5, 6, 7] as const;
const { height: SCREEN_H } = Dimensions.get('window');
const SM = SCREEN_H < 740;
const GOAL_WRAP   = SM ? 118 : 150;
const GOAL_CIRCLE = SM ? 84  : 112;
const CIRCLE_R    = SM ? 42  : 56;

function getGoalMessage(goal: number) {
  if (goal >= 7) return '¡Meta perfecta! Vas por el máximo';
  if (goal >= 6) return '¡Excelente! Estás apuntando muy alto';
  if (goal >= 5) return 'Un objetivo sólido. ¡Puedes lograrlo!';
  return 'Buen punto de partida. ¡Vas a crecer!';
}

// Preset button with spring scale animation on activation
function PresetBtn({
  value, active, onPress,
}: { value: number; active: boolean; onPress: () => void }) {
  const sc = useSharedValue(1);
  const wasActive = useRef(false);

  useEffect(() => {
    if (active && !wasActive.current) {
      sc.value = withSequence(
        withSpring(1.1, { mass: 0.35, stiffness: 420, damping: 10 }),
        withSpring(1,   { mass: 0.35, stiffness: 260, damping: 14 })
      );
    }
    wasActive.current = active;
  }, [active]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));

  return (
    <Animated.View style={[styles.presetBtn, active && styles.presetBtnActive, animStyle]}>
      <Pressable
        onPress={onPress}
        style={styles.presetPressable}
        android_ripple={{ color: 'rgba(124,90,255,0.3)' }}
      >
        {active && (
          <LinearGradient colors={[NEON, '#C44EFF']} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
        )}
        <Text style={[styles.presetText, active && styles.presetTextActive]}>{value}.0</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function GoalScreen() {
  const { state, setGoal, nextStep, prevStep } = useOnboarding();

  // Entrance animations
  const fade  = useSharedValue(0);
  const slide = useSharedValue(28);

  // Goal circle animations
  const goalSc     = useSharedValue(1);
  const ringPulse  = useSharedValue(1);
  const circleFloat = useSharedValue(0);
  const ctaShine   = useSharedValue(0);

  // Slider PanResponder refs
  const sliderRef    = useRef<View>(null);
  const trackMetrics = useRef({ left: 0, width: 0 });

  // Keep goal setter stable across renders
  const setGoalRef = useRef(setGoal);
  setGoalRef.current = setGoal;

  const triggerGoalAnim = () => {
    goalSc.value = withSequence(
      withSpring(1.18, { mass: 0.35, stiffness: 380, damping: 10 }),
      withSpring(1,    { mass: 0.35, stiffness: 220, damping: 14 })
    );
  };

  const applyGoalRef = useRef((pageX: number) => {
    const { left, width } = trackMetrics.current;
    if (width === 0) return;
    const pct  = Math.max(0, Math.min(1, (pageX - left) / width));
    const raw  = 4 + pct * 3;
    const next = Math.min(7, Math.max(4, Math.round(raw * 10) / 10));
    setGoalRef.current(next);
    triggerGoalAnim();
  });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => applyGoalRef.current(e.nativeEvent.pageX),
      onPanResponderMove:  (e) => applyGoalRef.current(e.nativeEvent.pageX),
    })
  ).current;

  const measureSlider = () => {
    sliderRef.current?.measure((_x, _y, w, _h, pageX) => {
      trackMetrics.current = { left: pageX, width: w };
    });
  };

  useEffect(() => {
    fade.value  = withTiming(1, { duration: 600 });
    slide.value = withSpring(0, { mass: 0.6, stiffness: 160, damping: 18 });

    ringPulse.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1.15, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
          withTiming(1,    { duration: 1700, easing: Easing.inOut(Easing.ease) })
        ),
        -1, false
      )
    );

    circleFloat.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(-7, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
          withTiming(0,  { duration: 2200, easing: Easing.inOut(Easing.sin) })
        ),
        -1, false
      )
    );

    ctaShine.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withTiming(0.2, { duration: 1400 }),
          withTiming(0,   { duration: 1400 })
        ),
        -1, false
      )
    );
  }, []);

  const handleSetGoal = (val: number) => {
    setGoal(val);
    triggerGoalAnim();
  };

  const pct = ((state.data.goal - 4) / 3) * 100;

  const bodyStyle   = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateY: slide.value }] }));
  const goalScStyle = useAnimatedStyle(() => ({ transform: [{ scale: goalSc.value }] }));
  const ringStyle   = useAnimatedStyle(() => ({ transform: [{ scale: ringPulse.value }] }));
  const floatStyle     = useAnimatedStyle(() => ({ transform: [{ translateY: circleFloat.value }] }));
  const ctaShineStyle  = useAnimatedStyle(() => ({ opacity: ctaShine.value }));

  return (
    <ScreenContainer style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <LinearGradient colors={[BG, '#120B2F', '#1A1045']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.orb1} />
      <View style={styles.orb2} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={prevStep} style={styles.backBtn}>
          <ChevronLeft size={22} color="rgba(255,255,255,0.8)" strokeWidth={2.2} />
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
        <Animated.View style={[styles.body, bodyStyle]}>
          <View style={{ alignItems: 'center', marginBottom: SM ? 4 : 8 }}>
            <Target size={SM ? 36 : 44} color={LIME} strokeWidth={1.6} />
          </View>
          <Text style={styles.title}>¿Cuál es tu <Text style={styles.lime}>meta?</Text></Text>
          <Text style={styles.subtitle}>La nota que quieres alcanzar este año</Text>

          {/* Goal display — floating + pulsing rings */}
          <View style={styles.goalDisplay}>
            <Animated.View style={[styles.goalGlowWrap, floatStyle]}>
              <Animated.View style={[styles.goalGlowRing2, ringStyle]} />
              <Animated.View style={[styles.goalGlowRing1, ringStyle]} />
              <Animated.View style={[styles.goalCircle, goalScStyle]}>
                <LinearGradient
                  colors={['rgba(196,248,82,0.22)', 'rgba(124,90,255,0.32)']}
                  style={[StyleSheet.absoluteFill, { borderRadius: CIRCLE_R }]}
                />
                <Text style={styles.goalNumber}>{state.data.goal.toFixed(1)}</Text>
                <Text style={styles.goalLabel}>NIVEL OBJETIVO</Text>
              </Animated.View>
            </Animated.View>
          </View>

          {/* Draggable slider */}
          <View style={styles.sliderCard}>
            <Text style={styles.sliderTitle}>Ajusta tu meta</Text>
            {/* Touch area is taller than the visible track for easy interaction */}
            <View style={styles.sliderTouchArea} {...pan.panHandlers}>
              <View
                ref={sliderRef}
                style={styles.sliderTrack}
                onLayout={measureSlider}
              >
                <LinearGradient
                  colors={[NEON, LIME]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.sliderFill, { width: `${pct}%` as any }]}
                />
              </View>
              {/* Thumb — positioned over the touch area */}
              <View style={[styles.sliderThumb, { left: `${pct}%` as any }]} />
            </View>
            <View style={styles.sliderEdges}>
              <Text style={styles.sliderEdgeText}>4.0</Text>
              <Text style={styles.sliderEdgeText}>7.0</Text>
            </View>
          </View>

          {/* Preset buttons */}
          <View style={styles.presets}>
            {PRESETS.map((p) => (
              <PresetBtn
                key={p}
                value={p}
                active={state.data.goal === p}
                onPress={() => handleSetGoal(p)}
              />
            ))}
          </View>

          {/* Motivator */}
          <View style={styles.motivator}>
            <Dumbbell size={20} color={LIME} strokeWidth={1.8} />
            <Text style={styles.motivatorText}>{getGoalMessage(state.data.goal)}</Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* CTA */}
      <View style={styles.bottom}>
        <Pressable
          onPress={nextStep}
          style={({ pressed }) => [styles.ctaWrap, pressed && styles.ctaPressed]}
        >
          <LinearGradient colors={[NEON, '#B44EFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
            <Animated.View style={[styles.ctaShine, ctaShineStyle]} />
            <Text style={styles.ctaText}>Siguiente</Text>
            <ArrowRight size={17} color="#FFF" strokeWidth={2.5} />
          </LinearGradient>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  orb1: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(196,248,82,0.06)', top: -60, left: -60 },
  orb2: { position: 'absolute', width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(91,61,245,0.12)', bottom: 80, right: -80 },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.8)', lineHeight: 26 },
  progressWrap: { flex: 1, flexDirection: 'row', gap: 6 },
  progressSeg: { flex: 1, borderRadius: 3, height: 6 },
  progressSegOff: { backgroundColor: 'rgba(255,255,255,0.12)' },
  stepLbl: { backgroundColor: GLASS, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: GLASS_BORDER },
  stepLblText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },

  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  body: { paddingHorizontal: 24, paddingBottom: 12 },

  emoji: { fontSize: SM ? 36 : 44, textAlign: 'center', marginBottom: SM ? 4 : 8 },
  title: { fontSize: 30, fontWeight: '900', color: '#FFF', textAlign: 'center', lineHeight: 38, marginBottom: 6 },
  lime: { color: LIME },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 19, marginBottom: SM ? 10 : 16 },

  goalDisplay: { alignItems: 'center', marginBottom: SM ? 12 : 18 },
  goalGlowWrap: { alignItems: 'center', justifyContent: 'center', width: GOAL_WRAP, height: GOAL_WRAP },
  goalGlowRing2: { position: 'absolute', width: GOAL_WRAP, height: GOAL_WRAP, borderRadius: GOAL_WRAP / 2, backgroundColor: 'rgba(196,248,82,0.06)' },
  goalGlowRing1: { position: 'absolute', width: GOAL_WRAP * 0.79, height: GOAL_WRAP * 0.79, borderRadius: (GOAL_WRAP * 0.79) / 2, backgroundColor: 'rgba(196,248,82,0.11)' },
  goalCircle: {
    width: GOAL_CIRCLE, height: GOAL_CIRCLE, borderRadius: CIRCLE_R,
    backgroundColor: 'rgba(196,248,82,0.07)',
    borderWidth: 2, borderColor: 'rgba(196,248,82,0.38)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    shadowColor: LIME, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 8,
  },
  goalNumber: { fontSize: SM ? 40 : 50, fontWeight: '900', color: LIME, lineHeight: SM ? 44 : 54, letterSpacing: -2 },
  goalLabel: { fontSize: 8, fontWeight: '800', color: 'rgba(196,248,82,0.7)', letterSpacing: 1.5, marginTop: -4 },

  sliderCard: { backgroundColor: GLASS, borderRadius: 18, padding: SM ? 12 : 16, marginBottom: SM ? 10 : 14, borderWidth: 1, borderColor: GLASS_BORDER },
  sliderTitle: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.55)', marginBottom: SM ? 10 : 16 },

  // Tall touch area — makes the slider easy to grab on any device
  sliderTouchArea: {
    height: 40,
    justifyContent: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  sliderTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'visible',
  },
  sliderFill: { height: '100%', borderRadius: 4 },
  sliderThumb: {
    position: 'absolute',
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#FFF',
    borderWidth: 3, borderColor: NEON,
    top: 7, marginLeft: -13,
    shadowColor: NEON, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 10, elevation: 6,
  },
  sliderEdges: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderEdgeText: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },

  presets: { flexDirection: 'row', gap: 10, marginBottom: SM ? 10 : 14 },
  presetBtn: { flex: 1, backgroundColor: GLASS, borderWidth: 1.5, borderColor: GLASS_BORDER, borderRadius: 14, overflow: 'hidden' },
  presetBtnActive: { borderColor: NEON, shadowColor: NEON, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
  presetPressable: { paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  presetText: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  presetTextActive: { color: '#FFF', fontWeight: '900' },

  motivator: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(196,248,82,0.08)',
    borderWidth: 1, borderColor: 'rgba(196,248,82,0.2)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  motivatorEmoji: { fontSize: 20 },
  motivatorText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600', flex: 1, lineHeight: 19 },

  bottom: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 8 },
  ctaWrap: { borderRadius: 18, overflow: 'hidden', shadowColor: NEON, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 10 },
  ctaPressed: { opacity: 0.88 },
  cta: { paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  ctaText: { fontSize: 17, fontWeight: '900', color: '#FFF' },
  ctaArrow: { fontSize: 17, fontWeight: '900', color: '#FFF' },
  ctaShine: { position: 'absolute', top: 0, left: 0, right: 0, height: 22, backgroundColor: 'rgba(255,255,255,0.20)' },
});
