import { LinearGradient } from 'expo-linear-gradient';
import { ClipboardCheck, Layers, Trophy } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { palette } from '@/theme/colors';

const ITEMS = [
  {
    Icon: Trophy,
    gradient: [palette.amarilloXP, palette.ambar] as const,
    title: 'Desafío',
    desc: 'Conceptos + mini quizzes',
  },
  {
    Icon: ClipboardCheck,
    gradient: [palette.azul, palette.cyanBrillante] as const,
    title: 'Quiz',
    desc: 'Preguntas para poner a prueba lo que sabes',
  },
  {
    Icon: Layers,
    gradient: [palette.verdeXP, palette.verdeBrillante] as const,
    title: 'Tarjetas',
    desc: 'Repasa con tarjetas interactivas',
  },
];

export default function UnlocksCard() {
  return (
    <View style={s.wrap}>
      <Text style={s.title}>Con esta misión desbloqueas:</Text>
      <View style={s.row}>
        {ITEMS.map(({ Icon, gradient, title, desc }) => (
          <View key={title} style={s.item}>
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.iconBox}
            >
              <Icon size={22} color="white" strokeWidth={2} />
            </LinearGradient>
            <Text style={s.itemTitle}>{title}</Text>
            <Text style={s.itemDesc}>{desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { marginBottom: 10 },
  title: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800', color: palette.charcoal, marginBottom: 10 },

  row: { flexDirection: 'row', gap: 8 },

  item: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: palette.crema,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.bordeClaro,
    paddingVertical: 14,
    paddingHorizontal: 6,
  },

  iconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },

  itemTitle: { fontFamily: 'Nunito', fontSize: 13, fontWeight: '800', color: palette.charcoal, marginBottom: 3 },
  itemDesc:  { fontFamily: 'Nunito', fontSize: 10, fontWeight: '500', color: palette.grisMedio, textAlign: 'center', lineHeight: 14 },
});
