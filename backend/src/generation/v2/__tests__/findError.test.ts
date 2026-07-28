/**
 * findError.ts — unit tests for the safety-critical pure gate
 * (reconcileFindError) and the empty-input no-op (generateFindError with no
 * procedure concepts / no worked examples). Deliberately does NOT mock the
 * OpenAI SDK — only the deterministic logic that decides whether a
 * model-invented "error" is safe to teach is exercised here.
 */

import { describe, it, expect } from 'vitest';
import { generateFindError, reconcileFindError, type RawFindErrorItem } from '../findError.js';

const rawItem = (overrides: Partial<RawFindErrorItem> = {}): RawFindErrorItem => ({
  conceptId: 'c1',
  matched: true,
  expression: '4x + 3y − 2x + 5y',
  wrongStep: '6x + 8y',
  question: '¿Qué está mal en este paso?',
  errorExplanation: 'Sumó los coeficientes de x en vez de restarlos.',
  correctStep: '2x + 8y',
  ...overrides,
});

describe('reconcileFindError (pure safety gate)', () => {
  it('accepts a well-formed, genuinely-wrong item', () => {
    const result = reconcileFindError(rawItem());
    expect(result).toEqual({
      conceptId: 'c1',
      expression: '4x + 3y − 2x + 5y',
      wrongStep: '6x + 8y',
      question: '¿Qué está mal en este paso?',
      errorExplanation: 'Sumó los coeficientes de x en vez de restarlos.',
      correctStep: '2x + 8y',
    });
  });

  it('returns null when matched is false, regardless of the other fields', () => {
    expect(reconcileFindError(rawItem({ matched: false }))).toBeNull();
  });

  it('returns null when any field is empty or whitespace-only', () => {
    expect(reconcileFindError(rawItem({ expression: '' }))).toBeNull();
    expect(reconcileFindError(rawItem({ wrongStep: '   ' }))).toBeNull();
    expect(reconcileFindError(rawItem({ question: '' }))).toBeNull();
    expect(reconcileFindError(rawItem({ errorExplanation: '  ' }))).toBeNull();
    expect(reconcileFindError(rawItem({ correctStep: '' }))).toBeNull();
  });

  // The critical guard: a "wrongStep" that's actually correct (just
  // reformatted) would teach the student the wrong lesson — must be
  // rejected, reusing procedural.ts's own validated math-aware comparator.
  it('returns null when wrongStep is mathematically the same as correctStep (literal duplicate)', () => {
    expect(reconcileFindError(rawItem({ wrongStep: '2x + 8y', correctStep: '2x + 8y' }))).toBeNull();
  });

  it('returns null when wrongStep is only a reordering of correctStep\'s terms', () => {
    expect(reconcileFindError(rawItem({ wrongStep: '8y + 2x', correctStep: '2x + 8y' }))).toBeNull();
  });

  it('sanitizes LaTeX-ish leftovers and trims whitespace on every field', () => {
    const result = reconcileFindError(rawItem({
      expression: '  4x + 3y − 2x + 5y  ',
      correctStep: '  2x + 8y  ',
    }));
    expect(result?.expression).toBe('4x + 3y − 2x + 5y');
    expect(result?.correctStep).toBe('2x + 8y');
  });
});

describe('generateFindError', () => {
  it('returns an empty map immediately (no AI call) when there are no procedure concepts', async () => {
    const result = await generateFindError([], [{ statement: 'a', answer: '1' }]);
    expect(result.size).toBe(0);
  });

  it('returns an empty map immediately (no AI call) when there are no worked examples', async () => {
    const concept = {
      id: 'c1', name: 'Reducción', simpleExplanation: '', teacherExplanation: '', definition: '',
      example: null, exampleShort: null, hook: null, emoji: null, keyPhrase: null,
      advancedExamples: [], tips: [], difficulty: 2, distinctiveTrait: '', sourceQuote: '',
      role: 'procedure' as const,
    };
    const result = await generateFindError([concept], []);
    expect(result.size).toBe(0);
  });
});
