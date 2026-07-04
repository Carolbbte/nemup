import type { DailyMode } from '@/contexts/DailySessionContext';
import { Brain, Check, Layers, Target } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { palette, paletteExtras } from '@/theme/colors';

const BRAND  = palette.azul;
const INK    = palette.charcoal;
const MUTED  = palette.grisMedio;
const LABEL  = palette.grisClaro;
const GREEN  = palette.verde;

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const MODE_CONFIG: Record<DailyMode, {
  label: string;
  desc: string;
  iconBg: string;
  iconColor: string;
  Icon: IconComponent;
}> = {
  mision:   { label: 'Misión',   desc: 'Aprende los conceptos clave',    iconBg: palette.azulClaro,      iconColor: BRAND,                    Icon: Target },
  quiz:     { label: 'Quiz',     desc: 'Responde preguntas de práctica', iconBg: palette.rosaQuizBg,    iconColor: palette.rosaQuizIcon,     Icon: Brain  },
  tarjetas: { label: 'Tarjetas', desc: 'Repasa con flashcards',          iconBg: palette.tealTarjetasBg, iconColor: palette.tealTarjetasIcon, Icon: Layers },
  desafio:  { label: 'Desafío',  desc: 'Pon a prueba lo aprendido',      iconBg: palette.azulClaro,      iconColor: BRAND,                    Icon: Target },
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
      <View style={[s.iconBox, { backgroundColor: done ? paletteExtras.grisFondoDone : cfg.iconBg }]}>
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
  label:         { fontFamily: 'Nunito', fontSize: 14, fontWeight: '600', color: INK, marginBottom: 1 },
  labelDone:     { color: LABEL, textDecorationLine: 'line-through' as const },
  desc:          { fontFamily: 'Nunito', fontSize: 11, color: MUTED },
  descDone:      { color: LABEL },
  circlePending: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: palette.bordeMedio, flexShrink: 0 },
  circleNext:    { borderWidth: 2, borderColor: BRAND },
  circleDone:    { width: 20, height: 20, borderRadius: 10, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
});
