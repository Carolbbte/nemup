import ScreenContainer from '@/components/ScreenContainer';
import { palette, semantic } from '@/theme/colors';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { GOAL_TYPES } from '@/types/onboarding';
import {
  ArrowRight, ChevronLeft, ClipboardList, Lightbulb, Rocket, Star, TrendingUp,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const GOAL_TYPE_ICON: Record<string, LucideIcon> = {
  exam:     ClipboardList,
  improve:  TrendingUp,
  catchup:  Rocket,
  maintain: Star,
};

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
            <ChevronLeft size={20} color={semantic.textPrimary} strokeWidth={2.5} />
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
        <View style={{ alignItems: 'center', marginBottom: 12, marginTop: 16 }}>
          <Lightbulb size={48} color={palette.morado} strokeWidth={1.5} />
        </View>
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
              {(() => {
                const GoalIcon = GOAL_TYPE_ICON[reason.id] ?? ClipboardList;
                return <GoalIcon size={24} color={state.data.goalType === reason.id ? palette.morado : semantic.textSecondary} strokeWidth={1.8} />;
              })()}
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
  reasonList: {
    gap: 10,
  },
  reasonCard: {
    backgroundColor: semantic.surface,
    borderWidth: 1.5,
    borderColor: palette.bordeClaro,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reasonCardActive: {
    borderColor: palette.morado,
    backgroundColor: palette.moradoBg,
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
    color: semantic.textPrimary,
    marginBottom: 2,
  },
  reasonDesc: {
    fontSize: 11,
    color: semantic.textSecondary,
    lineHeight: 16,
  },
  reasonRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: palette.bordeMedio,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reasonRadioActive: {
    borderColor: palette.morado,
    backgroundColor: palette.morado,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.blanco,
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
