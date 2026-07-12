/**
 * assemble.ts — unit tests for buildSummarySlides, focused on the
 * "correctAnswer must be a letter, not literal text" regression: the
 * frontend Mission player stores the tapped LETTER and compares it
 * against `slide.correctAnswer` for every interactive slide type. Storing
 * the literal answer text there (as this function used to) made that
 * comparison always false — the student was never marked correct, and
 * the CTA's wrong-answer feedback path fired on every answer.
 */

import { describe, it, expect } from 'vitest';
import { buildSummarySlides, shuffleWithLetterAnswer, buildReinforcementFromTrait } from '../assemble.js';
import type { KnowledgeObject, KnowledgeConcept } from '../types.js';
import type { DistractorSet } from '../distractors.js';
import type { GeneratedExercise } from '../exerciseGenerator.js';

const LETTERS = ['A', 'B', 'C', 'D'];

describe('shuffleWithLetterAnswer', () => {
  it('returns a correctAnswer letter that indexes back to the correct text', () => {
    for (let i = 0; i < 20; i++) {
      const { options, correctAnswer } = shuffleWithLetterAnswer('3x²', ['2x - 1', 'x + 2', '5']);
      expect(options).toHaveLength(4);
      expect(LETTERS).toContain(correctAnswer);
      expect(options[LETTERS.indexOf(correctAnswer)]).toBe('3x²');
    }
  });
});

const makeConcept = (id: string, name: string, distinctiveTrait: string): KnowledgeConcept => ({
  id, name, distinctiveTrait,
  simpleExplanation: '', definition: '', example: null, tips: [], difficulty: 1, sourceQuote: '',
});

describe('buildReinforcementFromTrait (no-AI second question)', () => {
  it('falls back to the trait/name question when no concept has an example', () => {
    const concepts = [
      makeConcept('c1', 'Monomio', 'Es el único con un solo término.'),
      makeConcept('c2', 'Binomio', 'Es el único con dos términos.'),
      makeConcept('c3', 'Trinomio', 'Es el único con tres términos.'),
    ];
    const result = buildReinforcementFromTrait(concepts[0], concepts);
    expect(result).not.toBeNull();
    expect(result!.correctText).toBe('Monomio');
    expect(result!.question).toContain('Es el único con un solo término.');
    expect(result!.distractors).toEqual(['Binomio', 'Trinomio']);
    expect(result!.distractors).not.toContain('Monomio');
  });

  it('caps distractors at 3 even with more concepts available', () => {
    const concepts = ['a', 'b', 'c', 'd', 'e'].map((n, i) => makeConcept(`c${i}`, n, `trait-${n}`));
    const result = buildReinforcementFromTrait(concepts[0], concepts);
    expect(result!.distractors).toHaveLength(3);
  });

  it('returns null when there are no other concepts to use as distractors', () => {
    const concepts = [makeConcept('c1', 'Solo concepto', 'trait')];
    expect(buildReinforcementFromTrait(concepts[0], concepts)).toBeNull();
  });

  it('prefers an example-based question when the concept and at least one other have examples', () => {
    const withExample = (id: string, name: string, trait: string, example: string): KnowledgeConcept => ({
      ...makeConcept(id, name, trait),
      example,
    });
    const concepts = [
      withExample('c1', 'Término algebraico', 'Es el único formado por coeficiente y parte literal.', '5x²'),
      withExample('c2', 'Términos semejantes', 'Es el único que compara partes literales.', '3x y 5x'),
    ];
    const result = buildReinforcementFromTrait(concepts[0], concepts);
    expect(result).not.toBeNull();
    expect(result!.correctText).toBe('5x²');
    expect(result!.distractors).toEqual(['3x y 5x']);
    expect(result!.question).toContain('ejemplo');
  });

  it('falls back to the trait question when the concept has an example but no OTHER concept does', () => {
    const concept = { ...makeConcept('c1', 'Monomio', 'trait'), example: '3x²' };
    const other = makeConcept('c2', 'Binomio', 'otra característica'); // example: null
    const result = buildReinforcementFromTrait(concept, [concept, other]);
    expect(result).not.toBeNull();
    expect(result!.correctText).toBe('Monomio');
    expect(result!.distractors).toEqual(['Binomio']);
  });
});

const ko: KnowledgeObject = {
  topic: 'Expresiones algebraicas',
  subject: 'Matemática',
  concepts: [
    {
      id: 'c1',
      name: 'Término algebraico',
      simpleExplanation: 'Un número junto a una letra.',
      definition: 'Un término algebraico combina un coeficiente y una parte literal.',
      example: '5x²',
      tips: [],
      difficulty: 2,
      distinctiveTrait: 'Es el único formado por un coeficiente y una parte literal.',
      sourceQuote: 'Un término algebraico está compuesto por un coeficiente numérico y una parte literal.',
    },
    {
      id: 'c2',
      name: 'Términos semejantes',
      simpleExplanation: 'Términos con la misma parte literal.',
      definition: 'Dos términos son semejantes cuando comparten la misma parte literal.',
      example: '3x y 5x',
      tips: [],
      difficulty: 4,
      distinctiveTrait: 'Es el único que exige comparar la parte literal de dos términos.',
      sourceQuote: 'Dos términos son semejantes cuando tienen exactamente la misma parte literal.',
    },
  ],
  categories: [],
  workedExamples: [],
};

const distractors: Record<string, DistractorSet> = {
  c1: {
    question: '¿Cuál de las siguientes opciones representa un término algebraico?',
    correctText: '3x²',
    distractors: ['2x - 1', 'x + 2', '5'],
  },
  c2: {
    question: '¿Cuáles de los siguientes son términos semejantes?',
    correctText: '3x y 5x',
    distractors: ['3x y 3x²', '3x y 3y', '3 y 5'],
  },
};

describe('buildSummarySlides — correctAnswer format', () => {
  it('stores correctAnswer as a letter that resolves to the correct text within options, for micro_challenge/final_challenge', () => {
    const slides = buildSummarySlides(ko, distractors);
    // reinforcement_challenge is excluded here — its correct answer is a concept
    // name (see the dedicated describe block below), not the distractor set's text.
    const interactive = slides.filter((s) => s.type === 'micro_challenge' || s.type === 'final_challenge');

    expect(interactive.length).toBeGreaterThan(0);
    for (const slide of interactive) {
      expect(LETTERS).toContain(slide.correctAnswer);
      const letterIdx = LETTERS.indexOf(slide.correctAnswer!);
      const chosenText = (slide.options as string[])[letterIdx];
      // The boss slide reuses the hardest concept's distractor set (c2 here, difficulty 4);
      // the others use their own concept's set — either way, the letter must resolve to
      // that same set's correctText, never to a distractor.
      const isC1 = chosenText === distractors.c1.correctText;
      const isC2 = chosenText === distractors.c2.correctText;
      expect(isC1 || isC2).toBe(true);
    }
  });

  it('reinforcement_challenge asks a genuinely different question than micro_challenge for the same concept', () => {
    const slides = buildSummarySlides(ko, distractors);
    const micro = slides.find((s) => s.type === 'micro_challenge');
    const reinforcement = slides.find((s) => s.type === 'reinforcement_challenge');

    expect(micro?.question).toBeTruthy();
    expect(reinforcement?.question).toBeTruthy();
    expect(reinforcement?.question).not.toBe(micro?.question);
    // Both concepts in `ko` have a real `example`, so its options are the
    // document's own examples, not the distractor set's text or concept names.
    expect(reinforcement?.options).toContain('5x²');
  });

  it('reinforcement_challenge correctAnswer resolves to the concept\'s own example', () => {
    const slides = buildSummarySlides(ko, distractors);
    const reinforcement = slides.find((s) => s.type === 'reinforcement_challenge' && s.title === 'Refuerzo' && s.definition?.includes('Término algebraico'));
    expect(reinforcement).toBeTruthy();

    const letterIdx = LETTERS.indexOf(reinforcement!.correctAnswer!);
    expect((reinforcement!.options as string[])[letterIdx]).toBe('5x²');
  });

  it('skips a concept entirely (no micro_challenge/main_concept/reinforcement_challenge triple) when it has no distractor', () => {
    const partialDistractors: Record<string, DistractorSet> = { c1: distractors.c1 }; // c2 missing
    const slides = buildSummarySlides(ko, partialDistractors);

    const tripleTypes = new Set(['micro_challenge', 'main_concept', 'reinforcement_challenge']);
    const c2Slides = slides.filter((s) => tripleTypes.has(s.type) && (s.title?.includes('Términos semejantes') || s.definition?.includes('semejantes')));
    expect(c2Slides).toHaveLength(0);
  });

  it('returns an empty array when there are no concepts', () => {
    expect(buildSummarySlides({ ...ko, concepts: [] }, distractors)).toEqual([]);
  });
});

describe('buildSummarySlides — worked examples in Misión', () => {
  it('produces the same slide types/count when workedExampleResults is omitted vs explicitly empty', () => {
    // Compares types only — options are freshly shuffled on every call, so
    // exact-array equality would be flaky regardless of workedExampleResults.
    const withDefault = buildSummarySlides(ko, distractors);
    const withExplicitEmpty = buildSummarySlides(ko, distractors, []);
    expect(withDefault.map((s) => s.type)).toEqual(withExplicitEmpty.map((s) => s.type));
    expect(withDefault.some((s) => s.type === 'worked_example')).toBe(false);
  });

  it('inserts a transition slide + one worked_example per result, after all concepts and before final_challenge', () => {
    const slides = buildSummarySlides(ko, distractors, [
      { statement: '2m − 5n + 6m − m + 11n', answer: '7m + 6n', steps: ['Agrupa términos en m', 'Agrupa términos en n'] },
    ]);

    const lastConceptTripleIdx = slides.findIndex((s) => s.type === 'reinforcement_challenge' && s.title === 'Refuerzo' && s.definition?.includes('Términos semejantes'));
    const finalChallengeIdx = slides.findIndex((s) => s.type === 'final_challenge');
    const workedIdx = slides.findIndex((s) => s.type === 'worked_example');
    const transitionIdx = slides.findIndex((s) => s.title === 'Veamos cómo se resuelve');

    expect(transitionIdx).toBeGreaterThan(lastConceptTripleIdx);
    // Not 'main_concept' — a transition screen shouldn't be counted as a
    // taught concept anywhere that type drives that logic (victory's concept
    // list, the concept-card color rotation).
    expect(slides[transitionIdx].type).toBe('worked_example_intro');
    expect(workedIdx).toBeGreaterThan(transitionIdx);
    expect(finalChallengeIdx).toBeGreaterThan(workedIdx);
    expect(slides.some((s) => s.type === 'application')).toBe(false);

    const workedSlide = slides[workedIdx];
    expect(workedSlide.statement).toBe('2m − 5n + 6m − m + 11n');
    expect(workedSlide.answer).toBe('7m + 6n');
    expect(workedSlide.steps).toEqual(['Agrupa términos en m', 'Agrupa términos en n']);
    // definition/example are filled too, for any render path that only knows the legacy fields.
    expect(workedSlide.definition).toBe(workedSlide.statement);
    expect(workedSlide.example).toBe(workedSlide.answer);
  });

  it('omits steps (undefined) when validation failed (B-mínima) — never fabricates a path', () => {
    const slides = buildSummarySlides(ko, distractors, [
      { statement: '2m − 5n + 6m − m + 11n', answer: '7m + 6n', steps: null },
    ]);

    const workedSlide = slides.find((s) => s.type === 'worked_example');
    expect(workedSlide?.statement).toBe('2m − 5n + 6m − m + 11n');
    expect(workedSlide?.answer).toBe('7m + 6n');
    expect(workedSlide?.steps).toBeUndefined();
  });

  it('inserts one worked_example slide per result, in order', () => {
    const slides = buildSummarySlides(ko, distractors, [
      { statement: 'a', answer: '1', steps: null },
      { statement: 'b', answer: '2', steps: null },
    ]);

    const workedSlides = slides.filter((s) => s.type === 'worked_example');
    expect(workedSlides).toHaveLength(2);
    expect(workedSlides[0].statement).toBe('a');
    expect(workedSlides[1].statement).toBe('b');
  });
});

describe('buildSummarySlides — generated exercises', () => {
  const makeExercise = (statement: string, correctAnswer: string): GeneratedExercise => ({
    statement,
    correctAnswer,
    distractors: [
      { text: `${correctAnswer}-wrong1`, explanation: 'explicación 1' },
      { text: `${correctAnswer}-wrong2`, explanation: 'explicación 2' },
      { text: `${correctAnswer}-wrong3`, explanation: 'explicación 3' },
    ],
    hint: `pista para ${correctAnswer}`,
    kind: 'calculation',
  });

  it('produces the exact same slide types when the exercise pool is empty (default vs explicit)', () => {
    const withDefault = buildSummarySlides(ko, distractors);
    const withExplicitEmpty = buildSummarySlides(ko, distractors, [], []);
    expect(withDefault.map((s) => s.type)).toEqual(withExplicitEmpty.map((s) => s.type));
  });

  it('uses a generated exercise for micro_challenge instead of the distractor set, when available', () => {
    const ex = makeExercise('Reduce: 3a + 2a', '5a');
    const slides = buildSummarySlides(ko, distractors, [], [ex]);
    const micro = slides.find((s) => s.type === 'micro_challenge');

    expect(micro?.question).toBe('Reduce: 3a + 2a');
    const letterIdx = LETTERS.indexOf(micro!.correctAnswer!);
    expect((micro!.options as string[])[letterIdx]).toBe('5a');
    expect(micro?.hint).toBe('pista para 5a');
  });

  it('maps wrongAnswerHints to the letter each distractor landed on after shuffling', () => {
    const ex = makeExercise('Reduce: 3a + 2a', '5a');
    const slides = buildSummarySlides(ko, distractors, [], [ex]);
    const micro = slides.find((s) => s.type === 'micro_challenge')!;

    expect(Object.keys(micro.wrongAnswerHints ?? {})).toHaveLength(3);
    for (const [letter, explanation] of Object.entries(micro.wrongAnswerHints ?? {})) {
      const optionAtLetter = (micro.options as string[])[LETTERS.indexOf(letter)];
      const matchingDistractor = ex.distractors.find((d) => d.text === optionAtLetter);
      expect(matchingDistractor).toBeTruthy();
      expect(matchingDistractor!.explanation).toBe(explanation);
    }
  });

  it('consumes the pool in order (micro then reinforcement) across concepts, falling back once exhausted', () => {
    const ex1 = makeExercise('ejercicio-1', 'r1');
    const ex2 = makeExercise('ejercicio-2', 'r2');
    const slides = buildSummarySlides(ko, distractors, [], [ex1, ex2]);

    const micros = slides.filter((s) => s.type === 'micro_challenge');
    const reinforcements = slides.filter((s) => s.type === 'reinforcement_challenge');

    // c1's triple consumes both exercises (micro, then reinforcement); c2's
    // triple finds the pool empty and falls back to its usual sources.
    expect(micros[0].question).toBe('ejercicio-1');
    expect(reinforcements[0].question).toBe('ejercicio-2');
    expect(micros[1].question).toBe(distractors.c2.question);
    expect(reinforcements[1].question).not.toBe('ejercicio-1');
    expect(reinforcements[1].question).not.toBe('ejercicio-2');
  });

  it('uses a leftover exercise for final_challenge when the pool still has one after the concept loop', () => {
    // 2 concepts * 2 slots (micro + reinforcement) = 4 consumed by the loop;
    // a 5th is left over for final_challenge.
    const exercises = ['ejercicio-1', 'ejercicio-2', 'ejercicio-3', 'ejercicio-4', 'ejercicio-final']
      .map((statement, i) => makeExercise(statement, `r${i}`));
    const slides = buildSummarySlides(ko, distractors, [], exercises);

    const final = slides.find((s) => s.type === 'final_challenge');
    expect(final?.question).toBe('ejercicio-final');
  });

  it('falls back to the boss distractor for final_challenge when the pool is exhausted', () => {
    const slides = buildSummarySlides(ko, distractors, [], []);
    const final = slides.find((s) => s.type === 'final_challenge');
    expect(final?.question).toBe(distractors.c2.question); // c2 is the hardest concept (difficulty 4)
  });
});
