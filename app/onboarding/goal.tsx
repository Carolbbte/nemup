import { Colors } from '@/constants/Colors';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';

export default function GoalScreen() {
  const { state, setGoal, nextStep, prevStep } = useOnboarding();

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
        <Text style={styles.emoji}>🎯</Text>
        <Text style={styles.title}>¿Cuál es tu meta?</Text>
        <Text style={styles.subtitle}>Nota que deseas alcanzar</Text>

        {/* Current vs Goal Cards */}
        <View style={styles.currentGoalRow}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Actual</Text>
            <Text style={styles.cardValue}>4.0</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Meta</Text>
            <Text style={[styles.cardValue, styles.cardValueGoal]}>
              {state.data.goal}
            </Text>
          </View>
        </View>

        {/* Slider */}
        <View style={styles.sliderContainer}>
          <Text style={styles.sliderLabel}>Ajusta tu meta</Text>
          <View style={styles.sliderTrack}>
            <View
              style={[
                styles.sliderFill,
                {
                  width: `${(state.data.goal / 7) * 100}%`,
                },
              ]}
            />
            <View
              style={[
                styles.sliderThumb,
                {
                  left: `${(state.data.goal / 7) * 100}%`,
                },
              ]}
            />
          </View>
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderMinMax}>4.0</Text>
            <Text style={styles.sliderMinMax}>7.0</Text>
          </View>
        </View>

        {/* Preset Buttons */}
        <View style={styles.presets}>
          {[4, 5, 6, 7].map((preset) => (
            <Pressable
              key={preset}
              onPress={() => setGoal(preset)}
              style={[
                styles.presetBtn,
                state.data.goal === preset && styles.presetBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.presetText,
                  state.data.goal === preset && styles.presetTextActive,
                ]}
              >
                {preset}.0
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Motivator */}
        <View style={styles.motivator}>
          <Text style={styles.motivatorEmoji}>💪</Text>
          <Text style={styles.motivatorText}>
            <Text style={styles.motivatorBold}>¡Lo lograras!</Text> Estudia consistentemente y llegarás a tu meta
          </Text>
        </View>
      </View>

      {/* Continue Button */}
      <View style={styles.bottom}>
        <Pressable style={styles.continueBtn} onPress={nextStep}>
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
    marginBottom: 24,
  },
  currentGoalRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.bgSoft,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.muted,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink,
    lineHeight: 28,
  },
  cardValueGoal: {
    background: 'linear-gradient(135deg, #5B3DF5, #FF5B9F)',
    color: Colors.brand,
  },
  sliderContainer: {
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  sliderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink2,
    marginBottom: 12,
  },
  sliderTrack: {
    height: 7,
    backgroundColor: Colors.bgSoft,
    borderRadius: 4,
    position: 'relative',
    marginBottom: 12,
  },
  sliderFill: {
    height: '100%',
    backgroundColor: Colors.brand,
    borderRadius: 4,
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'white',
    borderWidth: 3,
    borderColor: Colors.brand,
    top: -6.5,
    marginLeft: -10,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 10,
    color: Colors.muted,
  },
  sliderMinMax: {
    fontSize: 10,
    color: Colors.muted,
    fontWeight: '500',
  },
  presets: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  presetBtn: {
    backgroundColor: Colors.paper,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  presetBtnActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  presetText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.ink3,
  },
  presetTextActive: {
    color: 'white',
  },
  motivator: {
    backgroundColor: 'rgba(91, 61, 245, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(91, 61, 245, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  motivatorEmoji: {
    fontSize: 16,
    marginTop: 2,
  },
  motivatorText: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.ink2,
    flex: 1,
  },
  motivatorBold: {
    fontWeight: '700',
    color: Colors.brand,
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
