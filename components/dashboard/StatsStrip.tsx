import { CalendarCheck, Trophy, Zap } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

const INK   = '#1A1A22';
const LABEL = '#9A95A6';
const AMBER = '#BA7517';
const SEP   = '#D6D2C8';

type Props = {
  xp: number;
  leagueName: string;
  leagueRank: number;
  sessionsCompleted: number;
};

export default function StatsStrip({ xp, leagueName, leagueRank, sessionsCompleted }: Props) {
  return (
    <View style={s.strip}>
      {/* XP */}
      <View style={s.stat}>
        <Zap size={15} color={AMBER} strokeWidth={2} />
        <Text style={s.value}>{xp.toLocaleString('es-CL')}</Text>
        <Text style={s.label}>XP</Text>
      </View>

      <View style={s.sep} />

      {/* Liga */}
      <View style={s.stat}>
        <Trophy size={15} color={AMBER} strokeWidth={2} />
        <Text style={s.value}>{leagueName}</Text>
        <Text style={s.label}>#{leagueRank}</Text>
      </View>

      <View style={s.sep} />

      {/* Sesiones */}
      <View style={s.stat}>
        <CalendarCheck size={15} color={LABEL} strokeWidth={2} />
        <Text style={s.value}>{sessionsCompleted}</Text>
        <Text style={s.label}>sesiones</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 0.5,
    borderColor: '#E8E5DC',
    marginBottom: 10,
  },
  stat:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  value: { fontSize: 13, fontWeight: '500', color: INK },
  label: { fontSize: 11, color: LABEL },
  sep:   { width: 0.5, height: 14, backgroundColor: SEP },
});
