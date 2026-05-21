import { useOnboarding } from '@/contexts/OnboardingContext';
import { View } from 'react-native';
import CommitmentScreen from './commitment';
import CompleteScreen from './complete';
import GoalScreen from './goal';
import NameCursoScreen from './name-curso';
import WelcomeScreen from './welcome';

export default function OnboardingNavigator() {
  const { state } = useOnboarding();

  const renderScreen = () => {
    switch (state.currentStep) {
      case 0:
        return <WelcomeScreen />;
      case 1:
        return <NameCursoScreen />;
      case 2:
        return <GoalScreen />;
      case 3:
        return <CommitmentScreen />;
      case 4:
        return <CompleteScreen />;
      default:
        return <WelcomeScreen />;
    }
  };

  return <View style={{ flex: 1 }}>{renderScreen()}</View>;
}
