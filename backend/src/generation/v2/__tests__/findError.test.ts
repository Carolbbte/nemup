/**
 * findError.ts — unit tests for the safety-critical pure gate
 * (reconcileFindError) and the empty-input no-op (generateFindError with no
 * procedure concepts / no worked examples). Deliberately does NOT mock the
 * OpenAI SDK — only the deterministic logic that decides whether a
 * model-invented "error" is safe to teach is exercised here.
 *
 * "Final answer" redesign: correctForm/wrongStep in the returned
 * FindErrorResult are no longer the raw unsimplified step — they're the
 * pretty-printed, simplified FINAL answers, and correctTerm/wrongTerm must
 * share the same monomial "shape" (or wrongTerm must be a confirmed zero —
 * a full term omission), which is what guarantees the final answer's delta
 * reduces to exactly one term. A correctTerm/wrongTerm pair with a DIFFERENT
 * literal part (e.g. "4x" -> "4", the star example from the previous
 * design) is now REJECTED, since it would corrupt a whole term into a
 * different kind of term instead of giving a clean single-term delta.
 */

import { describe, it, expect } from 'vitest';
import { generateFindError, reconcileFindError, type RawFindErrorItem } from '../findError.js';

const rawItem = (overrides: Partial<RawFindErrorItem> = {}): RawFindErrorItem => ({
  conceptId: 'c1',
  matched: true,
  expression: '4*x + 3*y - 2*x + 5*y',
  correctForm: '4*x + 3*y - 2*x + 5*y',
  correctTerm: '4*x',
  wrongTerm: '6*x', // same shape (x^1), different coefficient — valid under the new rule
  errorReason: 'sumó mal los coeficientes de x',
  errorDistractors: ['Restó los coeficientes de y en vez de sumarlos.', 'Mezcló los términos en x e y.'],
  ...overrides,
});

describe('reconcileFindError (pure safety gate)', () => {
  it('derives wrongStep/correctForm as pretty-printed SIMPLIFIED final answers, and templates errorExplanation with pretty terms', () => {
    const result = reconcileFindError(rawItem());
    // correctForm final: 4x+3y-2x+5y = 2x+8y. wrongForm final: 6x+3y-2x+5y = 4x+8y.
    // (mathjs's own term ordering, not a correctness concern — display only.)
    expect(result?.correctForm).toBe('8y + 2x');
    expect(result?.wrongStep).toBe('8y + 4x');
    expect(result?.correctTerm).toBe('4x');
    expect(result?.wrongTerm).toBe('6x');
    expect(result?.errorExplanation).toBe('El término 4x quedó como 6x — sumó mal los coeficientes de x.');
    expect(result?.question).toBe('¿Cuál es el error?');
  });

  it('omits the trailing " — reason" clause when errorReason is empty', () => {
    const result = reconcileFindError(rawItem({ errorReason: '' }));
    expect(result?.errorExplanation).toBe('El término 4x quedó como 6x.');
  });

  it('returns null when matched is false, regardless of the other fields', () => {
    expect(reconcileFindError(rawItem({ matched: false }))).toBeNull();
  });

  it('returns null when any required field is empty or whitespace-only', () => {
    expect(reconcileFindError(rawItem({ expression: '' }))).toBeNull();
    expect(reconcileFindError(rawItem({ correctForm: '   ' }))).toBeNull();
    expect(reconcileFindError(rawItem({ correctTerm: '' }))).toBeNull();
    expect(reconcileFindError(rawItem({ wrongTerm: '  ' }))).toBeNull();
  });

  it('returns null when fewer than 2 honest errorDistractors survive sanitization', () => {
    expect(reconcileFindError(rawItem({ errorDistractors: [] }))).toBeNull();
    expect(reconcileFindError(rawItem({ errorDistractors: ['solo uno'] }))).toBeNull();
  });

  it('returns null when correctTerm does not appear literally in correctForm', () => {
    const result = reconcileFindError(rawItem({
      correctForm: '4*x + 3*y - 2*x + 5*y',
      correctTerm: '7*x', // never appears in correctForm
    }));
    expect(result).toBeNull();
  });

  it('rejects when correctForm does not actually resolve expression', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)*(x+4)',
      correctForm: 'x^2 + 11*x + 24', // wrong — should be 10x, not 11x
      correctTerm: '11*x',
      wrongTerm: '10*x',
    }));
    expect(result).toBeNull();
  });

  it('rejects when correctTerm and wrongTerm are mathematically the same value', () => {
    const result = reconcileFindError(rawItem({
      correctForm: '4*x + 3*y - 2*x + 5*y',
      correctTerm: '4*x',
      wrongTerm: '2*x + 2*x', // same value as 4x, not a real error
    }));
    expect(result).toBeNull();
  });

  // The star check — a different LITERAL PART (not just a different
  // coefficient) is now rejected outright, since it wouldn't give a
  // single-term final-answer delta (the exact production bug this
  // "final answer" redesign targets: "4x" corrupted into a bare "4").
  it('rejects when wrongTerm has a different literal part than correctTerm (not a coefficient/sign-only change)', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)*(x+4)-x^2',
      correctForm: 'x^2 + 6*x + 4*x + 24 - x^2',
      correctTerm: '4*x',
      wrongTerm: '4', // different literal part (constant vs x^1) — PROHIBITED under the new rule
    }));
    expect(result).toBeNull();
  });

  // The same real case, done the COMPLIANT way: omitting the term entirely
  // (wrongTerm="0") gives a clean single-term final-answer delta.
  it('accepts the real reported case using the compliant "omit the whole term" pattern', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)*(x+4)-x^2',
      correctForm: 'x^2 + 6*x + 4*x + 24 - x^2',
      correctTerm: '4*x',
      wrongTerm: '0',
      errorReason: 'olvidó sumar este término',
    }));
    // correct final: 10x+24. wrong final (4x term dropped): 6x+24.
    expect(result?.correctForm).toBe('10x + 24');
    expect(result?.wrongStep).toBe('6x + 24');
    expect(result?.errorExplanation).toBe('El término 4x quedó como 0 — olvidó sumar este término.');
  });

  // The wrongTerm MUST carry an explicit "+" sign here — a bare "4*x" would
  // leave the substitution result ("x^2 4*x +6*x -24") missing an operator
  // between the previous term and this one, a real syntax gotcha the prompt
  // now explicitly calls out.
  it('accepts a sign-flip error (same literal part, opposite sign, explicit "+" on wrongTerm)', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)*(x-4)',
      correctForm: 'x^2 -4*x +6*x -24', // correct term here is -4x
      correctTerm: '-4*x',
      wrongTerm: '+4*x',
    }));
    expect(result).not.toBeNull();
    expect(result?.correctForm).toBe('2x + x² - 24');
    expect(result?.wrongStep).toBe('10x + x² - 24');
  });

  it('accepts a pure constant arithmetic error (both correctTerm and wrongTerm are plain numbers)', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)*(x+4)-x^2',
      correctForm: 'x^2 + 6*x + 4*x + 24 - x^2',
      correctTerm: '24',
      wrongTerm: '20',
    }));
    expect(result?.correctForm).toBe('10x + 24');
    expect(result?.wrongStep).toBe('10x + 20');
  });

  // Lightweight format checks — unaffected by the redesign.
  it('rejects when a distractor is a literal duplicate of the templated correct option', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['El término 4x quedó como 6x — sumó mal los coeficientes de x.', 'Mezcló los términos en x e y.'],
    }));
    expect(result).toBeNull();
  });

  it('rejects when a distractor mentions correctTerm in display notation (a second, encubierta description of the same term)', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Olvidó multiplicar 4x por otro factor.', 'Mezcló los términos en x e y.'],
    }));
    expect(result).toBeNull();
  });

  it('rejects when errorReason mentions "orden de los términos" (not a real error)', () => {
    const result = reconcileFindError(rawItem({ errorReason: 'reordenó los términos de la expresión' }));
    expect(result).toBeNull();
  });

  it('rejects when a distractor mentions "términos mal ubicados"', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Términos independiente y lineal mal ubicados.', 'Mezcló los términos en x e y.'],
    }));
    expect(result).toBeNull();
  });

  it('sanitizes LaTeX-ish leftovers and trims whitespace on every field', () => {
    const result = reconcileFindError(rawItem({
      expression: '  4*x + 3*y - 2*x + 5*y  ',
      correctForm: '  4*x + 3*y - 2*x + 5*y  ',
    }));
    expect(result).not.toBeNull();
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
