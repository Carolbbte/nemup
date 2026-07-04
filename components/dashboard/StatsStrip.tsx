import { StyleSheet, Text, View } from 'react-native';
import { palette } from '@/theme/colors';

const INK   = palette.charcoal;
const LABEL = palette.grisClaro;
const SEP   = palette.bordeMedio;

type Props = {
  streakDays: number;       // racha acumulada (días)
  xp: number;               // puntos acumulados
  sessionsCompleted: number; // sesiones completadas
};

export default function StatsStrip({ streakDays, xp, sessionsCompleted }: Props) {
  const isFirstTime = streakDays === 0 && xp === 0 && sessionsCompleted === 0;

  if (isFirstTime) {
    return (
      <View style={[s.strip, s.firstTimeStrip]}>
        <Text style={s.firstTimeEmoji}>🌱</Text>
        <View style={s.firstTimeTextCol}>
          <Text style={s.firstTimeTitle}>🔥 Empieza tu racha</Text>
          <Text style={s.firstTimeBody}>Gana 20 XP hoy</Text>
        </View>
      </View>
    );
  }

  if (streakDays > 0) {
    return (
      <View style={s.streakCard}>
        <Text style={s.streakCardEmoji}>🔥</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.streakCardTitle}>Mantén tu racha encendida</Text>
          <Text style={s.streakCardBody}>Estudia hoy y gana 20 XP</Text>
        </View>
        <View style={s.streakRing}>
          <Text style={s.streakRingValue}>{streakDays}</Text>
          <Text style={s.streakRingLabel}>días</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.strip}>
      {/* Racha */}
      <View style={s.stat}>
        {streakDays > 0 ? (
          <>
            <Text style={s.emoji}>🔥</Text>
            <Text style={s.value}>{streakDays}</Text>
            <Text style={s.label}>días</Text>
          </>
        ) : (
          <>
            <Text style={s.emoji}>🌱</Text>
            <Text style={s.valueStartGreen}>Empieza tu racha</Text>
          </>
        )}
      </View>

      <View style={s.sep} />

      {/* XP */}
      <View style={s.stat}>
        {xp > 0 ? (
          <>
            <Text style={s.emoji}>⚡</Text>
            <Text style={s.value}>{xp.toLocaleString('es-CL')}</Text>
            <Text style={s.label}>XP</Text>
          </>
        ) : (
          <>
            <Text style={s.emoji}>⚡</Text>
            <Text style={s.valueStart}>Tu primer XP te espera</Text>
          </>
        )}
      </View>

      <View style={s.sep} />

      {/* Sesiones */}
      <View style={s.stat}>
        {sessionsCompleted > 0 ? (
          <>
            <Text style={s.emoji}>🎓</Text>
            <Text style={s.value}>{sessionsCompleted}</Text>
            <Text style={s.label}>sesiones</Text>
          </>
        ) : (
          <>
            <Text style={s.emoji}>🎓</Text>
            <Text style={s.valueStart}>Tu primera sesión está por comenzar</Text>
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: palette.blanco,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 0.5,
    borderColor: palette.bordeClaro,
    marginBottom: 10,
  },
  stat:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  emoji: { fontSize: 14 },
  value:      { fontFamily: 'Nunito', fontSize: 13, fontWeight: '500', color: INK },
  valueStart: { fontFamily: 'Nunito', fontSize: 11, fontWeight: '700', color: INK },
  valueStartGreen: { fontFamily: 'Nunito', fontSize: 11, fontWeight: '700', color: palette.verdeXP },
  label: { fontFamily: 'Nunito', fontSize: 11, color: LABEL },
  sep:   { width: 0.5, height: 14, backgroundColor: SEP },

  firstTimeStrip:  { justifyContent: 'flex-start', paddingHorizontal: 12, gap: 10 },
  firstTimeEmoji:  { fontSize: 20 },
  firstTimeTextCol:{ flex: 1, gap: 1 },
  firstTimeTitle:  { fontFamily: 'Nunito', fontSize: 13, fontWeight: '700', color: palette.verdeXP },
  firstTimeBody:   { fontFamily: 'Nunito', fontSize: 12, fontWeight: '400', color: palette.grisMedio },

  streakCard:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: palette.blanco, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 0.5, borderColor: palette.bordeClaro, marginBottom: 10 },
  streakCardEmoji: { fontSize: 20 },
  streakCardTitle: { fontFamily: 'Nunito', fontSize: 13, fontWeight: '700', color: palette.verdeXP, marginBottom: 2 },
  streakCardBody:  { fontFamily: 'Nunito', fontSize: 12, color: palette.grisMedio },
  streakRing:      { width: 44, height: 44, borderRadius: 22, borderWidth: 2.5, borderColor: palette.verdeXP, alignItems: 'center', justifyContent: 'center' },
  streakRingValue: { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800', color: INK, lineHeight: 17 },
  streakRingLabel: { fontFamily: 'Nunito', fontSize: 8, color: palette.grisMedio },
});
