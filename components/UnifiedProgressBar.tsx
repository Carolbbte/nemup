import { palette } from '@/theme/colors';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const BRAND        = palette.azul;
const TRACK        = palette.azulClaro;
const TRACK_ACTIVE = palette.bordeClaro;

type Mode = 'mision' | 'quiz' | 'tarjetas';

type Props = {
  /** 0-1 global progress across all 3 modes. */
  progress: number;
  /** Which of the 3 modes is currently active (affects tint on its zone). */
  currentMode?: Mode | null;
  /** Small contextual label shown below the bar (e.g. "Misión · 5/10"). */
  modeLabel?: string;
  /** Whether to show the contextual label. Default true. */
  showCurrentMode?: boolean;
};

const MODES: Mode[] = ['mision', 'quiz', 'tarjetas'];

export default function UnifiedProgressBar({
  progress,
  currentMode = null,
  modeLabel,
  showCurrentMode = true,
}: Props) {
  const sv = useSharedValue(progress);

  useEffect(() => {
    sv.value = withTiming(progress, {
      duration: 350,
      easing: Easing.out(Easing.quad),
    });
  }, [progress]);

  const zone1Style = useAnimatedStyle(() => ({
    width: `${Math.min(Math.max(sv.value * 3, 0), 1) * 100}%` as any,
  }));
  const zone2Style = useAnimatedStyle(() => ({
    width: `${Math.min(Math.max(sv.value * 3 - 1, 0), 1) * 100}%` as any,
  }));
  const zone3Style = useAnimatedStyle(() => ({
    width: `${Math.min(Math.max(sv.value * 3 - 2, 0), 1) * 100}%` as any,
  }));
  const fillStyles = [zone1Style, zone2Style, zone3Style];

  return (
    <View style={s.wrap}>
      <View style={s.bar}>
        {MODES.map((key, i) => (
          <View
            key={key}
            style={[
              s.zone,
              { backgroundColor: currentMode === key ? TRACK_ACTIVE : TRACK },
            ]}
          >
            <Animated.View style={[s.fill, fillStyles[i]]} />
          </View>
        ))}
      </View>
      {showCurrentMode && !!modeLabel && (
        <Text style={s.label}>{modeLabel}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 4 },
  bar:   { flexDirection: 'row', gap: 3, height: 7 },
  zone:  { flex: 1, borderRadius: 4, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 4, backgroundColor: BRAND },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.grisClaro,
    marginTop: 4,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
