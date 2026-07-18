/**
 * assemble.ts — unit tests for buildSummarySlides, focused on the
 * "correctAnswer must be a letter, not literal text" regression: the
 * frontend Mission player stores the tapped LETTER and compares it
 * against `slide.correctAnswer` for every interactive slide type. Storing
 * the literal answer text there (as this function used to) made that
 * comparison always false — the student was never marked correct, and
 * the CTA's wrong-answer feedback path fired on every answer.
 */

import { describe, it, expect, vi } from 'vitest';
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
  simpleExplanation: '', definition: '', example: null, exampleShort: null, hook: null, emoji: null, keyPhrase: null, advancedExamples: [], tips: [], difficulty: 1, sourceQuote: '',
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
    // Order isn't guaranteed — the pool is shuffled so repeated calls don't
    // always surface the same distractors in the same order.
    expect(result!.distractors.slice().sort()).toEqual(['Binomio', 'Trinomio']);
    expect(result!.distractors).not.toContain('Monomio');
    expect(result!.usedExample).toBe(false);
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
    expect(result!.usedExample).toBe(true);
  });

  it('falls back to the trait question when the concept has an example but no OTHER concept does', () => {
    const concept = { ...makeConcept('c1', 'Monomio', 'trait'), example: '3x²' };
    const other = makeConcept('c2', 'Binomio', 'otra característica'); // example: null
    const result = buildReinforcementFromTrait(concept, [concept, other]);
    expect(result).not.toBeNull();
    expect(result!.correctText).toBe('Monomio');
    expect(result!.distractors).toEqual(['Binomio']);
    expect(result!.usedExample).toBe(false);
  });

  it('skips the example branch when preferExample=false, even if both concepts have examples', () => {
    const withExample = (id: string, name: string, trait: string, example: string): KnowledgeConcept => ({
      ...makeConcept(id, name, trait),
      example,
    });
    const concepts = [
      withExample('c1', 'Término algebraico', 'Es el único formado por coeficiente y parte literal.', '5x²'),
      withExample('c2', 'Términos semejantes', 'Es el único que compara partes literales.', '3x y 5x'),
    ];
    const result = buildReinforcementFromTrait(concepts[0], concepts, false);
    expect(result).not.toBeNull();
    expect(result!.usedExample).toBe(false);
    expect(result!.correctText).toBe('Término algebraico');
    expect(result!.question).toContain('pista');
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
      exampleShort: '5x²',
      hook: null,
      emoji: null,
      keyPhrase: null,
      advancedExamples: [],
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
      exampleShort: '3x y 5x',
      hook: null,
      emoji: null,
      keyPhrase: null,
      advancedExamples: [],
      tips: [],
      difficulty: 4,
      distinctiveTrait: 'Es el único que exige comparar la parte literal de dos términos.',
      sourceQuote: 'Dos términos son semejantes cuando tienen exactamente la misma parte literal.',
    },
  ],
  categories: [],
  workedExamples: [],
};

const asDistractors = (texts: string[]) => texts.map((text) => ({ text, explanation: `Explicación de ${text}.` }));

const distractors: Record<string, DistractorSet> = {
  c1: {
    question: '¿Cuál de las siguientes opciones representa un término algebraico?',
    correctText: '3x²',
    distractors: asDistractors(['2x - 1', 'x + 2', '5']),
  },
  c2: {
    question: '¿Cuáles de los siguientes son términos semejantes?',
    correctText: '3x y 5x',
    distractors: asDistractors(['3x y 3x²', '3x y 3y', '3 y 5']),
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
    // A 2nd exercise is included because the LAST array element is always
    // reserved for final_challenge first (see the dedicated boss-reservation
    // tests below) — with only 1 exercise, it would be reserved as the boss
    // instead of reaching micro_challenge at all.
    const ex = makeExercise('Reduce: 3a + 2a', '5a');
    const reserve = makeExercise('reservado-para-boss', 'rb');
    const slides = buildSummarySlides(ko, distractors, [], [ex, reserve]);
    const micro = slides.find((s) => s.type === 'micro_challenge');

    expect(micro?.question).toBe('Reduce: 3a + 2a');
    const letterIdx = LETTERS.indexOf(micro!.correctAnswer!);
    expect((micro!.options as string[])[letterIdx]).toBe('5a');
    expect(micro?.hint).toBe('pista para 5a');
  });

  it('maps wrongAnswerHints to the letter each distractor landed on after shuffling', () => {
    const ex = makeExercise('Reduce: 3a + 2a', '5a');
    const reserve = makeExercise('reservado-para-boss', 'rb');
    const slides = buildSummarySlides(ko, distractors, [], [ex, reserve]);
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
    const boss = makeExercise('ejercicio-boss', 'rb');
    // 3rd exercise is reserved for final_challenge before the loop runs —
    // only ex1/ex2 remain for micro/reinforcement.
    const slides = buildSummarySlides(ko, distractors, [], [ex1, ex2, boss]);

    const micros = slides.filter((s) => s.type === 'micro_challenge');
    const reinforcements = slides.filter((s) => s.type === 'reinforcement_challenge');
    const final = slides.find((s) => s.type === 'final_challenge');

    // c1's triple consumes both remaining exercises (micro, then
    // reinforcement); c2's triple finds the pool empty and falls back to
    // its usual sources.
    expect(micros[0].question).toBe('ejercicio-1');
    expect(reinforcements[0].question).toBe('ejercicio-2');
    expect(micros[1].question).toBe(distractors.c2.question);
    expect(reinforcements[1].question).not.toBe('ejercicio-1');
    expect(reinforcements[1].question).not.toBe('ejercicio-2');
    expect(final?.question).toBe('ejercicio-boss');
  });

  describe('final_challenge boss reservation', () => {
    it('always reserves the LAST array element for final_challenge, before the per-concept loop can consume it', () => {
      // 2 concepts * 2 slots (micro + reinforcement) = 4 — exactly enough for
      // the loop — plus a 5th, which must be reserved for final_challenge
      // rather than left to chance as a "leftover".
      const exercises = ['ejercicio-1', 'ejercicio-2', 'ejercicio-3', 'ejercicio-4', 'ejercicio-final']
        .map((statement, i) => makeExercise(statement, `r${i}`));
      const slides = buildSummarySlides(ko, distractors, [], exercises);

      const final = slides.find((s) => s.type === 'final_challenge');
      expect(final?.question).toBe('ejercicio-final');
      // None of the loop's slides accidentally picked up the reserved one.
      const others = slides.filter((s) => s.type === 'micro_challenge' || s.type === 'reinforcement_challenge');
      expect(others.some((s) => s.question === 'ejercicio-final')).toBe(false);
    });

    it('reserves the boss even when the pool has fewer exercises than the loop needs', () => {
      // Only 1 exercise total: reserved for final_challenge, leaving zero
      // for the loop — both c1 and c2 fall back to their usual sources.
      const only = makeExercise('unico-ejercicio', 'ru');
      const slides = buildSummarySlides(ko, distractors, [], [only]);

      const final = slides.find((s) => s.type === 'final_challenge');
      const micros = slides.filter((s) => s.type === 'micro_challenge');
      expect(final?.question).toBe('unico-ejercicio');
      expect(micros.every((s) => s.question !== 'unico-ejercicio')).toBe(true);
    });

    it('falls back to the boss distractor for final_challenge when the pool is exhausted', () => {
      const slides = buildSummarySlides(ko, distractors, [], []);
      const final = slides.find((s) => s.type === 'final_challenge');
      expect(final?.question).toBe(distractors.c2.question); // c2 is the hardest concept (difficulty 4)
    });
  });
});

describe('buildSummarySlides — Fase 2: Arco de la misión (MISSION_ARC_V2)', () => {
  // Deliberately NOT in difficulty order — c1 (mid), c2 (easiest, should be
  // promoted to front when the flag is on), c3 (hardest, stays the boss).
  const makeArcConcept = (id: string, name: string, difficulty: number): KnowledgeConcept => ({
    id, name, difficulty,
    simpleExplanation: `${name} explicación.`,
    definition: `${name} definición.`,
    example: null, exampleShort: null, hook: null, emoji: null, keyPhrase: null,
    advancedExamples: [], tips: [],
    distinctiveTrait: `Es el único que distingue a ${name}.`,
    sourceQuote: `Fuente de ${name}.`,
  });

  const arcKo: KnowledgeObject = {
    topic: 'Arco de misión', subject: 'Test',
    concepts: [
      makeArcConcept('c1', 'Concepto Medio', 3),
      makeArcConcept('c2', 'Concepto Fácil', 1),
      makeArcConcept('c3', 'Concepto Difícil', 5),
    ],
    categories: [], workedExamples: [],
  };

  const makeArcDistractor = (name: string): DistractorSet => ({
    question: `¿Pregunta sobre ${name}?`,
    correctText: `Respuesta de ${name}`,
    distractors: [
      { text: `Distractor A de ${name}`, explanation: `Explicación A de ${name}.` },
      { text: `Distractor B de ${name}`, explanation: `Explicación B de ${name}.` },
      { text: `Distractor C de ${name}`, explanation: `Explicación C de ${name}.` },
    ],
  });

  const arcDistractors: Record<string, DistractorSet> = {
    c1: makeArcDistractor('Concepto Medio'),
    c2: makeArcDistractor('Concepto Fácil'),
    c3: makeArcDistractor('Concepto Difícil'),
  };

  it('is byte-identical to the flag omitted, and to today\'s document order, when off', () => {
    // buildSummarySlides shuffles options internally (Math.random), so two
    // independent calls never match by coincidence — pin randomness so both
    // calls draw the identical sequence, isolating the ONE thing this test
    // actually checks: that adding the missionArcV2 parameter (defaulted to
    // false) changed nothing for a caller that doesn't pass it.
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValue(0.42);
    const withDefault = buildSummarySlides(arcKo, arcDistractors);
    randomSpy.mockReturnValue(0.42);
    const withExplicitFalse = buildSummarySlides(arcKo, arcDistractors, [], [], false);
    randomSpy.mockRestore();
    expect(withDefault).toEqual(withExplicitFalse);

    // Document order preserved: c1 (Concepto Medio) is still taught first.
    const firstMainConcept = withDefault.find((s) => s.type === 'main_concept');
    expect(firstMainConcept?.title).toBe('Concepto Medio');
    // No callback slide when the flag is off.
    expect(withDefault.some((s) => s.title === 'Repaso rápido')).toBe(false);
  });

  it('Cambio 1: promotes the easiest concept to the front when the flag is on', () => {
    const slides = buildSummarySlides(arcKo, arcDistractors, [], [], true);
    const firstMainConcept = slides.find((s) => s.type === 'main_concept');
    expect(firstMainConcept?.title).toBe('Concepto Fácil');
  });

  it('Cambio 1: the hardest concept is still the boss regardless of the flag', () => {
    const off = buildSummarySlides(arcKo, arcDistractors, [], [], false);
    const on = buildSummarySlides(arcKo, arcDistractors, [], [], true);
    expect(off.find((s) => s.type === 'final_challenge')?.title).toContain('Concepto Difícil');
    expect(on.find((s) => s.type === 'final_challenge')?.title).toContain('Concepto Difícil');
  });

  it('Cambio 1: ties break to the earliest concept in document order', () => {
    const tiedKo: KnowledgeObject = {
      ...arcKo,
      concepts: [
        makeArcConcept('c1', 'Primero Empatado', 2),
        makeArcConcept('c2', 'Segundo Empatado', 2),
        makeArcConcept('c3', 'Concepto Difícil', 5),
      ],
    };
    const tiedDistractors: Record<string, DistractorSet> = {
      c1: makeArcDistractor('Primero Empatado'),
      c2: makeArcDistractor('Segundo Empatado'),
      c3: makeArcDistractor('Concepto Difícil'),
    };
    const slides = buildSummarySlides(tiedKo, tiedDistractors, [], [], true);
    expect(slides.find((s) => s.type === 'main_concept')?.title).toBe('Primero Empatado');
  });

  it('Cambio 2: inserts a "Repaso rápido" reinforcement_challenge right before final_challenge, not about the boss', () => {
    const slides = buildSummarySlides(arcKo, arcDistractors, [], [], true);
    const finalIdx = slides.findIndex((s) => s.type === 'final_challenge');
    const victoryIdx = slides.findIndex((s) => s.type === 'victory');
    expect(finalIdx).toBeGreaterThan(-1);
    expect(victoryIdx).toBe(slides.length - 1); // victory always last
    expect(finalIdx).toBe(victoryIdx - 1); // final_challenge right before victory

    const callback = slides[finalIdx - 1];
    expect(callback.type).toBe('reinforcement_challenge');
    expect(callback.title).toBe('Repaso rápido');
    expect(callback.definition).not.toContain('Concepto Difícil'); // never the boss's own concept
  });

  it('Cambio 2: never fabricates — omitted when no earlier concept has a usable question', () => {
    const soloKo: KnowledgeObject = { ...arcKo, concepts: [makeArcConcept('c1', 'Único', 3)] };
    const soloDistractors: Record<string, DistractorSet> = { c1: makeArcDistractor('Único') };
    const slides = buildSummarySlides(soloKo, soloDistractors, [], [], true);
    // Only concept is also the boss — no earlier concept exists to pull a callback from.
    expect(slides.some((s) => s.title === 'Repaso rápido')).toBe(false);
  });

  it('Cambio 2: skips the callback entirely rather than repeating a question word-for-word', () => {
    // Only 2 concepts, neither with an example/exampleShort/category — so
    // fill_blank/match_pairs/classify are all ineligible and BOTH concepts
    // fall through to buildReinforcementFromTrait for their reinforcement
    // slot. That exhausts the easiest (non-boss) concept's only two possible
    // question texts (its DistractorSet question via micro_challenge, and
    // its trait question via reinforcement_challenge) before the callback
    // stage even runs, and there's no other non-boss concept to fall back
    // to — so the callback must be omitted, never a literal repeat.
    const dupKo: KnowledgeObject = {
      ...arcKo,
      concepts: [
        makeArcConcept('c1', 'Concepto Fácil', 1),
        makeArcConcept('c2', 'Concepto Difícil', 5),
      ],
    };
    const dupDistractors: Record<string, DistractorSet> = {
      c1: makeArcDistractor('Concepto Fácil'),
      c2: makeArcDistractor('Concepto Difícil'),
    };
    const slides = buildSummarySlides(dupKo, dupDistractors, [], [], true);
    expect(slides.some((s) => s.title === 'Repaso rápido')).toBe(false);
    // Sanity check this hit the intended path — Concepto Fácil really did
    // get a reinforcement_challenge (not fill_blank/match_pairs/classify),
    // so both its texts really were already used by the time the callback
    // was attempted.
    const facilBlock = slides.filter((s) => s.definition?.includes('Concepto Fácil'));
    expect(facilBlock.some((s) => s.type === 'reinforcement_challenge')).toBe(true);
  });

  it('Cambio opcional: forces the mission-opener concept (position 0) to cardFirst=true when the flag is on', () => {
    const slides = buildSummarySlides(arcKo, arcDistractors, [], [], true);
    // The very first slide of the whole mission is the easiest concept's
    // card, not its quiz — a confidence opener.
    expect(slides[0].type).toBe('main_concept');
    expect(slides[0].title).toBe('Concepto Fácil');
  });

  it('Cambio opcional: does NOT force cardFirst when the flag is off — conceptIdx % 2 alone decides, unchanged', () => {
    const slides = buildSummarySlides(arcKo, arcDistractors, [], [], false);
    // conceptIdx 0 is even -> cardFirst false -> opens with the quiz, same
    // as before this whole phase existed.
    expect(slides[0].type).toBe('micro_challenge');
  });

  describe('Cambio 4: Beat de progreso a mitad', () => {
    const makeSixConcepts = () => [
      makeArcConcept('c1', 'Concepto Uno', 2),
      makeArcConcept('c2', 'Concepto Dos', 3),
      makeArcConcept('c3', 'Concepto Tres', 1),
      makeArcConcept('c4', 'Concepto Cuatro', 4),
      makeArcConcept('c5', 'Concepto Cinco', 2),
      makeArcConcept('c6', 'Concepto Seis', 5), // boss
    ];
    const sixKo: KnowledgeObject = { ...arcKo, concepts: makeSixConcepts() };
    const sixDistractors: Record<string, DistractorSet> = Object.fromEntries(
      makeSixConcepts().map((c) => [c.id, makeArcDistractor(c.name)]),
    );

    it('never appears when the flag is off, regardless of concept count', () => {
      const slides = buildSummarySlides(sixKo, sixDistractors, [], [], false);
      expect(slides.some((s) => s.type === 'motivation')).toBe(false);
    });

    it('is omitted in sessions with fewer than 5 taught concepts, even with the flag on', () => {
      const fourKo: KnowledgeObject = { ...arcKo, concepts: makeSixConcepts().slice(0, 4) };
      const fourDistractors = Object.fromEntries(makeSixConcepts().slice(0, 4).map((c) => [c.id, makeArcDistractor(c.name)]));
      const slides = buildSummarySlides(fourKo, fourDistractors, [], [], true);
      expect(slides.some((s) => s.type === 'motivation')).toBe(false);
    });

    it('inserts exactly one motivation slide at a clean concept boundary, with the expected copy', () => {
      const slides = buildSummarySlides(sixKo, sixDistractors, [], [], true);
      const beats = slides.filter((s) => s.type === 'motivation');
      expect(beats).toHaveLength(1);

      const beat = beats[0];
      expect(beat.emoji).toBe('🔥');
      expect(beat.message).toBe('Vas por la mitad.');
      expect(beat.sub).toMatch(/^Ya dominaste \d+ conceptos\.$/);

      // Clean boundary: never between a micro_challenge/main_concept pair —
      // the slide right before it must be a "tail" type (a concept's
      // reinforcement slot, whatever format it took) and the slide right
      // after it must open a fresh concept's block, never continue one.
      const idx = slides.findIndex((s) => s.type === 'motivation');
      const TAIL_TYPES = ['reinforcement_challenge', 'fill_blank', 'match_pairs', 'classify'];
      const OPENER_TYPES = ['main_concept', 'micro_challenge'];
      expect(TAIL_TYPES).toContain(slides[idx - 1].type);
      expect(OPENER_TYPES).toContain(slides[idx + 1].type);
    });

    it('never fabricates: the "N conceptos" count matches how many concept blocks were actually pushed before it', () => {
      const slides = buildSummarySlides(sixKo, sixDistractors, [], [], true);
      const idx = slides.findIndex((s) => s.type === 'motivation');
      const beforeIt = slides.slice(0, idx);
      const mainConceptsSeen = beforeIt.filter((s) => s.type === 'main_concept').length;
      const match = slides[idx].sub!.match(/^Ya dominaste (\d+) conceptos\.$/);
      expect(Number(match![1])).toBe(mainConceptsSeen);
    });
  });
});
