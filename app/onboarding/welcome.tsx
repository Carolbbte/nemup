import { useOnboarding } from '@/contexts/OnboardingContext';
import { palette } from '@/theme/colors';
import { Image } from 'expo-image';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BTN_COLOR    = palette.morado;
const LINK_COLOR   = palette.morado;
const BODY_COLOR   = palette.grisMedio;
const DOT_ACTIVE   = palette.morado;
const DOT_INACTIVE = palette.moradoBg;

function StepIndicator() {
  return (
    <View style={ind.row}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={[ind.dot, i === 0 ? ind.active : ind.inactive]} />
      ))}
    </View>
  );
}
const ind = StyleSheet.create({
  row:      { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  dot:      { borderRadius: 99 },
  active:   { width: 24, height: 8,  backgroundColor: DOT_ACTIVE },
  inactive: { width: 8,  height: 8,  backgroundColor: DOT_INACTIVE },
});

export default function WelcomeScreen() {
  const { nextStep } = useOnboarding();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.blanco} />

      <View style={s.stack}>
        <Image
          source={require('@/assets/images/welcome.png')}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
        />

        {/* Fade overlay — plain View, no gradient */}
        <View style={s.fadeOverlay} pointerEvents="none" />

        <View style={s.overlay}>
          <View style={s.btnWrap}>
            <Pressable
              onPress={nextStep}
              style={({ pressed }) => [s.btn, pressed && { opacity: 0.9 }]}
              accessibilityRole="button"
            >
              <Text style={s.btnText}>Comenzar</Text>
            </Pressable>
          </View>

          <View style={s.loginRow}>
            <Text style={s.loginBody}>¿Ya tienes cuenta? </Text>
            <Pressable onPress={() => {}}>
              <Text style={s.loginLink}>Inicia sesión</Text>
            </Pressable>
          </View>

          <View style={s.dotsWrap}>
            <StepIndicator />
          </View>

          <View style={{ height: 24 }} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: palette.blanco },
  stack:       { flex: 1 },
  fadeOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.0)', bottom: 0, top: '44%' },
  overlay:     { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  btnWrap:     { marginHorizontal: 28, borderRadius: 30, overflow: 'hidden' },
  btn:         { height: 58, borderRadius: 30, backgroundColor: BTN_COLOR, alignItems: 'center', justifyContent: 'center' },
  btnText:     { fontSize: 20, fontWeight: '700', color: palette.blanco },
  loginRow:    { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  loginBody:   { fontSize: 16, color: BODY_COLOR },
  loginLink:   { fontSize: 16, fontWeight: '600', color: LINK_COLOR },
  dotsWrap:    { marginTop: 20, alignItems: 'center' },
});
