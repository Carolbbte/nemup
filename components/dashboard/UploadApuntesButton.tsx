import { Upload } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const BRAND = '#5B3DF5';
const MUTED = '#6B6779';

type Props = {
  onPress: () => void;
};

export default function UploadApuntesButton({ onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.btn, pressed && s.pressed]}>
      <Upload size={15} color={BRAND} strokeWidth={2} />
      <Text style={s.txt}>Subir nuevos apuntes</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 28, borderWidth: 1.5, borderColor: BRAND, marginBottom: 12 },
  pressed: { opacity: 0.65 },
  txt:     { fontSize: 14, fontWeight: '600', color: BRAND },
});
