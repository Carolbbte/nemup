import ProgressDots from '@/components/ProgressDots';
import ScreenContainer from '@/components/ScreenContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { palette, semantic } from '@/theme/colors';
import { Image } from 'expo-image';
import { ArrowRight, ChevronLeft, User } from 'lucide-react-native';
import { useState } from 'react';
import { Dimensions, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';

const { height: H } = Dimensions.get('window');
const SM = H < 740;

const BG     = palette.crema;
const DARK   = semantic.textPrimary;
const MED    = semantic.textSecondary;
const PRIM   = palette.morado;
const BORDER = palette.bordeClaro;

const AVATAR_SIZE = SM ? 110 : 130;

export default function ProfileScreen() {
  const { state, setName, nextStep, prevStep } = useOnboarding();
  const [focused, setFocused] = useState(false);
  const canContinue = state.data.name.trim().length > 0;

  return (
    <ScreenContainer style={s.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={s.topRow}>
        <Pressable onPress={prevStep} style={s.backBtn}>
          <ChevronLeft size={22} color={DARK} strokeWidth={2.2} />
        </Pressable>
        <Text style={s.logo}>NEMUP</Text>
        <View style={{ width: 38 }} />
      </View>

      <Text style={s.title}>
        Antes de empezar,{'\n'}cuéntanos quién eres.
      </Text>
      <Text style={s.subtitle}>Así personalizamos tu carrera.</Text>

      <Image
        source={require('@/assets/images/avatar.png')}
        contentFit="contain"
        style={s.avatar}
      />

      <Text style={s.nameLabel}>¿Cómo te llamas?</Text>

      <View style={[s.inputWrap, focused && s.inputFocused]}>
        <User size={18} color={focused ? PRIM : palette.grisClaro} strokeWidth={1.8} />
        <TextInput
          style={s.input}
          placeholder="Escribe tu nombre"
          placeholderTextColor="rgba(155,149,166,0.6)"
          value={state.data.name}
          onChangeText={setName}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize="words"
          cursorColor={PRIM}
          selectionColor={`${PRIM}44`}
          returnKeyType="done"
        />
      </View>

      <View style={{ flex: 1, minHeight: 40 }} />

      <View style={s.bottomRow}>
        <ProgressDots current={1} />
        <Pressable
          onPress={nextStep}
          disabled={!canContinue}
          style={[s.arrowBtn, !canContinue && { opacity: 0.35 }]}
        >
          <ArrowRight size={22} color={palette.blanco} strokeWidth={2.5} />
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: SM ? 4 : 8, paddingBottom: SM ? 6 : 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: palette.blanco, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  logo: { fontSize: 13, fontWeight: '900', color: PRIM, letterSpacing: 4 },

  title: {
    fontSize: SM ? 22 : 25, fontWeight: '700', color: DARK,
    textAlign: 'center', lineHeight: SM ? 30 : 34,
    paddingHorizontal: 28, marginBottom: 12,
  },
  subtitle: { fontSize: 14, fontWeight: '400', color: MED, textAlign: 'center', paddingHorizontal: 32 },

  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, alignSelf: 'center', marginTop: 32 },

  nameLabel: {
    fontSize: SM ? 15 : 16, fontWeight: '600', color: DARK,
    textAlign: 'center', marginTop: 32, marginBottom: 16,
  },

  inputWrap: {
    alignSelf: 'center', width: '85%', height: 56,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: palette.blanco, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 16, paddingHorizontal: 16,
  },
  inputFocused: { borderColor: PRIM, backgroundColor: palette.moradoBg },
  input:        { flex: 1, fontSize: 16, fontWeight: '500', color: DARK },

  bottomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 8, paddingBottom: SM ? 14 : 22,
  },
  arrowBtn: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: PRIM,
    alignItems: 'center', justifyContent: 'center',
  },
});
