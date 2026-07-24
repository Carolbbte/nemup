import { palette } from '@/theme/colors';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const FILL          = palette.verdeXP;
const TRACK         = palette.trackNeutral;
const TRACK_ACTIVE  = palette.bordeMedio;

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
      duration: 300,
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
            <Animated.View style={[s.fill, fillStyles[i]]}>
              <View style={s.fillGloss} />
            </Animated.View>
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
  wrap:  { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 2 },
  // Chunky/Duolingo-style: thicker pill track, green fill with an inner
  // "gel" highlight stripe instead of a flat tint.
  bar:   { flexDirection: 'row', gap: 3, height: 14 },
  zone:  { flex: 1, borderRadius: 999, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 999, backgroundColor: FILL, overflow: 'hidden' },
  fillGloss: {
    position: 'absolute', top: 2, left: 4, right: 4, height: 3,
    borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.35)',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.grisClaro,
    marginTop: 2,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
