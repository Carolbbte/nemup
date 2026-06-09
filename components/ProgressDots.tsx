import { palette } from '@/theme/colors';
import { StyleSheet, View } from 'react-native';

const ACTIVE_COLOR   = palette.morado;
const INACTIVE_COLOR = palette.moradoBg;
const TOTAL          = 7;

type Props = { current: number };

export default function ProgressDots({ current }: Props) {
  return (
    <View style={s.row}>
      {Array.from({ length: TOTAL }).map((_, i) => (
        <View
          key={i}
          style={[
            s.dot,
            i === current ? s.active : s.inactive,
          ]}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dot:      { height: 8, borderRadius: 4 },
  active:   { width: 24, backgroundColor: ACTIVE_COLOR },
  inactive: { width: 8,  backgroundColor: INACTIVE_COLOR },
});
