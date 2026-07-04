import { palette } from '@/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Upload } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

const MUTED = palette.grisMedio;
const LABEL = palette.grisClaro;

type Props = {
  onUpload: () => void;
};

export default function HeroEmptyState({ onUpload }: Props) {
  return (
    <View style={s.row}>
      <View style={s.left}>
        <View style={s.missionPill}>
          <Text style={s.missionPillTxt}>TU MISIÓN DEL DÍA</Text>
        </View>

        <Text style={s.title}>¡Empieza tu primera misión! 🚀</Text>

        <Text style={s.body}>Sube tu material y recibe tu sesión de estudio personalizada.</Text>

        <Pressable onPress={onUpload} style={s.ctaWrap}>
          <LinearGradient
            colors={[palette.azul, palette.cyanBrillante, palette.verdeBrillante]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.cta}
          >
            <Upload size={15} color="white" strokeWidth={2.2} />
            <Text style={s.ctaTxt}>Subir material</Text>
            <ChevronRight size={16} color="white" strokeWidth={2.5} />
          </LinearGradient>
        </Pressable>

        <View style={s.hintPill}>
          <Text style={s.hintPillTxt} numberOfLines={1}>Guías, apuntes, libros o ejercicios</Text>
        </View>
      </View>

      <Image
        source={require('@/assets/images/saludoInicial.png')}
        style={s.mascot}
        resizeMode="contain"
      />
    </View>
  );
}

const s = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'flex-start', position: 'relative' },
  left:     { width: '65%', paddingRight: 12 },
  mascot:   { position: 'absolute', top: -38, right: -40, width: 190, height: 345 },

  missionPill:    { alignSelf: 'flex-start', backgroundColor: palette.azulClaro, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, marginBottom: 12 },
  missionPillTxt: { fontFamily: 'Nunito', fontSize: 10, fontWeight: '800', color: palette.azul, letterSpacing: 0.8, textTransform: 'uppercase' },

  title: { fontFamily: 'Nunito', fontSize: 24, fontWeight: '800', color: palette.charcoal, lineHeight: 30, marginBottom: 10 },
  body:  { fontFamily: 'Nunito', fontSize: 14, fontWeight: '500', color: MUTED, lineHeight: 20, marginBottom: 22 },

  ctaWrap:  { alignSelf: 'flex-start', marginBottom: 14 },
  cta:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 22, borderRadius: 30 },
  ctaTxt:   { fontFamily: 'Nunito', fontSize: 17, fontWeight: '800', color: 'white' },

  hintPill:    { alignSelf: 'flex-start', backgroundColor: palette.azulClaro, borderRadius: 20, paddingVertical: 1, paddingHorizontal: 12 },
  hintPillTxt: { fontFamily: 'Nunito', fontSize: 12, fontWeight: '600', color: palette.azul },
});
