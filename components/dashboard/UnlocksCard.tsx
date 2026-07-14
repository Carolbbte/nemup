import { LinearGradient } from 'expo-linear-gradient';
import { ClipboardCheck, Layers, Trophy } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { palette } from '@/theme/colors';

const ITEMS = [
  {
    key: 'desafio' as const,
    Icon: Trophy,
    gradient: [palette.amarilloXP, palette.ambar] as const,
    solid: palette.ambar,
    title: 'Desafío',
    desc: 'Conceptos + mini quizzes',
  },
  {
    key: 'quiz' as const,
    Icon: ClipboardCheck,
    gradient: [palette.azul, palette.cyanBrillante] as const,
    solid: palette.azul,
    title: 'Quiz',
    desc: 'Preguntas para poner a prueba lo que sabes',
  },
  {
    key: 'tarjetas' as const,
    Icon: Layers,
    gradient: [palette.verdeXP, palette.verdeBrillante] as const,
    solid: palette.verdeXP,
    title: 'Tarjetas',
    desc: 'Repasa con tarjetas interactivas',
  },
];

type Props = {
  // Default (omitted): the original first-mission "unlocks" teaser —
  // gradient icon boxes, description text, unchanged from before.
  title?: string;
  variant?: 'unlock' | 'included';
  // 'included'-only — real XP per mode, same formula session.tsx's
  // mode-select screen uses (XP_PER_CORRECT/XP_PER_CARD per item, "BONUS"
  // for Desafío, which has no per-item XP there either).
  quizXp?: number;
  cardsXp?: number;
  showDesafio?: boolean;
};

export default function UnlocksCard({ title, variant = 'unlock', quizXp, cardsXp, showDesafio = true }: Props) {
  const included = variant === 'included';
  const items = included ? ITEMS.filter((i) => i.key !== 'desafio' || showDesafio) : ITEMS;

  return (
    <View style={s.wrap}>
      <Text style={s.title}>{title ?? 'Con esta misión desbloqueas:'}</Text>
      <View style={s.row}>
        {items.map((item) => (
          <View
            key={item.key}
            style={[s.item, included && [s.itemIncluded, { borderBottomColor: item.solid }]]}
          >
            {included ? (
              <View style={[s.iconBox, { backgroundColor: item.solid }]}>
                <item.Icon size={22} color="white" strokeWidth={2} />
              </View>
            ) : (
              <LinearGradient
                colors={item.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.iconBox}
              >
                <item.Icon size={22} color="white" strokeWidth={2} />
              </LinearGradient>
            )}
            <Text style={s.itemTitle}>{item.title}</Text>
            {included ? (
              <Text style={[s.itemXp, { color: item.solid }]}>
                {item.key === 'desafio' ? 'BONUS' : `+${item.key === 'quiz' ? (quizXp ?? 0) : (cardsXp ?? 0)} XP`}
              </Text>
            ) : (
              <Text style={s.itemDesc}>{item.desc}</Text>
            )}
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
  // 'included' variant — white card + a colored "3D" bottom border (the
  // same mode-card language session.tsx's mode-select screen uses) instead
  // of the flat crema teaser card.
  itemIncluded: { backgroundColor: palette.blanco, borderBottomWidth: 3 },

  iconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },

  itemTitle: { fontFamily: 'Nunito', fontSize: 13, fontWeight: '800', color: palette.charcoal, marginBottom: 3 },
  itemDesc:  { fontFamily: 'Nunito', fontSize: 10, fontWeight: '500', color: palette.grisMedio, textAlign: 'center', lineHeight: 14 },
  itemXp:    { fontFamily: 'Nunito', fontSize: 12, fontWeight: '800' },
});
