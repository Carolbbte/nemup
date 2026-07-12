import { describe, it, expect } from 'vitest';
import { isExercisableSubject, isValidGeneratedExercise } from '../exerciseGenerator.js';
import type { GeneratedExercise } from '../exerciseGenerator.js';

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

const makeExercise = (overrides: Partial<GeneratedExercise> = {}): GeneratedExercise => ({
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

  it('rejects an exercise with an empty statement/correctAnswer/hint', () => {
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
