import { describe, it, expect } from 'vitest';
import { isValidFindErrorResult, sanitizeFindError } from '../findError.js';
import type { RawFindErrorResult } from '../findError.js';

const makeItem = (overrides: Partial<RawFindErrorResult> = {}): RawFindErrorResult => ({
  conceptId: 'c1',
  expression: '2(x + 3)',
  wrongStep: '2x + 3',
  question: '¿Qué salió mal?',
  errorExplanation: 'Olvidó multiplicar el 3.',
  correctStep: '2x + 6',
  sourceType: 'material',
  ...overrides,
});

describe('isValidFindErrorResult', () => {
  it('accepts a well-formed material-sourced item', () => {
    expect(isValidFindErrorResult(makeItem())).toBe(true);
  });

  it('accepts a well-formed generated-sourced item', () => {
    expect(isValidFindErrorResult(makeItem({ sourceType: 'generated' }))).toBe(true);
  });

  it('rejects null/undefined', () => {
    expect(isValidFindErrorResult(null)).toBe(false);
    expect(isValidFindErrorResult(undefined)).toBe(false);
  });

  it('rejects a missing/blank required field', () => {
    expect(isValidFindErrorResult(makeItem({ conceptId: '' }))).toBe(false);
    expect(isValidFindErrorResult(makeItem({ expression: '   ' }))).toBe(false);
    expect(isValidFindErrorResult(makeItem({ wrongStep: '' }))).toBe(false);
    expect(isValidFindErrorResult(makeItem({ question: '' }))).toBe(false);
    expect(isValidFindErrorResult(makeItem({ errorExplanation: '' }))).toBe(false);
    expect(isValidFindErrorResult(makeItem({ correctStep: '' }))).toBe(false);
  });

  it('rejects an invalid sourceType', () => {
    expect(isValidFindErrorResult(makeItem({ sourceType: 'invented' as any }))).toBe(false);
  });

  it('rejects wrongStep identical to correctStep (not a real error)', () => {
    expect(isValidFindErrorResult(makeItem({ wrongStep: '2x + 6', correctStep: '2x + 6' }))).toBe(false);
    // case/whitespace-insensitive
    expect(isValidFindErrorResult(makeItem({ wrongStep: ' 2X + 6 ', correctStep: '2x + 6' }))).toBe(false);
  });
});

describe('sanitizeFindError', () => {
  it('strips LaTeX notation that slipped through from every string field', () => {
    const sanitized = sanitizeFindError(makeItem({
      expression: '\\frac{2}{3}x',
      correctStep: '\\frac{4}{6}x',
    }));
    expect(sanitized.expression).not.toContain('\\frac');
    expect(sanitized.correctStep).not.toContain('\\frac');
  });

  it('leaves already-plain-text fields untouched', () => {
    const item = makeItem();
    expect(sanitizeFindError(item)).toEqual(item);
  });
});
