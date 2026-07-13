import { describe, it, expect } from 'vitest';
import { sanitizeMathText } from '../mathNotation.js';

describe('sanitizeMathText', () => {
  it('converts \\frac{a}{b} to a/b', () => {
    expect(sanitizeMathText('\\frac{2}{3}')).toBe('2/3');
  });

  it('handles the exact reported case: mixed \\frac with a caret exponent', () => {
    expect(sanitizeMathText('-\\frac{2}{3}x^2')).toBe('-2/3x^2');
  });

  it('strips \\( \\) inline delimiters', () => {
    expect(sanitizeMathText('\\(2x + 3\\)')).toBe('2x + 3');
  });

  it('strips \\left \\right size modifiers, keeping the delimiter', () => {
    expect(sanitizeMathText('\\left(x + 1\\right)')).toBe('(x + 1)');
  });

  it('strips braces around a simple numeric exponent', () => {
    expect(sanitizeMathText('x^{2}')).toBe('x^2');
  });

  it('converts common LaTeX operators to their symbol', () => {
    expect(sanitizeMathText('2 \\times 3')).toBe('2 × 3');
    expect(sanitizeMathText('2 \\cdot 3')).toBe('2 · 3');
  });

  it('degrades unknown LaTeX commands to plain words instead of leaving a backslash', () => {
    expect(sanitizeMathText('\\alpha + 1')).toBe('alpha + 1');
  });

  it('leaves plain text with no LaTeX untouched', () => {
    expect(sanitizeMathText('2x + 8y')).toBe('2x + 8y');
    expect(sanitizeMathText('1/3 de los estudiantes')).toBe('1/3 de los estudiantes');
  });

  it('handles empty/falsy input without throwing', () => {
    expect(sanitizeMathText('')).toBe('');
  });
});
