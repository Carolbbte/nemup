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
import { evaluate } from 'mathjs';
import { toMathjsSyntax, toDisplayMath, extractFreeSymbols, expressionsEqual, validateCalculationExercise, stripUnitSuffix, combineLikeTerms, isAdditiveTermOf, validateConceptFormula } from '../exerciseValidator.js';
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

  // Signos de agrupación anidados (notación chilena: ( ) → [ ] → { }) — antes
  // de este fix, '{' y '[' caían en la rama "unknown character, skip it" del
  // tokenizer y se BORRABAN sin avisar, corrompiendo el valor en vez de
  // fallar limpio ("5 - {3 - [2 + 4 - (1+1)]}", valor real 6, evaluaba a 2).
  // '{'/'[' se tratan como '(' y '}'/']' como ')' — solo en esta conversión
  // interna, nunca en el texto que ve el alumno (ver mathNotation.ts).
  it('trata las llaves y corchetes de agrupación como paréntesis, no los borra', () => {
    const result = toMathjsSyntax('5 - {3 - [2 + 4 - (1+1)]}');
    expect(result).toBe('5-(3-(2+4-(1+1)))');
    expect(evaluate(result)).toBe(6);
  });

  it('mezcla de llaves/corchetes con coeficiente implícito sigue insertando la multiplicación', () => {
    expect(toMathjsSyntax('2[x+3]')).toBe('2*(x+3)');
    expect(toMathjsSyntax('2{x+3}')).toBe('2*(x+3)');
  });
});

describe('toDisplayMath (mathjs syntax -> student-facing notation, display only)', () => {
  it('converts integer exponents to unicode superscripts', () => {
    expect(toDisplayMath('x^2')).toBe('x²');
  });

  it('resolves a product of two plain numbers to its computed value', () => {
    expect(toDisplayMath('6*4')).toBe('24');
  });

  it('renders multiplication implicitly (no visible "*")', () => {
    expect(toDisplayMath('4*x')).toBe('4x');
  });

  it('combines like terms in an already-flat sum', () => {
    expect(toDisplayMath('6*x + 4*x + 24 - 0*x')).toBe('10x + 24');
  });

  it('falls back to a parsed (unsimplified) rendering when simplify() would throw, and to the raw input when nothing parses', () => {
    // Malformed input — never crashes, degrades gracefully.
    expect(toDisplayMath('(((')).toBe('(((');
  });

  // mathjs's own default rendering wraps a negated product in parens
  // ("-(4x)") — not wrong, but not how a student writes a negative term.
  // Only unwrapped for a simple term (constant/symbol/product/power); a
  // negated SUM keeps its parens (dropping them would change the meaning).
  it('renders a negated simple term without parentheses ("-4x", not "-(4x)")', () => {
    expect(toDisplayMath('-4*x')).toBe('-4x');
  });

  it('keeps parentheses around a negated sum (dropping them would change the meaning)', () => {
    expect(toDisplayMath('-(x+6)')).toBe('-x - 6');
  });

  // Fix 2b — explicit regression guard: a coefficient of 2 must survive
  // (never collapse "2x" into "x"); a coefficient of exactly 1 is the only
  // one that gets omitted.
  it('never drops a non-1 coefficient next to a variable', () => {
    expect(toDisplayMath('2*x')).toBe('2x');
    expect(toDisplayMath('2*x^2')).toBe('2x²');
  });

  it('omits a coefficient of exactly 1 (and -1), never any other value', () => {
    expect(toDisplayMath('1*x')).toBe('x');
    expect(toDisplayMath('-1*x')).toBe('-x');
  });
});

describe('combineLikeTerms (deterministic, never uses simplify())', () => {
  // The exact case that broke simplify(): it correctly combined 5x+8x into
  // 13x, but then FACTORED a common 2 out of the leftover "2*x^2" and "2*x"
  // into "2*(x^2+x)", corrupting the "2x" term's own coefficient when
  // rendered term-by-term. combineLikeTerms must never do this.
  it('combines like terms across a mix of degrees without simplify()\'s factoring bug', () => {
    // 5x + 2x + 8x = 15x (three x-terms here, not two — see the next test
    // for the ticket's own 2-term example).
    expect(combineLikeTerms('2*x^2 + 5*x + 3 - 4*x^2 + 2*x + 8*x')).toBe('-2x² + 15x + 3');
  });

  it('handles the exact ticket example (no extra terms, ordered by degree descending)', () => {
    expect(combineLikeTerms('2*x^2 + 3 - 4*x^2 + 2*x + 8*x')).toBe('-2x² + 10x + 3');
  });

  it('drops a group that cancels to zero entirely', () => {
    expect(combineLikeTerms('3*x - 3*x + 5')).toBe('5');
  });

  it('returns "0" when everything cancels', () => {
    expect(combineLikeTerms('x - x')).toBe('0');
  });

  it('never collapses a coefficient of 2 into 1 while combining', () => {
    expect(combineLikeTerms('2*x + 8*x')).toBe('10x');
    // A lone non-combining term keeps its own coefficient untouched.
    expect(combineLikeTerms('2*x + 3*y')).toBe('2x + 3y');
  });

  it('omits a coefficient of exactly 1 after combining, never any other value', () => {
    expect(combineLikeTerms('3*x - 2*x')).toBe('x');
    expect(combineLikeTerms('2*x - 3*x')).toBe('-x');
  });

  it('falls back to a pretty-printed (uncombined) rendering when the expression is not a flat sum of monomials', () => {
    // An unexpanded product slipping through — can't safely decompose into
    // additive terms, so this must not fabricate a combined result.
    expect(combineLikeTerms('(x+1)*(x+2)')).toBe(toDisplayMath('(x+1)*(x+2)'));
  });

  it('falls back to the raw input on genuinely malformed syntax', () => {
    expect(combineLikeTerms('(((')).toBe('(((');
  });
});

describe('isAdditiveTermOf', () => {
  // Star test — a model-authored "-5*x^2*y" failing to string-match the
  // "- 5*x^2*y" that literally appears inside correctForm (minus rendered
  // as a spaced binary operator, not glued to the coefficient) was a real
  // false-reject seen in production logs.
  it('matches a term regardless of spacing/sign formatting differences', () => {
    expect(isAdditiveTermOf('-4*x^2*y + 7*x^2*y - 5*x^2*y', '-5*x^2*y')).toBe(true);
    expect(isAdditiveTermOf('-4*x + 3*x + 5*x - 4*y - 8*z', '-8*z')).toBe(true);
  });

  it('matches regardless of which side glues the sign to the coefficient', () => {
    // Same value, differently formatted — must still match.
    expect(isAdditiveTermOf('10*x+24', '+24')).toBe(true);
  });

  it('returns false when the term genuinely is not one of the additive terms', () => {
    expect(isAdditiveTermOf('-4*x^2*y + 7*x^2*y - 5*x^2*y', '2*x^2*y')).toBe(false);
    // Right variable shape, wrong coefficient (3x^2*y not present as a term).
    expect(isAdditiveTermOf('-4*x^2*y + 7*x^2*y - 5*x^2*y', '3*x^2*y')).toBe(false);
  });

  it('returns false (never throws) on malformed input', () => {
    expect(isAdditiveTermOf('(((', 'x')).toBe(false);
    expect(isAdditiveTermOf('x + 1', '(((')).toBe(false);
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

  // Signos de agrupación anidados en checkExpression — antes de este fix, las
  // llaves/corchetes se borraban silenciosamente y el motor comparaba contra
  // un valor distinto del real (2 en vez de 6), rechazando de forma falsa un
  // correctAnswer legítimo.
  it('valida correctamente un checkExpression con llaves y corchetes de agrupación anidados', () => {
    const result = validateCalculationExercise(makeExercise({
      checkExpression: '5 - {3 - [2 + 4 - (1+1)]}',
      variables: [],
      correctAnswer: '6',
      distractors: asDistractors(['2', '4', '8']),
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

  // Fix 2: unit stripping — "49 cm²" is correct for a side of 7 (x²=49),
  // the trailing unit must not break the comparison.
  it('strips a trailing unit from correctAnswer before comparing (ej1: false-positive fix)', () => {
    const result = validateCalculationExercise(makeExercise({
      checkExpression: 'x^2',
      variables: [{ name: 'x', value: 7 }],
      correctAnswer: '49 cm²',
      distractors: asDistractors(['36 cm²', '56 cm²', '42 cm²']),
    }));
    expect(result).toEqual({ ok: true });
  });

  it('does NOT strip a unit-like letter that is part of a longer algebraic expression (never just the trailing char)', () => {
    // "7m + 6n" must reach mathjs untouched — "m" here is a variable, not
    // the unit "metros", and stripUnitSuffix only ever matches a string
    // that is ENTIRELY "<number><unit>".
    const result = validateCalculationExercise(makeExercise({
      checkExpression: '2*m - 5*n + 6*m - m + 11*n',
      variables: [],
      correctAnswer: '7m + 6n',
      distractors: asDistractors(['m + 6n', '7m + 17n', '13m']),
    }));
    expect(result).toEqual({ ok: true });
  });

  // Fix 1 (raw checkExpression, verified here via the validator): ej6 — a
  // pre-expanded checkExpression the model got wrong ("25x^4y^2+40x^2y+40",
  // missing a 25x²y term) used to reject the genuinely correct answer. With
  // checkExpression as the RAW, unexpanded operation, mathjs does the
  // expansion itself and the real correct answer validates.
  it('accepts the real correctAnswer when checkExpression is the raw (unexpanded) operation (ej6 false-positive fix)', () => {
    const result = validateCalculationExercise(makeExercise({
      checkExpression: '(5*x^2*y + 8) * (5*x^2*y + 5)',
      variables: [],
      correctAnswer: '25x^4y^2+65x^2y+40',
      distractors: asDistractors(['25x^4y^2+40x^2y+40', '25x^4y^2+40', '65x^2y+40']),
    }));
    expect(result).toEqual({ ok: true });
  });

  // Fix 3: checkExpression left a free variable unresolved, but
  // correctAnswer is a concrete number — no ground truth to check against.
  // Must be unverifiable, never invalid (the answer may well be right).
  it('marks unverifiable (not invalid) when checkExpression has an unresolved free variable but correctAnswer is a concrete number', () => {
    const result = validateCalculationExercise(makeExercise({
      checkExpression: 'x^2',
      variables: [], // x never substituted
      correctAnswer: '49',
      distractors: asDistractors(['36', '56', '42']),
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unverifiable');
  });

  // The genuine "correct value absent/wrong" case must still be caught as
  // invalid once checkExpression is fully resolved — Fix 3 only protects
  // the unresolved-variable case, it must not swallow real bugs.
  it('still rejects as invalid (not unverifiable) when checkExpression is fully resolved and correctAnswer is genuinely wrong', () => {
    const result = validateCalculationExercise(makeExercise({ correctAnswer: '260' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
  });
});

describe('stripUnitSuffix', () => {
  it('strips a unit when the entire string is a bare number followed by it', () => {
    expect(stripUnitSuffix('49 cm²')).toBe('49');
    expect(stripUnitSuffix('12km')).toBe('12');
    expect(stripUnitSuffix('-3.5 kg')).toBe('-3.5');
  });

  it('leaves a multi-term algebraic expression untouched, even with a unit-like trailing letter', () => {
    expect(stripUnitSuffix('7m + 6n')).toBe('7m + 6n');
    expect(stripUnitSuffix('x^2 + 3')).toBe('x^2 + 3');
  });

  it('leaves a string with no recognizable unit untouched', () => {
    expect(stripUnitSuffix('10x + 24')).toBe('10x + 24');
  });
});

describe('validateConceptFormula', () => {
  it('accepts a valid algebraic identity (LHS ≡ RHS)', () => {
    expect(validateConceptFormula('a^2 - b^2 = (a+b)(a-b)')).toBe('a^2 - b^2 = (a+b)(a-b)');
  });

  it('rejects an invalid identity whose sides do not actually match', () => {
    expect(validateConceptFormula('a^2 - b^2 = (a+b)(a+b)')).toBeNull();
  });

  it('accepts a definitional formula (different variables on each side) without an equivalence check', () => {
    // expressionsEqual("F", "m*a") would report "not equal" — the bug this
    // avoids by never applying the identity check to a definitional formula.
    expect(validateConceptFormula('F = m*a')).toBe('F = m*a');
    expect(validateConceptFormula('v = d/t')).toBe('v = d/t');
    expect(validateConceptFormula('densidad = m/V')).toBe('densidad = m/V');
  });

  it('accepts and shows an unparseable formula (subscripts) without validating it', () => {
    expect(validateConceptFormula('v = v₀ + a*t')).toBe('v = v₀ + a*t');
  });

  it('accepts a formula with no "=" at all — nothing to compare, shown as-is', () => {
    expect(validateConceptFormula('a^2 + 2*a*b + b^2')).toBe('a^2 + 2*a*b + b^2');
  });

  it('returns null for empty/whitespace-only input', () => {
    expect(validateConceptFormula('')).toBeNull();
    expect(validateConceptFormula('   ')).toBeNull();
  });

  it('trims the returned formula', () => {
    expect(validateConceptFormula('  F = m*a  ')).toBe('F = m*a');
  });
});
