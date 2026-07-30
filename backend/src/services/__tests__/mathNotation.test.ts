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

  // Signos de agrupación anidados (notación chilena: ( ) → [ ] → { }) — un
  // strip incondicional de '{'/'}' vivía acá antes, y borraba estas llaves
  // sin condición, cambiando el significado de la expresión ("5 - {3 - X}"
  // pasaba a "5 - 3 - X"). Cada construcción LaTeX que SÍ usa llaves como
  // sintaxis (\frac{}{}, \sqrt{}, ^{N}) ya se resuelve arriba en esta misma
  // función — cualquier llave que sobrevive hasta acá es agrupación real,
  // no un resto de LaTeX, así que ahora se preserva tal cual (igual que ya
  // se preservaban los corchetes '['/']').
  it('preserva las llaves/corchetes de agrupación anidados — no las borra', () => {
    expect(sanitizeMathText('5 - {3 - [2 + 4 - (1+1)]}')).toBe('5 - {3 - [2 + 4 - (1+1)]}');
  });

  it('no confunde una llave de agrupación real con una de LaTeX ya resuelta (\\frac sigue funcionando)', () => {
    expect(sanitizeMathText('\\frac{2}{3} + {5 - 1}')).toBe('2/3 + {5 - 1}');
  });

  // Al dejar de borrar TODA llave, un comando LaTeX no reconocido con
  // argumento entre llaves (\text{}, \mathrm{}, \vec{}, ...) ya no debe
  // dejar una llave huérfana visible — se desenvuelve al contenido, mismo
  // trato que \sqrt{} ya recibe.
  it('desenvuelve un comando LaTeX genérico con argumento entre llaves, sin dejar llaves huérfanas', () => {
    expect(sanitizeMathText('5\\text{cm}')).toBe('5cm');
    expect(sanitizeMathText('3\\mathrm{kg} + 2\\mathrm{kg}')).toBe('3kg + 2kg');
  });

  it('el desenvuelto de comando LaTeX no toca una llave de agrupación real justo al lado', () => {
    expect(sanitizeMathText('5\\text{cm} + {3 - 1}')).toBe('5cm + {3 - 1}');
  });
});
