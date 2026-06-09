import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DAILY_SESSION_LOGIC } from '@/config/features';

const STORAGE_KEY = 'nemup_daily_session_v2';

export type DailyMode = 'mision' | 'quiz' | 'tarjetas';

const CANON_ORDER: DailyMode[] = ['mision', 'quiz', 'tarjetas'];

const MODE_LABELS: Record<DailyMode, string> = {
  mision:   'Misión',
  quiz:     'Quiz',
  tarjetas: 'Tarjetas',
};

interface DailySessionData {
  date: string;                            // YYYY-MM-DD local
  completedModes: Record<DailyMode, boolean>;
  streak: number;                          // consecutive days all 3 modes complete
  lastCompleteDate: string;                // last YYYY-MM-DD when all 3 were done
}

const DEFAULT_DATA: DailySessionData = {
  date: '',
  completedModes: { mision: false, quiz: false, tarjetas: false },
  streak: 0,
  lastCompleteDate: '',
};

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getYesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DailySessionContextType {
  dailySession: DailySessionData;
  markModeComplete: (mode: DailyMode) => void;
  getNextPendingMode: () => DailyMode | null;
  getModeLabel: (mode: DailyMode) => string;
  isFullyComplete: boolean;
}

const DailySessionContext = createContext<DailySessionContextType | undefined>(undefined);

export const DailySessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<DailySessionData>(DEFAULT_DATA);

  useEffect(() => {
    (async () => {
      const today = getTodayStr();
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          const fresh = { ...DEFAULT_DATA, date: today };
          setSession(fresh);
          return;
        }
        const stored: DailySessionData = JSON.parse(raw);
        if (stored.date === today) {
          setSession(stored);
          return;
        }
        // New day — preserve streak only if yesterday was the last complete date
        const yesterday = getYesterdayStr();
        const updated: DailySessionData = {
          ...stored,
          date: today,
          completedModes: { mision: false, quiz: false, tarjetas: false },
          streak: stored.lastCompleteDate === yesterday ? stored.streak : 0,
        };
        setSession(updated);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      } catch {
        setSession({ ...DEFAULT_DATA, date: today });
      }
    })();
  }, []);

  const markModeComplete = useCallback((mode: DailyMode) => {
    if (!DAILY_SESSION_LOGIC) return;
    setSession(prev => {
      const today = getTodayStr();
      const newModes = { ...prev.completedModes, [mode]: true };
      const allDone = CANON_ORDER.every(m => newModes[m]);
      const firstTimeToday = allDone && prev.lastCompleteDate !== today;
      const updated: DailySessionData = {
        ...prev,
        date: today,
        completedModes: newModes,
        streak: firstTimeToday ? prev.streak + 1 : prev.streak,
        lastCompleteDate: firstTimeToday ? today : prev.lastCompleteDate,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const getNextPendingMode = useCallback((): DailyMode | null => {
    return CANON_ORDER.find(m => !session.completedModes[m]) ?? null;
  }, [session.completedModes]);

  const getModeLabel = (mode: DailyMode) => MODE_LABELS[mode];

  const isFullyComplete = CANON_ORDER.every(m => session.completedModes[m]);

  return (
    <DailySessionContext.Provider value={{
      dailySession: session,
      markModeComplete,
      getNextPendingMode,
      getModeLabel,
      isFullyComplete,
    }}>
      {children}
    </DailySessionContext.Provider>
  );
};

export const useDailySession = () => {
  const ctx = useContext(DailySessionContext);
  if (!ctx) throw new Error('useDailySession must be used within DailySessionProvider');
  return ctx;
};
