import { useOnboarding } from '@/contexts/OnboardingContext';
import OnboardingNavigator from '../onboarding';
import MainTabs from './_main-tabs';

export default function MainGroupLayout() {
  const { state } = useOnboarding();

  // Wait for AsyncStorage to load before deciding which navigator to show.
  // Without this guard, MainGroupLayout briefly renders <OnboardingNavigator />
  // while isInitialized is false, then switches to <MainTabs /> — causing
  // MainTabs to remount and potentially resetting the navigation stack.
  // On Android this race can dismiss an open modal (e.g. upload) when the
  // native file-picker Activity returns.
  if (!state.isInitialized) {
    return null;
  }

  if (!state.data.completed) {
    return <OnboardingNavigator />;
  }

  return <MainTabs />;
}
