/**
 * findError.ts — unit tests for the safety-critical pure gate
 * (reconcileFindError) and the empty-input no-op (generateFindError with no
 * procedure concepts / no worked examples). Deliberately does NOT mock the
 * OpenAI SDK — only the deterministic logic that decides whether a
 * model-invented "error" is safe to teach is exercised here.
 *
 * Structured redesign: the model no longer authors wrongStep or the correct
 * diagnosis text directly. It gives correctForm/correctTerm/wrongTerm, and
 * the backend DERIVES wrongStep (substitution) and TEMPLATES the correct MC
 * option — this is what makes the exact production bug (correct diagnosis
 * and wrongStep drifting apart, or the correct option and a distractor
 * swapped) structurally impossible rather than merely discouraged by a
 * prompt instruction.
 */

import { describe, it, expect } from 'vitest';
import { generateFindError, reconcileFindError, type RawFindErrorItem } from '../findError.js';

const rawItem = (overrides: Partial<RawFindErrorItem> = {}): RawFindErrorItem => ({
  conceptId: 'c1',
  matched: true,
  expression: '4x + 3y − 2x + 5y',
  correctForm: '4x + 3y − 2x + 5y',
  correctTerm: '4x',
  wrongTerm: '6x',
  errorReason: 'sumó mal los coeficientes de x',
  errorDistractors: ['Restó los coeficientes de y en vez de sumarlos.', 'Mezcló los términos en x e y.'],
  ...overrides,
});

describe('reconcileFindError (pure safety gate)', () => {
  it('derives wrongStep by substitution and templates errorExplanation from correctTerm/wrongTerm/errorReason', () => {
    const result = reconcileFindError(rawItem());
    expect(result).toEqual({
      conceptId: 'c1',
      expression: '4x + 3y − 2x + 5y',
      correctForm: '4x + 3y − 2x + 5y',
      wrongStep: '6x + 3y − 2x + 5y',
      correctTerm: '4x',
      wrongTerm: '6x',
      question: '¿Cuál es el error?',
      errorExplanation: 'El término 4x quedó como 6x — sumó mal los coeficientes de x.',
      errorDistractors: ['Restó los coeficientes de y en vez de sumarlos.', 'Mezcló los términos en x e y.'],
    });
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

  // The star check — correctTerm must be a literal substring of correctForm,
  // since wrongStep is derived by substitution, not authored.
  it('returns null when correctTerm does not appear literally in correctForm', () => {
    const result = reconcileFindError(rawItem({
      correctForm: '4x + 3y − 2x + 5y',
      correctTerm: '7x', // never appears in correctForm
    }));
    expect(result).toBeNull();
  });

  // Real production bug this redesign fixes: (x+6)(x+4)-x² with the
  // x·4 → 4 mistake. Verifies the exact derivation and template.
  it('handles the real reported case: (x+6)(x+4)-x² with the x·4 → 4 mistake', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)(x+4)-x^2',
      correctForm: 'x^2 + 6x + 4x + 24 - x^2',
      correctTerm: '4x',
      wrongTerm: '4',
      errorReason: 'olvidó multiplicar por x',
    }));
    expect(result?.wrongStep).toBe('x^2 + 6x + 4 + 24 - x^2');
    expect(result?.errorExplanation).toBe('El término 4x quedó como 4 — olvidó multiplicar por x.');
  });

  it('rejects when correctForm does not actually resolve expression', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)(x+4)',
      correctForm: 'x^2 + 11x + 24', // wrong — should be 10x, not 11x
      correctTerm: '11x',
      wrongTerm: '10x',
    }));
    expect(result).toBeNull();
  });

  it('rejects when correctTerm and wrongTerm are mathematically the same value', () => {
    const result = reconcileFindError(rawItem({
      correctForm: '4x + 3y − 2x + 5y',
      correctTerm: '4x',
      wrongTerm: '2x + 2x', // same value as 4x, not a real error
    }));
    expect(result).toBeNull();
  });

  // Coherence check: correctTerm "4x" is ALSO a substring of "24x" earlier
  // in correctForm — indexOf finds that unintended FIRST occurrence (inside
  // "24x", corrupting it into "24" + " + 4x") instead of the intended
  // standalone "4x" term. The resulting substitution is real but NOT
  // coherent: correctForm-wrongStep reduces to "24x-24", which does not
  // equal correctTerm-wrongTerm ("4x-4") for all x — the coherence check
  // catches this collision even though the naive substring search didn't.
  it('rejects when correctTerm collides with an unintended substring earlier in correctForm', () => {
    const result = reconcileFindError(rawItem({
      expression: '24x + 4x',
      correctForm: '24x + 4x',
      correctTerm: '4x',
      wrongTerm: '4',
    }));
    expect(result).toBeNull();
  });

  // Lightweight format checks.
  it('rejects when a distractor is a literal duplicate of the templated correct option', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['El término 4x quedó como 6x — sumó mal los coeficientes de x.', 'Mezcló los términos en x e y.'],
    }));
    expect(result).toBeNull();
  });

  it('rejects when a distractor mentions correctTerm (a second, encubierta description of the same term)', () => {
    const result = reconcileFindError(rawItem({
      correctTerm: '4x',
      errorDistractors: ['Olvidó multiplicar 4x por otro factor.', 'Mezcló los términos en x e y.'],
    }));
    expect(result).toBeNull();
  });

  it('rejects when errorReason mentions "orden de los términos" (not a real error)', () => {
    const result = reconcileFindError(rawItem({
      errorReason: 'reordenó los términos de la expresión',
    }));
    expect(result).toBeNull();
  });

  it('rejects when a distractor mentions "términos mal ubicados"', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Términos independiente y lineal mal ubicados.', 'Mezcló los términos en x e y.'],
    }));
    expect(result).toBeNull();
  });

  it('does NOT reject a legitimate "orden de operaciones" (order of operations) error', () => {
    const result = reconcileFindError(rawItem({
      errorReason: 'sumó antes de multiplicar, orden de operaciones equivocado',
    }));
    expect(result).not.toBeNull();
  });

  it('sanitizes LaTeX-ish leftovers and trims whitespace on every field', () => {
    const result = reconcileFindError(rawItem({
      expression: '  4x + 3y − 2x + 5y  ',
      correctForm: '  4x + 3y − 2x + 5y  ',
    }));
    expect(result?.expression).toBe('4x + 3y − 2x + 5y');
    expect(result?.correctForm).toBe('4x + 3y − 2x + 5y');
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
