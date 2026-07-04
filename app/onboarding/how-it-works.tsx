import ProgressDots from '@/components/ProgressDots';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { palette, semantic } from '@/theme/colors';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ArrowRight, Check, ChevronLeft, FileText } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Tokens ────────────────────────────────────────────────────
const BG    = palette.crema;
const PRIM  = palette.azul;
const DARK  = semantic.textPrimary;
const BODY  = semantic.textSecondary;
const WHITE = palette.blanco;

// Each block starts 280 ms after the previous one.
// 10 blocks × 280 ms + 350 ms last duration ≈ 3.15 s total.
const STAGGER  = 280;
const STEP_DUR = 350;

// ── Step 1: Two overlapping document cards ────────────────────
function DocIcon() {
  return (
    <View style={doc.wrap}>
      <View style={doc.back} />
      <View style={doc.front}>
        <FileText size={18} color={PRIM} strokeWidth={1.8} />
      </View>
    </View>
  );
}
const doc = StyleSheet.create({
  wrap:  { width: 64, height: 58 },
  back: {
    position: 'absolute',
    top: 0, left: 0,
    width: 42, height: 50,
    backgroundColor: palette.azulClaro,
    borderRadius: 10,
    transform: [{ rotate: '-6deg' }],
  },
  front: {
    position: 'absolute',
    top: 4, left: 14,
    width: 42, height: 50,
    backgroundColor: WHITE,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '3deg' }],
  },
});

// ── Step 2: IA chip with circuit dots ─────────────────────────
const IA_DOTS = [
  { top: 3,  left: 3  }, { top: 3,  right: 3 },
  { top: 22, left: -2 }, { top: 22, right: -2 },
  { bottom: 3, left: 3  }, { bottom: 3, right: 3 },
  { top: -2, left: 26 }, { bottom: -2, left: 26 },
] as const;

function IAIcon() {
  return (
    <View style={ia.wrap}>
      {IA_DOTS.map((pos, i) => (
        <View key={i} style={[ia.dot, pos as object]} />
      ))}
      <View style={ia.badge}>
        <Text style={ia.label}>IA</Text>
      </View>
    </View>
  );
}
const ia = StyleSheet.create({
  wrap:  { width: 64, height: 56, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: PRIM, opacity: 0.6,
  },
  badge: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: PRIM, alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 16, fontWeight: '800', color: WHITE, letterSpacing: 1.5 },
});

// ── Step 3: Checklist card ────────────────────────────────────
function MissionIcon() {
  return (
    <View style={mi.card}>
      {([0, 1, 2] as const).map(i => (
        <View key={i} style={mi.row}>
          <View style={mi.cb}>
            <Check size={8} color={WHITE} strokeWidth={3.5} />
          </View>
          <View style={mi.line} />
        </View>
      ))}
    </View>
  );
}
const mi = StyleSheet.create({
  card: {
    width: 52, height: 50,
    backgroundColor: WHITE, borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 9, gap: 7,
  },
  row:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cb:   {
    width: 13, height: 13, borderRadius: 3,
    backgroundColor: PRIM, alignItems: 'center', justifyContent: 'center',
  },
  line: { flex: 1, height: 3, borderRadius: 2, backgroundColor: palette.azulClaro },
});

// ── Step 4: XP badge ──────────────────────────────────────────
// animStyle is computed in the parent — no SharedValue passed as prop.
function XPBadge({ animStyle }: { animStyle: object }) {
  return (
    <Animated.View style={[xp.badge, animStyle]}>
      <Text style={xp.text}>XP</Text>
    </Animated.View>
  );
}
const xp = StyleSheet.create({
  badge: {
    width: 56, height: 62, borderRadius: 16,
    backgroundColor: PRIM, alignItems: 'center', justifyContent: 'center',
  },
  text: { fontSize: 20, fontWeight: '900', color: WHITE, letterSpacing: 2 },
});

// ── Step 5: Car icon ──────────────────────────────────────────
// animStyle is computed in the parent — no SharedValue passed as prop.
function CarIcon({ animStyle }: { animStyle: object }) {
  return (
    <Animated.View style={[car.bubble, animStyle]}>
      <MaterialCommunityIcons name="car-side" size={26} color={PRIM} />
    </Animated.View>
  );
}
const car = StyleSheet.create({
  bubble: {
    width: 58, height: 50, borderRadius: 13,
    backgroundColor: palette.azulClaro, alignItems: 'center', justifyContent: 'center',
  },
});

// ── Dashed connector arrow ────────────────────────────────────
// animStyle is computed in the parent — no SharedValue passed as prop.
// marginLeft = 64/2 − 24/2 = 20  →  centers under the 64 px icon column.
function DashedArrow({ animStyle }: { animStyle: object }) {
  return (
    <Animated.View style={[ar.wrap, animStyle]}>
      {([0, 1, 2] as const).map(i => <View key={i} style={ar.dash} />)}
      <View style={ar.head} />
    </Animated.View>
  );
}
const ar = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    marginLeft: 20,
    width: 24, alignItems: 'center',
    gap: 3, paddingVertical: 1,
  },
  dash: { width: 2, height: 4, borderRadius: 1, backgroundColor: PRIM, opacity: 0.55 },
  head: {
    width: 0, height: 0,
    borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 7,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: PRIM, opacity: 0.7,
  },
});

// ── Step row ──────────────────────────────────────────────────
type StepRowProps = {
  icon: React.ReactNode;
  label: string;
  description: string;
  animStyle: object;
};
function StepRow({ icon, label, description, animStyle }: StepRowProps) {
  return (
    <Animated.View style={[sr.row, animStyle]}>
      <View style={sr.iconCol}>{icon}</View>
      <View style={sr.textCol}>
        <Text style={sr.label}>{label}</Text>
        <Text style={sr.desc}>{description}</Text>
      </View>
    </Animated.View>
  );
}
const sr = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconCol: { width: 64, alignItems: 'center', justifyContent: 'center' },
  textCol: { flex: 1 },
  label:   { fontSize: 15, fontWeight: '700', color: DARK, marginBottom: 2 },
  desc:    { fontSize: 12, color: BODY, lineHeight: 17 },
});

// ── Screen ────────────────────────────────────────────────────
export default function HowItWorksScreen() {
  const { nextStep, prevStep } = useOnboarding();
  const insets = useSafeAreaInsets();

  // Shared values — entrance
  const titleOp = useSharedValue(0);

  const s1Op = useSharedValue(0); const s1Y = useSharedValue(16);
  const a1Op = useSharedValue(0);
  const s2Op = useSharedValue(0); const s2Y = useSharedValue(16);
  const a2Op = useSharedValue(0);
  const s3Op = useSharedValue(0); const s3Y = useSharedValue(16);
  const a3Op = useSharedValue(0);
  const s4Op = useSharedValue(0); const s4Y = useSharedValue(16);
  const a4Op = useSharedValue(0);
  const s5Op = useSharedValue(0); const s5Y = useSharedValue(16);

  // Shared values — micro-animations
  const xpGlow   = useSharedValue(0);
  const carSlide = useSharedValue(0);

  useEffect(() => {
    const ease  = { duration: STEP_DUR, easing: Easing.out(Easing.cubic) };
    const aEase = { duration: 200 };

    // Staggered cascade — each block starts STAGGER ms after the previous
    titleOp.value = withDelay(0,             withTiming(1, { duration: 300 }));

    s1Op.value    = withDelay(STAGGER * 1,   withTiming(1, ease));
    s1Y.value     = withDelay(STAGGER * 1,   withTiming(0, ease));
    a1Op.value    = withDelay(STAGGER * 2,   withTiming(1, aEase));

    s2Op.value    = withDelay(STAGGER * 3,   withTiming(1, ease));
    s2Y.value     = withDelay(STAGGER * 3,   withTiming(0, ease));
    a2Op.value    = withDelay(STAGGER * 4,   withTiming(1, aEase));

    s3Op.value    = withDelay(STAGGER * 5,   withTiming(1, ease));
    s3Y.value     = withDelay(STAGGER * 5,   withTiming(0, ease));
    a3Op.value    = withDelay(STAGGER * 6,   withTiming(1, aEase));

    s4Op.value    = withDelay(STAGGER * 7,   withTiming(1, ease));
    s4Y.value     = withDelay(STAGGER * 7,   withTiming(0, ease));
    a4Op.value    = withDelay(STAGGER * 8,   withTiming(1, aEase));

    s5Op.value    = withDelay(STAGGER * 9,   withTiming(1, ease));
    s5Y.value     = withDelay(STAGGER * 9,   withTiming(0, ease));

    // Micro-animations start after the last step finishes
    const micro = STAGGER * 9 + STEP_DUR + 160;

    // XP glow — withSequence avoids `reverse: true` which can crash in RN Reanimated v4
    xpGlow.value = withDelay(
      micro,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 800 }),
          withTiming(0, { duration: 800 }),
        ),
        -1,
        false,
      ),
    );

    // Car — slides forward 20 px once then returns
    carSlide.value = withDelay(
      micro + 100,
      withSequence(
        withTiming(20, { duration: 380, easing: Easing.out(Easing.cubic) }),
        withTiming(0,  { duration: 320, easing: Easing.inOut(Easing.cubic) }),
      ),
    );

    return () => {
      cancelAnimation(titleOp);
      cancelAnimation(s1Op); cancelAnimation(s1Y);
      cancelAnimation(a1Op);
      cancelAnimation(s2Op); cancelAnimation(s2Y);
      cancelAnimation(a2Op);
      cancelAnimation(s3Op); cancelAnimation(s3Y);
      cancelAnimation(a3Op);
      cancelAnimation(s4Op); cancelAnimation(s4Y);
      cancelAnimation(a4Op);
      cancelAnimation(s5Op); cancelAnimation(s5Y);
      cancelAnimation(xpGlow);
      cancelAnimation(carSlide);
    };
  }, []);

  // ── ALL useAnimatedStyle calls live here in the parent.
  // No SharedValue is ever passed as a prop to a child — this is
  // required in Reanimated v4 to avoid worklet capture crashes.

  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOp.value }));

  const step1Style = useAnimatedStyle(() => ({
    opacity: s1Op.value, transform: [{ translateY: s1Y.value }],
  }));
  const step2Style = useAnimatedStyle(() => ({
    opacity: s2Op.value, transform: [{ translateY: s2Y.value }],
  }));
  const step3Style = useAnimatedStyle(() => ({
    opacity: s3Op.value, transform: [{ translateY: s3Y.value }],
  }));
  const step4Style = useAnimatedStyle(() => ({
    opacity: s4Op.value, transform: [{ translateY: s4Y.value }],
  }));
  const step5Style = useAnimatedStyle(() => ({
    opacity: s5Op.value, transform: [{ translateY: s5Y.value }],
  }));

  const arrow1Style = useAnimatedStyle(() => ({ opacity: a1Op.value }));
  const arrow2Style = useAnimatedStyle(() => ({ opacity: a2Op.value }));
  const arrow3Style = useAnimatedStyle(() => ({ opacity: a3Op.value }));
  const arrow4Style = useAnimatedStyle(() => ({ opacity: a4Op.value }));

  const xpIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + xpGlow.value * 0.04 }],
  }));
  const carIconStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: carSlide.value }],
  }));

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={s.topBar}>
        <Pressable onPress={prevStep} style={s.backBtn}>
          <ChevronLeft size={22} color={DARK} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={s.content}>
        <Animated.View style={titleStyle}>
          <Text style={s.title}>Convierte tus apuntes{'\n'}en progreso.</Text>
        </Animated.View>

        <View style={s.steps}>
          <StepRow
            icon={<DocIcon />}
            label="Subes tu material"
            description="Apuntes, guías, pruebas o PDFs."
            animStyle={step1Style}
          />
          <DashedArrow animStyle={arrow1Style} />
          <StepRow
            icon={<IAIcon />}
            label="Nuestra IA analiza"
            description="Entiende y organiza el contenido."
            animStyle={step2Style}
          />
          <DashedArrow animStyle={arrow2Style} />
          <StepRow
            icon={<MissionIcon />}
            label="Se genera una misión"
            description="Contenido adaptado a ti."
            animStyle={step3Style}
          />
          <DashedArrow animStyle={arrow3Style} />
          <StepRow
            icon={<XPBadge animStyle={xpIconStyle} />}
            label="Ganas XP"
            description="Cada misión te hace avanzar."
            animStyle={step4Style}
          />
          <DashedArrow animStyle={arrow4Style} />
          <StepRow
            icon={<CarIcon animStyle={carIconStyle} />}
            label="Tu modelo mejora"
            description="Más progreso, mejores recompensas."
            animStyle={step5Style}
          />
        </View>
      </View>

      <View style={s.bottomBar}>
        <ProgressDots current={2} />
        <Pressable onPress={nextStep} style={s.arrowBtn}>
          <ArrowRight size={22} color={WHITE} strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  topBar: { paddingHorizontal: 16, paddingTop: 4 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: WHITE, borderWidth: 1, borderColor: palette.bordeClaro,
    alignItems: 'center', justifyContent: 'center',
  },

  content: { flex: 1, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 4 },

  title: {
    fontSize: 22, fontWeight: '700', color: DARK,
    textAlign: 'center', lineHeight: 30, marginBottom: 8,
  },

  // flex:1 + space-evenly distributes available height equally around
  // all 9 children (5 steps + 4 arrows), adapting to any screen size.
  steps: { flex: 1, justifyContent: 'space-evenly' },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12,
    backgroundColor: BG,
  },
  arrowBtn: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: PRIM, alignItems: 'center', justifyContent: 'center',
  },
});
