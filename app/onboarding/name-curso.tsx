import ScreenContainer from '@/components/ScreenContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { CURSOS } from '@/types/onboarding';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, BookOpen, Check, ChevronLeft, Smile, User } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
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
const GLASS_BORDER = 'rgba(255,255,255,0.10)';
const TOTAL_STEPS = 4;

function CursoCard({ curso, active, onPress }: { curso: string; active: boolean; onPress: () => void }) {
  const sc = useSharedValue(1);
  const wasActive = useRef(false);

  useEffect(() => {
    if (active && !wasActive.current) {
      sc.value = withSequence(
        withSpring(0.92, { mass: 0.3, stiffness: 520, damping: 12 }),
        withSpring(1.06, { mass: 0.3, stiffness: 380, damping: 10 }),
        withSpring(1,    { mass: 0.4, stiffness: 260, damping: 16 })
      );
    }
    wasActive.current = active;
  }, [active]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));

  return (
    <Animated.View style={[styles.cursoCard, active && styles.cursoCardActive, animStyle]}>
      <Pressable
        onPress={onPress}
        style={styles.cursoPressable}
        android_ripple={{ color: 'rgba(124,90,255,0.25)' }}
      >
        {active && (
          <LinearGradient
            colors={['rgba(91,61,245,0.44)', 'rgba(155,77,255,0.28)']}
            style={[StyleSheet.absoluteFill, { borderRadius: 15 }]}
          />
        )}
        <Text style={[styles.cursoText, active && styles.cursoTextActive]}>{curso}</Text>
        {active && <Check size={13} color={LIME} strokeWidth={2.5} />}
      </Pressable>
    </Animated.View>
  );
}

export default function NameCursoScreen() {
  const { state, setName, setCurso, nextStep, prevStep } = useOnboarding();
  const [nameFocused, setNameFocused] = useState(false);

  const canContinue = state.data.name.trim() !== '' && state.data.curso !== '';

  const fade     = useSharedValue(0);
  const slide    = useSharedValue(24);
  const inputSc  = useSharedValue(1);
  const ctaShine = useSharedValue(0);

  useEffect(() => {
    fade.value  = withDelay(60, withTiming(1, { duration: 550 }));
    slide.value = withDelay(60, withSpring(0, { mass: 0.6, stiffness: 160, damping: 18 }));
  }, []);

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

  const handleFocus = () => {
    setNameFocused(true);
    inputSc.value = withSpring(1.012, { mass: 0.3, stiffness: 380, damping: 18 });
  };
  const handleBlur = () => {
    setNameFocused(false);
    inputSc.value = withSpring(1, { mass: 0.3, stiffness: 280, damping: 18 });
  };

  const bodyStyle     = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateY: slide.value }] }));
  const inputScStyle  = useAnimatedStyle(() => ({ transform: [{ scale: inputSc.value }] }));
  const ctaShineStyle = useAnimatedStyle(() => ({ opacity: ctaShine.value }));

  return (
    <ScreenContainer style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <LinearGradient colors={[BG, '#120B2F', '#1A1045']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.orb1} />

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
          <View style={{ alignItems: 'center', marginBottom: 10 }}>
            <Smile size={48} color={LIME} strokeWidth={1.5} />
          </View>
          <Text style={styles.title}>¿Cuál es{'\n'}<Text style={styles.neon}>tu nombre?</Text></Text>
          <Text style={styles.subtitle}>Personalizaremos tu experiencia de estudio</Text>

          <Animated.View style={[styles.inputWrap, nameFocused && styles.inputWrapFocused, inputScStyle]}>
            <View style={styles.inputIconWrap}>
              <User size={16} color="rgba(255,255,255,0.7)" strokeWidth={2} />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Tu nombre aquí..."
              placeholderTextColor="rgba(255,255,255,0.28)"
              value={state.data.name}
              onChangeText={setName}
              onFocus={handleFocus}
              onBlur={handleBlur}
              autoCapitalize="words"
              cursorColor={NEON}
              selectionColor={`${NEON}55`}
            />
          </Animated.View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <BookOpen size={12} color={LIME} strokeWidth={2.5} />
            <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>SELECCIONA TU CURSO</Text>
          </View>
          <View style={styles.cursoGrid}>
            {CURSOS.map((curso) => (
              <CursoCard
                key={curso}
                curso={curso}
                active={state.data.curso === curso}
                onPress={() => setCurso(curso)}
              />
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      {/* CTA */}
      <View style={styles.bottom}>
        <Pressable
          onPress={nextStep}
          disabled={!canContinue}
          style={({ pressed }) => [styles.ctaWrap, !canContinue && styles.ctaDisabled, pressed && canContinue && styles.ctaPressed]}
        >
          <LinearGradient
            colors={canContinue ? [NEON, '#B44EFF'] : ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.07)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.cta}
          >
            {canContinue && <Animated.View style={[styles.ctaShine, ctaShineStyle]} />}
            <Text style={[styles.ctaText, !canContinue && styles.ctaTextOff]}>Siguiente</Text>
            <ArrowRight size={17} color={canContinue ? '#FFF' : 'rgba(255,255,255,0.35)'} strokeWidth={2.5} />
          </LinearGradient>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  orb1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(91,61,245,0.09)', top: -50, right: -50 },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.8)', lineHeight: 26 },
  progressWrap: { flex: 1, flexDirection: 'row', gap: 6 },
  progressSeg: { flex: 1, borderRadius: 3, height: 6 },
  progressSegOff: { backgroundColor: 'rgba(255,255,255,0.12)' },
  stepLbl: { backgroundColor: GLASS, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: GLASS_BORDER },
  stepLblText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },

  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  body: { paddingHorizontal: 24, paddingTop: 4 },

  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 10 },
  title: { fontSize: 32, fontWeight: '900', color: '#FFF', textAlign: 'center', lineHeight: 40, marginBottom: 8 },
  neon: { color: LIME },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.50)', textAlign: 'center', lineHeight: 19, marginBottom: 28 },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: GLASS, borderWidth: 1.5, borderColor: GLASS_BORDER,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    gap: 12, marginBottom: 24,
  },
  inputWrapFocused: { borderColor: NEON, backgroundColor: 'rgba(124,90,255,0.09)' },
  inputIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(124,90,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  inputIconEmoji: { fontSize: 16 },
  input: { flex: 1, fontSize: 16, fontWeight: '600', color: '#FFF' },

  sectionLabel: { fontSize: 10, fontWeight: '800', color: LIME, letterSpacing: 1.2, marginBottom: 10 },
  cursoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  cursoCard: {
    width: '48%',
    backgroundColor: GLASS, borderWidth: 1.5, borderColor: GLASS_BORDER,
    borderRadius: 15, overflow: 'hidden',
  },
  cursoCardActive: {
    borderColor: NEON,
    shadowColor: NEON, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  cursoPressable: {
    paddingVertical: 16, paddingHorizontal: 12,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
  },
  cursoText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  cursoTextActive: { color: '#FFF', fontWeight: '800' },
  cursoCheck: { fontSize: 13, color: LIME },

  bottom: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 8 },
  ctaWrap: { borderRadius: 18, overflow: 'hidden', shadowColor: NEON, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 10 },
  ctaDisabled: { shadowOpacity: 0, elevation: 0 },
  ctaPressed: { opacity: 0.88 },
  cta: { paddingVertical: 17, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  ctaShine: { position: 'absolute', top: 0, left: 0, right: 0, height: 22, backgroundColor: 'rgba(255,255,255,0.20)' },
  ctaText: { fontSize: 17, fontWeight: '900', color: '#FFF' },
  ctaArrow: { fontSize: 17, fontWeight: '900', color: '#FFF' },
  ctaTextOff: { color: 'rgba(255,255,255,0.35)' },
});
