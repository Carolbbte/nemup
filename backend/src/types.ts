/**
 * Backend-local type definitions for session generation.
 */

export type SessionFormat = 'quizzes' | 'flashcards' | 'summary' | 'mindmap';

export interface DetectedSkill {
  skillId: string;
  skillLabel: string;
  confidence: number;
  priority: number;
}

export type DifficultyLevel = 'easy' | 'adaptive' | 'hard';

export interface SessionConfig {
  documentId: string;
  format: SessionFormat[];
  difficulty: DifficultyLevel;
  estimatedDuration: number;
  subject?: string;
  topic?: string;
  curso?: string;
}

export interface MultipleChoiceOption {
  id: string;
  text: string;
}

export interface MultipleChoiceQuestion {
  id: string;
  text: string;
  options: MultipleChoiceOption[];
  correctOptionId: string;
  explanation: string;
  sourceQuote: string;
  difficulty: DifficultyLevel;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  sourceQuote: string;
  difficulty: DifficultyLevel;
}

export type SummarySlideType =
  // Legacy informational types (kept for compatibility)
  | 'concept' | 'key_fact' | 'important' | 'remember' | 'example' | 'curiosity' | 'wow_fact'
  | 'did_you_know' | 'common_error' | 'mini_quiz' | 'true_false' | 'observe'
  | 'compare' | 'partial_summary' | 'final_challenge'
  // Structured mission screens
  | 'mission' | 'main_concept' | 'micro_challenge' | 'reinforcement_challenge' | 'comprehension' | 'key_relation'
  | 'process_flow' | 'application' | 'victory' | 'challenge' | 'decide' | 'order_sequence' | 'quiz_transition'
  | 'worked_example';

export type IllustrationType = 'educational' | 'diagram' | 'concept' | 'timeline' | 'map' | 'process' | 'comparison';

export interface SummarySlide {
  type: SummarySlideType;
  emoji: string;
  title: string;
  definition: string;
  example: string;
  visualHint?: string;
  illustrationType?: IllustrationType;
  connector?: string | null;
  question?: string | null;
  options?: string[] | null;
  correctAnswer?: string | null;
  wrongAnswerHints?: Record<string, string> | null;
  // Guiding hint for a generated exercise (exerciseGenerator.ts) — shown
  // without revealing the answer. Frontend rendering (a "Pista" button) is
  // pending; the field is populated so the data is ready when it lands.
  hint?: string;
  // worked_example only — statement/answer copied verbatim from the source
  // material (never computed), steps omitted when the model's derivation
  // failed safety validation upstream (see procedural.ts's B-mínima fallback).
  statement?: string;
  answer?: string;
  steps?: string[];
}

export interface Summary {
  id: string;
  title: string;
  slides: SummarySlide[];
  sourceQuotes: string[];
}

export interface GeneratedSession {
  id: string;
  userId: string;
  documentId: string;
  subject: string;
  topic: string;
  wordCount: number;
  difficulty: DifficultyLevel;
  format: SessionFormat[];
  estimatedDuration: number;
  transcription: string;
  questions: MultipleChoiceQuestion[];
  flashcards: Flashcard[];
  summary: Summary;
  metadata: {
    createdAt: string;
    processedAt: string;
    groundingValidated: boolean;
    groundingScore: number;
    pedagogicalType?: string;
    primarySkillId?: string;
    primarySkillLabel?: string;
    learningPath?: Pick<DetectedSkill, 'skillId' | 'skillLabel' | 'priority'>[];
  };
  xpReward: number;       // max possible XP (earned at 100% score)
  baseXpReward: number;   // XP awarded just for attempting (20% of max)
  gemReward: number;      // max gems (awarded only if score ≥ 70%)
}

export type MasteryLevel = 'needs_practice' | 'in_progress' | 'good_mastery' | 'mastered';

export interface SkillPathEntry {
  missionIndex: number;
  skillId: string;
  skillLabel: string;
  sessionId: string;
}

export interface SkillMission extends SkillPathEntry {
  session: GeneratedSession;
}

export interface SkillPath {
  pathId: string;
  userId: string;
  documentId: string;
  totalMissions: number;
  missions: SkillPathEntry[];
  createdAt: string;
}
