import { Upload } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette } from '@/theme/colors';

const BRAND = palette.azul;

type Props = {
  onPress: () => void;
};

export default function UploadApuntesButton({ onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.btn, pressed && s.pressed]}>
      <View style={s.iconBox}>
        <Upload size={14} color={palette.blanco} strokeWidth={2.2} />
      </View>
      <Text style={s.txt}>Subir nuevos apuntes</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  // Tinted secondary — same brand blue as the primary CTA, just lower
  // visual weight (no gradient, tint fill instead of a solid one) so the
  // hierarchy against "Empieza tu sesión" stays the same as before.
  btn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 28, borderWidth: 1.5, borderColor: BRAND, backgroundColor: palette.azulClaro, marginBottom: 12 },
  pressed: { opacity: 0.65 },
  iconBox: { width: 26, height: 26, borderRadius: 13, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  txt:     { fontFamily: 'Nunito', fontSize: 14, fontWeight: '700', color: BRAND },
});
