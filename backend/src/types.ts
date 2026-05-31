/**
 * Backend-local type definitions for session generation.
 */

export type SessionFormat = 'quizzes' | 'flashcards' | 'summary' | 'mindmap';

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
  | 'mission' | 'main_concept' | 'comprehension' | 'key_relation'
  | 'process_flow' | 'application' | 'victory';

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
  };
  xpReward: number;
  gemReward: number;
}
