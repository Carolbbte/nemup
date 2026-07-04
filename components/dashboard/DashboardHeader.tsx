import { Bell, Flame } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, paletteExtras } from '@/theme/colors';

const BRAND      = palette.azul;
const INK        = palette.charcoal;
const MUTED      = palette.grisMedio;
const AMBER      = palette.ambarIcon;
const AMBER_TEXT = palette.ambarText;
const AMBER_BG   = palette.ambarBg;

const SUBTITLES = [
  'Vamos con todo hoy ⚡',
  'Tu próxima victoria te espera 🚀',
  'Un paso más y subes nivel 🔥',
  'Hoy toca sumar XP ⚡',
];

type Props = {
  userName: string;
  level: number;
  xp: number;
  streakDays: number;
  hasNotification?: boolean;
  isFirstTime?: boolean;
};

export default function DashboardHeader({ userName, level, xp, streakDays, hasNotification = false, isFirstTime = false }: Props) {
  const initial = (userName[0] ?? 'U').toUpperCase();
  const subtitleIdx = useMemo(() => Math.floor(Math.random() * SUBTITLES.length), []);
  const xpLabel = xp >= 1000 ? `${(xp / 1000).toFixed(1)}K` : `${xp}`;

  return (
    <View style={s.row}>
      {/* Avatar */}
      <View style={s.avatarWrap}>
        <View style={s.avatar}>
          <Text style={s.avatarLetter}>{initial}</Text>
        </View>
      </View>

      {/* Text block */}
      <View style={s.textBlock}>
        <Text style={s.greeting}>¡Hola, {userName}! 👋</Text>
        <Text style={s.subtitle}>
          {isFirstTime ? (
            <>👉 Hoy toca sumar <Text style={s.subtitleXp}>XP</Text> ⚡</>
          ) : (
            SUBTITLES[subtitleIdx]
          )}
        </Text>
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
  row:          { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },

  avatarWrap:   { alignItems: 'center', width: 58 },
  avatar:       { width: 58, height: 58, borderRadius: 29, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { fontFamily: 'Nunito', fontSize: 20, fontWeight: '800', color: 'white' },

  xpBadge:    { marginTop: 5, backgroundColor: paletteExtras.xpBadgeBg, borderRadius: 20, paddingVertical: 2, paddingHorizontal: 7, borderWidth: 1, borderColor: paletteExtras.xpBadgeBorde },
  xpBadgeTxt: { fontFamily: 'Nunito', fontSize: 10, fontWeight: '800', color: BRAND },

  textBlock:  { flex: 1, paddingTop: 4, gap: 2 },
  greeting:   { fontFamily: 'Nunito', fontSize: 17, fontWeight: '700', color: INK },
  subtitle:   { fontFamily: 'Nunito', fontSize: 12, color: MUTED, marginBottom: 4 },
  subtitleXp: { color: palette.azul },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: AMBER_BG, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  streakTxt:  { fontFamily: 'Nunito', fontSize: 12, fontWeight: '500', color: AMBER_TEXT },

  bellWrap:   { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', paddingTop: 4, position: 'relative' },
  bellDot:    { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND, borderWidth: 1.5, borderColor: palette.crema },
});
