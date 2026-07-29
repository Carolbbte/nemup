/**
 * findError.ts — unit tests for the safety-critical pure gate
 * (reconcileFindError) and the empty-input no-op (generateFindError with no
 * procedure concepts / no worked examples). Deliberately does NOT mock the
 * OpenAI SDK — only the deterministic logic that decides whether a
 * model-invented "error" is safe to teach is exercised here.
 *
 * Voz cercana: errorExplanation ya no es texto libre del modelo con un
 * "porqué" opcional pegado — es SIEMPRE uno de 3 templates fijos
 * (omisión/signo/valor), elegido determinísticamente a partir de
 * correctTerm/wrongTerm. El modelo ya no envía `errorReason` — el contrato
 * se achicó porque los 3 templates cubren, sin ambigüedad, los únicos 3
 * tipos de error que la validación estructural admite.
 *
 * Notación de alumno: toda opción (correcta + distractores) pasa por
 * lightPrettyPrint antes de guardarse — un swap de tokens sobre texto libre
 * (no un parseo de expresión), para que ningún "*"/"^" crudo del modelo
 * llegue a pantalla.
 */

import { describe, it, expect } from 'vitest';
import { generateFindError, reconcileFindError, type RawFindErrorItem } from '../findError.js';

const rawItem = (overrides: Partial<RawFindErrorItem> = {}): RawFindErrorItem => ({
  conceptId: 'c1',
  matched: true,
  expression: '4*x + 3*y - 2*x + 5*y',
  correctForm: '4*x + 3*y - 2*x + 5*y',
  correctTerm: '4*x',
  wrongTerm: '6*x', // misma forma (x^1), distinto coeficiente — tipo "value"
  errorDistractors: ['Restó los coeficientes de y en vez de sumarlos.', 'Mezcló los términos en x e y.'],
  ...overrides,
});

describe('reconcileFindError — voz cercana por tipo de error', () => {
  it('tipo "value" (mismo monomio, distinto coeficiente): "Puso W en vez de C."', () => {
    const result = reconcileFindError(rawItem());
    expect(result?.errorExplanation).toBe('Puso 6x en vez de 4x.');
  });

  it('tipo "value" con constantes puras (ej. 24 -> 20): "Puso 20 en vez de 24."', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)*(x+4)-x^2',
      correctForm: 'x^2 + 6*x + 4*x + 24 - x^2',
      correctTerm: '24',
      wrongTerm: '20',
    }));
    expect(result?.errorExplanation).toBe('Puso 20 en vez de 24.');
    expect(result?.correctForm).toBe('10x + 24');
    expect(result?.wrongStep).toBe('10x + 20');
  });

  it('tipo "omission" (wrongTerm=0): "Le faltó el T: se olvidó de ese término."', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)*(x+4)-x^2',
      correctForm: 'x^2 + 6*x + 4*x + 24 - x^2',
      correctTerm: '4*x',
      wrongTerm: '0',
    }));
    expect(result?.errorExplanation).toBe('Le faltó el 4x: se olvidó de ese término.');
    expect(result?.correctForm).toBe('10x + 24');
    expect(result?.wrongStep).toBe('6x + 24');
  });

  // wrongTerm lleva el signo "+" explícito — un "4*x" a secas rompería la
  // sintaxis de la sustitución (ver el propio comentario del prompt).
  it('tipo "sign" (wrongTerm = -correctTerm): "Le cambió el signo: puso W en vez de C."', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)*(x-4)',
      correctForm: 'x^2 -4*x +6*x -24',
      correctTerm: '-4*x',
      wrongTerm: '+4*x',
    }));
    expect(result?.errorExplanation).toBe('Le cambió el signo: puso 4x en vez de -4x.');
    expect(result?.correctForm).toBe('2x + x² - 24');
    expect(result?.wrongStep).toBe('10x + x² - 24');
  });
});

describe('reconcileFindError — notación de alumno en TODAS las opciones', () => {
  it('limpia "*" y "^" del texto de un distractor (red de seguridad de presentación)', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Multiplicó mal 6*4.', 'Olvidó elevar x^2 al cuadrado.'],
    }));
    expect(result?.errorDistractors).toEqual(['Multiplicó mal 6·4.', 'Olvidó elevar x² al cuadrado.']);
  });

  it('ninguna opción (correcta ni distractor) contiene "*" ni "^" en el resultado final', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Sumó 6*x en vez de restarlo.', 'Confundió x^2 con 2*x.'],
    }));
    const allOptionText = [result?.errorExplanation, ...(result?.errorDistractors ?? [])].join(' ');
    expect(allOptionText).not.toMatch(/[*^]/);
  });
});

describe('reconcileFindError (pure safety gate)', () => {
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

  // El chequeo estrella — una parte literal DISTINTA (no solo un coeficiente
  // distinto) se rechaza directamente, porque no daría un delta de un solo
  // término en el resultado final.
  it('rejects when wrongTerm has a different literal part than correctTerm (not a coefficient/sign-only change)', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)*(x+4)-x^2',
      correctForm: 'x^2 + 6*x + 4*x + 24 - x^2',
      correctTerm: '4*x',
      wrongTerm: '4', // different literal part (constant vs x^1) — PROHIBITED under the new rule
    }));
    expect(result).toBeNull();
  });

  it('rejects when a distractor is a literal duplicate of the templated correct option', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Puso 6x en vez de 4x.', 'Mezcló los términos en x e y.'],
    }));
    expect(result).toBeNull();
  });

  it('rejects when a distractor mentions correctTerm in display notation (a second, encubierta description of the same term)', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Olvidó multiplicar 4x por otro factor.', 'Mezcló los términos en x e y.'],
    }));
    expect(result).toBeNull();
  });

  it('rejects when a distractor mentions "orden de los términos" (not a real error)', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Reordenó los términos de la expresión.', 'Mezcló los términos en x e y.'],
    }));
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
