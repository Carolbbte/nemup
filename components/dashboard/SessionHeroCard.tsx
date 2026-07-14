import { useDailySession } from '@/contexts/DailySessionContext';
import { Dimensions, StyleSheet, View } from 'react-native';
import { palette, paletteExtras } from '@/theme/colors';
import HeroCompleteState from './HeroCompleteState';
import HeroEmptyState from './HeroEmptyState';
import HeroInProgressState from './HeroInProgressState';
import HeroReadyState from './HeroReadyState';

// Same breakpoint home.tsx uses — replicated locally since this component
// doesn't receive screen-size context as a prop.
const { height: SCREEN_H } = Dimensions.get('window');
const SM = SCREEN_H < 740;

export type SessionInfo = {
  subject: string;
  topic: string;
  xpReward: number;
  estimatedDuration: number;
};

type Props = {
  hasSession: boolean;          // whether a session has been uploaded today
  session: SessionInfo | null;  // info of today's session (subject, topic, xp, duration)
  onNavigate: () => void;       // → /modals/session
  onUpload: () => void;         // → /modals/upload
};

export default function SessionHeroCard({ hasSession, session, onNavigate, onUpload }: Props) {
  const { dailySession, getNextPendingMode, isFullyComplete } = useDailySession();

  const { completedModes, streak } = dailySession;
  const completedCount = Object.values(completedModes).filter(Boolean).length;
  const nextMode = getNextPendingMode();

  // Determine which state to render
  const isEmpty      = !hasSession;
  const isComplete   = hasSession && isFullyComplete;
  const isInProgress = hasSession && !isFullyComplete && completedCount > 0;
  const isReady      = hasSession && !isFullyComplete && completedCount === 0;

  const renderContent = () => {
    if (isEmpty) {
      return (
        <HeroEmptyState onUpload={onUpload} />
      );
    }
    if (isReady) {
      return (
        <HeroReadyState
          session={session}
          nextMode={nextMode}
          onStart={onNavigate}
        />
      );
    }
    if (isInProgress && nextMode) {
      return (
        <HeroInProgressState
          session={session}
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
          onNewSession={onUpload}
        />
      );
    }
    // Fallback — shouldn't happen, but guard
    return <HeroEmptyState onUpload={onUpload} />;
  };

  return (
    <View style={s.card}>
      {/* Decorations */}
      <View style={s.glow} pointerEvents="none" />
      {renderContent()}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: paletteExtras.moradoCardBg,
    borderRadius: 24,
    // Was a flat 16/10 — tightened (more so under SM) as part of shrinking
    // the "sesión lista" state to fit without scrolling.
    padding: SM ? 8 : 10,
    borderWidth: 1,
    borderColor: paletteExtras.moradoBorde,
    marginBottom: SM ? 6 : 8,
    overflow: 'hidden',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: palette.verdeXP + '1A',
  },
});
