import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * Missions library.
 *
 * Persistent, local-first store of every study session ("misión") the user
 * has generated, so they can resume an in-progress one exactly where they
 * left off, or replay a completed one as review.
 *
 * Design note (offline-first, like Duolingo/Brilliant): the device keeps the
 * source-of-truth cache in AsyncStorage. Everything the UI reads goes through
 * this context, so a future backend sync (per authenticated user) can be
 * layered in here — inside addOrUpdateMission / updateMissionProgress — without
 * touching any screen.
 *
 * "Activating" a mission (resume or replay) reuses the EXISTING session-player
 * machinery: we simply hydrate the active-session AsyncStorage slots that
 * upload.tsx already writes (nemup_last_session / _id / _key / skill_path /
 * desafio / session_progress), then the caller navigates to the player, which
 * loads them on focus exactly as it does for a freshly generated session.
 */

const MISSIONS_KEY = 'nemup_missions_v1';

// Active-session slots read by the session player (session.tsx) on focus.
const ACTIVE_SESSION_KEY      = 'nemup_session_key';
const ACTIVE_LAST_SESSION     = 'nemup_last_session';
const ACTIVE_LAST_SESSION_ID  = 'nemup_last_session_id';
const ACTIVE_SKILL_PATH       = 'nemup_skill_path';
const ACTIVE_DESAFIO          = 'nemup_desafio_session';
const ACTIVE_SESSION_PROGRESS = 'nemup_session_progress';

export type MissionStatus = 'ready' | 'in_progress' | 'completed';

export interface MissionProgress {
  missionCompleted: boolean;
  quizCompleted: boolean;
  flashcardsCompleted: boolean;
  sessionCompleted: boolean;
}

export interface MissionRecord {
  id: string;                 // sessionId (fallback: sessionKey)
  sessionKey: string;         // per-session key that triggers a player reload
  subject: string;
  topic: string;
  title: string;
  xpReward: number;
  estimatedDuration: number;
  session: any;               // full generated Session payload
  desafio: any | null;
  skillPath: any | null;
  progress: MissionProgress;
  status: MissionStatus;
  createdAt: number;
  updatedAt: number;
}

const EMPTY_PROGRESS: MissionProgress = {
  missionCompleted: false,
  quizCompleted: false,
  flashcardsCompleted: false,
  sessionCompleted: false,
};

function deriveStatus(p: MissionProgress): MissionStatus {
  if (p.sessionCompleted) return 'completed';
  if (p.missionCompleted || p.quizCompleted || p.flashcardsCompleted) return 'in_progress';
  return 'ready';
}

export interface AddMissionInput {
  id: string;
  sessionKey: string;
  subject: string;
  topic: string;
  title?: string;
  xpReward?: number;
  estimatedDuration?: number;
  session: any;
  desafio?: any | null;
  skillPath?: any | null;
}

interface MissionsContextType {
  missions: MissionRecord[];
  hydrated: boolean;
  addOrUpdateMission: (input: AddMissionInput) => void;
  updateMissionProgress: (id: string | null | undefined, progress: Partial<MissionProgress>) => void;
  /** Writes the active-session slots so the player can resume/replay this mission.
   *  Returns true if the mission was found. Caller navigates to the player after. */
  activateMission: (id: string, opts?: { replay?: boolean }) => Promise<boolean>;
  getMission: (id: string | null | undefined) => MissionRecord | undefined;
  removeMission: (id: string) => void;
}

const MissionsContext = createContext<MissionsContextType | undefined>(undefined);

export const MissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [missions, setMissions] = useState<MissionRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // Keep a ref mirror so async writers persist the freshest list without
  // depending on a stale closure.
  const missionsRef = useRef<MissionRecord[]>([]);

  const persist = useCallback((list: MissionRecord[]) => {
    missionsRef.current = list;
    setMissions(list);
    AsyncStorage.setItem(MISSIONS_KEY, JSON.stringify(list)).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(MISSIONS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            missionsRef.current = parsed;
            setMissions(parsed);
          }
        }
      } catch {}
      setHydrated(true);
    })();
  }, []);

  const addOrUpdateMission = useCallback((input: AddMissionInput) => {
    const now = Date.now();
    const list = missionsRef.current;
    const existing = list.find(m => m.id === input.id);
    const record: MissionRecord = {
      id: input.id,
      sessionKey: input.sessionKey,
      subject: input.subject,
      topic: input.topic,
      title: input.title ?? input.topic ?? input.subject,
      xpReward: input.xpReward ?? 0,
      estimatedDuration: input.estimatedDuration ?? 0,
      session: input.session,
      desafio: input.desafio ?? null,
      skillPath: input.skillPath ?? null,
      progress: existing?.progress ?? { ...EMPTY_PROGRESS },
      status: existing?.status ?? 'ready',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    // Newest first; de-dupe by id.
    const next = [record, ...list.filter(m => m.id !== input.id)];
    persist(next);
  }, [persist]);

  const updateMissionProgress = useCallback((id: string | null | undefined, progress: Partial<MissionProgress>) => {
    if (!id) return;
    const list = missionsRef.current;
    const idx = list.findIndex(m => m.id === id);
    if (idx === -1) return;
    const merged: MissionProgress = { ...list[idx].progress, ...progress };
    const updated: MissionRecord = {
      ...list[idx],
      progress: merged,
      status: deriveStatus(merged),
      updatedAt: Date.now(),
    };
    const next = [...list];
    next[idx] = updated;
    persist(next);
  }, [persist]);

  const activateMission = useCallback(async (id: string, opts?: { replay?: boolean }) => {
    const record = missionsRef.current.find(m => m.id === id);
    if (!record) return false;

    const replay = opts?.replay ?? false;
    // A fresh key forces the player's useFocusEffect to treat this as a new
    // load and re-hydrate its state.
    const newKey = `${Date.now()}`;

    const progress: MissionProgress = replay ? { ...EMPTY_PROGRESS } : record.progress;

    const writes: [string, string][] = [
      [ACTIVE_LAST_SESSION, JSON.stringify(record.session)],
      [ACTIVE_SESSION_KEY, newKey],
      [ACTIVE_LAST_SESSION_ID, record.id],
      [ACTIVE_SESSION_PROGRESS, JSON.stringify({
        sessionId: record.id,
        title: record.title,
        createdAt: Date.now(),
        ...progress,
      })],
    ];
    if (record.skillPath) writes.push([ACTIVE_SKILL_PATH, JSON.stringify(record.skillPath)]);

    await AsyncStorage.multiSet(writes);

    if (record.desafio) {
      await AsyncStorage.setItem(ACTIVE_DESAFIO, JSON.stringify(record.desafio));
    } else {
      await AsyncStorage.removeItem(ACTIVE_DESAFIO);
    }
    if (!record.skillPath) {
      await AsyncStorage.removeItem(ACTIVE_SKILL_PATH);
    }

    // On replay, reset the stored progress for this mission too.
    if (replay) {
      updateMissionProgress(id, { ...EMPTY_PROGRESS });
    }
    return true;
  }, [updateMissionProgress]);

  const getMission = useCallback((id: string | null | undefined) => {
    if (!id) return undefined;
    return missionsRef.current.find(m => m.id === id);
  }, []);

  const removeMission = useCallback((id: string) => {
    persist(missionsRef.current.filter(m => m.id !== id));
  }, [persist]);

  return (
    <MissionsContext.Provider value={{
      missions,
      hydrated,
      addOrUpdateMission,
      updateMissionProgress,
      activateMission,
      getMission,
      removeMission,
    }}>
      {children}
    </MissionsContext.Provider>
  );
};

export const useMissions = () => {
  const ctx = useContext(MissionsContext);
  if (!ctx) throw new Error('useMissions must be used within MissionsProvider');
  return ctx;
};
