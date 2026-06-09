import ProgressDots from '@/components/ProgressDots';
import ScreenContainer from '@/components/ScreenContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { palette, semantic } from '@/theme/colors';
import { Image } from 'expo-image';
import { ArrowRight, ChevronLeft } from 'lucide-react-native';
import { Dimensions, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';

const { height: H } = Dimensions.get('window');
const SM = H < 740;

const BG   = palette.crema;
const DARK = semantic.textPrimary;
const MED  = semantic.textSecondary;
const PRIM = palette.morado;

const XP_REQUIRED = 200;
const BENEFITS = ['Misiones personalizadas', 'Quizzes ilimitados', 'Repasos inteligentes'];

export default function VehicleAssignedScreen() {
  const { nextStep, prevStep } = useOnboarding();

  return (
    <ScreenContainer style={s.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={s.topBar}>
        <Pressable onPress={prevStep} style={s.backBtn}>
          <ChevronLeft size={22} color={DARK} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={s.header}>
        <Text style={s.title}>Tu vehículo ha sido asignado.</Text>
        <Text style={s.subtitle}>Este es tu compañero de ruta.</Text>
      </View>

      {/* Level badge — plano, sin gradiente */}
      <View style={s.badgeRow}>
        <View style={s.badge}>
          <Text style={s.badgeText}>NIVEL 1</Text>
        </View>
      </View>
      <Text style={s.vehicleName}>City Car Sport</Text>

      {/* Car illustration — source of truth, do not redraw */}
      <View style={s.imageWrap}>
        <Image
          source={require('@/assets/images/citycar.png')}
          contentFit="contain"
          style={s.image}
        />
      </View>

      <View style={s.xpRow}>
        <View style={s.xpCol}>
          <Text style={s.xpLabel}>XP INICIAL</Text>
          <Text style={s.xpValue}>0 XP</Text>
        </View>
        <View style={s.xpDivider} />
        <View style={s.xpCol}>
          <Text style={s.xpLabel}>PRÓXIMA MEJORA</Text>
          <Text style={[s.xpValue, { color: PRIM }]}>{XP_REQUIRED} XP</Text>
        </View>
      </View>

      <View style={s.progressRow}>
        <View style={s.progressBg} />
        <Text style={s.progressLabel}>0 / {XP_REQUIRED} XP</Text>
      </View>

      <Text style={s.benefitsTitle}>Beneficios de este nivel</Text>
      <View style={s.benefitsRow}>
        {BENEFITS.map((b, i) => (
          <View key={i} style={s.benefitItem}>
            <View style={s.benefitDot} />
            <Text style={s.benefitText}>{b}</Text>
          </View>
        ))}
      </View>

      <View style={s.ctaBlock}>
        <ProgressDots current={5} />
        <Pressable onPress={nextStep} style={s.arrowBtn}>
          <ArrowRight size={22} color={palette.blanco} strokeWidth={2.5} />
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const IMAGE_H = H * (SM ? 0.22 : 0.27);

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  topBar: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 },
  backBtn:{ width: 38, height: 38, borderRadius: 12, backgroundColor: palette.blanco, borderWidth: 1, borderColor: palette.bordeClaro, alignItems: 'center', justifyContent: 'center' },

  header:   { paddingHorizontal: 24, alignItems: 'center', marginBottom: 10 },
  title:    { fontSize: SM ? 18 : 21, fontWeight: '800', color: DARK, textAlign: 'center', marginBottom: 3 },
  subtitle: { fontSize: 13, color: MED, textAlign: 'center' },

  badgeRow:    { alignItems: 'center', marginBottom: 6 },
  badge:       { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 5, backgroundColor: PRIM },
  badgeText:   { fontSize: 11, fontWeight: '900', color: palette.blanco, letterSpacing: 1.5 },
  vehicleName: { fontSize: SM ? 22 : 26, fontWeight: '900', color: DARK, textAlign: 'center', marginBottom: 4 },

  imageWrap: { width: '100%', height: IMAGE_H },
  image:     { width: '100%', height: '100%' },

  xpRow:    { flexDirection: 'row', marginHorizontal: 24, marginTop: SM ? 8 : 12, backgroundColor: palette.blanco, borderRadius: 14, borderWidth: 1, borderColor: palette.bordeClaro, paddingVertical: 12 },
  xpCol:    { flex: 1, alignItems: 'center' },
  xpDivider:{ width: 1, backgroundColor: palette.bordeClaro },
  xpLabel:  { fontSize: 10, fontWeight: '700', color: MED, letterSpacing: 0.5, marginBottom: 3 },
  xpValue:  { fontSize: SM ? 16 : 18, fontWeight: '900', color: DARK },

  progressRow:  { paddingHorizontal: 24, marginTop: 8 },
  progressBg:   { height: 8, backgroundColor: palette.moradoBg, borderRadius: 4, marginBottom: 4 },
  progressLabel:{ fontSize: 11, color: MED, fontWeight: '600', textAlign: 'right' },

  benefitsTitle: { fontSize: 11, fontWeight: '800', color: MED, letterSpacing: 0.5, paddingHorizontal: 24, marginTop: SM ? 8 : 10, marginBottom: 8 },
  benefitsRow:   { flexDirection: 'row', paddingHorizontal: 24, gap: 8 },
  benefitItem:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.blanco, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: palette.bordeClaro },
  benefitDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: PRIM },
  benefitText:   { fontSize: 10, fontWeight: '700', color: DARK, flex: 1 },

  ctaBlock: {
    marginTop: 'auto',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingBottom: SM ? 14 : 22, paddingTop: 10,
  },
  arrowBtn: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: PRIM, alignItems: 'center', justifyContent: 'center',
  },
});
