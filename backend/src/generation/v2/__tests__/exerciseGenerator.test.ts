import { describe, it, expect } from 'vitest';
import { isExercisableSubject, isValidGeneratedExercise, buildSlotPlan, TARGET_EXERCISES_PER_SESSION } from '../exerciseGenerator.js';
import type { GeneratedExercise, RawGeneratedExercise } from '../exerciseGenerator.js';
import type { KnowledgeConcept } from '../types.js';

describe('isExercisableSubject', () => {
  it('matches exercisable subjects regardless of case and accents', () => {
    expect(isExercisableSubject('Matemáticas')).toBe(true);
    expect(isExercisableSubject('matematica')).toBe(true);
    expect(isExercisableSubject('Física')).toBe(true);
    expect(isExercisableSubject('QUÍMICA')).toBe(true);
    expect(isExercisableSubject('Álgebra')).toBe(true);
    expect(isExercisableSubject('geometría')).toBe(true);
  });

  it('returns false for non-exercisable or generic subjects', () => {
    expect(isExercisableSubject('Historia')).toBe(false);
    expect(isExercisableSubject('Biología')).toBe(false);
    expect(isExercisableSubject('Tema del material')).toBe(false);
    expect(isExercisableSubject('')).toBe(false);
  });
});

const makeExercise = (overrides: Partial<RawGeneratedExercise> = {}): RawGeneratedExercise => ({
  slotId: 'ej1',
  statement: 'Reduce: 3a + 2a',
  correctAnswer: '5a',
  distractors: [
    { text: '1a', explanation: 'Resta en vez de sumar.' },
    { text: '6a', explanation: 'Suma un coeficiente de más.' },
    { text: '5a²', explanation: 'Suma los exponentes en vez de dejarlos iguales.' },
  ],
  hint: 'Suma los coeficientes.',
  kind: 'calculation',
  ...overrides,
});

describe('isValidGeneratedExercise', () => {
  it('accepts a well-formed exercise', () => {
    expect(isValidGeneratedExercise(makeExercise())).toBe(true);
  });

  it('rejects an exercise with an empty slotId/statement/correctAnswer/hint', () => {
    expect(isValidGeneratedExercise(makeExercise({ slotId: '' }))).toBe(false);
    expect(isValidGeneratedExercise(makeExercise({ statement: '' }))).toBe(false);
    expect(isValidGeneratedExercise(makeExercise({ correctAnswer: '   ' }))).toBe(false);
    expect(isValidGeneratedExercise(makeExercise({ hint: '' }))).toBe(false);
  });

  it('rejects an exercise without exactly 3 non-empty distractors', () => {
    expect(isValidGeneratedExercise(makeExercise({ distractors: makeExercise().distractors.slice(0, 2) }))).toBe(false);
    expect(isValidGeneratedExercise(makeExercise({
      distractors: [
        { text: '', explanation: 'x' },
        { text: 'a', explanation: 'x' },
        { text: 'b', explanation: 'x' },
      ],
    }))).toBe(false);
  });

  it('rejects an invalid kind', () => {
    expect(isValidGeneratedExercise(makeExercise({ kind: 'other' as GeneratedExercise['kind'] }))).toBe(false);
  });

  it('rejects null/undefined', () => {
    expect(isValidGeneratedExercise(null)).toBe(false);
    expect(isValidGeneratedExercise(undefined)).toBe(false);
  });
});

const makeConcept = (id: string, difficulty: number, advancedExamples: string[] = []): KnowledgeConcept => ({
  id,
  name: `Concepto ${id}`,
  simpleExplanation: '',
  definition: '',
  example: null,
  advancedExamples,
  tips: [],
  difficulty,
  distinctiveTrait: '',
  sourceQuote: '',
});

describe('buildSlotPlan', () => {
  it('reaches exactly TARGET_EXERCISES_PER_SESSION when concepts have no advanced variants', () => {
    const concepts = [makeConcept('c1', 2), makeConcept('c2', 3), makeConcept('c3', 4)];
    const plan = buildSlotPlan(concepts);

    expect(plan).toHaveLength(TARGET_EXERCISES_PER_SESSION);
    // Every concept has its base slot.
    for (const c of concepts) {
      expect(plan.filter((s) => s.concept.id === c.id && s.kind === 'base')).toHaveLength(1);
    }
    // The rest are practice slots (no variants exist to allocate).
    expect(plan.filter((s) => s.kind === 'practice')).toHaveLength(TARGET_EXERCISES_PER_SESSION - concepts.length);
  });

  it('guarantees every distinct advanced variant appears at least once when breadth fits under the target', () => {
    const concepts = [
      makeConcept('c1', 2, ['adv1a', 'adv1b']),
      makeConcept('c2', 3, ['adv2a']),
      makeConcept('c3', 4),
    ];
    const plan = buildSlotPlan(concepts);

    expect(plan).toHaveLength(TARGET_EXERCISES_PER_SESSION);
    const variantSlots = plan.filter((s) => s.kind === 'variant');
    expect(variantSlots).toHaveLength(3); // 2 for c1, 1 for c2
    expect(variantSlots.some((s) => s.concept.id === 'c1' && s.variantIndex === 0)).toBe(true);
    expect(variantSlots.some((s) => s.concept.id === 'c1' && s.variantIndex === 1)).toBe(true);
    expect(variantSlots.some((s) => s.concept.id === 'c2' && s.variantIndex === 0)).toBe(true);
  });

  it('trims breadth-first when variant coverage alone exceeds the target, never dropping a concept entirely', () => {
    // 5 concepts * (1 base + 3 variants) = 20 raw slots, well over 12.
    const concepts = Array.from({ length: 5 }, (_, i) =>
      makeConcept(`c${i}`, 2, [`adv${i}a`, `adv${i}b`, `adv${i}c`]));
    const plan = buildSlotPlan(concepts);

    expect(plan).toHaveLength(TARGET_EXERCISES_PER_SESSION);
    // Every concept still keeps its base slot — trimming affects variants,
    // never a concept's entire representation.
    for (const c of concepts) {
      expect(plan.some((s) => s.concept.id === c.id && s.kind === 'base')).toBe(true);
    }
    // Breadth-first: every concept's 1st variant (index 0) must be present
    // before ANY concept's 2nd variant (index 1) is — 5 bases + 5 first
    // variants = 10, leaving only 2 of the 5 possible "index 1" variants.
    const idx0Count = plan.filter((s) => s.kind === 'variant' && s.variantIndex === 0).length;
    const idx1Count = plan.filter((s) => s.kind === 'variant' && s.variantIndex === 1).length;
    expect(idx0Count).toBe(5);
    expect(idx1Count).toBe(2);
    expect(plan.filter((s) => s.kind === 'variant' && s.variantIndex === 2)).toHaveLength(0);
  });

  it('caps at 1 base exercise per concept, with no variants, once nConcepts >= the target', () => {
    const concepts = Array.from({ length: 13 }, (_, i) => makeConcept(`c${i}`, 2, [`adv${i}`]));
    const plan = buildSlotPlan(concepts);

    expect(plan).toHaveLength(13); // target bumped up to nConcepts, per concept — none dropped
    expect(plan.every((s) => s.kind === 'base')).toBe(true);
    expect(new Set(plan.map((s) => s.concept.id)).size).toBe(13);
  });

  it('assigns every slot a unique id', () => {
    const concepts = [makeConcept('c1', 2, ['adv1']), makeConcept('c2', 3, ['adv2a', 'adv2b'])];
    const plan = buildSlotPlan(concepts);
    const ids = plan.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
