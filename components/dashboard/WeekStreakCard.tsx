import { StyleSheet, Text, View } from 'react-native';
import { palette } from '@/theme/colors';

const BRAND = palette.azul;
const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

type Props = {
  // Defaults to 0 when the streak system doesn't have real data yet
  // (DailySessionContext already starts new users at 0) — today still
  // renders marked, just with "0 días" in the pill.
  streakDays: number;
};

export default function WeekStreakCard({ streakDays }: Props) {
  // JS getDay(): 0=Sun..6=Sat — shift to a Monday-first index (0=Mon..6=Sun)
  // to match the L-a-D strip.
  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Tu racha esta semana</Text>
          {/* StatsStrip's daily nudge doesn't render in this state anymore
              (home.tsx hides it when isReady) — preserved here so the
              reminder isn't lost. */}
          <Text style={s.subtitle}>Gana 20 XP hoy</Text>
        </View>
        <View style={s.streakPill}>
          <Text style={s.streakPillText}>{`${streakDays} días 🔥`}</Text>
        </View>
      </View>
      <View style={s.daysRow}>
        {DAY_LABELS.map((label, i) => {
          const isToday = i === todayIdx;
          return (
            <View key={`${label}-${i}`} style={s.dayCol}>
              <View style={[s.dayCircle, isToday ? s.dayCircleToday : s.dayCircleOther]}>
                <Text style={[s.dayLetter, isToday && s.dayLetterToday]}>{label}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: palette.blanco, borderRadius: 18, borderWidth: 1, borderColor: palette.bordeClaro, padding: 14, marginBottom: 10 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title:     { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800', color: palette.charcoal },
  subtitle:  { fontFamily: 'Nunito', fontSize: 11, fontWeight: '500', color: palette.grisMedio, marginTop: 2 },

  streakPill:     { backgroundColor: palette.ambarBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  streakPillText: { fontFamily: 'Nunito', fontSize: 12, fontWeight: '800', color: palette.ambarText },

  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol:  { alignItems: 'center' },

  dayCircle:      { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayCircleToday: { backgroundColor: BRAND },
  dayCircleOther: { borderWidth: 1.5, borderColor: palette.bordeMedio, borderStyle: 'dotted' },

  dayLetter:      { fontFamily: 'Nunito', fontSize: 12, fontWeight: '700', color: palette.grisMedio },
  dayLetterToday: { color: palette.blanco, fontWeight: '800' },
});
