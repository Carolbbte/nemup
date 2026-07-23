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
  | 'process_flow' | 'application' | 'victory' | 'challenge' | 'decide' | 'order_sequence'
  | 'worked_example' | 'worked_example_intro' | 'fill_blank' | 'match_pairs' | 'classify'
  // Fase 2 (MISSION_ARC_V2) — a single non-interactive progress beat mid-
  // mission. Already a real type the frontend renders (session.tsx's own
  // client-side quality pass has synthesized these for the legacy content
  // path for a while); this is the first time the backend emits one.
  | 'motivation';

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
  // Guiding hint for a generated exercise (exerciseGenerator.ts) — shown on
  // a wrong answer, without revealing the correct one.
  hint?: string;
  // main_concept only, from KnowledgeConcept.hook — a short, teen-relatable
  // analogy shown in mascot voice above the card. Null/absent on older
  // cached sessions or when comprehension.ts had no honest analogy.
  hook?: string | null;
  // main_concept only, from KnowledgeConcept.teacherExplanation — the 2-3
  // sentence narrative teaching moment (scenario → understanding → name),
  // shown as the card's main teaching content, above simpleExplanation
  // (kept on `definition`, the compact headline). Absent on older cached
  // sessions generated before this field existed.
  teacherExplanation?: string | null;
  // main_concept only, from KnowledgeConcept.keyPhrase — a short (2-5 word)
  // fragment of `definition` (which holds simpleExplanation on this slide,
  // see below) meant to be highlighted in color on the card. The frontend
  // locates it via a literal substring search — absent/not found means no
  // highlight, never a crash. Null/absent on older cached sessions or when
  // comprehension.ts had no clear fragment to highlight.
  keyPhrase?: string | null;
  // main_concept only, from KnowledgeConcept.definition (the FORMAL one —
  // `definition` on this slide holds simpleExplanation instead, see
  // assemble.ts). Shown behind a collapsed "Ver definición formal" toggle.
  formalDefinition?: string;
  // main_concept only, first of KnowledgeConcept.tips when non-empty.
  tip?: string;
  // fill_blank only — same builders buildDesafio already uses
  // (buildFillBlank/pickFillBlankChoices in assemble.ts), just packaged as
  // a SummarySlide instead of a DesafioSlide. The answer is still a LETTER
  // (blankAnswer), evaluated the exact same way as any other Misión
  // multiple-choice slide (letter === slide.blankAnswer) — no new answer
  // model needed.
  blankSentence?: string;
  blankChoices?: { letter: string; text: string }[];
  blankAnswer?: string;
  blankExplanation?: string;
  // match_pairs only — same shape Desafío's DesafioSlide already uses for
  // `pairs` (built by buildMatchPairs, reused as-is). The answer is NOT a
  // letter — it's an object mapping each pair's left id to the right id the
  // student matched it to, evaluated by pairs.every(p => value[p.id] ===
  // p.id + '_r'). `pairsPrompt` carries the Misión's own instruction line
  // (Desafío's reused renderer hardcodes its own, unrelated prompt text —
  // see session.tsx for how this is shown instead).
  // leftIcon/rightIcon are only ever set for Misión's own pairs (built by
  // buildMisionMatchPairs, NOT the buildMatchPairs Desafío reuses) — see
  // that function's own comment on why they must be two DIFFERENT emoji.
  pairs?: { id: string; left: string; right: string; leftIcon?: string; rightIcon?: string }[];
  pairsPrompt?: string;
  // classify only — same shape Desafío's DesafioSlide already uses for
  // classifyItems/classifyCategories (built by buildClassify, reused
  // as-is; items are shuffled by assemble.ts before being assigned ids, to
  // avoid the source's category-grouped ordering handing out the answer).
  // The answer is an object mapping each item's id to the category the
  // student assigned it to, evaluated by items.every(i => value[i.id] ===
  // i.category). `classifyExplanation` (declared on Desafío's DesafioSlide)
  // is deliberately NOT included here — nothing in the Misión reads it,
  // since its object-answer feedback is intentionally simple (no
  // per-item explanation), same as match_pairs.
  classifyPrompt?: string;
  classifyCategories?: string[];
  classifyItems?: { id: string; text: string; category: string }[];
  // worked_example only — statement/answer copied verbatim from the source
  // material (never computed), steps omitted when the model's derivation
  // failed safety validation upstream (see procedural.ts's B-mínima fallback).
  statement?: string;
  answer?: string;
  steps?: string[];
  // motivation only — the frontend's render for this type reads message/sub
  // instead of definition/example (see session.tsx's motivCard). title/
  // definition/example are still filled with equivalent copy so this slide
  // satisfies the rest of the frontend's own quality-pass pipeline (which
  // expects every slide to have non-empty title/definition), even though
  // the renderer itself never displays them for this type.
  message?: string;
  sub?: string;
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
