import { UNIFIED_PROGRESS_BAR } from '@/config/features';
import { useDailySession } from '@/contexts/DailySessionContext';
import type { DailyMode } from '@/contexts/DailySessionContext';
import { palette, semantic } from '@/theme/colors';
import { ChevronLeft, X } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import UnifiedProgressBar from '@/components/UnifiedProgressBar';
import ConfettiCannon from 'react-native-confetti-cannon';

const BRAND = palette.azul;

// Confetti is decorative, not a UI accent — a wider mix than the brand
// palette reads more like a celebration than the app's usual blue/green.
const CONFETTI_COLORS = [palette.azul, palette.verdeXP, palette.ambar, '#8B5BD6', '#F5C518', palette.rojoError];

const ALL_MODES: DailyMode[] = ['mision', 'quiz', 'tarjetas'];

type Tile = { label: string; value: string; valueColor?: string };

type Props = {
  mode: DailyMode;
  iconNode: ReactNode;
  screenTitle: string;
  title: string;
  tiles: [Tile, Tile, Tile];
  contextualLine: string;
  continueLabel: string;
  onContinue: () => void;
  onBack: () => void;
  sessionCompletedCount?: number;
  // Misión-only enhancements — omitted (falsy) by Quiz/Tarjetas, which stay
  // visually identical to before. `celebratory` gives the icon+title a
  // bouncier pop-in instead of the plain fade+rise; `streakCount` (when
  // celebratory and >= 2) shows a streak badge next to the title.
  celebratory?: boolean;
  streakCount?: number;
};

export default function ModeCompletionScreen({
  mode,
  iconNode,
  screenTitle,
  title,
  tiles,
  contextualLine,
  continueLabel,
  onContinue,
  onBack,
  sessionCompletedCount,
  celebratory,
  streakCount,
}: Props) {
  const insets = useSafeAreaInsets();
  const { dailySession } = useDailySession();

  const completedCount = sessionCompletedCount !== undefined
    ? sessionCompletedCount
    : ALL_MODES.filter(m => m === mode || dailySession.completedModes[m]).length;
  const progress = completedCount / 3;

  const entryY  = useSharedValue(36);
  const entryOp = useSharedValue(0);
  const entryStyle = useAnimatedStyle(() => ({
    opacity:   entryOp.value,
    transform: [{ translateY: entryY.value }],
  }));
  const heroScale = useSharedValue(celebratory ? 0.5 : 1);
  const heroStyle = useAnimatedStyle(() => ({ transform: [{ scale: heroScale.value }] }));

  // Celebratory-only extras (mascot pop, XP count-up, staggered trophies) —
  // the shared values below are inert (never animated) when !celebratory,
  // so this adds no behavior to Quiz/Tarjetas.
  const mascotScale = useSharedValue(0.5);
  const mascotStyle = useAnimatedStyle(() => ({ transform: [{ scale: mascotScale.value }] }));

  const xpTile = tiles.find(t => t.label === 'XP');
  const conceptTile = tiles.find(t => t.label === 'conceptos');
  const timeTile = tiles.find(t => t.label === 'enfocado');
  const xpTarget = xpTile ? parseInt(xpTile.value.replace(/[^0-9-]/g, ''), 10) || 0 : 0;
  const xpProgress = useSharedValue(0);
  const [xpDisplay, setXpDisplay] = useState(0);
  useAnimatedReaction(
    () => Math.round(xpProgress.value),
    (current, previous) => {
      if (current !== previous) runOnJS(setXpDisplay)(current);
    },
  );

  const stat0Op = useSharedValue(0); const stat0Y = useSharedValue(16);
  const stat1Op = useSharedValue(0); const stat1Y = useSharedValue(16);
  const stat2Op = useSharedValue(0); const stat2Y = useSharedValue(16);
  const statStyles = [
    useAnimatedStyle(() => ({ opacity: stat0Op.value, transform: [{ translateY: stat0Y.value }] })),
    useAnimatedStyle(() => ({ opacity: stat1Op.value, transform: [{ translateY: stat1Y.value }] })),
    useAnimatedStyle(() => ({ opacity: stat2Op.value, transform: [{ translateY: stat2Y.value }] })),
  ];

  useEffect(() => {
    entryY.value  = 36;
    entryOp.value = 0;
    entryY.value  = withSpring(0, { damping: 22, stiffness: 180 });
    entryOp.value = withTiming(1, { duration: 420 });
    if (celebratory) {
      heroScale.value = 0.5;
      heroScale.value = withSpring(1, { damping: 9, stiffness: 200 });

      mascotScale.value = withDelay(100, withSequence(
        withSpring(1.1, { damping: 6, stiffness: 200 }),
        withSpring(1, { damping: 10, stiffness: 220 }),
      ));

      xpProgress.value = withDelay(500, withTiming(xpTarget, { duration: 800 }));

      [[stat0Op, stat0Y], [stat1Op, stat1Y], [stat2Op, stat2Y]].forEach(([op, y], i) => {
        op.value = withDelay(900 + i * 80, withTiming(1, { duration: 300 }));
        y.value  = withDelay(900 + i * 80, withTiming(0, { duration: 300 }));
      });
    }
  }, []);

  if (celebratory) {
    const trophies: { key: string; emoji: string; value: string; label: string; bg: string; border: string }[] = [];
    if (!!streakCount && streakCount >= 1) {
      trophies.push({ key: 'racha', emoji: '🔥', value: String(streakCount), label: 'racha', bg: 'rgba(255,144,0,0.12)', border: 'rgba(255,144,0,0.3)' });
    }
    if (conceptTile) {
      trophies.push({ key: 'conceptos', emoji: '🧠', value: conceptTile.value, label: 'conceptos', bg: '#EEF3FF', border: '#C9D8F5' });
    }
    if (timeTile) {
      trophies.push({ key: 'tiempo', emoji: '⏱️', value: timeTile.value, label: 'enfocado', bg: palette.blanco, border: palette.bordeClaro });
    }

    return (
      <SafeAreaView style={s.page} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={palette.crema} />
        <View style={s.topBar}>
          <Pressable onPress={onBack} style={s.iconBtn} hitSlop={10}>
            <ChevronLeft size={18} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
          <Text style={s.screenTitle}>{screenTitle}</Text>
          <Pressable onPress={onBack} style={s.iconBtn} hitSlop={10}>
            <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
        </View>
        {UNIFIED_PROGRESS_BAR && (
          <UnifiedProgressBar progress={progress} currentMode={ALL_MODES.includes(mode as any) ? mode as any : null} />
        )}
        <Animated.View style={[{ flex: 1 }, entryStyle]}>
          <ScrollView contentContainerStyle={s.scroll}>
            <Animated.View style={mascotStyle}>
              <Image
                source={require('@/assets/images/metaAlcanzada.png')}
                style={s.mascotImg}
                resizeMode="contain"
              />
            </Animated.View>
            <Text style={s.title}>{`¡${title}!`}</Text>

            <View style={s.xpBox}>
              <Text style={s.xpBoxLabel}>XP GANADO</Text>
              <Text style={s.xpBoxValue}>{`+${xpDisplay}`}</Text>
            </View>

            <View style={s.tileRow}>
              {trophies.map((t, i) => (
                <Animated.View key={t.key} style={[s.trophy, { backgroundColor: t.bg, borderColor: t.border }, statStyles[i]]}>
                  <Text style={s.trophyEmoji}>{t.emoji}</Text>
                  <Text style={s.trophyVal}>{t.value}</Text>
                  <Text style={s.trophyLbl}>{t.label}</Text>
                </Animated.View>
              ))}
            </View>
          </ScrollView>
        </Animated.View>
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <ConfettiCannon count={80} origin={{ x: -10, y: 0 }} colors={CONFETTI_COLORS} fadeOut autoStart />
        </View>
        <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={onContinue} style={s.ctaVolume}>
            <Text style={s.ctaTxt}>{continueLabel}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.page} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.crema} />
      <View style={s.topBar}>
        <Pressable onPress={onBack} style={s.iconBtn} hitSlop={10}>
          <ChevronLeft size={18} color={semantic.textPrimary} strokeWidth={2.5} />
        </Pressable>
        <Text style={s.screenTitle}>{screenTitle}</Text>
        <Pressable onPress={onBack} style={s.iconBtn} hitSlop={10}>
          <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
        </Pressable>
      </View>
      {UNIFIED_PROGRESS_BAR && (
        <UnifiedProgressBar progress={progress} currentMode={ALL_MODES.includes(mode as any) ? mode as any : null} />
      )}
      <Animated.View style={[{ flex: 1 }, entryStyle]}>
        <ScrollView contentContainerStyle={s.scroll}>
          <Animated.View style={[{ alignItems: 'center' }, heroStyle]}>
            {iconNode}
            <Text style={s.title}>{title}</Text>
          </Animated.View>
          <View style={s.tileRow}>
            {tiles.map(({ label, value, valueColor }) => (
              <View key={label} style={s.tile}>
                <Text style={[s.tileVal, valueColor ? { color: valueColor } : null]}>{value}</Text>
                <Text style={s.tileLbl}>{label}</Text>
              </View>
            ))}
          </View>
          {!!contextualLine && <Text style={s.context}>{contextualLine}</Text>}
        </ScrollView>
      </Animated.View>
      <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable onPress={onContinue} style={s.cta}>
          <Text style={s.ctaTxt}>{continueLabel}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page:       { flex: 1, backgroundColor: palette.crema },
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, minHeight: 48 },
  iconBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.04)' },
  screenTitle:{ fontSize: 15, fontWeight: '700', color: semantic.textPrimary, textAlign: 'center' },
  scroll:     { alignItems: 'center', paddingHorizontal: 24, paddingTop: 36, paddingBottom: 32 },
  title:      { fontSize: 26, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', marginTop: 12, marginBottom: 28 },
  tileRow:    { flexDirection: 'row', gap: 8, marginBottom: 16, width: '100%' },
  tile:       { flex: 1, alignItems: 'center', backgroundColor: palette.blanco, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 8, borderWidth: 1, borderColor: palette.bordeClaro },
  tileVal:    { fontSize: 20, fontWeight: '900', color: semantic.textPrimary, marginBottom: 4 },
  tileLbl:    { fontSize: 11, fontWeight: '600', color: semantic.textTertiary, textAlign: 'center' },
  context:    { fontSize: 13, color: semantic.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 4 },
  bottom:     { paddingHorizontal: 20, paddingTop: 8 },
  cta:        { height: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND },
  ctaTxt:     { fontSize: 16, fontWeight: '800', color: palette.blanco, letterSpacing: 0.2 },

  // Celebratory-only (Misión) — mascot, XP count-up box, colored trophy
  // chips, and a "physical key" volume CTA distinct from the plain `cta`.
  mascotImg:    { width: '100%', height: 130, marginBottom: 8 },
  xpBox:        { backgroundColor: semantic.success, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 28, alignItems: 'center', marginBottom: 20 },
  xpBoxLabel:   { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 1, marginBottom: 2 },
  xpBoxValue:   { fontSize: 34, fontWeight: '900', color: palette.blanco, letterSpacing: -0.5 },
  trophy:       { flex: 1, alignItems: 'center', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 6, borderWidth: 1.5 },
  trophyEmoji:  { fontSize: 20, marginBottom: 4 },
  trophyVal:    { fontSize: 18, fontWeight: '900', color: semantic.textPrimary, marginBottom: 2 },
  trophyLbl:    { fontSize: 11, fontWeight: '600', color: semantic.textTertiary, textAlign: 'center' },
  ctaVolume:    { height: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderBottomWidth: 4, borderBottomColor: 'rgba(0,0,0,0.18)' },
});
