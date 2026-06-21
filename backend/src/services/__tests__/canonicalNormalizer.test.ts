/**
 * canonicalNormalizer — unit tests for normalizeMathExpression via normalizeCanonicalForm.
 *
 * Required test cases:
 *   1. Like-term combination where a² terms cancel to 0  → pruned
 *   2. All terms cancel → "0"
 *   3. Explicit 0 coefficient alongside non-zero → 0-term pruned
 *   4. All terms explicitly zero → "0"
 *   5. Explicit 0x middle term → pruned, non-zero terms kept
 */

import { describe, it, expect } from 'vitest';
import { normalizeCanonicalForm, detectContentType } from '../canonicalNormalizer.js';

// Helper: normalize a string that is known to be a math expression
function normMath(expr: string): string {
  return normalizeCanonicalForm(expr, 'math_expression');
}

// ── Required test cases ───────────────────────────────────────────────────────

describe('normalizeMathExpression — zero-coefficient pruning', () => {
  it('combines like terms and prunes the 0a result', () => {
    // a²: 3-8+1 = -4  ✓   a: 5-11+6 = 0  → pruned
    expect(normMath('3a² + 5a - 8a² - 11a + a² + 6a')).toBe('-4a²');
  });

  it('returns "0" when all terms cancel', () => {
    expect(normMath('2x - 2x')).toBe('0');
  });

  it('keeps non-zero term when other term has explicit 0 coefficient', () => {
    // 5m + 0m = 5m — the 0m should be absorbed, not left in the output
    expect(normMath('5m + 0m')).toBe('5m');
  });

  it('returns "0" when all terms are explicitly zero', () => {
    expect(normMath('0a + 0b')).toBe('0');
  });

  it('removes the 0x middle term and keeps surrounding non-zero terms', () => {
    expect(normMath('4x² + 0x + 3')).toBe('4x² + 3');
  });
});

// ── Rendering: no zero terms in output after pruning ─────────────────────────

describe('normalizeMathExpression — render correctness', () => {
  it('does not reintroduce 0-coefficient terms during rendering', () => {
    const result = normMath('3a² + 5a - 8a² - 11a + a² + 6a');
    expect(result).not.toMatch(/\b0[a-z]/i);
    expect(result).not.toMatch(/\+ 0/);
    expect(result).not.toMatch(/- 0/);
  });

  it('renders coefficient 1 without the digit (implicit)', () => {
    expect(normMath('a² + 3')).toBe('a² + 3');
  });

  it('renders negative coefficient -1 as minus sign only', () => {
    expect(normMath('-a² + 3')).toBe('-a² + 3');
  });

  it('orders terms by degree descending', () => {
    // 3 + 2x² + x → 2x² + x + 3
    expect(normMath('3 + 2x² + x')).toBe('2x² + x + 3');
  });

  it('handles a single non-zero monomio correctly', () => {
    expect(normMath('-4a²')).toBe('-4a²');
  });

  it('handles combining to a single constant', () => {
    expect(normMath('5 + 3')).toBe('8');
  });
});

// ── normalizeAllSlides — integration test ─────────────────────────────────────

import { normalizeAllSlides } from '../canonicalNormalizer.js';

describe('normalizeAllSlides', () => {
  it('cleans zero-coefficient terms from all slide options before storage', () => {
    const slides: any[] = [
      {
        type: 'micro_challenge',
        question: '¿Cuál es la reducción de 3a² + 5a − 8a² − 11a + a² + 6a?',
        options: ['A. −4a² + 0a', 'B. −4a² + 6a', 'C. 0a² + 0a'],
        correctAnswer: 'A',
        definition: 'Sumar coeficientes solo si letras y exponentes coinciden.',
      },
    ];

    const result = normalizeAllSlides(slides);
    const opts = result[0]!.options!;
    expect(opts[0]).toBe('A. -4a²');     // "−4a² + 0a" → "-4a²"
    expect(opts[2]).toBe('C. 0');        // "0a² + 0a"  → "0"
    expect(opts[1]).toBe('B. -4a² + 6a'); // non-zero option unchanged
  });

  it('leaves non-interactive slides (no options) untouched', () => {
    const slides: any[] = [
      { type: 'main_concept', title: 'Álgebra', definition: 'Rama de la matemática.' },
    ];
    const result = normalizeAllSlides(slides);
    expect(result[0]).toBe(slides[0]); // same reference — no copy made
  });
});

// ── Fallback for non-polynomial expressions ───────────────────────────────────

describe('normalizeMathExpression — fallback for non-polynomial input', () => {
  it('returns expression unchanged (cleaned) for division expressions', () => {
    // Should not crash or corrupt a fraction
    const result = normMath('x/2 + 3');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── detectContentType ─────────────────────────────────────────────────────────

describe('detectContentType', () => {
  it('classifies multi-term algebraic expressions as math_expression', () => {
    expect(detectContentType('3a² + 5a')).toBe('math_expression');
    expect(detectContentType('-4a²')).toBe('math_expression');
    expect(detectContentType('2x - 2x')).toBe('math_expression');
  });

  it('classifies polynomial names with "nomio" suffix as taxonomy', () => {
    // Note: 'monomio' does not match TAXONOMY_RE (mono+nomio ≠ monomio) — binomio/trinomio do
    expect(detectContentType('binomio')).toBe('taxonomy');
    expect(detectContentType('trinomio')).toBe('taxonomy');
    expect(detectContentType('polinomio')).toBe('taxonomy');
  });

  it('classifies pure numbers as fact_answer', () => {
    expect(detectContentType('42')).toBe('fact_answer');
    expect(detectContentType('1492')).toBe('fact_answer');
  });

  it('classifies measurement values as fact_answer (ambiguous with math var but physical units take precedence)', () => {
    // "5m" → MEASUREMENT_RE matches (5 meters) before math_expression check
    expect(detectContentType('5m')).toBe('fact_answer');
  });
});
