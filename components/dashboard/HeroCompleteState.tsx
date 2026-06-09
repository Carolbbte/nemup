import type { DailyMode } from '@/contexts/DailySessionContext';
import { ArrowRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ModeRow from './ModeRow';

const BRAND = '#5B3DF5';
const INK   = '#1A1A22';
const MUTED = '#6B6779';
const LABEL = '#9A95A6';

const MODES: DailyMode[] = ['mision', 'quiz', 'tarjetas'];

type Props = {
  streak: number;
  streakAdvancedToday: boolean;
  onViewSummary: () => void;
};

export default function HeroCompleteState({ streak, streakAdvancedToday, onViewSummary }: Props) {
  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <Text style={s.stateLabel}>DÍA COMPLETO</Text>
        <Text style={s.counter}>3 de 3</Text>
      </View>

      <Text style={s.title}>¡Sesión del día lista!</Text>

      {/* Full progress bar */}
      <View style={s.bar}>
        {[0, 1, 2].map(i => <View key={i} style={[s.zone, { backgroundColor: BRAND }]} />)}
      </View>

      <View style={s.modes}>
        {MODES.map(m => <ModeRow key={m} mode={m} status="done" />)}
      </View>

      <Pressable onPress={onViewSummary} style={s.cta}>
        <Text style={s.ctaTxt}>Ver resumen del día</Text>
        <ArrowRight size={16} color="white" strokeWidth={2.5} />
      </Pressable>

      {streakAdvancedToday && streak > 0 && (
        <Text style={s.streakLine}>Tu racha avanzó a {streak} días</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:       { paddingTop: 4 },
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  stateLabel: { fontSize: 10, fontWeight: '600', color: LABEL, letterSpacing: 1.4, textTransform: 'uppercase' },
  counter:    { fontSize: 11, fontWeight: '500', color: MUTED },
  title:      { fontSize: 17, fontWeight: '700', color: INK, marginBottom: 14 },
  bar:        { flexDirection: 'row', gap: 4, height: 6, marginBottom: 16 },
  zone:       { flex: 1, borderRadius: 3 },
  modes:      { borderTopWidth: 0.5, borderTopColor: '#ECEAE3', paddingTop: 4, marginBottom: 18 },
  cta:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BRAND, paddingVertical: 13, borderRadius: 28 },
  ctaTxt:     { fontSize: 15, fontWeight: '700', color: 'white' },
  streakLine: { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 12 },
});
