import { ChevronRight, Target, TrendingUp, Zap } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette } from '@/theme/colors';

type Props = {
  completedCount: number; // de 3 modos canónicos (Misión/Quiz/Tarjetas)
  totalXp: number;        // xpReward total de la sesión
};

// NOTA: hoy DailySessionContext solo trackea 3 booleanos (mision/quiz/tarjetas),
// no un conteo granular de sub-actividades ni XP realmente acumulado — estas
// métricas son una aproximación a partir de esos 3 booleanos, no un valor exacto.
export default function SessionProgressCard({ completedCount, totalXp }: Props) {
  const pct = Math.round((completedCount / 3) * 100);
  const xpEarned = Math.round((totalXp * completedCount) / 3);

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Tu progreso en esta sesión</Text>
      <View style={s.card}>
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Target size={18} color={palette.azul} strokeWidth={2} />
            <Text style={s.statValue}>{completedCount}/3</Text>
            <Text style={s.statLabel}>Actividades{'\n'}completadas</Text>
          </View>
          <View style={s.stat}>
            <Zap size={18} color={palette.amarilloXP} fill={palette.amarilloXP} strokeWidth={1.5} />
            <Text style={s.statValue}>{xpEarned}</Text>
            <Text style={s.statLabel}>XP ganados</Text>
          </View>
          <View style={s.stat}>
            <TrendingUp size={18} color={palette.verdeXP} strokeWidth={2} />
            <Text style={s.statValue}>{pct}%</Text>
            <Text style={s.statLabel}>Progreso{'\n'}general</Text>
          </View>
        </View>

        <View style={s.tipRow}>
          <Image
            source={require('@/assets/images/tuPuedes.png')}
            style={s.tipAvatar}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            <Text style={s.tipTitle}>¡Vas muy bien! Sigue así 💪</Text>
            <Text style={s.tipDesc}>Cada paso te acerca a tu mejor versión.</Text>
          </View>
          <ChevronRight size={18} color={palette.grisClaro} strokeWidth={2} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { marginBottom: 10 },
  title: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800', color: palette.charcoal, marginBottom: 10 },

  card: { backgroundColor: palette.blanco, borderRadius: 20, borderWidth: 1, borderColor: palette.bordeClaro, padding: 16 },

  statsRow: { flexDirection: 'row', marginBottom: 14 },
  stat:     { flex: 1, alignItems: 'center', gap: 6 },
  statValue:{ fontFamily: 'Nunito', fontSize: 16, fontWeight: '800', color: palette.charcoal },
  statLabel:{ fontFamily: 'Nunito', fontSize: 10, color: palette.grisMedio, textAlign: 'center', lineHeight: 13 },

  tipRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: palette.bordeClaro, paddingTop: 14 },
  tipAvatar: { width: 34, height: 38 },
  tipTitle:  { fontFamily: 'Nunito', fontSize: 13, fontWeight: '700', color: palette.charcoal, marginBottom: 1 },
  tipDesc:   { fontFamily: 'Nunito', fontSize: 11, color: palette.grisMedio },
});
