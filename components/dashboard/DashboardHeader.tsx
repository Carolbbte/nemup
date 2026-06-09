import { Bell, Flame } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const BRAND      = '#5B3DF5';
const INK        = '#1A1A22';
const MUTED      = '#6B6779';
const AMBER      = '#BA7517';
const AMBER_TEXT = '#854F0B';
const AMBER_BG   = '#FFF2E0';

type Props = {
  userName: string;
  level: number;
  streakDays: number;
  hasNotification?: boolean;
};

export default function DashboardHeader({ userName, level, streakDays, hasNotification = false }: Props) {
  const initial = (userName[0] ?? 'U').toUpperCase();

  return (
    <View style={s.row}>
      {/* Avatar + level badge */}
      <View style={s.avatarWrap}>
        <View style={s.avatar}>
          <Text style={s.avatarLetter}>{initial}</Text>
        </View>
        <View style={s.levelBadge}>
          <Text style={s.levelText}>{level}</Text>
        </View>
      </View>

      {/* Text block */}
      <View style={s.textBlock}>
        <Text style={s.greeting}>Hola, {userName}</Text>
        <Text style={s.subtitle}>Hoy es un gran día para avanzar.</Text>
        {streakDays > 0 && (
          <View style={s.streakPill}>
            <Flame size={13} color={AMBER} strokeWidth={2} />
            <Text style={s.streakTxt}>{streakDays} días</Text>
          </View>
        )}
      </View>

      {/* Bell */}
      <Pressable style={s.bellWrap} hitSlop={10}>
        <Bell size={22} color={MUTED} strokeWidth={1.8} />
        {hasNotification && <View style={s.bellDot} />}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  avatarWrap:  { width: 58, height: 58, position: 'relative' },
  avatar:      { width: 58, height: 58, borderRadius: 29, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center' },
  avatarLetter:{ fontSize: 22, fontWeight: '500', color: 'white' },
  levelBadge:  { position: 'absolute', bottom: 0, right: 0, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: INK, borderWidth: 2, borderColor: '#FAFAF7', justifyContent: 'center', alignItems: 'center' },
  levelText:   { fontSize: 11, fontWeight: '500', color: 'white' },
  textBlock:   { flex: 1, paddingTop: 2, gap: 2 },
  greeting:    { fontSize: 17, fontWeight: '500', color: INK },
  subtitle:    { fontSize: 12, color: MUTED, marginBottom: 6 },
  streakPill:  { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: AMBER_BG, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  streakTxt:   { fontSize: 12, fontWeight: '500', color: AMBER_TEXT },
  bellWrap:    { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', paddingTop: 2, position: 'relative' },
  bellDot:     { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND, borderWidth: 1.5, borderColor: '#FAFAF7' },
});
