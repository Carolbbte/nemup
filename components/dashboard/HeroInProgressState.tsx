import type { DailyMode } from '@/contexts/DailySessionContext';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ModeRow, { type ModeStatus } from './ModeRow';

const BRAND = '#5B3DF5';
const INK   = '#1A1A22';
const MUTED = '#6B6779';
const LABEL = '#9A95A6';
const TRACK = '#F0EDE5';

const MODES: DailyMode[]                     = ['mision', 'quiz', 'tarjetas'];
const MODE_LABELS: Record<DailyMode, string> = { mision: 'Misión', quiz: 'Quiz', tarjetas: 'Tarjetas', desafio: 'Desafío' };

type Props = {
  completedModes: Record<DailyMode, boolean>;
  nextMode: DailyMode;
  completedCount: number;
  onContinue: () => void;
};

export default function HeroInProgressState({ completedModes, nextMode, completedCount, onContinue }: Props) {
  const getStatus = (mode: DailyMode): ModeStatus => {
    if (completedModes[mode]) return 'done';
    if (mode === nextMode)    return 'next';
    return 'pending';
  };

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <Text style={s.stateLabel}>SESIÓN EN CURSO</Text>
        <Text style={s.counter}>{completedCount} de 3</Text>
      </View>

      <Text style={s.title}>Continúa tu día</Text>

      {/* 3-zone progress bar — first [completedCount] filled */}
      <View style={s.bar}>
        {[0, 1, 2].map(i => (
          <View key={i} style={[s.zone, { backgroundColor: i < completedCount ? BRAND : TRACK }]} />
        ))}
      </View>

      <View style={s.modes}>
        {MODES.map(m => <ModeRow key={m} mode={m} status={getStatus(m)} />)}
      </View>

      <Pressable onPress={onContinue} style={s.cta}>
        <Text style={s.ctaTxt}>Continuar con {MODE_LABELS[nextMode]}</Text>
      </Pressable>
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
  cta:        { backgroundColor: BRAND, paddingVertical: 13, borderRadius: 28, alignItems: 'center' },
  ctaTxt:     { fontSize: 15, fontWeight: '700', color: 'white' },
});
