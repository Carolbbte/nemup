import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingData, OnboardingState, DEFAULT_ONBOARDING_DATA } from '@/types/onboarding';

interface OnboardingContextType {
  state: OnboardingState;
  setName: (name: string) => void;
  setCurso: (curso: string) => void;
  setGoal: (goal: number) => void;
  setSubjects: (subjects: string[]) => void;
  setGoalType: (goalType: string) => void;
  setDailyCommitment: (commitment: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => void;
}

export const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<OnboardingState>({
    data: DEFAULT_ONBOARDING_DATA,
    currentStep: 0,
    isLoading: true,
    error: null,
  });

  // Load onboarding data from AsyncStorage
  useEffect(() => {
    const loadData = async () => {
      try {
        const stored = await AsyncStorage.getItem('onboarding_data');
        const completed = await AsyncStorage.getItem('onboarding_completed');

        if (stored && completed === 'true') {
          setState(prev => ({
            ...prev,
            isLoading: false,
            data: { ...JSON.parse(stored), completed: true },
          }));
        } else {
          setState(prev => ({
            ...prev,
            isLoading: false,
          }));
        }
      } catch (error) {
        console.error('Error loading onboarding data:', error);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Error loading data',
        }));
      }
    };

    loadData();
  }, []);

  const updateData = async (updates: Partial<OnboardingData>) => {
    const newData = { ...state.data, ...updates };
    setState(prev => ({
      ...prev,
      data: newData,
    }));
    try {
      await AsyncStorage.setItem('onboarding_data', JSON.stringify(newData));
    } catch (error) {
      console.error('Error saving onboarding data:', error);
    }
  };

  const setName = (name: string) => {
    updateData({ name });
  };

  const setCurso = (curso: string) => {
    updateData({ curso });
  };

  const setGoal = (goal: number) => {
    updateData({ goal });
  };

  const setSubjects = (subjects: string[]) => {
    updateData({ subjects });
  };

  const setGoalType = (goalType: string) => {
    updateData({ goalType });
  };

  const setDailyCommitment = (dailyCommitment: string) => {
    updateData({ dailyCommitment });
  };

  const nextStep = () => {
    setState(prev => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, 6),
    }));
  };

  const prevStep = () => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 0),
    }));
  };

  const goToStep = (step: number) => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(0, Math.min(step, 6)),
    }));
  };

  const completeOnboarding = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      // Validate data
      if (!state.data.name || !state.data.curso || state.data.subjects.length === 0) {
        throw new Error('Please fill in all required fields');
      }

      await AsyncStorage.setItem('onboarding_completed', 'true');
      await AsyncStorage.setItem('onboarding_data', JSON.stringify(state.data));

      setState(prev => ({
        ...prev,
        data: { ...prev.data, completed: true },
        isLoading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Error completing onboarding',
      }));
      throw error;
    }
  };

  const resetOnboarding = async () => {
    try {
      await AsyncStorage.removeItem('onboarding_data');
      await AsyncStorage.removeItem('onboarding_completed');
      setState({
        data: DEFAULT_ONBOARDING_DATA,
        currentStep: 0,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error resetting onboarding:', error);
    }
  };

  return (
    <OnboardingContext.Provider
      value={{
        state,
        setName,
        setCurso,
        setGoal,
        setSubjects,
        setGoalType,
        setDailyCommitment,
        nextStep,
        prevStep,
        goToStep,
        completeOnboarding,
        resetOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
};
