import { Colors } from '@/constants/Colors';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { TIME_COMMITMENTS } from '@/types/onboarding';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';

export default function CommitmentScreen() {
  const { state, setDailyCommitment, nextStep, prevStep } = useOnboarding();

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
        <Text style={styles.emoji}>⏱️</Text>
        <Text style={styles.title}>¿Cuánto tiempo diario?</Text>
        <Text style={styles.subtitle}>Elige tu compromiso diario de estudio</Text>

        {/* Time Options */}
        <View style={styles.timeList}>
          {TIME_COMMITMENTS.map((time) => (
            <Pressable
              key={time.id}
              onPress={() => setDailyCommitment(time.id)}
              style={[
                styles.timeCard,
                time.tag === 'RECOMENDADO' && styles.timeCardRecommended,
                state.data.dailyCommitment === time.id && styles.timeCardActive,
              ]}
            >
              <View
                style={[
                  styles.timeIcon,
                  state.data.dailyCommitment === time.id && styles.timeIconActive,
                ]}
              >
                <Text style={styles.timeIconText}>⏰</Text>
              </View>
              <View style={styles.timeInfo}>
                <View style={styles.timeAmountRow}>
                  <Text style={styles.timeAmount}>{time.amount}</Text>
                  {time.tag && (
                    <View style={styles.timeTag}>
                      <Text style={styles.timeTagText}>{time.tag}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.timeDesc}>{time.description}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoBold}>💡 Consejo:</Text>
          <Text style={styles.infoText}>
            Estudia regularmente. Mejor 15 minutos diarios que 1 hora una vez a la semana.
          </Text>
        </View>
      </View>

      {/* Continue Button */}
      <View style={styles.bottom}>
        <Pressable
          style={[styles.continueBtn, !state.data.dailyCommitment && styles.continueBtnDisabled]}
          onPress={nextStep}
          disabled={!state.data.dailyCommitment}
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
  timeList: {
    gap: 10,
    marginBottom: 16,
  },
  timeCard: {
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
  timeCardRecommended: {
    borderColor: 'rgba(91, 61, 245, 0.4)',
    backgroundColor: 'rgba(91, 61, 245, 0.05)',
  },
  timeCardActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brandSoft,
  },
  timeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.bgSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeIconActive: {
    backgroundColor: Colors.brand,
  },
  timeIconText: {
    fontSize: 16,
  },
  timeInfo: {
    flex: 1,
  },
  timeAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  timeAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink,
  },
  timeTag: {
    backgroundColor: Colors.brand,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  timeTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: 'white',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeDesc: {
    fontSize: 11,
    color: Colors.ink3,
  },
  infoBox: {
    backgroundColor: 'rgba(196, 248, 82, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 248, 82, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoBold: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink2,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 11,
    lineHeight: 16,
    color: Colors.ink3,
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
