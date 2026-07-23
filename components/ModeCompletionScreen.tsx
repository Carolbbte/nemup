import UnifiedProgressBar from '@/components/UnifiedProgressBar';
import { UNIFIED_PROGRESS_BAR } from '@/config/features';
import type { DailyMode } from '@/contexts/DailySessionContext';
import { useDailySession } from '@/contexts/DailySessionContext';
import { palette, paletteExtras, semantic } from '@/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { Brain, ChevronLeft, Clock, Target, X } from 'lucide-react-native';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
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

const BRAND = palette.azul;

// Confetti is decorative, not a UI accent — a wider mix than the brand
// palette reads more like a celebration than the app's usual blue/green.
const CONFETTI_COLORS = [palette.azul, palette.verdeXP, palette.ambar, '#8B5BD6', '#F5C518', palette.rojoError];

// Mirrors `mds`'s MISSION_PURPLE / MISSION_PURPLE_DARK in session.tsx's
// mode-select screen — no formal "morado" token exists in theme/colors.ts
// (see that file's own comment on the same pair), so the identical literal
// is reused here rather than inventing a new one, to keep the Misión
// gradient consistent across both screens.
const MISSION_PURPLE      = '#7B4DD8';
const MISSION_PURPLE_DARK = '#3D4D9E';
// Same accent pair session.tsx's mode-select cards use for Quiz/Tarjetas —
// reused here so the completion screen's tiles read as the same "language".
const QUIZ_COLOR = paletteExtras.azulQuiz;
const QUIZ_BG     = 'rgba(59,130,246,0.08)';
const TEAL_COLOR  = palette.tealTarjetas;
const TEAL_BG     = 'rgba(0,194,168,0.08)';

const ALL_MODES: DailyMode[] = ['mision', 'quiz', 'tarjetas'];

type Tile = { label: string; value: string; valueColor?: string };

type Props = {
  mode: DailyMode;
  iconNode: ReactNode;
  screenTitle: string;
  title: string;
  tiles: Tile[];
  // Non-celebratory branch only: when set, replaces iconNode with this mascot
  // image (used by Quiz). Omitted elsewhere → keeps the plain icon.
  mascotSource?: any;
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
  // Celebratory-only, all optional — omitted entirely when the caller
  // doesn't have the data yet, in which case the corresponding UI piece
  // just doesn't render (no placeholder, no "0%").
  praiseLine?: string;
  accuracy?: { correct: number; total: number };
  levelProgress?: { level: number; pctToNext: number };
};

export default function ModeCompletionScreen({
  mode,
  iconNode,
  mascotSource,
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
  praiseLine,
  accuracy,
  levelProgress,
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

  // Celebratory-only extras (mascot pop, XP count-up, staggered tiles) —
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
    // First tile: precisión when we have a real denominator, otherwise the
    // "enfocado" (time) tile — never a misleading "0%".
    const hasAccuracy   = !!accuracy && accuracy.total > 0;
    const accuracyPct   = hasAccuracy ? Math.round((accuracy!.correct / accuracy!.total) * 100) : null;
    const isPerfectRound = hasAccuracy && accuracy!.correct === accuracy!.total;

    const metricTiles: { key: string; Icon: ComponentType<{ size: number; color: string; strokeWidth: number }>; value: string; sub: string; bg: string; accent: string; emphasize?: boolean }[] = [];
    if (accuracyPct !== null) {
      metricTiles.push({
        key: 'precision',
        Icon: Target,
        value: `${accuracyPct}%`,
        sub: isPerfectRound ? '¡Sin errores!' : `precisión · ${accuracy!.correct}/${accuracy!.total}`,
        bg: TEAL_BG,
        accent: TEAL_COLOR,
        emphasize: isPerfectRound,
      });
    } else if (timeTile) {
      metricTiles.push({
        key: 'tiempo',
        Icon: Clock,
        value: timeTile.value,
        sub: 'enfocado',
        bg: semantic.modeMisionBg,
        accent: BRAND,
      });
    }
    if (conceptTile) {
      metricTiles.push({
        key: 'conceptos',
        Icon: Brain,
        value: conceptTile.value,
        sub: 'conceptos',
        bg: QUIZ_BG,
        accent: QUIZ_COLOR,
      });
    }

    return (
      <SafeAreaView style={s.page} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={palette.crema} />
        <View style={s.topBarCeleb}>
          <Pressable onPress={onBack} style={s.closeBtn} hitSlop={10}>
            <ChevronLeft size={18} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
          <Pressable onPress={onBack} style={s.closeBtn} hitSlop={10}>
            <X size={18} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
        </View>
        {UNIFIED_PROGRESS_BAR && (
          <>
            <UnifiedProgressBar progress={progress} currentMode={ALL_MODES.includes(mode as any) ? mode as any : null} />
            <Text style={s.progressLabel}>{`Tu progreso de hoy · ${completedCount}/3`}</Text>
          </>
        )}
        <Animated.View style={[{ flex: 1 }, entryStyle]}>
          <ScrollView contentContainerStyle={s.scroll}>
            <Animated.View style={[{ width: '100%', alignItems: 'center' }, mascotStyle]}>
              <Image
                source={require('@/assets/images/metaAlcanzada.png')}
                style={s.mascotImg}
                resizeMode="contain"
              />
            </Animated.View>
            <Text style={s.title}>{`¡${title}!`}</Text>

            <LinearGradient
              colors={[BRAND, MISSION_PURPLE]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.xpBox}
            >
              <Text style={s.xpBoxLabel}>XP GANADO</Text>
              <Text style={s.xpBoxValue}>{`+${xpDisplay}`}</Text>
              {!!levelProgress && (
                <View style={s.levelProgressWrap}>
                  <View style={s.levelProgressTrack}>
                    <View style={[s.levelProgressFill, { width: `${Math.max(0, Math.min(100, levelProgress.pctToNext))}%` }]} />
                  </View>
                  <Text style={s.levelProgressLabel}>{`${levelProgress.pctToNext}% al Nivel ${levelProgress.level + 1}`}</Text>
                </View>
              )}
            </LinearGradient>

            <View style={s.metricTileRow}>
              {metricTiles.map((t, i) => (
                <Animated.View key={t.key} style={[s.metricTile, { backgroundColor: t.bg, borderBottomColor: t.accent }, statStyles[i]]}>
                  <View style={[s.metricIconBox, { backgroundColor: t.accent }]}>
                    <t.Icon size={18} color={palette.blanco} strokeWidth={2.2} />
                  </View>
                  <Text style={[s.metricValue, { color: t.accent }]}>{t.value}</Text>
                  <Text style={[s.metricSub, t.emphasize && { color: t.accent, fontWeight: '800' }]}>{t.sub}</Text>
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
            {mascotSource ? (
              <Image source={mascotSource} style={s.completionMascot} resizeMode="contain" />
            ) : iconNode}
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
      {!!mascotSource && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <ConfettiCannon count={80} origin={{ x: -10, y: 0 }} colors={CONFETTI_COLORS} fadeOut autoStart />
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page:       { flex: 1, backgroundColor: palette.crema },
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, minHeight: 48 },
  iconBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.04)' },
  screenTitle:{ fontSize: 15, fontWeight: '700', color: semantic.textPrimary, textAlign: 'center' },
  scroll:     { alignItems: 'center', paddingHorizontal: 24, paddingTop: 14, paddingBottom: 24 },
  title:      { fontSize: 26, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', marginTop: 6, marginBottom: 16 },
  completionMascot: { width: '100%', height: 168, marginBottom: 6 },
  tileRow:    { flexDirection: 'row', gap: 8, marginBottom: 16, width: '100%' },
  tile:       { flex: 1, alignItems: 'center', backgroundColor: palette.blanco, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 8, borderWidth: 1, borderColor: palette.bordeClaro },
  tileVal:    { fontSize: 20, fontWeight: '900', color: semantic.textPrimary, marginBottom: 4 },
  tileLbl:    { fontSize: 11, fontWeight: '600', color: semantic.textTertiary, textAlign: 'center' },
  context:    { fontSize: 13, color: semantic.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 4 },
  bottom:     { paddingHorizontal: 20, paddingTop: 8 },
  cta:        { height: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND },
  ctaTxt:     { fontSize: 16, fontWeight: '800', color: palette.blanco, letterSpacing: 0.2 },

  // Celebratory-only (Misión) — clean single-X header, "today's progress"
  // anchor, mascot, praise balloon, gradient XP card, dashboard-style
  // metric tiles, and a "physical key" volume CTA distinct from the plain
  // `cta`.
  topBarCeleb: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, minHeight: 48 },
  closeBtn:    { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.blanco, borderWidth: 1, borderColor: palette.bordeClaro },
  progressLabel: { fontSize: 12, fontWeight: '700', color: semantic.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: 2 },

  mascotImg: { width: '100%', height: 172, marginBottom: 4 },

  praiseBalloon:     { backgroundColor: paletteExtras.moradoSuaveBg, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 16, marginTop: 16, marginBottom: 4, maxWidth: '92%', position: 'relative' },
  praiseBalloonTail: { position: 'absolute', top: -6, alignSelf: 'center', width: 12, height: 12, backgroundColor: paletteExtras.moradoSuaveBg, transform: [{ rotate: '45deg' }] },
  praiseBalloonText: { fontSize: 14, fontWeight: '700', color: MISSION_PURPLE_DARK, textAlign: 'center' },

  xpBox:        { borderRadius: 18, paddingVertical: 14, paddingHorizontal: 28, alignItems: 'center', marginBottom: 14, width: '100%', borderBottomWidth: 5, borderBottomColor: MISSION_PURPLE_DARK },
  xpBoxLabel:   { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 1, marginBottom: 2 },
  xpBoxValue:   { fontSize: 34, fontWeight: '900', color: palette.blanco, letterSpacing: -0.5 },
  levelProgressWrap:  { width: '100%', marginTop: 12, alignItems: 'center' },
  levelProgressTrack: { width: '100%', height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden', marginBottom: 6 },
  levelProgressFill:  { height: '100%', borderRadius: 3, backgroundColor: palette.blanco },
  levelProgressLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },

  metricTileRow: { flexDirection: 'row', gap: 10, width: '100%' },
  metricTile:    { flex: 1, alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: palette.bordeClaro, borderBottomWidth: 3, paddingVertical: 14, paddingHorizontal: 8 },
  metricIconBox: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  metricValue:   { fontSize: 20, fontWeight: '900', marginBottom: 2 },
  metricSub:     { fontSize: 11, fontWeight: '600', color: semantic.textTertiary, textAlign: 'center' },

  ctaVolume:    { height: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderBottomWidth: 4, borderBottomColor: 'rgba(0,0,0,0.18)' },
});
