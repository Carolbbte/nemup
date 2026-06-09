import { UNIFIED_PROGRESS_BAR } from '@/config/features';
import { useDailySession } from '@/contexts/DailySessionContext';
import type { DailyMode } from '@/contexts/DailySessionContext';
import { palette, semantic } from '@/theme/colors';
import { ChevronLeft, X } from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import UnifiedProgressBar from '@/components/UnifiedProgressBar';

const BRAND = palette.morado;

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

  useEffect(() => {
    entryY.value  = 36;
    entryOp.value = 0;
    entryY.value  = withSpring(0, { damping: 22, stiffness: 180 });
    entryOp.value = withTiming(1, { duration: 420 });
  }, []);

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
        <UnifiedProgressBar progress={progress} currentMode={mode} />
      )}
      <Animated.View style={[{ flex: 1 }, entryStyle]}>
        <ScrollView contentContainerStyle={s.scroll}>
          {iconNode}
          <Text style={s.title}>{title}</Text>
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
});
