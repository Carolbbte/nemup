/**
 * exerciseValidator.ts — unit tests split into two groups on purpose:
 *
 *   1. toMathjsSyntax: the preprocessor is where correctness actually lives
 *      (see its own file comment) — these tests target UGLY display-notation
 *      formats directly (asserting the output string, not just an evaluate()
 *      result), since a silent mis-parse here would corrupt every truth
 *      check downstream without ever showing up as an obvious test failure.
 *   2. validateCalculationExercise / expressionsEqual: the actual logic,
 *      including the 5 required cases from the spec (pantalla-6 regression,
 *      symbolic-valid, numeric-valid, distractor-equals-correct,
 *      unparseable-checkExpression).
 *
 * No AI SDK mocking anywhere — deterministic math only, same convention as
 * procedural.test.ts/findError.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { toMathjsSyntax, extractFreeSymbols, expressionsEqual, validateCalculationExercise } from '../exerciseValidator.js';
import type { GeneratedExercise } from '../exerciseGenerator.js';

describe('toMathjsSyntax (preprocessor — the fragile piece)', () => {
  it('converts a single unicode superscript exponent', () => {
    expect(toMathjsSyntax('x²')).toBe('x^2');
  });

  it('converts chained superscripts with an implicit coefficient into fully explicit mathjs syntax', () => {
    expect(toMathjsSyntax('9x⁴y²')).toBe('9*x^4*y^2');
  });

  it('inserts multiplication before a parenthesis after a coefficient', () => {
    expect(toMathjsSyntax('2(x+3)')).toBe('2*(x+3)');
  });

  it('inserts multiplication between two adjacent parenthesized groups', () => {
    expect(toMathjsSyntax('(x+1)(x-1)')).toBe('(x+1)*(x-1)');
  });

  it('inserts multiplication between every letter in a 3+ letter coefficient run (the non-overlapping-regex trap)', () => {
    expect(toMathjsSyntax('3ab')).toBe('3*a*b');
  });

  it('converts a unicode minus sign and inserts the coefficient multiplication after it', () => {
    expect(toMathjsSyntax('−4a²')).toBe('-4*a^2');
  });

  it('converts × and · to * and ÷ to /', () => {
    expect(toMathjsSyntax('3×4')).toBe('3*4');
    expect(toMathjsSyntax('3·x')).toBe('3*x');
    expect(toMathjsSyntax('8÷2')).toBe('8/2');
  });

  it('leaves a known function call (sin/sqrt/etc.) completely intact, never splitting it into letters', () => {
    expect(toMathjsSyntax('sin(x)')).toBe('sin(x)');
    expect(toMathjsSyntax('sqrt(x)')).toBe('sqrt(x)');
  });

  it('inserts multiplication before a function call preceded by a coefficient, without touching the function name', () => {
    expect(toMathjsSyntax('2sin(x)')).toBe('2*sin(x)');
  });

  it('does NOT treat a function name as protected when it is not actually called (no trailing "(") — splits into single-letter variables like any other run', () => {
    // A material could legitimately have a 3-letter variable-ish token "sin"
    // that is NOT the trig function (e.g. concatenated single-letter
    // coefficients s, i, n) — only "sin(" is a function call.
    expect(toMathjsSyntax('sin')).toBe('s*i*n');
  });

  it('handles a realistic checkExpression end-to-end: area of a rectangle with algebraic sides', () => {
    expect(toMathjsSyntax('(5x²y + 8)(5x²y + 5)')).toBe('(5*x^2*y+8)*(5*x^2*y+5)');
  });
});

describe('extractFreeSymbols', () => {
  it('extracts every distinct single-letter variable', () => {
    expect(extractFreeSymbols('3*x^2*y + 4*y')).toEqual(expect.arrayContaining(['x', 'y']));
    expect(extractFreeSymbols('3*x^2*y + 4*y')).toHaveLength(2);
  });

  it('excludes mathjs builtins like e and pi', () => {
    expect(extractFreeSymbols('e^x + pi')).toEqual(['x']);
  });
});

describe('expressionsEqual', () => {
  it('numeric case: matches when fully substituted values are equal', () => {
    expect(expressionsEqual('(x+6)*(x+4)', '63', { x: 3 })).toBe(true);
  });

  it('numeric case: does not match a genuinely different value', () => {
    expect(expressionsEqual('(x+6)*(x+4)', '260', { x: 3 })).toBe(false);
  });

  it('symbolic case: matches an expanded polynomial regardless of term order', () => {
    expect(expressionsEqual('(3*x^2*y+4)*(3*x^2*y+6)', '9*x^4*y^2+30*x^2*y+24', {})).toBe(true);
    expect(expressionsEqual('(3*x^2*y+4)*(3*x^2*y+6)', '30*x^2*y+9*x^4*y^2+24', {})).toBe(true);
  });

  it('symbolic case: does not match a genuinely different polynomial', () => {
    expect(expressionsEqual('(3*x^2*y+4)*(3*x^2*y+6)', '9*x^4*y^2+30*x^2*y+25', {})).toBe(false);
  });

  it('returns null (unverifiable) when a side cannot be parsed at all', () => {
    // Genuinely malformed mathjs syntax (unbalanced parens) — NOT the same
    // as "prose that happens to parse": mathjs's own grammar treats
    // space-separated bare identifiers as implicit multiplication, so e.g.
    // "no es una" is actually valid syntax (an undefined-symbol product),
    // not a parse error. This string is a real syntax error.
    expect(expressionsEqual('x + 1', '((x', {})).toBeNull();
  });
});

describe('validateCalculationExercise', () => {
  const asDistractors = (texts: string[]) => texts.map((text) => ({ text, explanation: `Explicación de ${text}.` }));

  const makeExercise = (overrides: Partial<GeneratedExercise> = {}): GeneratedExercise => ({
    statement: 'Calcula el área de un rectángulo de lados (5x²y + 8) y (5x²y + 5), con x=1, y=2.',
    correctAnswer: '270',
    distractors: asDistractors(['260', '130', '195']),
    hint: 'Multiplica los dos lados.',
    kind: 'calculation',
    checkExpression: '(5x²y + 8)(5x²y + 5)',
    variables: [{ name: 'x', value: 1 }, { name: 'y', value: 2 }],
    ...overrides,
  });

  // Required case: pantalla 6 regression — correctAnswer="260" but the real
  // area is 270, and 270 isn't among the distractors either.
  it('rejects the exact reported bug: correctAnswer does not match checkExpression\'s evaluated truth', () => {
    const result = validateCalculationExercise(makeExercise({ correctAnswer: '260' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
  });

  it('accepts the same exercise once correctAnswer is the real value (270)', () => {
    const result = validateCalculationExercise(makeExercise({ correctAnswer: '270' }));
    expect(result).toEqual({ ok: true });
  });

  // Required case: symbolic valid.
  it('accepts a valid symbolic (no substitution) exercise', () => {
    const result = validateCalculationExercise(makeExercise({
      checkExpression: '(3x²y+4)(3x²y+6)',
      variables: [],
      correctAnswer: '9x^4y^2+30x^2y+24',
      distractors: asDistractors(['9x^4y^2+24', '30x^2y+24', '9x^4y^2+30x^2y+25']),
    }));
    expect(result).toEqual({ ok: true });
  });

  // Required case: numeric valid.
  it('accepts a valid numeric exercise', () => {
    const result = validateCalculationExercise(makeExercise({
      checkExpression: '(x+6)(x+4)',
      variables: [{ name: 'x', value: 3 }],
      correctAnswer: '63',
      distractors: asDistractors(['56', '70', '49']),
    }));
    expect(result).toEqual({ ok: true });
  });

  // Required case: distractor equals correctAnswer.
  it('rejects when a distractor is mathematically identical to correctAnswer', () => {
    const result = validateCalculationExercise(makeExercise({
      correctAnswer: '270',
      distractors: asDistractors(['270', '130', '195']), // first distractor secretly correct too
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
  });

  // Required case: checkExpression missing/unparseable.
  it('marks unverifiable (not invalid) when checkExpression is missing', () => {
    const result = validateCalculationExercise(makeExercise({ checkExpression: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unverifiable');
  });

  it('marks unverifiable (not invalid) when checkExpression cannot be parsed', () => {
    const result = validateCalculationExercise(makeExercise({ checkExpression: '(((' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unverifiable');
  });

  it('is a no-op (ok:true) for kind="recognition" regardless of garbage math fields', () => {
    const result = validateCalculationExercise(makeExercise({
      kind: 'recognition',
      checkExpression: '(((',
      correctAnswer: 'no es matemática',
    }));
    expect(result).toEqual({ ok: true });
  });
});
