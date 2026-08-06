/**
 * motorAdapter.ts — unit tests for the pure KnowledgeObject/DistractorSet →
 * Motor-banco transformation. No AI calls involved — every input is a
 * hand-built fixture.
 */

import { describe, it, expect } from 'vitest';
import { adaptarAMotor } from '../motorAdapter.js';
import type { KnowledgeConcept, KnowledgeObject, WorkedExample } from '../types.js';
import type { DistractorSet } from '../distractors.js';

const makeConcept = (overrides: Partial<KnowledgeConcept> & { id: string; name: string }): KnowledgeConcept => ({
  simpleExplanation: '', teacherExplanation: '', definition: '', example: null, exampleShort: null,
  hook: null, emoji: null, keyPhrase: null, advancedExamples: [], tips: [], difficulty: 1,
  distinctiveTrait: '', sourceQuote: '',
  ...overrides,
});

const makeKo = (concepts: KnowledgeConcept[], workedExamples: WorkedExample[] = []): KnowledgeObject => ({
  isSchoolContent: true, rejectionReason: null, topic: 'Factorización', subject: 'Matemáticas',
  concepts, categories: [], workedExamples,
});

const DISTRACTOR_SET: DistractorSet = {
  question: '¿Qué método conviene para 6x² + 12x?',
  correctText: 'Factor común',
  distractors: [
    { text: 'Diferencia de cuadrados', explanation: 'No aplica sin dos cuadrados perfectos.' },
    { text: 'Trinomio cuadrado perfecto', explanation: 'Se necesitan tres términos con esa forma.' },
    { text: 'Completar el cuadrado', explanation: 'Es un método para ecuaciones, no para factorizar directo.' },
  ],
};

describe('adaptarAMotor', () => {
  it('mapea pedagogicalType a escalera, con fallback a procedimental', () => {
    const ko = makeKo([makeConcept({ id: 'c1', name: 'Factor común' })]);
    expect(adaptarAMotor(ko, {}, 'PROCEDURAL').conceptos[0].escalera).toBe('procedimental');
    expect(adaptarAMotor(ko, {}, 'CONCEPTUAL').conceptos[0].escalera).toBe('declarativa');
    expect(adaptarAMotor(ko, {}, 'MEMORIZATION').conceptos[0].escalera).toBe('declarativa');
    expect(adaptarAMotor(ko, {}, 'MIXED').conceptos[0].escalera).toBe('procedimental');
    expect(adaptarAMotor(ko, {}, 'ALGO_NO_MAPEADO').conceptos[0].escalera).toBe('procedimental');
  });

  it('un concepto con distractor set + teacherExplanation + definition puebla comprender/reconocer/aplicar/transferir', () => {
    const concept = makeConcept({
      id: 'c1', name: 'Factor común', role: 'procedure',
      teacherExplanation: 'Factorizar es encontrar qué se repite en cada término.',
      definition: 'El factor común es el término presente en todos los sumandos.',
    });
    const ko = makeKo([concept]);
    const result = adaptarAMotor(ko, { c1: DISTRACTOR_SET }, 'PROCEDURAL');

    const banco = result.banco['c1'];
    expect(banco).toBeDefined();
    expect(banco!.comprender?.pregunta?.[0]).toEqual({
      enunciado: DISTRACTOR_SET.question,
      opciones: [
        { id: 'correcta', texto: 'Factor común', correcta: true },
        { id: 'distractor-0', texto: 'Diferencia de cuadrados', correcta: false },
        { id: 'distractor-1', texto: 'Trinomio cuadrado perfecto', correcta: false },
        { id: 'distractor-2', texto: 'Completar el cuadrado', correcta: false },
      ],
    });
    expect(banco!.comprender?.insight?.[0]).toEqual({ cuerpo: concept.teacherExplanation });
    expect(banco!.reconocer?.contexto?.[0]).toEqual({ cuerpo: concept.definition });
    // aplicar.ejercicio y transferir.ejercicio reusan el mismo DistractorSet.
    expect(banco!.aplicar?.ejercicio?.[0]).toEqual(banco!.comprender?.pregunta?.[0]);
    expect(banco!.transferir?.ejercicio?.[0]).toEqual(banco!.comprender?.pregunta?.[0]);
  });

  it('ninguna opción trae tipoError — queda para el fallback del runner', () => {
    const concept = makeConcept({ id: 'c1', name: 'Factor común' });
    const ko = makeKo([concept]);
    const result = adaptarAMotor(ko, { c1: DISTRACTOR_SET }, 'PROCEDURAL');
    const opciones = result.banco['c1'].comprender!.pregunta![0];
    if ('opciones' in opciones) {
      opciones.opciones.forEach((o) => expect((o as any).tipoError).toBeUndefined());
    }
  });

  it('asigna workedExamples por orden a los conceptos con role procedure', () => {
    const procA = makeConcept({ id: 'a', name: 'A', role: 'procedure' });
    const support = makeConcept({ id: 'b', name: 'B', role: 'supporting' });
    const procC = makeConcept({ id: 'c', name: 'C', role: 'procedure' });
    const ko = makeKo([procA, support, procC], [
      { statement: '6x² + 12x', answer: '6x(x + 2)' },
      { statement: '4x² + 8x', answer: '4x(x + 2)' },
    ]);
    const result = adaptarAMotor(ko, {}, 'PROCEDURAL');
    expect(result.banco['a'].aplicar?.ejemplo?.[0]).toEqual({ titulo: '6x² + 12x', cuerpo: '6x(x + 2)' });
    expect(result.banco['c'].aplicar?.ejemplo?.[0]).toEqual({ titulo: '4x² + 8x', cuerpo: '4x(x + 2)' });
    expect(result.banco['b']).toBeUndefined();
  });

  it('un concepto sin distractor set, sin explicaciones y sin worked example no entra al banco', () => {
    const concept = makeConcept({ id: 'c1', name: 'Concepto vacío' });
    const ko = makeKo([concept]);
    const result = adaptarAMotor(ko, {}, 'PROCEDURAL');
    expect(result.banco['c1']).toBeUndefined();
    expect(result.conceptos).toEqual([{ id: 'c1', nombre: 'Concepto vacío', escalera: 'procedimental' }]);
  });

  it('usa hook como fallback de insight y simpleExplanation como fallback de contexto', () => {
    const concept = makeConcept({
      id: 'c1', name: 'X', teacherExplanation: '', hook: 'Como separar ingredientes comunes de una receta.',
      definition: '', simpleExplanation: 'Es sacar lo que se repite.',
    });
    const ko = makeKo([concept]);
    const result = adaptarAMotor(ko, {}, 'PROCEDURAL');
    expect(result.banco['c1'].comprender?.insight?.[0]).toEqual({ cuerpo: concept.hook });
    expect(result.banco['c1'].reconocer?.contexto?.[0]).toEqual({ cuerpo: concept.simpleExplanation });
  });
});
