import ScreenContainer from '@/components/ScreenContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Dimensions, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
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
const { height: SCREEN_H } = Dimensions.get('window');
const SM = SCREEN_H < 740;

const FEATURES = [
  { emoji: '⚡', label: 'Sesiones desde tus apuntes' },
  { emoji: '🤖', label: 'Tutor IA disponible 24/7' },
  { emoji: '🏆', label: 'Compite con tu curso' },
] as const;

// Twinkling background dots
const SPARKS = [
  { top: '9%',  left:  '18%', size: 3, color: LIME },
  { top: '13%', right: '22%', size: 2, color: '#FF5B9F' },
  { top: '30%', left:  '6%',  size: 3, color: NEON },
  { top: '42%', right: '9%',  size: 2, color: LIME },
  { top: '60%', left:  '14%', size: 2, color: '#5BC8FF' },
  { top: '72%', right: '18%', size: 3, color: '#FFB547' },
] as const;

type SparkItem = (typeof SPARKS)[number];

function SparkDot({ spark, index }: { spark: SparkItem; index: number }) {
  const opacity = useSharedValue(0.1);

  useEffect(() => {
    opacity.value = withDelay(
      800 + index * 180,
      withRepeat(
        withSequence(
          withTiming(0.75, { duration: 1100 + index * 220, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.08, { duration: 1100 + index * 220, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
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
        { position: 'absolute', borderRadius: spark.size / 2, backgroundColor: spark.color },
        { width: spark.size, height: spark.size, ...pos },
        style,
      ]}
    />
  );
}

function FeatureCard({ item, index }: { item: (typeof FEATURES)[number]; index: number }) {
  const opacity = useSharedValue(0);
  const ty = useSharedValue(16);

  useEffect(() => {
    const d = 600 + index * 140;
    opacity.value = withDelay(d, withTiming(1, { duration: 450 }));
    ty.value = withDelay(d, withSpring(0, { mass: 0.5, stiffness: 200, damping: 18 }));
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: ty.value }] }));

  return (
    <Animated.View style={[styles.featureCard, style]}>
      <LinearGradient colors={['rgba(124,90,255,0.35)', 'rgba(124,90,255,0.15)']} style={styles.featureIconWrap}>
        <Text style={styles.featureEmoji}>{item.emoji}</Text>
      </LinearGradient>
      <Text style={styles.featureText}>{item.label}</Text>
    </Animated.View>
  );
}

export default function WelcomeScreen() {
  const { nextStep } = useOnboarding();

  const logoFade    = useSharedValue(0);
  const heroFade    = useSharedValue(0);
  const heroTy      = useSharedValue(28);
  const heroFloat   = useSharedValue(0);
  const ringPulse   = useSharedValue(1);
  const ctaFade     = useSharedValue(0);
  const ctaShine    = useSharedValue(0);

  useEffect(() => {
    logoFade.value = withTiming(1, { duration: 500 });

    heroFade.value = withDelay(120, withTiming(1, { duration: 700 }));
    heroTy.value   = withDelay(120, withSpring(0, { mass: 0.7, stiffness: 150, damping: 18 }));

    heroFloat.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withTiming(-10, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0,   { duration: 2500, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );

    ringPulse.value = withDelay(
      700,
      withRepeat(
        withSequence(
          withTiming(1.18, { duration: 1900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1,    { duration: 1900, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      )
    );

    ctaFade.value = withDelay(1050, withTiming(1, { duration: 500 }));
    ctaShine.value = withDelay(
      1800,
      withRepeat(
        withSequence(
          withTiming(0.22, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
          withTiming(0,    { duration: 1700, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      )
    );
  }, []);

  const logoStyle    = useAnimatedStyle(() => ({ opacity: logoFade.value }));
  const heroStyle    = useAnimatedStyle(() => ({ opacity: heroFade.value, transform: [{ translateY: heroTy.value }] }));
  const floatStyle   = useAnimatedStyle(() => ({ transform: [{ translateY: heroFloat.value }] }));
  const ringStyle    = useAnimatedStyle(() => ({ transform: [{ scale: ringPulse.value }] }));
  const ctaStyle     = useAnimatedStyle(() => ({ opacity: ctaFade.value }));
  const shineStyle   = useAnimatedStyle(() => ({ opacity: ctaShine.value }));

  return (
    <ScreenContainer style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <LinearGradient colors={[BG, '#120B2F', '#2A1060']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

      <View style={styles.orb1} />
      <View style={styles.orb2} />

      {SPARKS.map((s, i) => <SparkDot key={i} spark={s} index={i} />)}

      <View style={styles.layout}>
        {/* Logo */}
        <Animated.View style={[styles.logoRow, logoStyle]}>
          <LinearGradient colors={[NEON, '#C44EFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logoBadge}>
            <Text style={styles.logoLetter}>N</Text>
          </LinearGradient>
          <Text style={styles.logoLabel}>NemUp</Text>
        </Animated.View>

        {/* Hero — centered section (flex:1) */}
        <Animated.View style={[styles.heroSection, heroStyle]}>
          <Animated.View style={[styles.heroWrap, floatStyle]}>
            <Animated.View style={[styles.ring3, ringStyle]} />
            <Animated.View style={[styles.ring2, ringStyle]} />
            <View style={styles.ring1} />
            <LinearGradient colors={['rgba(91,61,245,0.65)', 'rgba(155,77,255,0.55)']} style={styles.heroCircle}>
              <Text style={styles.heroEmoji}>📈</Text>
            </LinearGradient>
          </Animated.View>

          <Text style={styles.title}>
            Sube tu <Text style={styles.lime}>NEM.</Text>{'\n'}
            <Text style={styles.white}>Cambia tu futuro.</Text>
          </Text>
          <Text style={styles.subtitle}>La app de estudio con IA hecha para estudiantes chilenos.</Text>
        </Animated.View>

        {/* Features + CTA — anchored to bottom */}
        <View style={styles.bottomSection}>
          <View style={styles.features}>
            {FEATURES.map((f, i) => <FeatureCard key={f.label} item={f} index={i} />)}
          </View>

          <Animated.View style={[styles.ctaWrap, ctaStyle]}>
            <Pressable
              onPress={nextStep}
              style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            >
              <LinearGradient
                colors={[NEON, '#B44EFF', '#FF5B9F']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.cta}
              >
                <Animated.View style={[styles.ctaShine, shineStyle]} />
                <Text style={styles.ctaText}>Empezar gratis</Text>
                <Text style={styles.ctaArrow}>→</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  layout: { flex: 1, paddingHorizontal: 24, paddingTop: SM ? 6 : 20, paddingBottom: 32 },

  orb1: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(91,61,245,0.12)', top: -60, right: -80 },
  orb2: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(196,248,82,0.04)', bottom: 60, left: -60 },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBadge: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logoLetter: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  logoLabel: { fontSize: 18, fontWeight: '800', color: '#FFF' },

  // Floating hero: takes all middle space, centers content
  heroSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  heroWrap: {
    width: SM ? 110 : 150, height: SM ? 110 : 150,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SM ? 12 : 22,
  },
  ring3: { position: 'absolute', width: SM ? 110 : 150, height: SM ? 110 : 150, borderRadius: SM ? 55 : 75, backgroundColor: 'rgba(91,61,245,0.10)' },
  ring2: { position: 'absolute', width: SM ? 86 : 118, height: SM ? 86 : 118, borderRadius: SM ? 43 : 59, backgroundColor: 'rgba(91,61,245,0.20)' },
  ring1: { position: 'absolute', width: SM ? 66 : 92, height: SM ? 66 : 92, borderRadius: SM ? 33 : 46, backgroundColor: 'rgba(91,61,245,0.30)', borderWidth: 1, borderColor: 'rgba(124,90,255,0.5)' },
  heroCircle: {
    width: SM ? 66 : 92, height: SM ? 66 : 92, borderRadius: SM ? 33 : 46,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: NEON, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 12,
  },
  heroEmoji: { fontSize: SM ? 36 : 50 },

  title: { fontSize: SM ? 30 : 38, fontWeight: '900', color: '#FFF', textAlign: 'center', lineHeight: SM ? 38 : 46, marginBottom: 10 },
  lime: { color: LIME },
  white: { color: '#FFFFFF' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 21 },

  // Features + CTA sit at the bottom
  bottomSection: { gap: 24 },
  features: { gap: 8 },
  featureCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  featureIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureEmoji: { fontSize: 20 },
  featureText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.92)', flex: 1 },

  ctaWrap: {
    borderRadius: 18, overflow: 'hidden',
    shadowColor: NEON, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 18, elevation: 12,
  },
  cta: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  ctaShine: { position: 'absolute', top: 0, left: 0, right: 0, height: 24, backgroundColor: 'rgba(255,255,255,0.22)' },
  ctaText: { fontSize: 17, fontWeight: '900', color: '#FFF' },
  ctaArrow: { fontSize: 17, fontWeight: '900', color: '#FFF' },
});
