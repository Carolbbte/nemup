/**
 * Pure, deterministic assembly of the frontend-facing JSON from a
 * KnowledgeObject + a distractors map. No AI calls happen here — everything
 * the model needs to contribute (concepts, distinctiveTrait, distractors)
 * was already produced by `comprehension.ts`/`distractors.ts`; this module
 * only arranges that data into the exact shapes the frontend already
 * consumes (`Flashcard`, `MultipleChoiceQuestion`, `SummarySlide`,
 * `DesafioSession` — the last one mirrors `shared/desafio.ts` field-for-field,
 * duplicated locally the same way `desafioAdapter.ts` already does, since
 * `shared/` sits outside this project's `rootDir`).
 *
 * Trade-off worth being explicit about: only ONE question is generated per
 * concept (via `generateDistractors`), not one per exercise. Where a concept
 * needs to appear twice (Summary's micro_challenge + reinforcement_challenge,
 * Desafío's discovery_challenge + reinforcement_challenge), the same
 * question is reused under a different framing rather than paying for a
 * second AI call.
 */

import { randomUUID } from 'crypto';
import { shuffleArray } from '../../services/generationService.js';
import type { Flashcard, MultipleChoiceQuestion, DifficultyLevel, SummarySlide } from '../../types.js';
import type { KnowledgeConcept, KnowledgeObject } from './types.js';
import type { DistractorSet } from './distractors.js';
import type { WorkedExampleResult } from './procedural.js';

// ── Desafío local type mirror — matches shared/desafio.ts field-for-field ───
// (same rootDir-avoidance duplication desafioAdapter.ts already uses)

type DesafioInteractionType = 'multiple_choice' | 'match_pairs' | 'fill_blank' | 'classify' | 'order_steps';

type DesafioSlideType =
  | 'discovery_challenge'
  | 'instant_feedback'
  | 'insight'
  | 'reinforcement_challenge'
  | 'spaced_repetition'
  | 'boss_loop'
  | 'mastery_screen';

interface DesafioChoice {
  letter: 'A' | 'B' | 'C';
  text: string;
}

interface DesafioPair {
  id: string;
  left: string;
  right: string;
}

interface DesafioClassifyItem {
  id: string;
  text: string;
  category: string;
}

interface DesafioSlide {
  type: DesafioSlideType;
  interactionType?: DesafioInteractionType;
  conceptIndex: number;
  conceptName: string;
  emoji?: string;
  question?: string;
  choices?: DesafioChoice[];
  correctAnswer?: 'A' | 'B' | 'C';
  explanation?: string;
  pairsPrompt?: string;
  pairs?: DesafioPair[];
  pairsExplanation?: string;
  blankSentence?: string;
  blankChoices?: DesafioChoice[];
  blankAnswer?: 'A' | 'B' | 'C';
  blankExplanation?: string;
  classifyPrompt?: string;
  classifyItems?: DesafioClassifyItem[];
  classifyCategories?: string[];
  title?: string;
  body?: string;
  conceptsCovered?: string[];
  examples?: Array<{ expression: string; label: string }>;
}

export interface DesafioSession {
  id: string;
  topic: string;
  conceptCount: number;
  slides: DesafioSlide[];
}

const LETTERS = ['A', 'B', 'C'] as const;

// ── Shared helpers ────────────────────────────────────────────────────────────

function mapDifficulty(n: number): DifficultyLevel {
  if (n <= 2) return 'easy';
  if (n <= 3) return 'adaptive';
  return 'hard';
}

// Strips leading articles and truncates to max 6 words — ported verbatim from
// desafioGenerationService.ts's shortenPairRight (same limit: 2-6 palabras).
function shortenPairRight(text: string): string {
  const stripped = text.replace(/^(el|la|los|las|un|una|unos|unas)\s+/i, '').trim();
  const words = stripped.split(/\s+/);
  return words.slice(0, 6).join(' ');
}

// ── 1. Flashcards ─────────────────────────────────────────────────────────────

export function buildFlashcards(ko: KnowledgeObject): Flashcard[] {
  return ko.concepts.map((concept) => ({
    id: concept.id,
    front: concept.name,
    back: concept.simpleExplanation,
    sourceQuote: concept.sourceQuote,
    difficulty: mapDifficulty(concept.difficulty),
  }));
}

// ── 2. Quiz questions ─────────────────────────────────────────────────────────

export function buildQuestions(
  ko: KnowledgeObject,
  distractors: Record<string, DistractorSet>,
): MultipleChoiceQuestion[] {
  const questions: MultipleChoiceQuestion[] = [];

  ko.concepts.forEach((concept, i) => {
    const d = distractors[concept.id];
    if (!d) return; // no generated question for this concept — skip it

    const rawOptions = [
      { id: `q${i + 1}-o1`, text: d.correctText },
      { id: `q${i + 1}-o2`, text: d.distractors[0] },
      { id: `q${i + 1}-o3`, text: d.distractors[1] },
      { id: `q${i + 1}-o4`, text: d.distractors[2] },
    ];
    // Resolve correctOptionId BEFORE shuffle, same convention as generationService.
    const correctOptionId = rawOptions[0].id;
    const options = shuffleArray(rawOptions);

    questions.push({
      id: `q-${i + 1}`,
      text: d.question,
      options,
      correctOptionId,
      explanation: concept.definition,
      sourceQuote: concept.sourceQuote,
      difficulty: mapDifficulty(concept.difficulty),
    });
  });

  return questions;
}

// ── 3. Fill-blank sentence ────────────────────────────────────────────────────

const BLANK_ANCHORS = [
  'La evidencia denominada ___',
  'El proceso llamado ___',
  'El concepto conocido como ___',
  'La estructura de tipo ___',
  'El mecanismo denominado ___',
  'El fenómeno llamado ___',
];

function decapitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/**
 * Builds a fill_blank sentence as ANCHOR + ___ + PREDICADO, where the
 * predicate is the concept's `distinctiveTrait` — true only for this concept,
 * per how `comprehension.ts` instructs the model to write it. The anchor is
 * picked deterministically from `concept.name` so the same concept always
 * gets the same anchor, and different concepts vary across the 6 options.
 */
export function buildFillBlank(concept: KnowledgeConcept): string {
  const hash = [...concept.name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const anchor = BLANK_ANCHORS[hash % BLANK_ANCHORS.length];
  return `${anchor} ${decapitalize(concept.distinctiveTrait.trim())}`;
}

// ── 4. Match pairs ────────────────────────────────────────────────────────────

export interface MatchPairsResult {
  prompt: string;
  pairs: Array<{ left: string; right: string }>;
}

/**
 * Ported from desafioGenerationService.ts's validatePairs, adapted to build
 * pairs directly from KnowledgeObject instead of validating AI output:
 * max 3 pairs, right-hand side shortened, both sides non-empty, at least 3
 * valid pairs required or the exercise is dropped entirely.
 */
export function buildMatchPairs(ko: KnowledgeObject): MatchPairsResult | null {
  const pairs = ko.concepts
    .map((c) => ({ left: c.name.trim(), right: shortenPairRight(c.distinctiveTrait) }))
    .filter((p) => p.left.length > 0 && p.right.length > 0)
    .slice(0, 3);

  return pairs.length >= 3 ? { prompt: 'Relaciona', pairs } : null;
}

// ── 5. Classify ───────────────────────────────────────────────────────────────

export interface ClassifyResult {
  prompt: string;
  categories: string[];
  items: Array<{ text: string; category: string }>;
}

/** Needs ≥2 categories and ≥3 total items across them to be a meaningful exercise — otherwise null. */
export function buildClassify(ko: KnowledgeObject): ClassifyResult | null {
  const categories = ko.categories.filter((c) => c.name.trim().length > 0 && c.items.length > 0);
  if (categories.length < 2) return null;

  const items = categories.flatMap((c) => c.items.map((text) => ({ text, category: c.name })));
  if (items.length < 3) return null;

  return {
    prompt: 'Clasifica cada elemento según su categoría.',
    categories: categories.map((c) => c.name),
    items,
  };
}

// ── 6. Desafío ────────────────────────────────────────────────────────────────

function pickFillBlankChoices(
  correctName: string,
  allNames: string[],
  seed: number,
): { choices: DesafioChoice[]; correctAnswer: 'A' | 'B' | 'C' } | null {
  const others = allNames.filter((n) => n !== correctName);
  if (others.length < 2) return null;

  const decoys: string[] = [];
  for (let offset = 0; offset < others.length && decoys.length < 2; offset++) {
    const candidate = others[(seed + offset) % others.length];
    if (!decoys.includes(candidate)) decoys.push(candidate);
  }
  if (decoys.length < 2) return null;

  const correctPos = seed % 3;
  const texts = [decoys[0], decoys[1]];
  texts.splice(correctPos, 0, correctName);

  return {
    choices: texts.slice(0, 3).map((text, idx) => ({ letter: LETTERS[idx], text })),
    correctAnswer: LETTERS[correctPos],
  };
}

function toDesafioChoices(
  correctText: string,
  distractorTexts: string[],
  seed: number,
): { choices: DesafioChoice[]; correctAnswer: 'A' | 'B' | 'C' } {
  const correctPos = seed % 3;
  const texts = [distractorTexts[0], distractorTexts[1]];
  texts.splice(correctPos, 0, correctText);

  return {
    choices: texts.slice(0, 3).map((text, idx) => ({ letter: LETTERS[idx], text })),
    correctAnswer: LETTERS[correctPos],
  };
}

function buildFillBlankSlideFor(
  concept: KnowledgeConcept,
  allNames: string[],
  seed: number,
  type: DesafioSlideType,
): DesafioSlide | null {
  const picked = pickFillBlankChoices(concept.name, allNames, seed);
  if (!picked) return null;

  return {
    type,
    interactionType: 'fill_blank',
    conceptIndex: seed,
    conceptName: concept.name,
    emoji: '📚',
    blankSentence: buildFillBlank(concept),
    blankChoices: picked.choices,
    blankAnswer: picked.correctAnswer,
    blankExplanation: concept.definition,
  };
}

function buildMultipleChoiceSlideFor(
  concept: KnowledgeConcept,
  d: DistractorSet,
  seed: number,
  type: DesafioSlideType,
): DesafioSlide {
  const { choices, correctAnswer } = toDesafioChoices(d.correctText, d.distractors, seed);

  return {
    type,
    interactionType: 'multiple_choice',
    conceptIndex: seed,
    conceptName: concept.name,
    emoji: '📚',
    question: d.question,
    choices,
    correctAnswer,
    explanation: concept.definition,
  };
}

/**
 * Builds one 'insight' slide (existing, non-interactive Desafío slide type —
 * no new slide type introduced, so the frontend renders it exactly like any
 * other insight card) per worked example. Reuses `examples` to show the
 * statement/answer pair and `body` for the explanatory steps. When a worked
 * example failed safety validation (`steps: null`), the body falls back to
 * a bare statement → answer line with no fabricated path — this is the
 * "B-mínima" fallback from the spec, applied per example, not as an all-or-nothing switch.
 */
function buildWorkedExampleSlide(result: WorkedExampleResult, seed: number): DesafioSlide {
  const body = result.steps
    ? result.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')
    : `${result.statement} → ${result.answer}`;

  return {
    type: 'insight',
    conceptIndex: seed,
    conceptName: 'Ejemplo resuelto',
    emoji: '📐',
    title: 'Así se resuelve',
    body,
    examples: [
      { expression: result.statement, label: 'Enunciado' },
      { expression: result.answer, label: 'Respuesta' },
    ],
  };
}

/**
 * Assembles the full Desafío slide sequence directly from KnowledgeObject +
 * distractors — no intermediate "Mission slides" pass. Per concept: a
 * discovery_challenge + reinforcement_challenge pair, alternating which one
 * is fill_blank vs multiple_choice (starting with fill_blank), so every
 * concept is practiced both ways using its single generated question.
 * match_pairs/classify are injected at the same relative positions as the
 * legacy system (ported from desafioGenerationService.ts): after the
 * ceil(N/2)-1'th and max(N-2, ...)'th concepts respectively.
 *
 * `workedExampleResults` (procedural mode) is optional and defaults to `[]`,
 * which reproduces the exact conceptual-only slide sequence from before this
 * existed — when non-empty, one 'insight' slide per worked example is
 * inserted right before the boss_loop, so the student sees "así se resuelve"
 * immediately before the culminating application challenge.
 */
export function buildDesafio(
  ko: KnowledgeObject,
  distractors: Record<string, DistractorSet>,
  workedExampleResults: WorkedExampleResult[] = [],
): DesafioSession {
  const N = ko.concepts.length;
  if (N === 0) {
    return { id: randomUUID(), topic: ko.topic || 'Desafío', conceptCount: 0, slides: [] };
  }

  const conceptNames = ko.concepts.map((c) => c.name);
  const matchPairsInsertAfter = Math.ceil(N / 2) - 1;
  const classifyInsertAfter = Math.max(N - 2, matchPairsInsertAfter + 1);
  const matchPairs = buildMatchPairs(ko);
  const classify = buildClassify(ko);

  const slides: DesafioSlide[] = [];

  ko.concepts.forEach((concept, i) => {
    const d = distractors[concept.id];
    const fillBlankFirst = i % 2 === 0;

    const discovery = fillBlankFirst
      ? buildFillBlankSlideFor(concept, conceptNames, i, 'discovery_challenge')
      : d
        ? buildMultipleChoiceSlideFor(concept, d, i, 'discovery_challenge')
        : null;
    const reinforcement = fillBlankFirst
      ? d
        ? buildMultipleChoiceSlideFor(concept, d, i, 'reinforcement_challenge')
        : null
      : buildFillBlankSlideFor(concept, conceptNames, i, 'reinforcement_challenge');

    if (discovery) slides.push(discovery);
    if (reinforcement) slides.push(reinforcement);

    if (matchPairs && matchPairsInsertAfter === i) {
      slides.push({
        conceptIndex: i,
        conceptName: 'Repaso',
        emoji: '🔗',
        type: 'reinforcement_challenge',
        interactionType: 'match_pairs',
        pairsPrompt: matchPairs.prompt,
        pairs: matchPairs.pairs.map((p, idx) => ({ id: `pair-${idx}`, left: p.left, right: p.right })),
      });
    }

    if (classify && classifyInsertAfter === i) {
      slides.push({
        conceptIndex: i,
        conceptName: 'Clasificación',
        emoji: '🗂️',
        type: 'reinforcement_challenge',
        interactionType: 'classify',
        classifyPrompt: classify.prompt,
        classifyCategories: classify.categories,
        classifyItems: classify.items.map((it, idx) => ({ id: `item-${idx}`, text: it.text, category: it.category })),
      });
    }
  });

  // Procedural mode: show "así se resuelve" for every worked example right
  // before the culminating application challenge (boss_loop). No-op when
  // workedExampleResults is empty — identical slide sequence to before.
  workedExampleResults.forEach((result) => slides.push(buildWorkedExampleSlide(result, N)));

  const bossConcept = ko.concepts.reduce((max, c) => (c.difficulty > max.difficulty ? c : max));
  const bossDistractor = distractors[bossConcept.id];
  if (bossDistractor) {
    slides.push(buildMultipleChoiceSlideFor(bossConcept, bossDistractor, N, 'boss_loop'));
  }

  slides.push({
    conceptIndex: N - 1,
    conceptName: 'Cierre',
    emoji: '🎉',
    type: 'mastery_screen',
    title: '¡Misión completada!',
    body: `Dominaste: ${conceptNames.join(', ')}.`,
    conceptsCovered: conceptNames,
  });

  return { id: randomUUID(), topic: ko.topic || 'Desafío', conceptCount: N, slides };
}

// ── 7. Summary (Duolingo loop) ────────────────────────────────────────────────

/**
 * Assembles the Duolingo-loop summary slides directly from KnowledgeObject +
 * distractors: micro_challenge → main_concept → reinforcement_challenge per
 * concept, then a closing application → final_challenge → victory sequence.
 * final_challenge reuses the hardest concept's already-generated question
 * rather than requesting a new one.
 */
export function buildSummarySlides(
  ko: KnowledgeObject,
  distractors: Record<string, DistractorSet>,
): SummarySlide[] {
  if (ko.concepts.length === 0) return [];

  const slides: SummarySlide[] = [];

  for (const concept of ko.concepts) {
    const d = distractors[concept.id];
    if (!d) continue; // no generated question — skip this concept's loop, keep the rest intact

    slides.push({
      type: 'micro_challenge',
      emoji: '🧠',
      title: `¿Qué sabes de ${concept.name}?`,
      definition: 'Responde antes de ver la respuesta — así el concepto se queda contigo.',
      example: '',
      question: d.question,
      options: shuffleArray([d.correctText, ...d.distractors]),
      correctAnswer: d.correctText,
    });

    slides.push({
      type: 'main_concept',
      emoji: '💡',
      title: concept.name,
      definition: concept.simpleExplanation,
      example: concept.example ?? '',
    });

    slides.push({
      type: 'reinforcement_challenge',
      emoji: '🎯',
      title: 'Refuerzo',
      definition: `Aplica lo que acabas de aprender sobre ${concept.name}.`,
      example: '',
      question: d.question,
      options: shuffleArray([d.correctText, ...d.distractors]),
      correctAnswer: d.correctText,
    });
  }

  slides.push({
    type: 'application',
    emoji: '🚀',
    title: 'Aplícalo',
    definition: 'Repasa lo aprendido antes del desafío final.',
    example: '',
  });

  const bossConcept = ko.concepts.reduce((max, c) => (c.difficulty > max.difficulty ? c : max));
  const bossDistractor = distractors[bossConcept.id];
  if (bossDistractor) {
    slides.push({
      type: 'final_challenge',
      emoji: '🏆',
      title: `Desafío final: ${bossConcept.name}`,
      definition: 'Demuestra que dominas el concepto más exigente de esta sesión.',
      example: '',
      question: bossDistractor.question,
      options: shuffleArray([bossDistractor.correctText, ...bossDistractor.distractors]),
      correctAnswer: bossDistractor.correctText,
    });
  }

  slides.push({
    type: 'victory',
    emoji: '🎉',
    title: '¡Misión completada!',
    definition: `Dominaste: ${ko.concepts.map((c) => c.name).join(', ')}.`,
    example: '',
  });

  return slides;
}
