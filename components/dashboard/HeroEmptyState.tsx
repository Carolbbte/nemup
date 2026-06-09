import { FileText, Layers, Target, Upload } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const BRAND = '#5B3DF5';
const INK   = '#1A1A22';
const MUTED = '#6B6779';
const LABEL = '#9A95A6';

// Three illustration icons representing the 3 modes
const ILLUS_ICONS = [FileText, Target, Layers] as const;

type Props = {
  onUpload: () => void;
  onHowItWorks: () => void;
};

export default function HeroEmptyState({ onUpload, onHowItWorks }: Props) {
  return (
    <View style={s.wrap}>
      <Text style={s.stateLabel}>EMPIEZA TU DÍA</Text>

      {/* Illustration — 3 circles connected by lines */}
      <View style={s.illus}>
        {ILLUS_ICONS.map((Icon, i) => (
          <View key={i} style={s.illusItem}>
            {i > 0 && <View style={s.connector} />}
            <View style={s.circle}>
              <Icon size={20} color={BRAND} strokeWidth={1.8} />
            </View>
          </View>
        ))}
      </View>

      <Text style={s.title}>Aún no hay sesión de hoy</Text>
      <Text style={s.body}>Sube tus apuntes y armamos los 3 modos de estudio para ti.</Text>

      <Pressable onPress={onUpload} style={s.cta}>
        <Upload size={16} color="white" strokeWidth={2} />
        <Text style={s.ctaTxt}>Subir apuntes</Text>
      </Pressable>

      <Pressable onPress={onHowItWorks} style={s.link} hitSlop={8}>
        <Text style={s.linkTxt}>¿Cómo funciona?</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:       { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 4 },
  stateLabel: { fontSize: 10, fontWeight: '600', color: LABEL, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 20 },
  illus:      { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  illusItem:  { flexDirection: 'row', alignItems: 'center' },
  connector:  { width: 22, height: 1, backgroundColor: '#D6D2C8' },
  circle:     { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ECE9FF', justifyContent: 'center', alignItems: 'center' },
  title:      { fontSize: 17, fontWeight: '700', color: INK, textAlign: 'center', marginBottom: 8 },
  body:       { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 8 },
  cta:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND, paddingVertical: 13, paddingHorizontal: 28, borderRadius: 28, marginBottom: 14 },
  ctaTxt:     { fontSize: 15, fontWeight: '700', color: 'white' },
  link:       { paddingVertical: 4 },
  linkTxt:    { fontSize: 13, color: BRAND, fontWeight: '500' },
});
