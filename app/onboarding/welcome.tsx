import React from 'react';
import { View, Text, Pressable, StyleSheet, ImageBackground } from 'react-native';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { Colors } from '@/constants/Colors';

export default function WelcomeScreen() {
  const { nextStep } = useOnboarding();

  return (
    <View style={styles.container}>
      <ImageBackground
        source={{ uri: 'https://via.placeholder.com/400x800/5B3DF5/5B3DF5' }}
        style={styles.background}
      >
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>N</Text>
            </View>
            <Text style={styles.logoLabel}>NemUp</Text>
          </View>

          {/* Hero Section */}
          <View style={styles.hero}>
            <Text style={styles.emoji}>🚀</Text>
            <Text style={styles.title}>
              Aprende<Text style={styles.titleGradient}> mejor</Text>
            </Text>
            <Text style={styles.subtitle}>
              Sube tus apuntes y genera sesiones de estudio con IA
            </Text>

            {/* Features */}
            <View style={styles.features}>
              <View style={styles.featureItem}>
                <View style={styles.featureBadge}>
                  <Text style={styles.featureEmoji}>📱</Text>
                </View>
                <Text style={styles.featureText}>Estudio personalizado</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureBadge}>
                  <Text style={styles.featureEmoji}>✨</Text>
                </View>
                <Text style={styles.featureText}>Con inteligencia artificial</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureBadge}>
                  <Text style={styles.featureEmoji}>📈</Text>
                </View>
                <Text style={styles.featureText}>Mejora tus notas</Text>
              </View>
            </View>
          </View>

          {/* CTA Button */}
          <View style={styles.buttonContainer}>
            <Pressable
              style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
              onPress={nextStep}
            >
              <Text style={styles.ctaButtonText}>Comenzar</Text>
              <Text style={styles.ctaButtonArrow}>→</Text>
            </Pressable>
            <Text style={styles.loginText}>
              ¿Ya tienes cuenta? <Text style={styles.loginLink}>Inicia sesión</Text>
            </Text>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 40,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.brand,
  },
  logoLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  hero: {
    alignItems: 'center',
  },
  emoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: 'white',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 42,
  },
  titleGradient: {
    color: Colors.lime,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  features: {
    gap: 12,
    width: '100%',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  featureBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureEmoji: {
    fontSize: 14,
  },
  featureText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'white',
    flex: 1,
  },
  buttonContainer: {
    gap: 12,
  },
  ctaButton: {
    width: '100%',
    backgroundColor: 'white',
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  ctaButtonPressed: {
    opacity: 0.9,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  ctaButtonArrow: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  loginText: {
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  loginLink: {
    color: Colors.lime,
    fontWeight: '600',
  },
});
