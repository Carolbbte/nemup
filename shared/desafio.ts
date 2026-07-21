export type DesafioInteractionType =
  | 'multiple_choice'
  | 'match_pairs'
  | 'fill_blank'
  | 'classify'
  | 'order_steps';

export type DesafioSlideType =
  | 'discovery_challenge'
  | 'instant_feedback'
  | 'insight'
  | 'worked_example'
  | 'reinforcement_challenge'
  | 'spaced_repetition'
  | 'boss_loop'
  | 'mastery_screen';

export interface DesafioChoice {
  letter: 'A' | 'B' | 'C';
  text: string;
}

export interface DesafioPair {
  id: string;
  left: string;
  right: string;
}

export interface DesafioClassifyItem {
  id: string;
  text: string;
  category: string;
}

export interface DesafioSlide {
  type: DesafioSlideType;
  interactionType?: DesafioInteractionType;
  conceptIndex: number;
  conceptName: string;
  isSpacedRepetition?: boolean;
  isRetry?: boolean;

  // multiple_choice (discovery, reinforcement, spaced_repetition, boss_loop)
  emoji?: string;
  question?: string;
  choices?: DesafioChoice[];
  correctAnswer?: 'A' | 'B' | 'C';
  explanation?: string;
  wrongExplanation?: string;
  wrongHints?: Record<string, string>;

  // match_pairs
  pairsPrompt?: string;
  pairs?: DesafioPair[];
  pairsExplanation?: string;

  // fill_blank
  blankSentence?: string;
  blankChoices?: DesafioChoice[];
  blankAnswer?: 'A' | 'B' | 'C';
  blankExplanation?: string;

  // classify
  classifyPrompt?: string;
  classifyItems?: DesafioClassifyItem[];
  classifyCategories?: string[];
  classifyExplanation?: string;

  // order_steps
  orderPrompt?: string;
  steps?: string[];
  correctOrder?: number[];
  orderExplanation?: string;

  // non-interactive (instant_feedback, insight, worked_example, mastery_screen)
  title?: string;
  body?: string;
  conceptsCovered?: string[];

  // insight only — concrete examples to show as mini cards
  examples?: { expression: string; label: string }[];

  // worked_example only — a solved exercise from the source material.
  // `statement` and `answer` are copied verbatim from the material and never
  // computed by the model; `steps` (reusing the order_steps field, but here
  // as a plain ordered explanation, not a reorder exercise) is null-safe —
  // may be omitted/empty when the model's derivation didn't validate against
  // `answer`, in which case only statement/answer are shown, no steps.
  statement?: string;
  answer?: string;
}

export interface DesafioSession {
  id: string;
  topic: string;
  conceptCount: number;
  slides: DesafioSlide[];
  retrySlides?: Record<string, DesafioSlide[]>; // key = String(conceptIndex)
  missionEmoji?: string;  // emoji from the Mission's mission slide (for cover screen)
  missionTitle?: string;  // title/question from the Mission's mission slide (for cover screen)
}
