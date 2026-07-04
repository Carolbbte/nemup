import { ChevronRight, Medal } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, paletteExtras } from '@/theme/colors';

type Props = {
  onPress: () => void;
};

export default function ProgressStartCard({ onPress }: Props) {
  return (
    <View style={s.wrap}>
      <Text style={s.title}>Tu progreso comienza aquí</Text>
      <Pressable onPress={onPress} style={s.card}>
        <View style={s.iconWrap}>
          <Medal size={28} color={palette.ambar} strokeWidth={1.8} />
        </View>
        <Text style={s.text}>
          Completa tu primera misión{'\n'}y gana tu primer <Text style={s.xp}>XP</Text> 🥉
        </Text>
        <ChevronRight size={20} color={palette.azul} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { marginBottom: 10 },
  title: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800', color: palette.charcoal, marginBottom: 10 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: paletteExtras.moradoCardBg,
    borderWidth: 1,
    borderColor: paletteExtras.moradoBorde,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },

  iconWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  text: { flex: 1, fontFamily: 'Nunito', fontSize: 14, fontWeight: '700', color: palette.charcoal, lineHeight: 19 },
  xp:   { color: palette.azul },
});
