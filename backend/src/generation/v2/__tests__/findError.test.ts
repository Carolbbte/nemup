/**
 * findError.ts — unit tests for the safety-critical pure gate
 * (reconcileFindError) and the empty-input no-op (generateFindError with no
 * procedure concepts / no worked examples). Deliberately does NOT mock the
 * OpenAI SDK — only the deterministic logic that decides whether a
 * model-invented "error" is safe to teach is exercised here.
 *
 * reconcileFindError now uses REAL math evaluation (exerciseValidator.ts's
 * expressionsEqual) instead of procedural.ts's text-similarity resultsMatch
 * — the star test below ("(x+6)(x+4)-x²" → "x²+6x+4x+24-x²") is the exact
 * production bug this upgrade fixes: the old resultsMatch-based guard could
 * NOT catch that wrongStep, since it's a different STRING but the same
 * VALUE as correctStep (just unsimplified).
 */

import { describe, it, expect } from 'vitest';
import { generateFindError, reconcileFindError, type RawFindErrorItem } from '../findError.js';

const rawItem = (overrides: Partial<RawFindErrorItem> = {}): RawFindErrorItem => ({
  conceptId: 'c1',
  matched: true,
  expression: '4x + 3y − 2x + 5y',
  wrongStep: '6x + 8y',
  errorExplanation: 'Sumó los coeficientes de x en vez de restarlos.',
  errorDistractors: ['Restó los coeficientes de y en vez de sumarlos.', 'Mezcló los términos en x e y.'],
  correctStep: '2x + 8y',
  ...overrides,
});

describe('reconcileFindError (pure safety gate)', () => {
  it('accepts a well-formed item where wrongStep is genuinely wrong and correctStep genuinely solves expression', () => {
    const result = reconcileFindError(rawItem());
    expect(result).toEqual({
      conceptId: 'c1',
      expression: '4x + 3y − 2x + 5y',
      wrongStep: '6x + 8y',
      question: '¿Cuál es el error?',
      errorExplanation: 'Sumó los coeficientes de x en vez de restarlos.',
      errorDistractors: ['Restó los coeficientes de y en vez de sumarlos.', 'Mezcló los términos en x e y.'],
      correctStep: '2x + 8y',
    });
  });

  it('returns null when matched is false, regardless of the other fields', () => {
    expect(reconcileFindError(rawItem({ matched: false }))).toBeNull();
  });

  it('returns null when any required field is empty or whitespace-only', () => {
    expect(reconcileFindError(rawItem({ expression: '' }))).toBeNull();
    expect(reconcileFindError(rawItem({ wrongStep: '   ' }))).toBeNull();
    expect(reconcileFindError(rawItem({ errorExplanation: '  ' }))).toBeNull();
    expect(reconcileFindError(rawItem({ correctStep: '' }))).toBeNull();
  });

  it('returns null when fewer than 2 honest errorDistractors survive sanitization', () => {
    expect(reconcileFindError(rawItem({ errorDistractors: [] }))).toBeNull();
    expect(reconcileFindError(rawItem({ errorDistractors: ['solo uno'] }))).toBeNull();
    expect(reconcileFindError(rawItem({ errorDistractors: ['uno', '   '] }))).toBeNull(); // one is blank after trim
  });

  // Star test — the exact production bug this mathjs-based guard exists to
  // catch: wrongStep is a DIFFERENT STRING but the SAME VALUE as
  // correctStep (just not simplified) — not an error at all.
  it('rejects the exact reported bug: wrongStep is the unsimplified but mathematically identical form of correctStep', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)(x+4)-x²',
      wrongStep: 'x²+6x+4x+24-x²',
      correctStep: '10x+24',
    }));
    expect(result).toBeNull();
  });

  it('rejects when wrongStep is only a reordering of correctStep\'s terms (still the same value)', () => {
    expect(reconcileFindError(rawItem({ wrongStep: '8y + 2x', correctStep: '2x + 8y' }))).toBeNull();
  });

  it('accepts a genuinely different wrongStep for the star test\'s expression, with the real correctStep', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)(x+4)-x²',
      wrongStep: '10x+28', // plausible off-by-constant mistake, genuinely different from 10x+24
      correctStep: '10x+24',
    }));
    expect(result).not.toBeNull();
  });

  it('rejects when correctStep does NOT actually solve expression (second guard)', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)(x+4)',
      wrongStep: '10x+24', // wrong on purpose but different from the (wrong) correctStep below
      correctStep: '11x+24', // does not equal (x+6)(x+4) = x^2+10x+24 for all x
    }));
    expect(result).toBeNull();
  });

  // Lightweight format check (not semantic — see normalizeForDedupe's own
  // comment): the correct diagnosis and its 2 distractors must all read as
  // distinct alternatives.
  it('rejects when a distractor is a literal duplicate of errorExplanation', () => {
    const result = reconcileFindError(rawItem({
      errorExplanation: 'Sumó los coeficientes de x en vez de restarlos.',
      errorDistractors: ['Sumó los coeficientes de x en vez de restarlos.', 'Mezcló los términos en x e y.'],
    }));
    expect(result).toBeNull();
  });

  it('rejects when the two distractors are near-duplicates of each other (case/whitespace only)', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Restó los coeficientes de y en vez de sumarlos.', '  restó   los coeficientes de y en vez de sumarlos.  '],
    }));
    expect(result).toBeNull();
  });

  it('accepts when all 3 alternatives are genuinely distinct text', () => {
    const result = reconcileFindError(rawItem());
    expect(result).not.toBeNull();
  });

  // "Orden de los términos" is not a real error (commutativity) — the
  // prompt forbids it, this is the code backstop.
  it('rejects when errorExplanation describes "reordering terms" as the error', () => {
    const result = reconcileFindError(rawItem({
      errorExplanation: 'Términos independiente y lineal mal ubicados.',
    }));
    expect(result).toBeNull();
  });

  it('rejects when a distractor describes "reordering terms" as an error', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Reordenó los términos de la expresión.', 'Mezcló los términos en x e y.'],
    }));
    expect(result).toBeNull();
  });

  it('does NOT reject a legitimate "orden de operaciones" (order of operations) error, only "orden de los términos"', () => {
    const result = reconcileFindError(rawItem({
      errorExplanation: 'Sumó antes de multiplicar — orden de operaciones equivocado.',
    }));
    expect(result).not.toBeNull();
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
