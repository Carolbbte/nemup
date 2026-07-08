/**
 * procedural.ts — unit tests for the safety-critical pieces of the
 * procedural mode: the pure validation gate (reconcileWorkedExample) and the
 * empty-input no-op (buildWorkedExampleSteps([])). Deliberately does NOT
 * mock the OpenAI SDK — the actual AI call path isn't exercised here, only
 * the deterministic logic that decides whether its output is safe to show.
 *
 * Required cases per the procedural-mode spec:
 *   (a) workedExamples vacío → ruta conceptual (no AI call, empty result).
 *   (b) worked example cuyo resultado no valida → cae a B-mínima (steps: null).
 */

import { describe, it, expect } from 'vitest';
import { buildWorkedExampleSteps, reconcileWorkedExample, resultsMatch } from '../procedural.js';
import { buildDesafio } from '../assemble.js';
import type { KnowledgeObject } from '../types.js';
import type { DistractorSet } from '../distractors.js';

const EXAMPLE = { statement: '2m − 5n + 6m − m + 11n', answer: '7m + 6n' };

describe('resultsMatch', () => {
  it('matches identical strings', () => {
    expect(resultsMatch('7m + 6n', '7m + 6n')).toBe(true);
  });

  it('matches reordered terms (whitespace/order-insensitive)', () => {
    expect(resultsMatch('6n + 7m', '7m + 6n')).toBe(true);
  });

  it('does not match a genuinely different result', () => {
    expect(resultsMatch('8m + 6n', '7m + 6n')).toBe(false);
  });
});

describe('reconcileWorkedExample (pure safety gate)', () => {
  it('keeps steps when the model derivation matches the material answer', () => {
    const steps = ['Agrupa términos en m: 2m + 6m − m = 7m', 'Agrupa términos en n: −5n + 11n = 6n'];
    const result = reconcileWorkedExample(EXAMPLE, steps, '7m + 6n');
    expect(result.steps).toEqual(steps);
    expect(result.statement).toBe(EXAMPLE.statement);
    expect(result.answer).toBe(EXAMPLE.answer);
  });

  it('keeps steps when the model result matches after reordering', () => {
    const steps = ['...'];
    const result = reconcileWorkedExample(EXAMPLE, steps, '6n + 7m');
    expect(result.steps).toEqual(steps);
  });

  // (b) required case: worked example cuyo resultado no valida → cae a B-mínima
  it('falls back to steps: null (B-mínima) when the derivation does not match the material answer', () => {
    const wrongSteps = ['Suma todo sin agrupar por variable'];
    const result = reconcileWorkedExample(EXAMPLE, wrongSteps, '8m + 6n');
    expect(result.steps).toBeNull();
    // the anchor (statement/answer) is preserved even on fallback — only the path is discarded
    expect(result.statement).toBe(EXAMPLE.statement);
    expect(result.answer).toBe(EXAMPLE.answer);
  });
});

describe('buildWorkedExampleSteps', () => {
  // (a) required case: workedExamples vacío → ruta conceptual (no AI call)
  it('returns [] immediately without any AI call when there are no worked examples', async () => {
    const result = await buildWorkedExampleSteps([]);
    expect(result).toEqual([]);
  });
});

describe('buildDesafio — procedural slide insertion', () => {
  const ko: KnowledgeObject = {
    topic: 'Expresiones algebraicas',
    subject: 'Matemática',
    concepts: [
      {
        id: 'c1',
        name: 'Término algebraico',
        simpleExplanation: 'Un número junto a una letra.',
        definition: 'Un término algebraico combina un coeficiente y una parte literal.',
        example: '5x²',
        tips: [],
        difficulty: 2,
        distinctiveTrait: 'Es el único formado por un coeficiente y una parte literal.',
        sourceQuote: 'Un término algebraico está compuesto por un coeficiente numérico y una parte literal.',
      },
      {
        id: 'c2',
        name: 'Términos semejantes',
        simpleExplanation: 'Términos con la misma parte literal.',
        definition: 'Dos términos son semejantes cuando comparten la misma parte literal.',
        example: '3x y 5x',
        tips: [],
        difficulty: 3,
        distinctiveTrait: 'Es el único que exige comparar la parte literal de dos términos.',
        sourceQuote: 'Dos términos son semejantes cuando tienen exactamente la misma parte literal.',
      },
    ],
    categories: [],
    workedExamples: [],
  };

  const distractors: Record<string, DistractorSet> = {
    c1: { question: '¿Qué es un término algebraico?', correctText: 'Coeficiente + parte literal', distractors: ['Solo un número', 'Solo una letra', 'Una ecuación'] },
    c2: { question: '¿Cuándo son semejantes dos términos?', correctText: 'Misma parte literal', distractors: ['Mismo coeficiente', 'Mismo signo', 'Mismo exponente solamente'] },
  };

  it('produces the exact same slides when workedExampleResults is omitted vs explicitly empty', () => {
    // Compares slides/conceptCount only — `id` is a fresh randomUUID() per call by design.
    const withDefault = buildDesafio(ko, distractors);
    const withExplicitEmpty = buildDesafio(ko, distractors, []);
    expect(withDefault.slides).toEqual(withExplicitEmpty.slides);
    expect(withDefault.conceptCount).toBe(withExplicitEmpty.conceptCount);
  });

  it('does not insert any insight slide for worked examples when there are none', () => {
    const desafio = buildDesafio(ko, distractors, []);
    const workedSlides = desafio.slides.filter((s) => s.conceptName === 'Ejemplo resuelto');
    expect(workedSlides).toHaveLength(0);
  });

  it('inserts one worked_example slide per worked example, carrying statement/steps/answer, before the first third mark', () => {
    const steps = ['Agrupa términos en m', 'Agrupa términos en n'];
    const desafio = buildDesafio(ko, distractors, [
      { statement: EXAMPLE.statement, answer: EXAMPLE.answer, steps },
    ]);

    const workedIdx = desafio.slides.findIndex((s) => s.type === 'worked_example');
    const bossIdx = desafio.slides.findIndex((s) => s.type === 'boss_loop');

    expect(workedIdx).toBeGreaterThanOrEqual(0);
    expect(bossIdx).toBeGreaterThan(workedIdx);

    const workedSlide = desafio.slides[workedIdx];
    expect(workedSlide.statement).toBe(EXAMPLE.statement);
    expect(workedSlide.answer).toBe(EXAMPLE.answer);
    expect(workedSlide.steps).toEqual(steps);
  });

  it('omits steps (undefined) when validation failed (B-mínima) — never fabricates a path', () => {
    const desafio = buildDesafio(ko, distractors, [
      { statement: EXAMPLE.statement, answer: EXAMPLE.answer, steps: null },
    ]);

    const workedSlide = desafio.slides.find((s) => s.type === 'worked_example');
    expect(workedSlide?.statement).toBe(EXAMPLE.statement);
    expect(workedSlide?.answer).toBe(EXAMPLE.answer);
    expect(workedSlide?.steps).toBeUndefined();
  });
});
