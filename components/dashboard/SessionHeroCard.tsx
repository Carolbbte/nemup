import { useDailySession } from '@/contexts/DailySessionContext';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import HeroCompleteState from './HeroCompleteState';
import HeroEmptyState from './HeroEmptyState';
import HeroInProgressState from './HeroInProgressState';
import HeroReadyState from './HeroReadyState';

type Props = {
  hasSession: boolean;   // whether a session has been uploaded today
  onNavigate: () => void; // → /modals/session
  onUpload: () => void;   // → /modals/upload
};

export default function SessionHeroCard({ hasSession, onNavigate, onUpload }: Props) {
  const router = useRouter();
  const { dailySession, getNextPendingMode, isFullyComplete } = useDailySession();

  const { completedModes, streak } = dailySession;
  const completedCount = Object.values(completedModes).filter(Boolean).length;
  const nextMode = getNextPendingMode();

  // Determine which state to render
  const isEmpty      = !hasSession;
  const isComplete   = hasSession && isFullyComplete;
  const isInProgress = hasSession && !isFullyComplete && completedCount > 0;
  const isReady      = hasSession && !isFullyComplete && completedCount === 0;

  // Whether streak advanced today: streak > 0 and lastCompleteDate === today
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const streakAdvancedToday = dailySession.lastCompleteDate === today && streak > 0;

  const renderContent = () => {
    if (isEmpty) {
      return (
        <HeroEmptyState
          onUpload={onUpload}
          onHowItWorks={() => router.push('/onboarding/how-it-works' as any)}
        />
      );
    }
    if (isReady) {
      return <HeroReadyState onStart={onNavigate} />;
    }
    if (isInProgress && nextMode) {
      return (
        <HeroInProgressState
          completedModes={completedModes}
          nextMode={nextMode}
          completedCount={completedCount}
          onContinue={onNavigate}
        />
      );
    }
    if (isComplete) {
      return (
        <HeroCompleteState
          streak={streak}
          streakAdvancedToday={streakAdvancedToday}
          onViewSummary={() => router.push('/session-complete' as any)}
        />
      );
    }
    // Fallback — shouldn't happen, but guard
    return <HeroEmptyState onUpload={onUpload} onHowItWorks={() => router.push('/onboarding/how-it-works' as any)} />;
  };

  return (
    <View style={s.card}>
      {renderContent()}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 0.5,
    borderColor: '#E8E5DC',
    marginBottom: 10,
  },
});
