import { useOnboarding } from '@/contexts/OnboardingContext';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import CompleteScreen from './complete';
import GoalScreen from './goal';
import HowItWorksScreen from './how-it-works';
import NameCursoScreen from './name-curso';
import ProfileScreen from './profile';
import VehicleAssignedScreen from './vehicle-assigned';
import WelcomeScreen from './welcome';

const SCREENS = [
  WelcomeScreen,
  ProfileScreen,
  HowItWorksScreen,
  NameCursoScreen,
  GoalScreen,
  VehicleAssignedScreen,
  CompleteScreen,
];

export default function OnboardingNavigator() {
  const { state } = useOnboarding();
  const Screen = SCREENS[state.currentStep] ?? WelcomeScreen;

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        key={state.currentStep}
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(160)}
        style={{ flex: 1 }}
      >
        <Screen />
      </Animated.View>
    </View>
  );
}
