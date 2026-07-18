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
import type { GeneratedExercise } from './exerciseGenerator.js';

// ── Desafío local type mirror — matches shared/desafio.ts field-for-field ───
// (same rootDir-avoidance duplication desafioAdapter.ts already uses)

type DesafioInteractionType = 'multiple_choice' | 'match_pairs' | 'fill_blank' | 'classify' | 'order_steps';

type DesafioSlideType =
  | 'discovery_challenge'
  | 'instant_feedback'
  | 'insight'
  | 'worked_example'
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
  // worked_example only — see shared/desafio.ts for the full contract.
  statement?: string;
  steps?: string[];
  answer?: string;
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
      { id: `q${i + 1}-o2`, text: d.distractors[0].text },
      { id: `q${i + 1}-o3`, text: d.distractors[1].text },
      { id: `q${i + 1}-o4`, text: d.distractors[2].text },
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

// Category-neutral on purpose — an anchor like "La evidencia denominada ___"
// asserts a category (evidence/process/mechanism/phenomenon/structure) that's
// wrong for any concept that isn't actually that category (e.g. "La evidencia
// denominada Evolución..." — evolution is the process, not a piece of
// evidence). Every anchor here works for ANY concept regardless of what kind
// of thing it is.
const BLANK_ANCHORS = [
  'El concepto ___',
  'El concepto denominado ___',
  'El concepto conocido como ___',
  'El término denominado ___',
  'La idea llamada ___',
];

function decapitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/**
 * Builds a fill_blank sentence as ANCHOR + ___ + PREDICADO, where the
 * predicate is the concept's `distinctiveTrait` — true only for this concept,
 * per how `comprehension.ts` instructs the model to write it. The anchor is
 * picked deterministically from `concept.name` so the same concept always
 * gets the same anchor, and different concepts vary across BLANK_ANCHORS.
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
  const { choices, correctAnswer } = toDesafioChoices(d.correctText, d.distractors.map((x) => x.text), seed);

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
 * Builds one 'worked_example' slide per worked example — its own slide type
 * (not a reuse of 'insight'), so the frontend can render `statement`/`steps`/
 * `answer` as an actual step-by-step resolution instead of two mini cards
 * both mislabeled "ejemplo práctico". `steps` is omitted (undefined) when the
 * example failed safety validation upstream (`WorkedExampleResult.steps ===
 * null`) — the frontend then shows only statement → answer, no fabricated path.
 */
function buildWorkedExampleSlide(result: WorkedExampleResult, seed: number): DesafioSlide {
  return {
    type: 'worked_example',
    conceptIndex: seed,
    conceptName: 'Ejemplo resuelto',
    emoji: '🧮',
    title: 'Así se resuelve',
    statement: result.statement,
    answer: result.answer,
    ...(result.steps ? { steps: result.steps } : {}),
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
 * existed — when non-empty, one 'worked_example' slide per worked example is
 * inserted after the first third of the concept sequence (there's no data
 * linking a worked example to a specific concept, so this is a deliberate
 * "early, not late" placement rather than a per-concept association): the
 * student sees "así se resuelve" before most of the practice, not after all
 * of it.
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
  const workedExampleInsertAfter = Math.floor((N - 1) / 3);
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

    if (workedExampleInsertAfter === i) {
      workedExampleResults.forEach((result) => slides.push(buildWorkedExampleSlide(result, i)));
    }

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
// The frontend's Mission player stores the TAPPED LETTER ('A'/'B'/'C'/'D') in
// its answers map and compares it against `slide.correctAnswer` for every
// interactive slide type — a convention set by the legacy v1 AI (which always
// emits a letter) and already followed by buildDesafio's own choice-builders
// below. Storing the literal answer TEXT in `correctAnswer` here (as this
// function used to) makes that comparison always false: the student is never
// marked correct on a micro_challenge/reinforcement_challenge/final_challenge,
// which also meant the CTA's wrong-answer feedback path fired on every single
// answer, right or wrong.
const SUMMARY_LETTERS = ['A', 'B', 'C', 'D'];
export function shuffleWithLetterAnswer(correctText: string, distractorTexts: string[]): { options: string[]; correctAnswer: string } {
  const options = shuffleArray([correctText, ...distractorTexts]);
  const correctAnswer = SUMMARY_LETTERS[options.indexOf(correctText)] ?? 'A';
  return { options, correctAnswer };
}

/**
 * Summary-shaped worked_example slide — distinct from Desafío's
 * buildWorkedExampleSlide (which returns a DesafioSlide, missing
 * SummarySlide's required `definition`/`example` fields and carrying
 * Desafío-only fields like conceptIndex/conceptName). `definition`/
 * `example` are filled with statement/answer too so the slide still reads
 * correctly even via a render path that only knows the legacy fields.
 */
function buildWorkedExampleSummarySlide(result: WorkedExampleResult): SummarySlide {
  return {
    type: 'worked_example',
    emoji: '🧮',
    title: 'Así se resuelve',
    definition: result.statement,
    example: result.answer,
    statement: result.statement,
    answer: result.answer,
    ...(result.steps ? { steps: result.steps } : {}),
  };
}

/**
 * Derives a SECOND, genuinely different question for a concept's
 * reinforcement_challenge — without a second AI call.
 *
 * Prefers an example-based question ("¿cuál de estas opciones es un ejemplo
 * de X?") using each concept's own `example` field — concrete and, for
 * procedural material (math, formulas), still expression/number-based rather
 * than pure vocabulary. Only falls back to the trait-matching question,
 * framed as a guessing riddle ("¿Qué concepto reconoces por esta pista?")
 * rather than the meta-academic "¿a cuál de estos conceptos corresponde...?"
 * phrasing this used to have, when the concept or its siblings don't have a
 * usable `example` (comprehension.ts documents `example` as nullable —
 * "o null si no aplica").
 *
 * `distinctiveTrait` is explicitly extracted to be true for this concept and
 * false for every other one in the same document (see KnowledgeConcept's doc
 * comment), which makes it a safe anchor for the fallback: the correct
 * answer and every distractor are real concept names already in the
 * document, nothing invented. The example-based path is equally
 * grounded — every option is a real `example` already in the document.
 *
 * Returns null when there aren't enough OTHER concepts to build a real
 * multiple-choice question (needs >=1 other; comprehension.ts's own "3 a 6
 * conceptos" instruction means this only happens if the model under-delivers
 * concepts) — callers must drop the reinforcement_challenge slide in that
 * case rather than fabricate distractors.
 *
 * `preferExample` (default true) lets a caller force the riddle branch even
 * when an example-based question would otherwise be available — used by
 * buildSummarySlides to cap how many concepts in one session get the
 * example-match framing, since that branch's distractor pool overlaps
 * heavily across concepts in short documents and started feeling cloned.
 * The distractor pool for BOTH branches is shuffled before slicing, so two
 * concepts that land in the same branch don't surface the same 3 options in
 * the same order either.
 */
export function buildReinforcementFromTrait(
  concept: KnowledgeConcept,
  allConcepts: KnowledgeConcept[],
  preferExample: boolean = true,
): { question: string; correctText: string; distractors: string[]; usedExample: boolean } | null {
  const others = allConcepts.filter((c) => c.id !== concept.id);
  if (others.length === 0) return null;

  // Prefers exampleShort over the long example — options built from full
  // sentences ran 3-4 lines each. Requires the correct concept AND at least
  // 3 OTHER concepts to have a usable exampleShort (never fewer, unlike the
  // long-example branch below) — anything short of that would mean some
  // options come out short and others don't get built at all, so it falls
  // through to the long-example branch instead, where every option is long
  // and nothing is mixed.
  if (preferExample && concept.exampleShort && concept.exampleShort.trim().length > 0) {
    const otherShorts = others
      .map((c) => c.exampleShort)
      .filter((e): e is string => !!e && e.trim().length > 0 && e !== concept.exampleShort);

    if (otherShorts.length >= 3) {
      return {
        question: `¿Cuál de estas opciones es un ejemplo de "${concept.name}"?`,
        correctText: concept.exampleShort,
        distractors: shuffleArray(otherShorts).slice(0, 3),
        usedExample: true,
      };
    }
  }

  if (preferExample && concept.example && concept.example.trim().length > 0) {
    const otherExamples = others
      .map((c) => c.example)
      .filter((e): e is string => !!e && e.trim().length > 0 && e !== concept.example);

    if (otherExamples.length > 0) {
      return {
        question: `¿Cuál de estas opciones es un ejemplo de "${concept.name}"?`,
        correctText: concept.example,
        distractors: shuffleArray(otherExamples).slice(0, 3),
        usedExample: true,
      };
    }
  }

  return {
    question: `¿Qué concepto reconoces por esta pista?\n"${concept.distinctiveTrait}"`,
    correctText: concept.name,
    distractors: shuffleArray(others.map((c) => c.name)).slice(0, 3),
    usedExample: false,
  };
}

/** Common shape produced by either a real DistractorSet or a GeneratedExercise. */
interface InteractiveFields {
  question: string;
  options: string[];
  correctAnswer: string;
  wrongAnswerHints?: Record<string, string>;
  hint?: string;
}

function fieldsFromDistractorSet(d: DistractorSet): InteractiveFields {
  const { options, correctAnswer } = shuffleWithLetterAnswer(d.correctText, d.distractors.map((x) => x.text));
  return { question: d.question, options, correctAnswer, wrongAnswerHints: buildWrongAnswerHints(options, d.distractors) };
}

/**
 * Maps each distractor's explanation to the LETTER it landed on after
 * shuffling — not its original text position — so it lines up with
 * `wrongAnswerHints`'s existing convention (keyed by option letter, per
 * desafioAdapter.ts/desafioService.ts's legacy v1 usage) regardless of how
 * the options were reordered.
 */
function buildWrongAnswerHints(options: string[], distractors: GeneratedExercise['distractors']): Record<string, string> {
  const hints: Record<string, string> = {};
  distractors.forEach((d) => {
    const idx = options.indexOf(d.text);
    if (idx >= 0) hints[SUMMARY_LETTERS[idx]] = d.explanation;
  });
  return hints;
}

function fieldsFromExercise(ex: GeneratedExercise): InteractiveFields {
  const { options, correctAnswer } = shuffleWithLetterAnswer(ex.correctAnswer, ex.distractors.map((d) => d.text));
  return {
    question: ex.statement,
    options,
    correctAnswer,
    wrongAnswerHints: buildWrongAnswerHints(options, ex.distractors),
    hint: ex.hint,
  };
}

/**
 * Fase 2 (MISSION_ARC_V2) — a reusable "callback" question for `concept`,
 * built ONLY from data already generated (buildReinforcementFromTrait or its
 * own DistractorSet) — never a new AI call. Tries both trait-question
 * framings (preferExample true then false — genuinely different wording
 * from each other and from the concept's raw DistractorSet question), then
 * the DistractorSet's own question — returning the first one NOT already in
 * `avoid`. Returns null when every source is exhausted or already shown
 * (never a fabricated question, and — per explicit product decision — never
 * a word-for-word repeat either: this callback exists for engagement, and a
 * literal duplicate reads as broken/repetitive rather than helpful, even
 * though spaced repetition of the exact same item is pedagogically
 * defensible on its own). The caller tries the next candidate concept, or
 * omits the callback slide entirely if none has a fresh variant.
 */
function reinforcementCallbackVariant(
  concept: KnowledgeConcept,
  allConcepts: KnowledgeConcept[],
  d: DistractorSet | undefined,
  avoid: Set<string>,
): { question: string; options: string[]; correctAnswer: string } | null {
  for (const preferExample of [true, false]) {
    const tq = buildReinforcementFromTrait(concept, allConcepts, preferExample);
    if (!tq || avoid.has(tq.question)) continue;
    const shuffled = shuffleWithLetterAnswer(tq.correctText, tq.distractors);
    return { question: tq.question, options: shuffled.options, correctAnswer: shuffled.correctAnswer };
  }

  if (d && !avoid.has(d.question)) {
    const fields = fieldsFromDistractorSet(d);
    return { question: fields.question, options: fields.options, correctAnswer: fields.correctAnswer };
  }

  return null;
}

// Mission-only pairs source — NOT buildMatchPairs (that stays exactly as
// Desafío uses it; not called from here at all). buildMatchPairs pairs each
// concept's name with its distinctiveTrait via shortenPairRight, which for
// the Misión produced near-duplicate fragments: distinctiveTrait is written
// in a homogeneous "Es el único que..." register (see comprehension.ts's
// own instruction #7), and shortenPairRight's 6-word cap chopped that down
// mid-sentence ("...que estudia", "...que describe", "...que se") — hard to
// tell apart and not a real description of the concept. The long `example`
// isn't usable either — it's a full sentence, which either got clamped mid-
// sentence (bad UX) or forced the card to grow to fit it (huge, mismatched
// cards). `exampleShort` (comprehension.ts) is a purpose-built 3-6 word
// label for exactly this slot — concrete, complete, and short by
// construction, not by truncating `example` at render time.
function buildMisionMatchPairs(concepts: KnowledgeConcept[]): MatchPairsResult | null {
  const pairs = concepts
    .filter((c) => !!c.exampleShort && c.exampleShort.trim().length > 0)
    .map((c) => ({ left: c.name.trim(), right: c.exampleShort!.trim() }))
    .filter((p) => p.left.length > 0 && p.right.length > 0)
    // Same cap buildMatchPairs itself uses — MatchPairsContent/its color
    // palette and layout are sized for this, on both Desafío and Misión.
    .slice(0, 3);

  // <3 concepts with a usable exampleShort — omit the format entirely
  // rather than topping up with distinctiveTrait fragments or falling back
  // to the long example; a missing match_pairs is better than a
  // barely-distinguishable or oversized one.
  return pairs.length >= 3 ? { prompt: 'Relaciona cada concepto con su ejemplo', pairs } : null;
}

export function buildSummarySlides(
  ko: KnowledgeObject,
  distractors: Record<string, DistractorSet>,
  workedExampleResults: WorkedExampleResult[] = [],
  generatedExercises: GeneratedExercise[] = [],
  // Fase 2 — Arco de la misión. Default false so every existing caller (and
  // every existing test) is byte-identical to before this parameter existed.
  // The real production value (config.mission_arc_v2) is wired in by the one
  // caller, orchestrator.ts — kept out of this function on purpose so it
  // stays a pure, directly-testable function with no env/config coupling.
  missionArcV2: boolean = false,
): SummarySlide[] {
  if (ko.concepts.length === 0) return [];

  const slides: SummarySlide[] = [];

  // Cambio 1 (Momentum) — only computed/applied when the flag is on; the
  // forEach below iterates ko.concepts UNCHANGED when it's off, so nothing
  // here can alter today's behavior in the off case.
  // easiestConcept is also Change 2's primary callback candidate, so it's
  // computed once here regardless of which change ends up using it.
  let conceptTraversalOrder = ko.concepts;
  let easiestConcept = ko.concepts[0];
  if (missionArcV2) {
    easiestConcept = ko.concepts.reduce((min, c) => (c.difficulty < min.difficulty ? c : min));
    conceptTraversalOrder = [easiestConcept, ...ko.concepts.filter((c) => c.id !== easiestConcept.id)];
  }
  // Populated during the loop below, ONLY when missionArcV2 is on — lets the
  // Cambio 2 callback avoid repeating a question word-for-word when a fresh
  // variant is available. Never read/written when the flag is off.
  const usedQuestionTexts = new Set<string>();
  // exerciseGenerator.ts places its single hardest-difficulty exercise LAST
  // on purpose (see generateExercises's boss selection) so final_challenge
  // gets it deliberately — reserved here BEFORE the per-concept loop can
  // consume it, rather than hoping whatever's left in the pool by the time
  // we reach final_challenge happens to be the hard one.
  const exercisePool = [...generatedExercises];
  const bossExercise = exercisePool.length > 0 ? exercisePool.pop() : undefined;
  // Pool consumed in order, not mapped to a specific concept — the generated
  // exercises already share the document's subject/concepts, so which exact
  // concept "gets" which exercise doesn't matter pedagogically. Empty when
  // shouldGenerateExercises was false upstream, so every `nextExercise()`
  // call below returns undefined and every slide falls through to the exact
  // pre-existing distractor/trait-based behavior — conceptual material is
  // untouched.
  const nextExercise = (): GeneratedExercise | undefined => exercisePool.shift();

  // Caps how many concepts in one session get the "¿cuál de estas opciones
  // es un ejemplo de X?" framing from buildReinforcementFromTrait — with
  // few concepts, that branch's distractor pool overlaps so heavily across
  // concepts it started reading as a cloned question. Once the cap is hit,
  // later concepts fall through to the (now-shuffled, riddle-framed) trait
  // branch instead — still a real, ungenerated second question, just not
  // the example-match framing every time.
  const MAX_EXAMPLE_MATCH_PER_SESSION = 2;
  let exampleMatchUsed = 0;

  // Fill-blank: intercalates ONE genuinely different interaction format
  // instead of every concept's reinforcement being another multiple-choice
  // question — reuses the exact sentence/choice builders buildDesafio
  // already relies on (buildFillBlank + pickFillBlankChoices), just
  // packaged as a SummarySlide. Picks the first concept (in document order)
  // for which real decoy choices can be built from sibling concept names
  // (pickFillBlankChoices needs >=2 OTHER names); every other concept's
  // reinforcement is completely untouched. If no concept has enough
  // siblings, fill_blank is simply never emitted — no fabrication.
  const allConceptNames = ko.concepts.map((c) => c.name);
  const fillBlankConceptId = ko.concepts.find(
    (c, i) => pickFillBlankChoices(c.name, allConceptNames, i) !== null,
  )?.id ?? null;

  // Match-pairs: also intercalated at most once per session, using
  // buildMisionMatchPairs (name ↔ exampleShort, NOT buildMatchPairs's name ↔
  // distinctiveTrait — see that function's own comment) across every
  // concept's exampleShort (needs >=3 usable ones, same requirement
  // buildDesafio enforces for its own trait-based pairs). Since it isn't
  // tied to one specific concept's content, it's anchored to the LAST
  // concept's reinforcement slot rather than the first (fillBlankConceptId's
  // pick) — needing >=3 concepts with a usable exampleShort still means
  // "first" and "last" are always different concepts, guaranteeing the two
  // intercalated formats never collide on the same slot.
  const matchPairsResult = buildMisionMatchPairs(ko.concepts);
  const matchPairsConceptId = matchPairsResult ? ko.concepts[ko.concepts.length - 1].id : null;

  // Classify: same "at most once per session" treatment, using buildClassify
  // (needs >=2 categories with items, >=3 items total — same requirement
  // buildDesafio already enforces via ko.categories, independent of
  // ko.concepts). Anchored to the MIDDLE concept so it can never collide
  // with fill_blank (first) or match_pairs (last): whenever match_pairs is
  // active (requires >=3 concepts), floor(N/2) is provably distinct from
  // both 0 and N-1. If categories happen to be eligible with too few
  // concepts for that to hold, the collision is checked explicitly below
  // and classify is simply skipped rather than risk overwriting another
  // format's slot — no fabrication either way.
  const classifyResult = buildClassify(ko);
  const classifyConceptIdCandidate = classifyResult
    ? ko.concepts[Math.floor(ko.concepts.length / 2)]?.id ?? null
    : null;
  const classifyConceptId = classifyResult
    && classifyConceptIdCandidate
    && classifyConceptIdCandidate !== fillBlankConceptId
    && classifyConceptIdCandidate !== matchPairsConceptId
    ? classifyConceptIdCandidate
    : null;

  // Fase 2 (MISSION_ARC_V2), Cambio 4 — one non-interactive progress beat
  // inserted at the concept boundary closest to the mission's midpoint,
  // only when there are >=5 taught concepts (fewer and "the middle" isn't
  // a meaningful beat). Called at each of the loop's exit points below —
  // all of them fire only AFTER a concept's entire block (its
  // main_concept/micro_challenge pair + its one reinforcement slot,
  // whichever format that turned out to be) has already been pushed, so
  // this can never land inside a challenge-first pair or split any slot.
  const eligibleConceptCount = conceptTraversalOrder.filter((c) => !!distractors[c.id]).length;
  const midpointTargetCount = Math.round(eligibleConceptCount / 2);
  let conceptsCompleted = 0;
  let midpointBeatInserted = false;
  const maybeInsertMidpointBeat = () => {
    conceptsCompleted++;
    if (!missionArcV2 || eligibleConceptCount < 5 || midpointBeatInserted || conceptsCompleted < midpointTargetCount) return;
    midpointBeatInserted = true;
    // title/definition are real, non-empty copy (not literally what the
    // frontend renders for this type — see message/sub — but required so
    // this slide behaves like every other one through session.tsx's own
    // quality-pass pipeline, which expects non-empty title/definition).
    slides.push({
      type: 'motivation',
      emoji: '🔥',
      title: 'Vas por la mitad.',
      definition: `Ya dominaste ${conceptsCompleted} conceptos.`,
      example: '',
      message: 'Vas por la mitad.',
      sub: `Ya dominaste ${conceptsCompleted} conceptos.`,
    });
  };

  conceptTraversalOrder.forEach((concept, conceptIdx) => {
    const d = distractors[concept.id];
    if (!d) return; // no generated question — skip this concept's loop, keep the rest intact

    // Alternates which slide opens the concept's block. Breaks the rigid
    // "concept → its question → next concept" rhythm at roughly half the
    // concept boundaries: today every block ends on a challenge slide
    // (reinforcement_challenge) and the next always opens on one too
    // (micro_challenge) — two challenge-shaped slides touching every single
    // time. Starting odd-indexed concepts with the card instead means that
    // boundary becomes challenge → card (a breather) rather than
    // challenge → challenge.
    // Fase 2 (MISSION_ARC_V2) only: the mission's very first concept
    // (conceptIdx 0 of the momentum-reordered traversal — always the
    // easiest one) is forced to open with the card instead of the quiz — a
    // confidence opener, read the easy concept before being tested on it.
    // Doesn't disturb the alternation's own purpose: concept 1's cardFirst
    // is still true on its own (1 % 2 === 1), so the challenge → card
    // breather at the concept 0→1 boundary still happens regardless.
    const cardFirst = missionArcV2 && conceptIdx === 0 ? true : conceptIdx % 2 === 1;

    const microEx = nextExercise();
    const micro = microEx ? fieldsFromExercise(microEx) : fieldsFromDistractorSet(d);
    const microSlide: SummarySlide = {
      type: 'micro_challenge',
      emoji: '🧠',
      title: cardFirst ? `Practica: ${concept.name}` : `¿Qué sabes de ${concept.name}?`,
      definition: cardFirst
        ? 'Ya viste este concepto — ponlo en práctica.'
        : 'Responde antes de ver la respuesta — así el concepto se queda contigo.',
      example: '',
      question: micro.question,
      options: micro.options,
      correctAnswer: micro.correctAnswer,
      ...(micro.wrongAnswerHints ? { wrongAnswerHints: micro.wrongAnswerHints } : {}),
      ...(micro.hint ? { hint: micro.hint } : {}),
    };
    if (missionArcV2) usedQuestionTexts.add(micro.question);

    const cardSlide: SummarySlide = {
      type: 'main_concept',
      // Falls back to the generic 💡 when comprehension.ts had no clear
      // thematic emoji for this concept (concept.emoji === null) — never a
      // blank icon.
      emoji: concept.emoji || '💡',
      title: concept.name,
      definition: concept.simpleExplanation,
      example: concept.example ?? '',
      hook: concept.hook,
      keyPhrase: concept.keyPhrase,
      formalDefinition: concept.definition,
      ...(concept.tips[0] ? { tip: concept.tips[0] } : {}),
    };

    slides.push(...(cardFirst ? [cardSlide, microSlide] : [microSlide, cardSlide]));

    // A DIFFERENT question than the micro's, not the same one reshuffled.
    // This concept's slot is reserved for the intercalated fill_blank,
    // match_pairs, or classify format when it's the chosen one — checked
    // BEFORE touching the exercise pool, so a generated exercise is never
    // silently consumed and dropped for a concept that ends up not using it.
    if (concept.id === classifyConceptId && classifyResult) {
      // Shuffled here (not in buildClassify, which buildDesafio also calls)
      // so this is 100% local to the Misión's own slide construction — zero
      // risk to Desafío. buildClassify's items come flatMap'd category by
      // category (see its own source), i.e. block-grouped in the source
      // order — rendered as-is, that clusters same-category items together
      // and quietly hints the answer before the student reads anything.
      const shuffledItems = shuffleArray(classifyResult.items);
      slides.push({
        type: 'classify',
        emoji: '🗂️',
        title: 'Clasifica cada elemento',
        definition: '',
        example: '',
        classifyPrompt: classifyResult.prompt,
        classifyCategories: classifyResult.categories,
        classifyItems: shuffledItems.map((it, idx) => ({ id: `item-${idx}`, text: it.text, category: it.category })),
      });
      maybeInsertMidpointBeat();
      return;
    }
    if (concept.id === matchPairsConceptId && matchPairsResult) {
      slides.push({
        type: 'match_pairs',
        emoji: '🔗',
        title: 'Relaciona los conceptos',
        definition: matchPairsResult.prompt,
        example: '',
        pairs: matchPairsResult.pairs.map((p, idx) => ({ id: `pair-${idx}`, left: p.left, right: p.right })),
        pairsPrompt: matchPairsResult.prompt,
      });
      maybeInsertMidpointBeat();
      return;
    }
    if (concept.id === fillBlankConceptId) {
      const picked = pickFillBlankChoices(concept.name, allConceptNames, conceptIdx);
      if (picked) {
        slides.push({
          type: 'fill_blank',
          emoji: '📝',
          title: 'Completa la frase',
          definition: `Aplica lo que acabas de aprender sobre ${concept.name}.`,
          example: '',
          blankSentence: buildFillBlank(concept),
          blankChoices: picked.choices,
          blankAnswer: picked.correctAnswer,
          // Mirrors blankAnswer — session.tsx's own answer evaluator uses
          // blankAnswer (per the instruction), but the shared
          // renderChallengeFeedback panel (deliberately left untouched)
          // was written before fill_blank existed and only ever reads
          // `correctAnswer`. Setting both to the same letter is the
          // no-code-change way to keep that shared panel correct here too.
          correctAnswer: picked.correctAnswer,
          blankExplanation: concept.definition,
        });
      }
      maybeInsertMidpointBeat();
      return;
    }

    // Prefers a generated exercise (also guaranteed distinct); falls back to
    // the distinctiveTrait-derived recognition question, dropped entirely
    // when neither is available — one question per concept beats two
    // identical ones.
    const reinforcementEx = nextExercise();
    if (reinforcementEx) {
      const r = fieldsFromExercise(reinforcementEx);
      slides.push({
        type: 'reinforcement_challenge',
        emoji: '🎯',
        title: 'Refuerzo',
        definition: `Aplica lo que acabas de aprender sobre ${concept.name}.`,
        example: '',
        question: r.question,
        options: r.options,
        correctAnswer: r.correctAnswer,
        ...(r.wrongAnswerHints ? { wrongAnswerHints: r.wrongAnswerHints } : {}),
        ...(r.hint ? { hint: r.hint } : {}),
      });
      if (missionArcV2) usedQuestionTexts.add(r.question);
    } else {
      const allowExample = exampleMatchUsed < MAX_EXAMPLE_MATCH_PER_SESSION;
      const traitQuestion = buildReinforcementFromTrait(concept, ko.concepts, allowExample);
      if (traitQuestion) {
        if (traitQuestion.usedExample) exampleMatchUsed++;
        const reinforcement = shuffleWithLetterAnswer(traitQuestion.correctText, traitQuestion.distractors);
        slides.push({
          type: 'reinforcement_challenge',
          emoji: '🎯',
          title: 'Refuerzo',
          definition: `Aplica lo que acabas de aprender sobre ${concept.name}.`,
          example: '',
          question: traitQuestion.question,
          options: reinforcement.options,
          correctAnswer: reinforcement.correctAnswer,
        });
        if (missionArcV2) usedQuestionTexts.add(traitQuestion.question);
      }
    }
    maybeInsertMidpointBeat();
  });

  // Worked examples: solved exercises from the material, placed after all
  // concepts are taught and before the application/final challenge — concept
  // first, then how it's applied in a real solved exercise, then the
  // student's own attempt. `steps` may be absent per-item (procedural.ts's
  // B-mínima fallback when the model's derivation didn't validate) — the
  // slide is still included with just statement/answer, never fabricating
  // a path, same as buildDesafio already does.
  if (workedExampleResults.length > 0) {
    // A dedicated type, NOT 'main_concept' — this is a transition screen, not
    // a real taught concept. Giving it 'main_concept' used to make it count
    // as one everywhere that type is treated as "a concept the student saw"
    // (victory's concept list, the concept-card color rotation), which is
    // exactly why "Veamos cómo se resuelve" was showing up as a concept on
    // the Misión-complete screen.
    slides.push({
      type: 'worked_example_intro',
      emoji: '✏️',
      title: 'Veamos cómo se resuelve',
      definition: 'Estos son ejercicios resueltos paso a paso del material.',
      example: '',
    });
    workedExampleResults.forEach((result) => {
      slides.push(buildWorkedExampleSummarySlide(result));
    });
  }

  const bossConcept = ko.concepts.reduce((max, c) => (c.difficulty > max.difficulty ? c : max));
  const bossDistractor = distractors[bossConcept.id];
  const bossEx = bossExercise;

  // Cambio 2 (Callback espaciado) — a single reinforcement_challenge pulled
  // from an earlier, already-taught concept (never the boss's — that
  // question is reserved for final_challenge right after this), right
  // before the mission's final stretch. Tries easiestConcept first (freshest
  // in the student's mind at the START, now the furthest away in time),
  // then falls back to the earliest-in-document-order concept that still
  // has a usable question. Omitted entirely if none do — never fabricated.
  if (missionArcV2) {
    const callbackCandidates = [
      // Single-concept sessions have easiestConcept === bossConcept — no
      // earlier concept exists in that case, so it's excluded here too
      // rather than accidentally reusing the boss's own question.
      ...(easiestConcept.id !== bossConcept.id ? [easiestConcept] : []),
      ...ko.concepts.filter((c) => c.id !== easiestConcept.id && c.id !== bossConcept.id),
    ];
    for (const candidate of callbackCandidates) {
      const variant = reinforcementCallbackVariant(candidate, ko.concepts, distractors[candidate.id], usedQuestionTexts);
      if (variant) {
        slides.push({
          type: 'reinforcement_challenge',
          emoji: '🎯',
          title: 'Repaso rápido',
          definition: `Un vistazo rápido de vuelta a ${candidate.name}.`,
          example: '',
          question: variant.question,
          options: variant.options,
          correctAnswer: variant.correctAnswer,
        });
        break;
      }
    }
  }

  if (bossEx) {
    const boss = fieldsFromExercise(bossEx);
    slides.push({
      type: 'final_challenge',
      emoji: '🏆',
      title: `Desafío final: ${bossConcept.name}`,
      definition: 'Demuestra que dominas el concepto más exigente de esta sesión.',
      example: '',
      question: boss.question,
      options: boss.options,
      correctAnswer: boss.correctAnswer,
      ...(boss.wrongAnswerHints ? { wrongAnswerHints: boss.wrongAnswerHints } : {}),
      ...(boss.hint ? { hint: boss.hint } : {}),
    });
  } else if (bossDistractor) {
    const boss = shuffleWithLetterAnswer(bossDistractor.correctText, bossDistractor.distractors.map((x) => x.text));
    slides.push({
      type: 'final_challenge',
      emoji: '🏆',
      title: `Desafío final: ${bossConcept.name}`,
      definition: 'Demuestra que dominas el concepto más exigente de esta sesión.',
      example: '',
      question: bossDistractor.question,
      options: boss.options,
      correctAnswer: boss.correctAnswer,
      wrongAnswerHints: buildWrongAnswerHints(boss.options, bossDistractor.distractors),
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
