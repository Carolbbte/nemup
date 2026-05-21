import { Colors } from '@/constants/Colors';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { GOAL_TYPES } from '@/types/onboarding';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';

export default function GoalTypeScreen() {
  const { state, setGoalType, nextStep, prevStep } = useOnboarding();

  return (
    <ScreenContainer style={styles.container}>
      {/* Status Bar */}
      <View style={styles.statusBar}>
        <Text style={styles.time}>9:41</Text>
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
        {[0, 1, 2, 3, 4, 5].map((i) => (
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
        <Text style={styles.emoji}>💡</Text>
        <Text style={styles.title}>¿Por qué estudias?</Text>
        <Text style={styles.subtitle}>Selecciona tu motivación principal</Text>

        {/* Reason Cards */}
        <View style={styles.reasonList}>
          {GOAL_TYPES.map((reason) => (
            <Pressable
              key={reason.id}
              onPress={() => setGoalType(reason.id)}
              style={[
                styles.reasonCard,
                state.data.goalType === reason.id && styles.reasonCardActive,
              ]}
            >
              <Text style={styles.reasonEmoji}>{reason.emoji}</Text>
              <View style={styles.reasonContent}>
                <Text style={styles.reasonTitle}>{reason.title}</Text>
                <Text style={styles.reasonDesc}>{reason.description}</Text>
              </View>
              <View
                style={[
                  styles.reasonRadio,
                  state.data.goalType === reason.id && styles.reasonRadioActive,
                ]}
              >
                {state.data.goalType === reason.id && (
                  <View style={styles.radioDot} />
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Continue Button */}
      <View style={styles.bottom}>
        <Pressable
          style={[styles.continueBtn, !state.data.goalType && styles.continueBtnDisabled]}
          onPress={nextStep}
          disabled={!state.data.goalType}
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
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  time: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink,
  },
  screenTop: {
    flexDirection: 'row',
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
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
    textAlign: 'center',
    marginTop: 16,
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
    marginBottom: 20,
  },
  reasonList: {
    gap: 10,
  },
  reasonCard: {
    backgroundColor: Colors.paper,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reasonCardActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brandSoft,
  },
  reasonEmoji: {
    fontSize: 24,
    lineHeight: 28,
  },
  reasonContent: {
    flex: 1,
  },
  reasonTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink,
    marginBottom: 2,
  },
  reasonDesc: {
    fontSize: 11,
    color: Colors.ink3,
    lineHeight: 16,
  },
  reasonRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.line2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reasonRadioActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brand,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'white',
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
