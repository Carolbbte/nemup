import type { DailyMode } from '@/contexts/DailySessionContext';
import { palette, paletteExtras } from '@/theme/colors';
import { ChevronRight, Play } from 'lucide-react-native';
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SessionInfo } from './SessionHeroCard';

const BRAND = palette.azul;
const INK   = palette.charcoal;
const MUTED = palette.grisMedio;
const LABEL = palette.grisClaro;
const TRACK = paletteExtras.moradoTrackClaro;

// Same breakpoint home.tsx uses — replicated locally since this component
// doesn't receive screen-size context as a prop.
const { height: SCREEN_H } = Dimensions.get('window');
const SM = SCREEN_H < 740;

const MODE_LABELS: Record<DailyMode, string> = { mision: 'Misión', quiz: 'Quiz', tarjetas: 'Tarjetas', desafio: 'Desafío' };

type Props = {
  session: SessionInfo | null;
  nextMode: DailyMode | null;
  onStart: () => void;
};

export default function HeroReadyState({ session, nextMode, onStart }: Props) {
  const subject  = session?.subject ?? 'Tu sesión';
  const topic    = session?.topic ?? 'Tu sesión de hoy te espera';
  const duration = session?.estimatedDuration ?? 0;
  const xp       = session?.xpReward ?? 0;

  return (
    <View style={s.wrap}>
      {/* Área superior: altura fija = mascota visible → panel empieza justo debajo */}
      <View style={s.topRow}>
        <View style={s.textCol}>
          <Text style={s.stateLabel}>SESIÓN LISTA</Text>
          <Text style={s.subject} numberOfLines={2}>{subject}</Text>
          <Text style={s.topic} numberOfLines={2}>{topic}</Text>
        </View>
        <View style={s.mascot} pointerEvents="none">
          <Image
            source={require('@/assets/images/misionActivada.png')}
            style={s.mascotImg}
            resizeMode="contain"
          />
        </View>
      </View>

      {/* Panel CTA — inmediatamente debajo del topRow */}
      <Pressable onPress={onStart} style={s.panel}>
        <View style={s.panelTop}>
          <View style={s.playCircle}>
            <Play size={13} color="white" fill="white" strokeWidth={2} />
          </View>
          <Text style={s.panelTitle}>Empieza tu sesión</Text>
          <ChevronRight size={18} color={BRAND} strokeWidth={2.5} />
        </View>
        <View style={s.progressRow}>
          <View style={s.trackBg}>
            <View style={[s.trackFill, { width: '0%' }]} />
          </View>
          <Text style={s.pct}>0%</Text>
        </View>
        <Text style={s.footer}>🕐 {duration} min  ·  ⚡ +{xp} XP por completar</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:    { },

  // topRow: altura fija para que la mascota siga visible y el panel quede
  // justo debajo — achicada (era minHeight:180 / mascota 200px) para ganar
  // espacio vertical en el estado "sesión lista", más aún en pantallas
  // chicas (SM).
  topRow:  { minHeight: SM ? 95 : 110, position: 'relative', marginBottom: SM ? 4 : 6 },
  textCol: { width: '58%' },
  mascot:    { position: 'absolute', right: SM ? -10 : -14, top: SM ? -8 : -10, width: SM ? 110 : 130, height: SM ? 110 : 130 },
  mascotImg: { width: '100%', height: '100%' },

  stateLabel: { fontFamily: 'Nunito', fontSize: 10, fontWeight: '800', color: LABEL, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 2 },
  subject:    { fontFamily: 'Nunito', fontSize: 26, lineHeight: 30, fontWeight: '800', color: palette.charcoal, letterSpacing: -0.4, flexShrink: 1 },
  topic:      { fontFamily: 'Nunito', fontSize: 12, fontWeight: '500', color: MUTED, marginTop: 3, flexShrink: 1 },

  panel:      { borderTopWidth: 1, borderTopColor: paletteExtras.moradoBordeSuave, paddingTop: SM ? 4 : 6 },
  panelTop:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SM ? 4 : 5 },
  playCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center' },
  panelTitle: { flex: 1, fontFamily: 'Nunito', fontSize: 13, fontWeight: '800', color: BRAND },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SM ? 3 : 4 },
  trackBg:     { flex: 1, height: 4, borderRadius: 3, backgroundColor: TRACK, overflow: 'hidden' },
  trackFill:   { height: 4, borderRadius: 3, backgroundColor: BRAND },
  pct:         { fontFamily: 'Nunito', fontSize: 12, fontWeight: '800', color: BRAND, minWidth: 30, textAlign: 'right' },

  footer:      { fontFamily: 'Nunito', fontSize: 11, fontWeight: '500', color: MUTED },
});
