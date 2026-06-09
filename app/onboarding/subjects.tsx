import { palette, semantic } from '@/theme/colors';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { SUBJECTS } from '@/types/onboarding';
import {
  ArrowRight, BookOpen, BookText, Calculator, Check, ChevronLeft,
  Dna, FlaskConical, Languages, Microscope, Scroll, Zap,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const SUBJECT_ICON_MAP: Record<string, LucideIcon> = {
  math:      Calculator,
  spanish:   BookText,
  english:   Languages,
  science:   Microscope,
  history:   Scroll,
  biology:   Dna,
  chemistry: FlaskConical,
  physics:   Zap,
};

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
            <ChevronLeft size={20} color={semantic.textPrimary} strokeWidth={2.5} />
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
        <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 12 }}>
          <BookOpen size={48} color={palette.morado} strokeWidth={1.5} />
        </View>
        <Text style={styles.title}>¿Qué ramos estudias?</Text>
        <Text style={styles.subtitle}>Selecciona tus asignaturas</Text>

        {/* Subject Grid */}
        <View style={styles.grid}>
          {SUBJECTS.map((subject) => {
            const active  = state.data.subjects.includes(subject.id);
            const SubIcon = SUBJECT_ICON_MAP[subject.id] ?? BookOpen;
            return (
              <Pressable
                key={subject.id}
                onPress={() => toggleSubject(subject.id)}
                style={[styles.subjectCard, active && styles.subjectCardActive]}
              >
                <View style={[styles.subjectEmoji, active && styles.subjectEmojiActive]}>
                  <SubIcon size={14} color={active ? palette.morado : semantic.textSecondary} strokeWidth={2} />
                </View>
                <Text style={styles.subjectName}>{subject.name}</Text>
                {active && (
                  <View style={styles.checkmark}>
                    <Check size={10} color={palette.blanco} strokeWidth={3} />
                  </View>
                )}
              </Pressable>
            );
          })}
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
          <ArrowRight size={16} color={palette.blanco} strokeWidth={2.5} />
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: semantic.background,
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
    color: semantic.textPrimary,
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
    backgroundColor: palette.crema,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: semantic.textPrimary,
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
    backgroundColor: palette.bordeClaro,
    borderRadius: 2,
  },
  dotActive: {
    backgroundColor: palette.morado,
  },
  dotDone: {
    backgroundColor: palette.morado,
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
    color: semantic.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: semantic.textSecondary,
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
    backgroundColor: semantic.surface,
    borderWidth: 1.5,
    borderColor: palette.bordeClaro,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    position: 'relative',
  },
  subjectCardActive: {
    borderColor: palette.morado,
    backgroundColor: palette.moradoBg,
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
    backgroundColor: palette.blanco,
  },
  subjectEmojiText: {
    fontSize: 14,
  },
  subjectName: {
    fontSize: 12,
    fontWeight: '600',
    color: semantic.textPrimary,
    textAlign: 'center',
  },
  checkmark: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 50,
    backgroundColor: palette.morado,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.blanco,
  },
  counter: {
    backgroundColor: palette.crema,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  counterText: {
    fontSize: 12,
    fontWeight: '600',
    color: semantic.textSecondary,
  },
  counterBold: {
    color: palette.morado,
    fontWeight: '700',
  },
  bottom: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  continueBtn: {
    width: '100%',
    backgroundColor: palette.morado,
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  continueBtnDisabled: {
    backgroundColor: palette.bordeClaro,
    opacity: 0.5,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.blanco,
  },
  continueBtnArrow: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.blanco,
  },
});
