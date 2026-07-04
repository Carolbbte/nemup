import PrimaryButton from '@/components/PrimaryButton';
import ProgressDots from '@/components/ProgressDots';
import ScreenContainer from '@/components/ScreenContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { palette, semantic } from '@/theme/colors';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { ChevronLeft, Upload } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { Dimensions, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';

const { height: H } = Dimensions.get('window');
const SM = H < 740;

const BG   = palette.crema;
const DARK = semantic.textPrimary;
const MED  = semantic.textSecondary;
const PRIM = palette.azul;

export default function CompleteScreen() {
  const { state, completeOnboarding, prevStep } = useOnboarding();
  const [isLoading, setIsLoading] = React.useState(false);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const handleComplete = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await completeOnboarding();
    } catch {
      setIsLoading(false);
    }
  };

  return (
    <ScreenContainer style={s.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={s.topBar}>
        <Pressable onPress={prevStep} style={s.backBtn}>
          <ChevronLeft size={22} color={DARK} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={s.imageWrap}>
        <Image
          source={require('@/assets/images/start-race.png')}
          contentFit="contain"
          style={s.image}
        />
      </View>

      <View style={s.textBlock}>
        <Text style={s.title}>¡Arranca tu motor!</Text>
        <Text style={s.subtitle}>Sube un material y crea tu primera misión.</Text>
      </View>

      <View style={s.uploadCard}>
        <View style={s.uploadIconWrap}>
          <Upload size={20} color={PRIM} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.uploadTitle}>Sube tu primer material</Text>
          <Text style={s.uploadDesc}>PDF, fotos, apuntes o guías</Text>
        </View>
      </View>

      <View style={s.ctaBlock}>
        <PrimaryButton
          label={isLoading ? 'Cargando...' : 'Comenzar mi primera misión'}
          onPress={handleComplete}
          disabled={isLoading}
        />
        <ProgressDots current={6} />
      </View>
    </ScreenContainer>
  );
}

const IMAGE_H = H * (SM ? 0.36 : 0.42);

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  topBar: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 },
  backBtn:{ width: 38, height: 38, borderRadius: 12, backgroundColor: palette.blanco, borderWidth: 1, borderColor: palette.bordeClaro, alignItems: 'center', justifyContent: 'center' },

  imageWrap: { width: '100%', height: IMAGE_H },
  image:     { width: '100%', height: '100%' },

  textBlock: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  title:     { fontSize: SM ? 24 : 28, fontWeight: '800', color: DARK, textAlign: 'center', marginBottom: 8 },
  subtitle:  { fontSize: 14, color: MED, textAlign: 'center', lineHeight: 21 },

  uploadCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 24, marginBottom: 8,
    backgroundColor: palette.blanco, borderRadius: 16,
    borderWidth: 1.5, borderColor: palette.azulClaro,
    padding: 14,
  },
  uploadIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: palette.azulClaro, alignItems: 'center', justifyContent: 'center' },
  uploadTitle:    { fontSize: 14, fontWeight: '700', color: DARK, marginBottom: 2 },
  uploadDesc:     { fontSize: 12, color: MED },

  ctaBlock: { paddingHorizontal: 24, paddingBottom: SM ? 16 : 24, paddingTop: 8, gap: 14 },
});
