import { Colors } from '@/constants/Colors';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { CURSOS } from '@/types/onboarding';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';

export default function NameCursoScreen() {
  const { state, setName, setCurso, nextStep, prevStep } = useOnboarding();
  const [nameFocused, setNameFocused] = useState(false);

  const canContinue = state.data.name.trim() !== '' && state.data.curso !== '';

  return (
    <ScreenContainer style={styles.container}>
      {/* Status Bar */}
      <View style={styles.statusBar}>
        <Text style={styles.time}>9:41</Text>
        <View style={styles.statusRight}>
          <Text style={styles.statusIcon}>📶</Text>
          <Text style={styles.statusIcon}>🔋</Text>
        </View>
      </View>

      {/* Screen Top */}
      <View style={styles.screenTop}>
        <Pressable onPress={prevStep}>
          <View style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹</Text>
          </View>
        </Pressable>
      </View>

      {/* Progress Dots */}
      <View style={styles.progressDots}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < state.currentStep && styles.dotDone,
              i === state.currentStep && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.emoji}>👋</Text>
        <Text style={styles.title}>¿Cuál es tu nombre?</Text>
        <Text style={styles.subtitle}>Personalizaremos tu experiencia</Text>

        {/* Name Input */}
        <View
          style={[
            styles.inputField,
            nameFocused && styles.inputFieldFocused,
          ]}
        >
          <Text style={styles.inputIcon}>👤</Text>
          <TextInput
            style={styles.inputText}
            placeholder="Tu nombre"
            placeholderTextColor={Colors.muted}
            value={state.data.name}
            onChangeText={setName}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
          />
        </View>

        {/* Curso Selection */}
        <Text style={styles.sectionLabel}>Curso</Text>
        <View style={styles.cursoGrid}>
          {CURSOS.map((curso) => (
            <Pressable
              key={curso}
              onPress={() => setCurso(curso)}
              style={[
                styles.cursoCard,
                state.data.curso === curso && styles.cursoCardActive,
              ]}
            >
              <Text
                style={[
                  styles.cursoText,
                  state.data.curso === curso && styles.cursoTextActive,
                ]}
              >
                {curso}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Continue Button */}
      <View style={styles.bottom}>
        <Pressable
          style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
          onPress={nextStep}
          disabled={!canContinue}
        >
          <Text style={styles.continueBtnText}>Siguiente</Text>
          <Text style={styles.continueBtnArrow}>→</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.paper,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  time: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink,
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusIcon: {
    fontSize: 12,
  },
  screenTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.bgSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.ink,
  },
  progressDots: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dot: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.line,
    borderRadius: 2,
  },
  dotActive: {
    backgroundColor: Colors.brand,
  },
  dotDone: {
    backgroundColor: Colors.brand,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    color: Colors.ink,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.ink3,
    textAlign: 'center',
    marginBottom: 32,
  },
  inputField: {
    backgroundColor: Colors.paper,
    borderWidth: 2,
    borderColor: Colors.line,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  inputFieldFocused: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brandSoft,
  },
  inputIcon: {
    fontSize: 20,
  },
  inputText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ink,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.muted,
    marginBottom: 8,
  },
  cursoGrid: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cursoCard: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: Colors.paper,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cursoCardActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brandSoft,
  },
  cursoText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink,
  },
  cursoTextActive: {
    color: Colors.brand,
    fontWeight: '700',
  },
  bottom: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  continueBtn: {
    width: '100%',
    backgroundColor: Colors.brand,
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  continueBtnDisabled: {
    backgroundColor: Colors.line,
    opacity: 0.5,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  continueBtnArrow: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
});
