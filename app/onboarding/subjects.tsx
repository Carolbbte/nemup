import { Colors } from '@/constants/Colors';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { SUBJECTS } from '@/types/onboarding';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';

export default function SubjectsScreen() {
  const { state, setSubjects, nextStep, prevStep } = useOnboarding();

  const toggleSubject = (id: string) => {
    const newSubjects = state.data.subjects.includes(id)
      ? state.data.subjects.filter(s => s !== id)
      : [...state.data.subjects, id];
    setSubjects(newSubjects);
  };

  const canContinue = state.data.subjects.length > 0;

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
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
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
        <Text style={styles.emoji}>📚</Text>
        <Text style={styles.title}>¿Qué ramos estudias?</Text>
        <Text style={styles.subtitle}>Selecciona tus asignaturas</Text>

        {/* Subject Grid */}
        <View style={styles.grid}>
          {SUBJECTS.map((subject) => (
            <Pressable
              key={subject.id}
              onPress={() => toggleSubject(subject.id)}
              style={[
                styles.subjectCard,
                state.data.subjects.includes(subject.id) && styles.subjectCardActive,
              ]}
            >
              <View
                style={[
                  styles.subjectEmoji,
                  state.data.subjects.includes(subject.id) && styles.subjectEmojiActive,
                ]}
              >
                <Text style={styles.subjectEmojiText}>{subject.emoji}</Text>
              </View>
              <Text style={styles.subjectName}>{subject.name}</Text>
              {state.data.subjects.includes(subject.id) && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {/* Counter */}
        {state.data.subjects.length > 0 && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              <Text style={styles.counterBold}>{state.data.subjects.length}</Text> ramo
              {state.data.subjects.length !== 1 ? 's' : ''} seleccionado
              {state.data.subjects.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  subjectCard: {
    width: '48%',
    backgroundColor: Colors.paper,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    position: 'relative',
  },
  subjectCardActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brandSoft,
  },
  subjectEmoji: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  subjectEmojiActive: {
    backgroundColor: 'white',
  },
  subjectEmojiText: {
    fontSize: 14,
  },
  subjectName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink,
    textAlign: 'center',
  },
  checkmark: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 50,
    backgroundColor: Colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'white',
  },
  counter: {
    backgroundColor: Colors.bgSoft,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  counterText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink3,
  },
  counterBold: {
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
