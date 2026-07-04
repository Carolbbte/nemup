import { StyleSheet, Text, View } from 'react-native';
import { palette, paletteExtras } from '@/theme/colors';

const BRAND = palette.azul;
const INK   = palette.charcoal;
const MUTED = palette.grisMedio;
const LABEL = palette.grisClaro;
const TRACK = paletteExtras.trackClaro;

type Props = {
  currentNEM: number;  // 0–1000 (NEM × 100)
  targetNEM: number;   // 0–1000
};

export default function NEMGoalCard({ currentNEM, targetNEM }: Props) {
  const current = (currentNEM / 100).toFixed(1);
  const target  = (targetNEM  / 100).toFixed(1);
  const pct     = targetNEM > 0 ? Math.min(currentNEM / targetNEM, 1) : 0;

  return (
    <View style={s.card}>
      <View style={s.topRow}>
        <Text style={s.label}>TU META</Text>
        <Text style={s.range}>{current} → {target}</Text>
      </View>
      <Text style={s.title}>Camino a NEM {target}</Text>
      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card:   { backgroundColor: palette.blanco, borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: palette.bordeClaro, marginBottom: 14 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  label:  { fontSize: 11, fontWeight: '500', color: LABEL, letterSpacing: 1.2, textTransform: 'uppercase' },
  range:  { fontSize: 11, color: MUTED },
  title:  { fontSize: 14, fontWeight: '500', color: INK, marginBottom: 10 },
  track:  { height: 4, borderRadius: 2, backgroundColor: TRACK, overflow: 'hidden' },
  fill:   { height: '100%', borderRadius: 2, backgroundColor: BRAND },
});
