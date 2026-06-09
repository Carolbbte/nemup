import type { DailyMode } from '@/contexts/DailySessionContext';
import { Brain, Check, Layers, Target } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

const BRAND  = '#5B3DF5';
const INK    = '#1A1A22';
const MUTED  = '#6B6779';
const LABEL  = '#9A95A6';
const GREEN  = '#1D9E75';

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const MODE_CONFIG: Record<DailyMode, {
  label: string;
  desc: string;
  iconBg: string;
  iconColor: string;
  Icon: IconComponent;
}> = {
  mision:   { label: 'Misión',   desc: 'Aprende los conceptos clave',    iconBg: '#ECE9FF', iconColor: BRAND,     Icon: Target },
  quiz:     { label: 'Quiz',     desc: 'Responde preguntas de práctica', iconBg: '#FFEBF2', iconColor: '#D4537E', Icon: Brain  },
  tarjetas: { label: 'Tarjetas', desc: 'Repasa con flashcards',          iconBg: '#DCF5F1', iconColor: '#0F6E56', Icon: Layers },
};

export type ModeStatus = 'pending' | 'next' | 'done';

type Props = {
  mode: DailyMode;
  status: ModeStatus;
};

export default function ModeRow({ mode, status }: Props) {
  const cfg  = MODE_CONFIG[mode];
  const Icon = cfg.Icon;
  const done = status === 'done';
  const next = status === 'next';

  return (
    <View style={s.row}>
      <View style={[s.iconBox, { backgroundColor: done ? '#F5F4F0' : cfg.iconBg }]}>
        <Icon size={18} color={done ? LABEL : cfg.iconColor} strokeWidth={1.8} />
      </View>
      <View style={s.text}>
        <Text style={[s.label, done && s.labelDone]}>{cfg.label}</Text>
        <Text style={[s.desc, done && s.descDone]} numberOfLines={1}>{cfg.desc}</Text>
      </View>
      {done ? (
        <View style={s.circleDone}>
          <Check size={11} color="white" strokeWidth={3} />
        </View>
      ) : (
        <View style={[s.circlePending, next && s.circleNext]} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row:           { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  iconBox:       { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  text:          { flex: 1 },
  label:         { fontSize: 14, fontWeight: '600', color: INK, marginBottom: 1 },
  labelDone:     { color: LABEL, textDecorationLine: 'line-through' as const },
  desc:          { fontSize: 11, color: MUTED },
  descDone:      { color: LABEL },
  circlePending: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#D6D2C8', flexShrink: 0 },
  circleNext:    { borderWidth: 2, borderColor: BRAND },
  circleDone:    { width: 20, height: 20, borderRadius: 10, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
});
