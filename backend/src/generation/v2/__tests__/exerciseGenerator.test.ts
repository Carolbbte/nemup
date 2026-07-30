import { describe, it, expect } from 'vitest';
import { isExercisableSubject, isValidGeneratedExercise, buildSlotPlan, applyMathValidation, attachConceptIds, TARGET_EXERCISES_PER_SESSION } from '../exerciseGenerator.js';
import type { GeneratedExercise, RawGeneratedExercise, RankedExercise, SlotDescriptor } from '../exerciseGenerator.js';
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
  teacherExplanation: '',
  definition: '',
  example: null,
  exampleShort: null,
  hook: null,
  emoji: null,
  keyPhrase: null,
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

  describe('roleAware (FEATURE_CONTENT_TYPE_V2, Paso 3)', () => {
    it('is identical to roleAware=false when no concept is tagged "procedure" (role absent — symmetry with assemble.ts\'s own fallback)', () => {
      const concepts = [
        makeConcept('c1', 2, ['adv1a', 'adv1b']),
        makeConcept('c2', 3, ['adv2a']),
        makeConcept('c3', 4),
      ];
      const withRoleAwareOff = buildSlotPlan(concepts, false);
      const withRoleAwareOnButNoProcedure = buildSlotPlan(concepts, true);
      // Same shape: same slot kinds/counts per concept (ids differ since
      // makeId() is a fresh counter per call, so compare structure not ids).
      const shape = (plan: typeof withRoleAwareOff) => plan.map((s) => ({ concept: s.concept.id, kind: s.kind, variantIndex: s.variantIndex }));
      expect(shape(withRoleAwareOnButNoProcedure)).toEqual(shape(withRoleAwareOff));
    });

    it('caps a "supporting" concept to its 1 base slot (no variants) once the session has a "procedure" concept', () => {
      const procedure = { ...makeConcept('proc', 4, ['procVariant']), role: 'procedure' as const };
      const supporting = { ...makeConcept('sup', 2, ['supVariant']), role: 'supporting' as const };
      const plan = buildSlotPlan([procedure, supporting], true);

      expect(plan.filter((s) => s.concept.id === 'sup' && s.kind === 'variant')).toHaveLength(0);
      expect(plan.filter((s) => s.concept.id === 'proc' && s.kind === 'variant')).toHaveLength(1);
    });

    it('concentrates depth-fill practice slots on "procedure" concepts only', () => {
      const procedure = { ...makeConcept('proc', 4), role: 'procedure' as const };
      const supporting1 = { ...makeConcept('sup1', 2), role: 'supporting' as const };
      const supporting2 = { ...makeConcept('sup2', 2), role: 'supporting' as const };
      const plan = buildSlotPlan([procedure, supporting1, supporting2], true);

      const practiceSlots = plan.filter((s) => s.kind === 'practice');
      expect(practiceSlots.length).toBeGreaterThan(0);
      expect(practiceSlots.every((s) => s.concept.id === 'proc')).toBe(true);
    });
  });
});

// applyMathValidation is EXERCISE_VALIDATION_MODE-gated at the top of
// exerciseGenerator.ts — with the constant at its current 'log-only' value,
// this exercises the real (non-mocked) validateCalculationExercise but never
// reaches the 'enforce' regeneration branch (which calls the OpenAI SDK), so
// no network mocking is needed here. See that constant's own comment for why
// 'enforce' isn't unit-tested end-to-end: it's simply inert today.
describe('applyMathValidation (EXERCISE_VALIDATION_MODE = "log-only" today)', () => {
  const asDistractors = (texts: string[]) => texts.map((text) => ({ text, explanation: `Explicación de ${text}.` }));

  const makeRanked = (overrides: Partial<RawGeneratedExercise> = {}): RankedExercise => ({
    exercise: {
      slotId: 'ej1',
      statement: 'Calcula (x+6)(x+4) con x=3',
      correctAnswer: '260', // wrong — the real value is 63
      distractors: asDistractors(['56', '70', '49']),
      hint: 'Multiplica los binomios.',
      kind: 'calculation',
      checkExpression: '(x+6)(x+4)',
      variables: [{ name: 'x', value: 3 }],
      ...overrides,
    },
    difficulty: 3,
  });

  it('never removes an invalid exercise from the pool — output is byte-identical to input', async () => {
    const ranked = [makeRanked()];
    const result = await applyMathValidation(ranked, [], 'Matemática');
    expect(result).toEqual(ranked);
    expect(result).toHaveLength(1);
  });

  it('is also a no-op when every exercise is already valid', async () => {
    const ranked = [makeRanked({ correctAnswer: '63' })];
    const result = await applyMathValidation(ranked, [], 'Matemática');
    expect(result).toEqual(ranked);
  });

  it('never touches "recognition"-kind exercises — exempt from math validation regardless of garbage fields', async () => {
    const ranked = [makeRanked({ kind: 'recognition', checkExpression: '', variables: [], correctAnswer: 'cualquier cosa' })];
    const result = await applyMathValidation(ranked, [], 'Matemática');
    expect(result).toEqual(ranked);
  });
});

// find_error's pool-sourcing (findError.ts's selectPoolCandidatesForFindError)
// needs to know which concept each generated exercise came from — attachConceptIds
// is the only place that association survives past slotId being stripped.
describe('attachConceptIds', () => {
  const c1 = makeConcept('c1', 2);
  const c2 = makeConcept('c2', 3);
  const slot = (id: string, concept: KnowledgeConcept): SlotDescriptor => ({ id, concept, kind: 'base', difficulty: concept.difficulty });

  it('maps each exercise back to the concept its slotId was planned for', () => {
    const plan: SlotDescriptor[] = [slot('ej1', c1), slot('ej2', c2)];
    const ranked: RankedExercise[] = [
      { exercise: { ...makeExercise({ slotId: 'ej1' }) }, difficulty: 2 },
      { exercise: { ...makeExercise({ slotId: 'ej2' }) }, difficulty: 3 },
    ];

    const result = attachConceptIds(ranked, plan);

    expect(result[0].conceptId).toBe('c1');
    expect(result[1].conceptId).toBe('c2');
  });

  it('strips slotId from the returned shape', () => {
    const plan: SlotDescriptor[] = [slot('ej1', c1)];
    const ranked: RankedExercise[] = [{ exercise: makeExercise({ slotId: 'ej1' }), difficulty: 2 }];

    const result = attachConceptIds(ranked, plan);

    expect(result[0]).not.toHaveProperty('slotId');
  });

  it('leaves conceptId undefined for a slotId with no match in the plan (defensive, should not happen in practice)', () => {
    const result = attachConceptIds([{ exercise: makeExercise({ slotId: 'orphan' }), difficulty: 1 }], []);
    expect(result[0].conceptId).toBeUndefined();
  });
});
