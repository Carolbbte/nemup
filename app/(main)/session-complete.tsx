import { useDailySession } from '@/contexts/DailySessionContext';
import { palette, semantic } from '@/theme/colors';
import { Flame } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SessionCompleteScreen() {
  const router = useRouter();
  const { dailySession } = useDailySession();

  return (
    <SafeAreaView style={s.page} edges={['top', 'bottom']}>
      <View style={s.content}>
        <View style={s.iconCircle}>
          <Flame size={36} color={palette.limaElectrica} strokeWidth={2} />
        </View>
        <Text style={s.title}>¡Día completo!</Text>
        <Text style={s.sub}>Resumen del día — en desarrollo</Text>
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statVal}>{dailySession.streak}</Text>
            <Text style={s.statLbl}>Días de racha</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statVal}>3/3</Text>
            <Text style={s.statLbl}>Modos completados</Text>
          </View>
        </View>
      </View>
      <View style={s.bottom}>
        <Pressable
          onPress={() => router.replace('/home' as any)}
          style={({ pressed }) => [s.cta, pressed && { opacity: 0.88 }]}
        >
          <Text style={s.ctaTxt}>Volver al inicio</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page:       { flex: 1, backgroundColor: palette.crema },
  content:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  iconCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: palette.charcoal, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title:      { fontSize: 28, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', marginBottom: 8 },
  sub:        { fontSize: 14, color: semantic.textSecondary, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  statsRow:   { flexDirection: 'row', gap: 16 },
  stat:       { alignItems: 'center', backgroundColor: palette.blanco, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, borderWidth: 1, borderColor: palette.bordeClaro },
  statVal:    { fontSize: 22, fontWeight: '900', color: semantic.textPrimary, marginBottom: 4 },
  statLbl:    { fontSize: 11, fontWeight: '600', color: semantic.textTertiary },
  bottom:     { paddingHorizontal: 20, paddingBottom: 24 },
  cta:        { height: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.morado },
  ctaTxt:     { fontSize: 16, fontWeight: '800', color: palette.blanco },
});
