import React from 'react';
import { Text, Pressable, StyleSheet, View } from 'react-native';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { Colors } from '@/constants/Colors';
import ScreenContainer from '@/components/ScreenContainer';
import { LinearGradient } from 'expo-linear-gradient';

const FEATURES = [
  { emoji: '⚡', label: 'Sesiones desde tus apuntes' },
  { emoji: '🤖', label: 'Tutor IA disponible 24/7' },
  { emoji: '🏆', label: 'Compite con tu curso' },
];

export default function WelcomeScreen() {
  const { nextStep } = useOnboarding();

  return (
    <ScreenContainer style={styles.container}>
      <LinearGradient
        colors={['#080712', '#140F32', '#361E7C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      >
        <View style={styles.overlay} />
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>N</Text>
            </View>
            <Text style={styles.logoLabel}>NemUp</Text>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroIconWrapper}>
              <View style={styles.heroIconBackground} />
              <Text style={styles.heroIcon}>📈</Text>
            </View>
            <Text style={styles.title}>
              Sube tu <Text style={styles.titleAccent}>NEM.</Text>{'\n'}
              <Text style={styles.titleGradient}>Cambia tu futuro.</Text>
            </Text>
            <Text style={styles.subtitle}>
              La app de estudio con IA hecha para estudiantes chilenos.
            </Text>

            <View style={styles.features}>
              {FEATURES.map((feature) => (
                <View key={feature.label} style={styles.featureItem}>
                  <View style={styles.featureBadge}>
                    <Text style={styles.featureEmoji}>{feature.emoji}</Text>
                  </View>
                  <Text style={styles.featureText}>{feature.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <Pressable
              style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
              onPress={nextStep}
            >
              <Text style={styles.ctaButtonText}>Empezar gratis</Text>
              <Text style={styles.ctaButtonArrow}>→</Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080712',
  },
  background: {
    flex: 1,
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 44,
    paddingBottom: 36,
    justifyContent: 'space-between',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#5B7AFF',
  },
  logoLabel: {
    marginLeft: 10,
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  hero: {
    alignItems: 'center',
  },
  heroIconWrapper: {
    width: 112,
    height: 112,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  heroIconBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroIcon: {
    fontSize: 44,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 42,
    marginBottom: 16,
  },
  titleAccent: {
    color: '#C4F852',
  },
  titleGradient: {
    color: '#F0B678',
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    maxWidth: 340,
  },
  features: {
    width: '100%',
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  featureBadge: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureEmoji: {
    fontSize: 18,
  },
  featureText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F9FBFF',
    flex: 1,
  },
  buttonContainer: {
    width: '100%',
  },
  ctaButton: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 8,
  },
  ctaButtonPressed: {
    opacity: 0.92,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0B0B18',
  },
  ctaButtonArrow: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0B0B18',
  },
  loginText: {
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 14,
  },
  loginLink: {
    color: '#C4F852',
    fontWeight: '700',
  },
});
