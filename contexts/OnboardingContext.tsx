import { DEFAULT_ONBOARDING_DATA, OnboardingData, OnboardingState } from '@/types/onboarding';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

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

const ONBOARDING_STORAGE_KEY = 'nemup_onboarding_data';

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<OnboardingState>({
    data: DEFAULT_ONBOARDING_DATA,
    currentStep: 0,
    isLoading: false,
    isInitialized: false,
    error: null,
  });

  // Load onboarding data from storage on mount
  useEffect(() => {
    const loadOnboardingData = async () => {
      try {
        const savedData = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
        if (savedData) {
          const parsedData = JSON.parse(savedData);
          setState(prev => ({ ...prev, data: parsedData, isInitialized: true }));
        } else {
          setState(prev => ({ ...prev, isInitialized: true }));
        }
      } catch (error) {
        console.warn('Failed to load onboarding data from storage:', error);
        setState(prev => ({ ...prev, isInitialized: true }));
      }
    };

    loadOnboardingData();
  }, []);

  const updateData = (updates: Partial<OnboardingData>) => {
    setState(prev => ({
      ...prev,
      data: { ...prev.data, ...updates },
    }));
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
      currentStep: Math.min(prev.currentStep + 1, 4),
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
      currentStep: Math.max(0, Math.min(step, 4)),
    }));
  };

  const completeOnboarding = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      // Validate data
      if (!state.data.name || !state.data.curso || !state.data.dailyCommitment) {
        throw new Error('Please fill in all required fields');
      }

      const completedData = { ...state.data, completed: true };
      
      // Save to AsyncStorage
      try {
        await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(completedData));
      } catch (storageError) {
        console.warn('Failed to save onboarding data to storage:', storageError);
      }

      setState(prev => ({
        ...prev,
        data: completedData,
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

  const resetOnboarding = () => {
    setState({
      data: DEFAULT_ONBOARDING_DATA,
      currentStep: 0,
      isLoading: false,
      isInitialized: true,
      error: null,
    });
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
