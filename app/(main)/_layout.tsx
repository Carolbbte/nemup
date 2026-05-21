import { useOnboarding } from '@/contexts/OnboardingContext';
import OnboardingNavigator from '../onboarding';
import MainTabs from './_main-tabs';

export default function MainGroupLayout() {
  const { state } = useOnboarding();

  if (!state.data.completed) {
    return <OnboardingNavigator />;
  }

  return <MainTabs />;
}
