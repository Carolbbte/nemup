/**
 * findError.ts — unit tests for the safety-critical pure gate
 * (reconcileFindError) and the empty-input no-op (generateFindError with no
 * procedure concepts / no worked examples). Deliberately does NOT mock the
 * OpenAI SDK — only the deterministic logic that decides whether a
 * model-invented "error" is safe to teach is exercised here.
 *
 * Two production bugs fixed here:
 *   - Bug 1 (starving): correctTerm used to be matched against correctForm
 *     via a plain substring search, which false-rejected valid items purely
 *     over formatting (a model-authored "-5*x^2*y" not matching the literal
 *     "- 5*x^2*y" inside correctForm). Now matched mathematically
 *     (isAdditiveTermOf), and wrongStep is derived arithmetically
 *     (correctForm − correctTerm + wrongTerm) instead of by text edit.
 *   - Bug 2 (display): the shown result used to go through toDisplayMath
 *     (which calls mathjs's simplify()) — confirmed unreliable for
 *     combining like terms (it once factored "2*x^2 + 2*x" into
 *     "2*(x^2+x)", corrupting the "2x" term's own coefficient). Now uses
 *     combineLikeTerms, a deterministic term-combiner that never calls
 *     simplify().
 *
 * Voz cercana: errorExplanation is always one of 3 fixed templates
 * (omisión/signo/valor), chosen deterministically from correctTerm/
 * wrongTerm. Notación de alumno: every option (correct + distractors)
 * passes through lightPrettyPrint before being stored.
 */

import { describe, it, expect } from 'vitest';
import { generateFindError, reconcileFindError, selectPoolCandidatesForFindError, removeConsumedPoolExercise, type RawFindErrorItem, type FindErrorResult } from '../findError.js';
import type { GeneratedExercise } from '../exerciseGenerator.js';
import type { KnowledgeConcept } from '../types.js';

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

describe('reconcileFindError — Bug 1 fix: match matemático de correctTerm (no substring literal)', () => {
  // Estrella del ticket #1 — el signo aparece PEGADO en correctTerm
  // ("-5*x^2*y") pero DENTRO de correctForm el mismo término está escrito
  // con el menos como operador binario espaciado ("- 5*x^2*y") — un
  // substring search fallaba acá; el match matemático no.
  it('acepta correctTerm="-5*x^2*y" contra correctForm="-4*x^2*y + 7*x^2*y - 5*x^2*y" (antes se descartaba)', () => {
    const expr = '-4*x^2*y + 7*x^2*y - 5*x^2*y';
    const result = reconcileFindError(rawItem({
      expression: expr,
      correctForm: expr,
      correctTerm: '-5*x^2*y',
      wrongTerm: '0',
    }));
    expect(result).not.toBeNull();
  });

  // Estrella del ticket #2 — mismo problema con "-8*z".
  it('acepta correctTerm="-8*z" contra correctForm="-4*x + 3*x + 5*x - 4*y - 8*z" (antes se descartaba)', () => {
    const expr = '-4*x + 3*x + 5*x - 4*y - 8*z';
    const result = reconcileFindError(rawItem({
      expression: expr,
      correctForm: expr,
      correctTerm: '-8*z',
      wrongTerm: '0',
    }));
    expect(result).not.toBeNull();
  });

  it('sigue rechazando un correctTerm que realmente NO es un término de correctForm', () => {
    const expr = '-4*x^2*y + 7*x^2*y - 5*x^2*y';
    const result = reconcileFindError(rawItem({
      expression: expr,
      correctForm: expr,
      correctTerm: '2*x^2*y', // ningún término tiene coeficiente 2
      wrongTerm: '0',
    }));
    expect(result).toBeNull();
  });

  it('deriva wrongStep matemáticamente (correctForm − correctTerm + wrongTerm), no por edición de texto', () => {
    const expr = '-4*x^2*y + 7*x^2*y - 5*x^2*y'; // combinado: -2x²y
    const result = reconcileFindError(rawItem({
      expression: expr,
      correctForm: expr,
      correctTerm: '-5*x^2*y',
      wrongTerm: '0', // omitió ese término -> queda -4x²y+7x²y = 3x²y
    }));
    expect(result?.correctForm).toBe('-2x²y');
    expect(result?.wrongStep).toBe('3x²y');
  });
});

describe('reconcileFindError — Bug 2 fix: resultado mostrado combinado y sin perder coeficientes', () => {
  // El caso de producción: un problema con 3 términos en x del mismo grado.
  // simplify() factorizaba mal esto ("2*(x^2+x)"), corrompiendo el
  // coeficiente del "2x" — combineLikeTerms no debe reproducir eso.
  it('combina todos los términos del mismo grado y conserva cada coeficiente intacto', () => {
    const expr = '2*x^2 + 3 - 4*x^2 + 2*x + 8*x';
    const result = reconcileFindError(rawItem({
      expression: expr,
      correctForm: expr,
      correctTerm: '2*x',
      wrongTerm: '0', // olvidó sumar este término
    }));
    // Correcto combinado: 2x²-4x²=-2x², 2x+8x=10x, +3 -> "-2x² + 10x + 3".
    expect(result?.correctForm).toBe('-2x² + 10x + 3');
    // Sin el 2x: -2x² + 8x + 3 — el 8x conserva su coeficiente, nunca "x".
    expect(result?.wrongStep).toBe('-2x² + 8x + 3');
  });
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

  it('tipo "sign" (wrongTerm = -correctTerm): "Le cambió el signo: puso W en vez de C."', () => {
    const result = reconcileFindError(rawItem({
      expression: '(x+6)*(x-4)',
      correctForm: 'x^2 -4*x +6*x -24',
      correctTerm: '-4*x',
      wrongTerm: '4*x', // el signo ya no necesita ser explícito — la derivación es matemática, no texto
    }));
    expect(result?.errorExplanation).toBe('Le cambió el signo: puso 4x en vez de -4x.');
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

describe('reconcileFindError — distractores circulares (sin error concreto)', () => {
  it('rechaza "…en vez de sumarlos correctamente" (caso real de producción)', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Sumó 2x y 8x en vez de sumarlos correctamente.', 'Mezcló los términos en x e y.'],
    }));
    expect(result).toBeNull();
  });

  it('rechaza "…en vez de restarlo con 2x² correctamente"', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Restó 4x² en vez de sumarlo con 2x² correctamente.', 'Mezcló los términos en x e y.'],
    }));
    expect(result).toBeNull();
  });

  it('rechaza la variante "…en vez de restarlos bien"', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Sumó los coeficientes en vez de restarlos bien.', 'Mezcló los términos en x e y.'],
    }));
    expect(result).toBeNull();
  });

  it('acepta un distractor concreto que nombra un error específico', () => {
    const result = reconcileFindError(rawItem({
      errorDistractors: ['Multiplicó el 3y por 2 sin motivo.', 'Restó los coeficientes de y en vez de sumarlos.'],
    }));
    expect(result).not.toBeNull();
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

  it('returns null when correctTerm is mathematically not one of correctForm\'s additive terms', () => {
    const result = reconcileFindError(rawItem({
      correctForm: '4*x + 3*y - 2*x + 5*y',
      correctTerm: '7*x', // no term has coefficient 7 in x
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

  // El chequeo estrella de la tarea anterior — una parte literal DISTINTA
  // (no solo un coeficiente distinto) se rechaza directamente, porque no
  // daría un delta de un solo término en el resultado final.
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

// find_error desde el pool de ejercicios generados (no solo del material) —
// selectPoolCandidatesForFindError (Cambio 1 + Cambio 2) y
// removeConsumedPoolExercise (Cambio 3), ambas puras/sin llamar al SDK.
const makeConcept = (id: string): KnowledgeConcept => ({
  id,
  name: `Concepto ${id}`,
  simpleExplanation: '',
  teacherExplanation: '',
  definition: '',
  example: null,
  exampleShort: null,
  hook: null,
  emoji: null,
  keyPhrase: null,
  advancedExamples: [],
  tips: [],
  difficulty: 2,
  distinctiveTrait: '',
  sourceQuote: '',
});

const makeGeneratedExercise = (overrides: Partial<GeneratedExercise> = {}): GeneratedExercise => ({
  statement: 'Reduce: 4*x + 3*y - 2*x + 5*y',
  correctAnswer: '2*x + 8*y', // 2 términos — multi-término, elegible
  distractors: [
    { text: '6*x + 8*y', explanation: 'Sumó en vez de restar.' },
    { text: '2*x + 2*y', explanation: 'Restó en vez de sumar.' },
    { text: '2*x*y + 8*x*y', explanation: 'Mezcló términos.' },
  ],
  hint: 'Agrupa por separado.',
  kind: 'calculation',
  checkExpression: '4*x + 3*y - 2*x + 5*y',
  variables: [],
  conceptId: 'c1',
  ...overrides,
});

describe('selectPoolCandidatesForFindError', () => {
  it('elige el ejercicio calculation validado y multi-término del propio concepto', () => {
    const concept = makeConcept('c1');
    const { concepts, examples } = selectPoolCandidatesForFindError([concept], [makeGeneratedExercise()]);

    expect(concepts).toEqual([concept]);
    expect(examples).toEqual([{ statement: '4*x + 3*y - 2*x + 5*y', answer: '2*x + 8*y' }]);
  });

  it('ignora un ejercicio de OTRO concepto, aunque sea válido y multi-término', () => {
    const concept = makeConcept('c1');
    const exercises = [makeGeneratedExercise({ conceptId: 'c2' })];

    const { concepts, examples } = selectPoolCandidatesForFindError([concept], exercises);
    expect(concepts).toEqual([]);
    expect(examples).toEqual([]);
  });

  it('ignora un ejercicio "recognition" (no numérico, no aplica find_error)', () => {
    const concept = makeConcept('c1');
    const exercises = [makeGeneratedExercise({ kind: 'recognition' })];

    const { concepts } = selectPoolCandidatesForFindError([concept], exercises);
    expect(concepts).toEqual([]);
  });

  it('Cambio 2 — ignora un ejercicio cuya correctAnswer NO valida contra checkExpression, sin importar EXERCISE_VALIDATION_MODE global', () => {
    const concept = makeConcept('c1');
    const exercises = [makeGeneratedExercise({ correctAnswer: '999*x' })]; // no coincide con checkExpression

    const { concepts } = selectPoolCandidatesForFindError([concept], exercises);
    expect(concepts).toEqual([]);
  });

  it('ignora un ejercicio de producto/evaluación numérica (correctAnswer de un solo término) — nada que corromper como "un término entre varios"', () => {
    const concept = makeConcept('c1');
    const exercises = [makeGeneratedExercise({
      statement: 'Calcula (x+6)(x+4) con x=3',
      checkExpression: '(x+6)*(x+4)',
      variables: [{ name: 'x', value: 3 }],
      correctAnswer: '63', // un solo valor, no una suma de términos
    })];

    const { concepts, examples } = selectPoolCandidatesForFindError([concept], exercises);
    expect(concepts).toEqual([]);
    expect(examples).toEqual([]);
  });

  it('dos conceptos, cada uno con su propio candidato — no se cruzan', () => {
    const c1 = makeConcept('c1');
    const c2 = makeConcept('c2');
    const exercises = [
      makeGeneratedExercise({ conceptId: 'c1', checkExpression: '4*x + 3*y - 2*x + 5*y', correctAnswer: '2*x + 8*y' }),
      makeGeneratedExercise({ conceptId: 'c2', checkExpression: '2*a + 3*b - a', correctAnswer: '2*a + 3*b - a' }),
    ];

    const { concepts, examples } = selectPoolCandidatesForFindError([c1, c2], exercises);
    expect(concepts.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(examples[0].statement).toBe('4*x + 3*y - 2*x + 5*y');
    expect(examples[1].statement).toBe('2*a + 3*b - a');
  });

  it('un concepto sin ningún candidato elegible queda simplemente afuera (sin forzar nada)', () => {
    const concept = makeConcept('c1');
    const result = selectPoolCandidatesForFindError([concept], []);
    expect(result).toEqual({ concepts: [], examples: [] });
  });
});

describe('removeConsumedPoolExercise', () => {
  const makeResult = (overrides: Partial<FindErrorResult> = {}): FindErrorResult => ({
    conceptId: 'c1',
    expression: '4*x + 3*y - 2*x + 5*y',
    correctForm: '2x + 8y',
    wrongStep: '6x + 8y',
    correctTerm: '4x',
    wrongTerm: '6x',
    question: '¿Cuál es el error?',
    errorExplanation: 'Puso 6x en vez de 4x.',
    errorDistractors: ['a', 'b'],
    ...overrides,
  });

  it('saca el ejercicio cuyo checkExpression es matemáticamente igual a result.expression', () => {
    const target = makeGeneratedExercise();
    const other = makeGeneratedExercise({ conceptId: 'c2', checkExpression: '2*a + 3*a', correctAnswer: '5*a' });

    const result = removeConsumedPoolExercise([other, target], makeResult());

    expect(result).toEqual([other]);
  });

  it('compara por equivalencia matemática, no por texto literal (formato distinto, mismo valor)', () => {
    const target = makeGeneratedExercise({ checkExpression: '4*x+3*y-2*x+5*y' }); // sin espacios
    const result = removeConsumedPoolExercise([target], makeResult({ expression: '4*x + 3*y - 2*x + 5*y' }));

    expect(result).toEqual([]);
  });

  it('no toca nada (no-op) cuando ningún ejercicio corresponde al resultado', () => {
    const exercises = [makeGeneratedExercise({ checkExpression: '2*a + 3*a', correctAnswer: '5*a' })];
    const result = removeConsumedPoolExercise(exercises, makeResult());

    expect(result).toEqual(exercises);
  });

  it('no muta el array original', () => {
    const exercises = [makeGeneratedExercise()];
    removeConsumedPoolExercise(exercises, makeResult());

    expect(exercises).toHaveLength(1);
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
