import type { DailyMode } from '@/contexts/DailySessionContext';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Play } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SessionInfo } from './SessionHeroCard';
import { palette } from '@/theme/colors';

const BRAND = palette.azul;
const INK   = palette.charcoal;
const MUTED = palette.grisMedio;
const TRACK = palette.azulClaro;

type Props = {
  session: SessionInfo | null;
  nextMode: DailyMode;
  completedCount: number;
  onContinue: () => void;
};

export default function HeroInProgressState({ session, completedCount, onContinue }: Props) {
  const subject  = session?.subject ?? 'Tu sesión';
  const topic    = session?.topic ?? 'Continúa donde quedaste';
  const duration = session?.estimatedDuration ?? 0;
  const xp       = session?.xpReward ?? 0;

  const pct = Math.round((completedCount / 3) * 100);

  return (
    <View>
      <View style={s.missionPill}>
        <Text style={s.missionPillTxt}>TU MISIÓN DE HOY</Text>
      </View>

      <View style={s.topRow}>
        <View style={s.textCol}>
          <Text style={s.subject} numberOfLines={2}>{subject}</Text>
          <Text style={s.topic} numberOfLines={2}>{topic}</Text>
          <Text style={s.meta}>🕐 {duration} min  ·  ⚡ +{xp} XP</Text>
        </View>

        <Image
          source={require('@/assets/images/tuPuedes.png')}
          style={s.mascot}
          resizeMode="contain"
        />
      </View>

      <Text style={s.progressLabel}>Tu progreso</Text>
      <View style={s.progressRow}>
        <View style={s.trackBg}>
          <View style={[s.trackFill, { width: `${pct}%` }]} />
        </View>
        <Text style={s.pct}>{pct}%</Text>
      </View>

      <Pressable onPress={onContinue} style={s.ctaWrap}>
        <LinearGradient
          colors={[palette.azul, palette.cyanBrillante, palette.verdeBrillante]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={s.cta}
        >
          <View style={s.playCircle}>
            <Play size={12} color="white" fill="white" strokeWidth={2} />
          </View>
          <Text style={s.ctaTxt}>Continuar sesión</Text>
          <ChevronRight size={18} color="white" strokeWidth={2.5} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  missionPill:    { alignSelf: 'flex-start', backgroundColor: palette.azulClaro, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, marginBottom: 10 },
  missionPillTxt: { fontFamily: 'Nunito', fontSize: 10, fontWeight: '800', color: BRAND, letterSpacing: 0.8, textTransform: 'uppercase' },

  topRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  textCol: { flex: 1, paddingRight: 8 },
  mascot:  { width: 110, height: 120 },

  subject: { fontFamily: 'Nunito', fontSize: 26, lineHeight: 30, fontWeight: '800', color: INK, letterSpacing: -0.4, flexShrink: 1 },
  topic:   { fontFamily: 'Nunito', fontSize: 13, fontWeight: '500', color: MUTED, marginTop: 3, flexShrink: 1 },
  meta:    { fontFamily: 'Nunito', fontSize: 12, fontWeight: '600', color: INK, marginTop: 8 },

  progressLabel: { fontFamily: 'Nunito', fontSize: 12, fontWeight: '700', color: INK, marginBottom: 6 },
  progressRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  trackBg:       { flex: 1, height: 8, borderRadius: 4, backgroundColor: TRACK, overflow: 'hidden' },
  trackFill:     { height: '100%', borderRadius: 4, backgroundColor: BRAND },
  pct:           { fontFamily: 'Nunito', fontSize: 13, fontWeight: '800', color: BRAND, minWidth: 34, textAlign: 'right' },

  ctaWrap: { borderRadius: 30, overflow: 'hidden' },
  cta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  playCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
  ctaTxt:  { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800', color: 'white' },
});
