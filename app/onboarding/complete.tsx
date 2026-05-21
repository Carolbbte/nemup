import { Colors } from '@/constants/Colors';
import { useOnboarding } from '@/contexts/OnboardingContext';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';

export default function CompleteScreen() {
  const { state, completeOnboarding } = useOnboarding();
  const [isLoading, setIsLoading] = React.useState(false);

  const handleComplete = async () => {
    try {
      setIsLoading(true);
      await completeOnboarding();
      // Navigate to home screen - this would be handled by navigation setup
    } catch (error) {
      console.error('Error completing onboarding:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
      {/* Confetti Animation Placeholders */}
      <View style={styles.confettiArea}>
        <View style={[styles.confetti, styles.c1]} />
        <View style={[styles.confetti, styles.c2]} />
        <View style={[styles.confetti, styles.c3]} />
        <View style={[styles.confetti, styles.c4]} />
        <View style={[styles.confetti, styles.c5]} />
      </View>

      {/* Done Icon */}
      <View style={styles.doneIcon}>
        <Text style={styles.doneIconText}>✨</Text>
      </View>

      <Text style={styles.title}>¡Listo para comenzar!</Text>
      <Text style={styles.subtitle}>
        Tu perfil está configurado. Ahora puedes subir apuntes y generar sesiones de estudio.
      </Text>

      {/* Profile Summary */}
      <View style={styles.summary}>
        <View style={styles.summarySection}>
          <Text style={styles.summaryLabel}>Tu perfil</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Nombre</Text>
          <Text style={styles.summaryValue}>{state.data.name}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Nivel</Text>
          <Text style={styles.summaryValue}>{state.data.curso}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Meta</Text>
          <Text style={[styles.summaryValue, styles.summaryValueHighlight]}>
            {state.data.goal}.0
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Ramos</Text>
          <Text style={styles.summaryValue}>{state.data.subjects.length} asignatura(s)</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Tiempo diario</Text>
          <Text style={styles.summaryValue}>{state.data.dailyCommitment}</Text>
        </View>
      </View>

      {/* CTA */}
      <View style={styles.ctaContainer}>
        <Pressable
          style={[styles.ctaButton, isLoading && styles.ctaButtonDisabled]}
          onPress={handleComplete}
          disabled={isLoading}
        >
          <Text style={styles.ctaButtonText}>
            {isLoading ? 'Cargando...' : 'Comenzar a estudiar'}
          </Text>
          <Text style={styles.ctaButtonArrow}>→</Text>
        </Pressable>

        <Text style={styles.footerText}>
          Podrás cambiar estos datos en cualquier momento desde ajustes
        </Text>
      </View>
    </ScrollView>
  </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.paper,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confettiArea: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    top: 0,
    left: 0,
  },
  confetti: {
    position: 'absolute',
    width: 8,
    height: 8,
  },
  c1: {
    backgroundColor: Colors.lime,
    top: '10%',
    left: '15%',
  },
  c2: {
    backgroundColor: Colors.accent,
    top: '8%',
    right: '15%',
    borderRadius: 4,
  },
  c3: {
    backgroundColor: Colors.yellow,
    top: '20%',
    left: '30%',
  },
  c4: {
    backgroundColor: Colors.sky,
    top: '15%',
    right: '25%',
    borderRadius: 4,
  },
  c5: {
    backgroundColor: Colors.lime,
    top: '30%',
    right: '10%',
  },
  doneIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.lime,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  doneIconText: {
    fontSize: 36,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    color: Colors.ink,
    lineHeight: 40,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.ink3,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
    maxWidth: 280,
  },
  summary: {
    width: '100%',
    backgroundColor: Colors.bgSoft,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  summarySection: {
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.muted,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  summaryKey: {
    fontSize: 13,
    color: Colors.ink3,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.ink,
  },
  summaryValueHighlight: {
    color: Colors.brand,
  },
  ctaContainer: {
    width: '100%',
    alignItems: 'center',
  },
  ctaButton: {
    width: '100%',
    backgroundColor: Colors.brand,
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  ctaButtonArrow: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  footerText: {
    fontSize: 12,
    color: Colors.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
