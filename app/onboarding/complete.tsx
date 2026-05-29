import ScreenContainer from '@/components/ScreenContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight, Award, BookOpen, Clock, Lightbulb,
  Sparkles, Star, Target, User,
} from 'lucide-react-native';
import React, { useEffect } from 'react';
import { Dimensions, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
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

const BG        = '#09051A';
const NEON      = '#7C5AFF';
const LIME      = '#C4F852';
const BTN_FLOOR = '#3D1F8A';
const GLASS        = 'rgba(124,90,255,0.1)';
const GLASS_BORDER = 'rgba(124,90,255,0.38)';
const TOTAL_STUDENTS = '8.247';

const { height: SCREEN_H } = Dimensions.get('window');
const SM = SCREEN_H < 700;

// Compact circle — fits without scroll on 360×640
const T_WRAP = SM ? 104 : 118;
const T_R    = SM ? 38  : 44;

// 12 confetti pieces — purely decorative, absolutely positioned
const CONFETTI = [
  { left: '7%',  bg: LIME,      size: 9,  dur: 2800, delay: 0,    zigzag:  8 },
  { left: '15%', bg: '#FF5B9F', size: 7,  dur: 3200, delay: 400,  zigzag: -10, radius: 4 },
  { left: '28%', bg: '#5BC8FF', size: 10, dur: 2600, delay: 800,  zigzag:  12 },
  { left: '38%', bg: LIME,      size: 6,  dur: 3600, delay: 200,  zigzag: -8,  radius: 3 },
  { left: '50%', bg: '#FFB547', size: 9,  dur: 2900, delay: 600,  zigzag:  6  },
  { left: '62%', bg: '#5BC8FF', size: 7,  dur: 3100, delay: 1000, zigzag: -12, radius: 4 },
  { left: '72%', bg: '#FF5B9F', size: 8,  dur: 2700, delay: 300,  zigzag:  10, radius: 4 },
  { left: '82%', bg: LIME,      size: 6,  dur: 3400, delay: 700,  zigzag: -6,  radius: 3 },
  { left: '20%', bg: NEON,      size: 8,  dur: 3000, delay: 500,  zigzag:  8,  radius: 4 },
  { left: '45%', bg: '#FFB547', size: 7,  dur: 2500, delay: 900,  zigzag: -10 },
  { left: '88%', bg: LIME,      size: 9,  dur: 3300, delay: 100,  zigzag:  6  },
  { left: '58%', bg: '#5BC8FF', size: 6,  dur: 2800, delay: 1200, zigzag: -8,  radius: 3 },
] as const;

type ConfettiItem = (typeof CONFETTI)[number];

function ConfettiPiece({ item }: { item: ConfettiItem }) {
  const ty  = useSharedValue(0);
  const tx  = useSharedValue(0);
  const rot = useSharedValue(0);

  useEffect(() => {
    ty.value = withDelay(
      item.delay,
      withRepeat(
        withTiming(SCREEN_H + 40, { duration: item.dur, easing: Easing.linear }),
        -1, false
      )
    );
    tx.value = withDelay(
      item.delay,
      withRepeat(
        withSequence(
          withTiming(item.zigzag,       { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
          withTiming(-item.zigzag,      { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
          withTiming(item.zigzag * 0.6, { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
          withTiming(0,                 { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) })
        ),
        -1, false
      )
    );
    rot.value = withDelay(
      item.delay,
      withRepeat(withTiming(720, { duration: item.dur, easing: Easing.linear }), -1, false)
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotateZ: rot.value + 'deg' }],
  }));

  return (
    <Animated.View
      style={[
        styles.confetti,
        style,
        {
          left: item.left,
          width: item.size,
          height: item.size,
          backgroundColor: item.bg,
          borderRadius: 'radius' in item ? (item as any).radius : 2,
        },
      ]}
    />
  );
}

const SPARKS = [
  { top: '30%', left: '8%',  size: 4, color: LIME },
  { top: '35%', right: '7%', size: 3, color: '#FF5B9F' },
  { top: '60%', left: '4%',  size: 3, color: NEON },
  { top: '65%', right: '5%', size: 4, color: LIME },
] as const;

type SparkItem = (typeof SPARKS)[number];

function SparkDot({ spark, index }: { spark: SparkItem; index: number }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(
      1200 + index * 200,
      withRepeat(
        withSequence(
          withTiming(0.7,  { duration: 1300 + index * 250, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.05, { duration: 1300 + index * 250, easing: Easing.inOut(Easing.ease) })
        ),
        -1, false
      )
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const pos: Record<string, string | number> = { top: spark.top };
  if ('left' in spark) pos.left = (spark as SparkItem & { left: string }).left;
  else pos.right = (spark as SparkItem & { right: string }).right;
  return (
    <Animated.View
      style={[
        { position: 'absolute', borderRadius: spark.size / 2, backgroundColor: spark.color, width: spark.size, height: spark.size, ...pos },
        style,
      ]}
    />
  );
}

type ValueType = 'plain' | 'chip' | 'highlight' | 'subtle';

function StatRow({ Icon, label, value, valueType = 'plain' }: {
  Icon: LucideIcon; label: string; value: string; valueType?: ValueType;
}) {
  return (
    <View style={styles.statRow}>
      <Icon size={SM ? 11 : 13} color="rgba(255,255,255,0.55)" strokeWidth={1.8} />
      <Text style={styles.statLabel}>{label}</Text>
      {valueType === 'chip' ? (
        <View style={styles.statChip}><Text style={styles.statChipText}>{value}</Text></View>
      ) : valueType === 'highlight' ? (
        <View style={styles.statHighlight}><Text style={styles.statHighText}>{value}</Text></View>
      ) : valueType === 'subtle' ? (
        <Text style={styles.statSubtle}>{value}</Text>
      ) : (
        <Text style={styles.statValue}>{value}</Text>
      )}
    </View>
  );
}

export default function CompleteScreen() {
  const { state, completeOnboarding } = useOnboarding();
  const [isLoading, setIsLoading] = React.useState(false);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  // ── Hero circle ──
  const circleScale   = useSharedValue(0);
  const circleFade    = useSharedValue(0);
  const circleFloatY  = useSharedValue(0);
  const sparkleRot    = useSharedValue(0);
  const ring1Scale    = useSharedValue(1);
  const ring2Scale    = useSharedValue(1);

  // ── Content stagger ──
  const titleFade    = useSharedValue(0);
  const titleY       = useSharedValue(18);
  const subtitleFade = useSharedValue(0);
  const badgeFade    = useSharedValue(0);
  const badgeY       = useSharedValue(14);
  const cardFade     = useSharedValue(0);
  const cardY        = useSharedValue(20);
  const cardSc       = useSharedValue(0.96);
  const ctaFade      = useSharedValue(0);
  const ctaY         = useSharedValue(16);
  const tipFade      = useSharedValue(0);
  const ctaShine     = useSharedValue(0);
  const ctaBorder    = useSharedValue(0);
  const btnSink      = useSharedValue(0);

  useEffect(() => {
    // 0.1s: circle bounceIn 0 → 1.22 → 1
    circleFade.value  = withDelay(100, withTiming(1, { duration: 300 }));
    circleScale.value = withDelay(
      100,
      withSequence(
        withSpring(1.22, { mass: 0.4, stiffness: 280, damping: 10 }),
        withSpring(1,    { mass: 0.4, stiffness: 220, damping: 14 })
      )
    );
    circleFloatY.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withTiming(-7, { duration: 2300, easing: Easing.inOut(Easing.sin) }),
          withTiming(0,  { duration: 2300, easing: Easing.inOut(Easing.sin) })
        ),
        -1, false
      )
    );
    sparkleRot.value = withRepeat(withTiming(360, { duration: 7000, easing: Easing.linear }), -1, false);
    ring1Scale.value = withDelay(
      500,
      withRepeat(
        withSequence(
          withTiming(1.14, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1,    { duration: 1800, easing: Easing.inOut(Easing.ease) })
        ),
        -1, false
      )
    );
    ring2Scale.value = withDelay(
      1100,
      withRepeat(
        withSequence(
          withTiming(1.08, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
          withTiming(1,    { duration: 2200, easing: Easing.inOut(Easing.ease) })
        ),
        -1, false
      )
    );

    // 0.4s: title
    titleFade.value = withDelay(400, withTiming(1, { duration: 420 }));
    titleY.value    = withDelay(400, withSpring(0, { mass: 0.5, stiffness: 180, damping: 16 }));
    // 0.55s: subtitle
    subtitleFade.value = withDelay(550, withTiming(1, { duration: 380 }));
    // 0.7s: badge
    badgeFade.value = withDelay(700, withTiming(1, { duration: 380 }));
    badgeY.value    = withDelay(700, withSpring(0, { mass: 0.5, stiffness: 200, damping: 16 }));
    // 0.85s: card
    cardFade.value = withDelay(850, withTiming(1, { duration: 420 }));
    cardY.value    = withDelay(850, withSpring(0, { mass: 0.6, stiffness: 160, damping: 18 }));
    cardSc.value   = withDelay(850, withSpring(1, { mass: 0.6, stiffness: 160, damping: 18 }));
    // 1.1s: CTA
    ctaFade.value = withDelay(1100, withTiming(1, { duration: 420 }));
    ctaY.value    = withDelay(1100, withSpring(0, { mass: 0.5, stiffness: 200, damping: 14 }));
    // CTA breathing shine
    ctaShine.value = withDelay(
      1900,
      withRepeat(
        withSequence(
          withTiming(0.22, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0,    { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1, false
      )
    );
    // Lime border pulse every 3s
    ctaBorder.value = withDelay(
      2200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 280, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 280, easing: Easing.in(Easing.ease) }),
          withTiming(0, { duration: 2440 })
        ),
        -1, false
      )
    );
    // 1.3s: tip
    tipFade.value = withDelay(1300, withTiming(1, { duration: 380 }));
  }, []);


  const handleComplete = async () => {
    try {
      setIsLoading(true);
      await completeOnboarding();
    } catch {
      setIsLoading(false);
    }
  };

  const commitmentLabel = {
    '5min': '5 min / día', '15min': '15 min / día',
    '30min': '30 min / día', '1hour': '1 hora / día', '2hours': '2+ horas / día',
  }[state.data.dailyCommitment] ?? state.data.dailyCommitment;

  const firstName = state.data.name.split(' ')[0] || state.data.name;

  const circleStyle    = useAnimatedStyle(() => ({
    opacity: circleFade.value,
    transform: [{ scale: circleScale.value }, { translateY: circleFloatY.value }],
  }));
  const ring1Style     = useAnimatedStyle(() => ({ transform: [{ scale: ring1Scale.value }] }));
  const ring2Style     = useAnimatedStyle(() => ({ transform: [{ scale: ring2Scale.value }] }));
  const sparkleStyle   = useAnimatedStyle(() => ({ transform: [{ rotateZ: sparkleRot.value + 'deg' }] }));
  const titleStyle     = useAnimatedStyle(() => ({ opacity: titleFade.value, transform: [{ translateY: titleY.value }] }));
  const subtitleStyle  = useAnimatedStyle(() => ({ opacity: subtitleFade.value }));
  const badgeStyle     = useAnimatedStyle(() => ({ opacity: badgeFade.value, transform: [{ translateY: badgeY.value }] }));
  const cardStyle      = useAnimatedStyle(() => ({
    opacity: cardFade.value,
    transform: [{ translateY: cardY.value }, { scale: cardSc.value }],
  }));
  const ctaStyle       = useAnimatedStyle(() => ({ opacity: ctaFade.value, transform: [{ translateY: ctaY.value }] }));
  const ctaShineStyle  = useAnimatedStyle(() => ({ opacity: ctaShine.value }));
  const ctaBorderStyle = useAnimatedStyle(() => ({ opacity: ctaBorder.value * 0.7 }));
  const tipStyle       = useAnimatedStyle(() => ({ opacity: tipFade.value }));
  const btnSinkStyle   = useAnimatedStyle(() => ({ transform: [{ translateY: btnSink.value * 4 }] }));

  return (
    <ScreenContainer style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <LinearGradient colors={[BG, '#120B2F', '#1A1045']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

      <View style={styles.orb1} />
      <View style={styles.orb2} />

      {CONFETTI.map((c, i) => <ConfettiPiece key={i} item={c} />)}
      {SPARKS.map((s, i)   => <SparkDot key={i} spark={s} index={i} />)}

      {/* No-scroll layout: 3 zones with space-between */}
      <View style={styles.layout}>

        {/* ── ZONE 1: circle + title + subtitle ── */}
        <View style={styles.top}>
          <Animated.View style={[styles.circleWrap, circleStyle]}>
            <Animated.View style={[styles.ring2, ring2Style]} />
            <Animated.View style={[styles.ring1, ring1Style]} />
            <View style={styles.circleOuter}>
              <LinearGradient colors={[LIME, '#9BCC14']} style={[StyleSheet.absoluteFill, { borderRadius: T_R }]} />
              <Animated.View style={[StyleSheet.absoluteFill, sparkleStyle]}>
                <View style={{ position: 'absolute', top: 2, left: 0, right: 0, alignItems: 'center' }}>
                  <Sparkles size={SM ? 8 : 10} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
                </View>
                <View style={{ position: 'absolute', bottom: 2, left: 0, right: 0, alignItems: 'center' }}>
                  <Star size={SM ? 8 : 10} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
                </View>
                <View style={{ position: 'absolute', top: '38%', left: 2 }}>
                  <Star size={7} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
                </View>
              </Animated.View>
              <View style={styles.circleHighlight} />
              <View style={{ zIndex: 1 }}>
                <Award size={SM ? 34 : 40} color={BG} strokeWidth={1.5} />
              </View>
            </View>
          </Animated.View>

          <Animated.View style={titleStyle}>
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
              ¡Listo para <Text style={styles.lime}>comenzar!</Text>
            </Text>
          </Animated.View>

          <Animated.View style={subtitleStyle}>
            <Text style={styles.subtitle}>
              Eres la estudiante{' '}
              <Text style={styles.subtitleAccent}>#{TOTAL_STUDENTS}</Text>
              {' '}en empezar tu NEM con NemUp,{' '}
              <Text style={styles.subtitleName}>{firstName}</Text>
            </Text>
          </Animated.View>
        </View>

        {/* ── ZONE 2: badge + character card ── */}
        <View style={styles.middle}>
          <Animated.View style={[styles.achieveBadge, badgeStyle]}>
            <Award size={SM ? 16 : 18} color={LIME} strokeWidth={1.8} />
            <View style={styles.achieveBody}>
              <Text style={styles.achieveTitle}>¡Primera medalla desbloqueada!</Text>
              <Text style={styles.achieveSub}>Pionero NEM</Text>
            </View>
            <View style={styles.achieveNew}>
              <Text style={styles.achieveNewText}>NUEVO</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.summaryCard, cardStyle]}>
            <LinearGradient colors={[NEON, '#C44EFF', '#FF5B9F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cardAccent} />
            <View style={styles.summaryHeader}>
              <LinearGradient colors={[NEON, '#C44EFF']} style={styles.summaryDot} />
              <Text style={styles.summaryTitle}>TU PERSONAJE</Text>
            </View>
            <StatRow Icon={Sparkles} label="Nivel"         value="1 · Aprendiz"             valueType="chip"      />
            <StatRow Icon={User}     label="Nombre"        value={state.data.name}                                 />
            <StatRow Icon={BookOpen} label="Curso"         value={state.data.curso}                                />
            <StatRow Icon={Target}   label="Meta NEM"      value={state.data.goal.toFixed(1)} valueType="highlight" />
            <StatRow Icon={Clock}    label="Entrenamiento" value={commitmentLabel}            valueType="subtle"    />
          </Animated.View>
        </View>

        {/* ── ZONE 3: CTA + tip ── */}
        <View style={styles.bottom}>
          {state.error ? <Text style={styles.errorText}>{state.error}</Text> : null}

          <Animated.View style={[styles.ctaOuterWrap, ctaStyle, isLoading && styles.ctaLoading]}>
            <View style={styles.ctaFloor} />
            <Pressable
              onPressIn={() => { btnSink.value = withTiming(1, { duration: 80 }); }}
              onPressOut={() => { btnSink.value = withTiming(0, { duration: 120 }); }}
              onPress={handleComplete}
              disabled={isLoading}
            >
              <Animated.View style={[styles.ctaFace, btnSinkStyle]}>
                <LinearGradient
                  colors={[NEON, '#B44EFF', '#FF5B9F']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.ctaGrad}
                >
                  <Animated.View style={[styles.ctaShineBar, ctaShineStyle]} />
                  <View style={styles.ctaContent}>
                    <View style={styles.ctaMainRow}>
                      <Text style={styles.ctaText}>{isLoading ? 'Cargando...' : 'Comenzar a estudiar'}</Text>
                      {!isLoading && <ArrowRight size={17} color="#FFF" strokeWidth={2.5} />}
                    </View>
                    {!isLoading && <Text style={styles.ctaXp}>+10 XP por empezar</Text>}
                  </View>
                </LinearGradient>
                <Animated.View style={[styles.ctaBorderPulse, ctaBorderStyle]} pointerEvents="none" />
              </Animated.View>
            </Pressable>
          </Animated.View>

          <Animated.View style={tipStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Lightbulb size={SM ? 10 : 11} color="rgba(255,255,255,0.42)" strokeWidth={2} />
              <Text style={styles.tip}>Sube cualquier apunte para tu primera sesión.</Text>
            </View>
          </Animated.View>
        </View>

      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  orb1: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(196,248,82,0.05)', top: -60, right: -70 },
  orb2: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(91,61,245,0.12)', bottom: 10, left: -80 },

  confetti: { position: 'absolute', top: -16, zIndex: 2 },

  // Main no-scroll layout: 3 zones with equal distribution
  layout: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: SM ? 10 : 14,
    paddingBottom: SM ? 16 : 22,
    justifyContent: 'space-between',
  },

  // ── Zone 1: hero ──
  top: { alignItems: 'center', gap: SM ? 7 : 9 },

  circleWrap: { alignItems: 'center', justifyContent: 'center', width: T_WRAP, height: T_WRAP },
  ring2: {
    position: 'absolute',
    width: T_WRAP, height: T_WRAP, borderRadius: T_WRAP / 2,
    backgroundColor: 'rgba(196,248,82,0.04)',
    borderWidth: 1, borderColor: 'rgba(196,248,82,0.11)',
  },
  ring1: {
    position: 'absolute',
    width: T_WRAP * 0.82, height: T_WRAP * 0.82, borderRadius: (T_WRAP * 0.82) / 2,
    backgroundColor: 'rgba(196,248,82,0.09)',
    borderWidth: 1, borderColor: 'rgba(196,248,82,0.20)',
  },
  circleOuter: {
    width: T_WRAP * 0.74, height: T_WRAP * 0.74, borderRadius: T_R,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    shadowColor: LIME, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 24, elevation: 14,
  },
  sparkleGlyph: { position: 'absolute', fontSize: SM ? 8 : 10 },
  sparkleSmall: { position: 'absolute', fontSize: 7, color: 'rgba(255,255,255,0.9)' },
  circleHighlight: { position: 'absolute', top: 0, left: 0, right: 0, height: '38%', backgroundColor: 'rgba(255,255,255,0.20)' },
  medalEmoji: { fontSize: SM ? 34 : 40, zIndex: 1 },

  title: {
    fontSize: SM ? 22 : 26,
    fontWeight: '900',
    color: '#FFF',
    textAlign: 'center',
    lineHeight: SM ? 26 : 30,
  },
  lime: { color: LIME },
  subtitle: {
    fontSize: SM ? 11 : 12,
    color: 'rgba(255,255,255,0.58)',
    textAlign: 'center',
    lineHeight: SM ? 15 : 17,
  },
  subtitleName:   { color: '#FFF', fontWeight: '700' },
  subtitleAccent: { color: LIME,  fontWeight: '800' },

  // ── Zone 2: middle ──
  middle: { gap: SM ? 7 : 9 },

  achieveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: 'rgba(196,248,82,0.10)',
    borderWidth: 1, borderColor: 'rgba(196,248,82,0.26)',
    borderRadius: 12,
    paddingVertical: SM ? 7 : 8,
    paddingHorizontal: 12,
  },
  achieveIcon:    { fontSize: SM ? 16 : 18 },
  achieveBody:    { flex: 1 },
  achieveTitle:   { fontSize: 11, fontWeight: '800', color: LIME },
  achieveSub:     { fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: '600', marginTop: 1 },
  achieveNew:     { backgroundColor: NEON, borderRadius: 5, paddingVertical: 2, paddingHorizontal: 6 },
  achieveNewText: { fontSize: 8, fontWeight: '900', color: '#FFF', letterSpacing: 0.4 },

  summaryCard: {
    backgroundColor: GLASS, borderRadius: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: GLASS_BORDER,
    shadowColor: NEON, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 6,
  },
  cardAccent: { height: 3 },
  summaryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingTop: SM ? 8 : 10,
    paddingBottom: SM ? 5 : 6,
    paddingHorizontal: 12,
  },
  summaryDot:   { width: 7, height: 7, borderRadius: 3.5 },
  summaryTitle: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.42)', letterSpacing: 1.6 },

  statRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SM ? 6 : 7,
    paddingHorizontal: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 7,
  },
  statEmoji:     { fontSize: SM ? 11 : 12, width: 18 },
  statLabel:     { flex: 1, fontSize: SM ? 10 : 11, color: 'rgba(255,255,255,0.42)', fontWeight: '500' },
  statValue:     { fontSize: SM ? 11 : 12, fontWeight: '700', color: '#FFF' },
  statSubtle:    { fontSize: SM ? 11 : 12, fontWeight: '600', color: 'rgba(255,255,255,0.62)' },
  statChip: {
    backgroundColor: 'rgba(196,248,82,0.14)', borderWidth: 1, borderColor: 'rgba(196,248,82,0.28)',
    borderRadius: 7, paddingVertical: 2, paddingHorizontal: 8,
  },
  statChipText:  { fontSize: SM ? 10 : 11, fontWeight: '800', color: LIME },
  statHighlight: {
    backgroundColor: 'rgba(196,248,82,0.14)', borderWidth: 1, borderColor: 'rgba(196,248,82,0.36)',
    borderRadius: 8, paddingVertical: 2, paddingHorizontal: 9,
  },
  statHighText:  { fontSize: SM ? 12 : 13, fontWeight: '900', color: LIME },

  // ── Zone 3: bottom ──
  bottom: { gap: SM ? 7 : 9 },

  errorText: { color: '#FF4D6D', textAlign: 'center', fontWeight: '600', fontSize: 12 },

  ctaOuterWrap: {
    shadowColor: NEON, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.55, shadowRadius: 18, elevation: 12,
  },
  ctaLoading: { opacity: 0.65 },
  ctaFloor: {
    position: 'absolute', top: 6, left: 0, right: 0, bottom: 0,
    borderRadius: 16, backgroundColor: BTN_FLOOR,
  },
  ctaFace: { borderRadius: 16, overflow: 'hidden', marginBottom: 6 },
  ctaGrad: {
    paddingVertical: SM ? 11 : 13,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  ctaShineBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 20, backgroundColor: 'rgba(255,255,255,0.24)' },
  ctaContent:  { alignItems: 'center', gap: 2 },
  ctaMainRow:  { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ctaText:     { fontSize: 16, fontWeight: '900', color: '#FFF' },
  ctaArrow:    { fontSize: 17, fontWeight: '900', color: '#FFF' },
  ctaXp:       { fontSize: SM ? 9 : 10, fontWeight: '700', color: 'rgba(255,255,255,0.70)' },
  ctaBorderPulse: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 16, borderWidth: 2, borderColor: LIME,
  },

  tip: { fontSize: SM ? 10 : 11, color: 'rgba(255,255,255,0.42)', textAlign: 'center', lineHeight: SM ? 14 : 15 },
});
