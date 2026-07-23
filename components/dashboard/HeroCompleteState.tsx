import { Target } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, paletteExtras } from '@/theme/colors';

const BRAND = palette.azul;
const INK   = palette.charcoal;
const MUTED = palette.grisMedio;
const LABEL = palette.grisClaro;
const LIME  = palette.verdeXP;

type Props = {
  streak: number;
  onViewMissions: () => void;
};

export default function HeroCompleteState({ streak, onViewMissions }: Props) {
  return (
    <View style={s.row}>
      <View style={s.left}>
        <Text style={s.stateLabel}>DÍA COMPLETO ✓</Text>
        <Text style={s.title}>¡Lo lograste!</Text>
        <Text style={s.body}>Completaste tu sesión de hoy. Tu racha sigue viva.</Text>

        {streak > 0 && (
          <View style={s.streakBadge}>
            <Text style={s.streakTxt}>🔥 {streak} días de racha</Text>
          </View>
        )}

        <Pressable onPress={onViewMissions} style={s.cta}>
          <Target size={15} color={BRAND} strokeWidth={2.5} />
          <Text style={s.ctaTxt}>Ver misiones disponibles</Text>
        </Pressable>
      </View>

      <Image
        source={require('@/assets/images/metaAlcanzada.png')}
        style={s.mascot}
        resizeMode="contain"
      />
    </View>
  );
}

const s = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left:     { width: '55%', paddingRight: 12 },
  mascot:   { width: '45%', height: 210, alignSelf: 'flex-end' },

  stateLabel: { fontFamily: 'Nunito', fontSize: 10, fontWeight: '800', color: LABEL, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6 },
  title:    { fontFamily: 'Nunito', fontSize: 26, fontWeight: '900', color: INK, letterSpacing: -0.5, marginBottom: 4 },
  body:     { fontFamily: 'Nunito', fontSize: 13, fontWeight: '500', color: MUTED, lineHeight: 19, marginBottom: 14 },

  streakBadge: { alignSelf: 'flex-start', backgroundColor: palette.verdeXP + '2E', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.verdeXP + '66', marginBottom: 16 },
  streakTxt:   { fontFamily: 'Nunito', fontSize: 13, fontWeight: '800', color: paletteExtras.verdeOscuro },

  cta:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.blanco, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 28, alignSelf: 'flex-start', borderWidth: 1.5, borderColor: BRAND },
  ctaTxt:   { fontFamily: 'Nunito', fontSize: 13, fontWeight: '800', color: BRAND },
});
