/**
 * knowledgeExtractor — unit tests.
 *
 * All OpenAI calls are mocked. Tests verify that:
 *   A. extractKnowledge parses and returns a valid KnowledgeGraph
 *   B. metadata is auto-computed (not trusted from the model)
 *   C. validateKnowledgeGraph catches structural errors
 *
 * Three subject scenarios:
 *   A. Matemáticas — concepts + examples + procedures
 *   B. Historia    — entities (dates, names) + relationships
 *   C. Biología    — concepts + definitions + relationships
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// vi.hoisted() ensures mock functions are available inside vi.mock() factories
// ---------------------------------------------------------------------------

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

vi.mock('../../config.js', () => ({
  config: { openai_api_key: 'test-key', openai_model: 'gpt-4.1-mini' },
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------

import {
  extractKnowledge,
  validateKnowledgeGraph,
  KnowledgeValidationError,
} from '../knowledgeExtractor.js';
import type { KnowledgeGraph } from '../knowledgeExtractor.js';

// ---------------------------------------------------------------------------
// Helper: wrap a KnowledgeGraph (without metadata) in a mock OpenAI response
// ---------------------------------------------------------------------------

function mockResponse(graph: Omit<KnowledgeGraph, 'metadata'>): void {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(graph) } }],
  });
}

// ---------------------------------------------------------------------------
// A. Matemáticas — reducción de términos semejantes
// ---------------------------------------------------------------------------

const MATH_GRAPH: Omit<KnowledgeGraph, 'metadata'> = {
  concepts: [
    {
      id: 'c1',
      name: 'Términos semejantes',
      description: 'Términos algebraicos con la misma parte literal y exponentes.',
      tags: ['álgebra', 'polinomios'],
    },
    {
      id: 'c2',
      name: 'Reducción de términos semejantes',
      description: 'Operación de sumar o restar coeficientes de términos con igual parte literal.',
    },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Términos semejantes',
      definition: 'Monomios que tienen la misma parte literal con los mismos exponentes.',
      conceptId: 'c1',
    },
  ],
  examples: [
    {
      id: 'e1',
      content: '3a² + 5a − 8a² − 11a + a² + 6a = −4a²',
      conceptId: 'c2',
      type: 'symbolic',
    },
    {
      id: 'e2',
      content: '7x − 3x = 4x',
      conceptId: 'c2',
      type: 'symbolic',
    },
  ],
  procedures: [
    {
      id: 'p1',
      name: 'Reducir términos semejantes',
      steps: [
        'Identificar los términos semejantes (misma parte literal y exponente).',
        'Sumar o restar los coeficientes.',
        'Conservar la parte literal sin cambios.',
      ],
      conceptId: 'c2',
    },
  ],
  mistakes: [
    {
      id: 'm1',
      description: 'Sumar exponentes en lugar de sumar solo los coeficientes.',
      conceptId: 'c2',
      correction: 'Solo se operan los coeficientes; la parte literal se mantiene igual.',
    },
  ],
  relationships: [
    {
      id: 'r1',
      from: 'c1',
      to: 'c2',
      type: 'enables',
      description: 'Identificar términos semejantes es necesario para reducirlos.',
    },
  ],
  entities: [
    { id: 'en1', value: 'a²', type: 'symbol', context: 'parte literal de grado 2' },
  ],
};

// ---------------------------------------------------------------------------
// B. Historia — Independencia de Chile
// ---------------------------------------------------------------------------

const HISTORY_GRAPH: Omit<KnowledgeGraph, 'metadata'> = {
  concepts: [
    {
      id: 'c1',
      name: 'Independencia de Chile',
      description: 'Proceso de separación política de Chile del Imperio español.',
    },
  ],
  definitions: [],
  examples: [],
  procedures: [],
  mistakes: [],
  relationships: [
    {
      id: 'r1',
      from: 'en1',
      to: 'c1',
      type: 'occurred-at',
      description: 'La proclamación ocurrió en 1818.',
    },
    {
      id: 'r2',
      from: 'en2',
      to: 'c1',
      type: 'leads-to',
      description: "O'Higgins lideró el proceso independentista.",
    },
  ],
  entities: [
    { id: 'en1', value: '1818',      type: 'date',  context: 'Proclamación de la Independencia de Chile' },
    { id: 'en2', value: "O'Higgins", type: 'name',  context: "Primer director supremo de Chile" },
    { id: 'en3', value: '1810',      type: 'date',  context: 'Inicio del proceso independentista (Primera Junta de Gobierno)' },
  ],
};

// ---------------------------------------------------------------------------
// C. Biología — Fotosíntesis
// ---------------------------------------------------------------------------

const BIOLOGY_GRAPH: Omit<KnowledgeGraph, 'metadata'> = {
  concepts: [
    { id: 'c1', name: 'Fotosíntesis', tags: ['biología celular', 'plantas'] },
    { id: 'c2', name: 'Cloroplasto',  description: 'Orgánulo donde se realiza la fotosíntesis.' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Fotosíntesis',
      definition: 'Proceso por el cual los organismos autótrofos transforman energía lumínica en energía química (glucosa).',
      conceptId: 'c1',
    },
  ],
  examples: [
    {
      id: 'e1',
      content: 'Las plantas absorben CO₂ y H₂O y liberan O₂ y glucosa mediante la fotosíntesis.',
      conceptId: 'c1',
      type: 'textual',
    },
  ],
  procedures: [
    {
      id: 'p1',
      name: 'Fase luminosa de la fotosíntesis',
      steps: [
        'La luz solar activa la clorofila en los tilacoides.',
        'Se produce ATP y NADPH.',
        'Se libera O₂ como subproducto.',
      ],
      conceptId: 'c1',
    },
  ],
  mistakes: [],
  relationships: [
    {
      id: 'r1',
      from: 'c2',
      to: 'c1',
      type: 'enables',
      description: 'El cloroplasto es el sitio donde ocurre la fotosíntesis.',
    },
  ],
  entities: [
    { id: 'en1', value: 'CO₂',     type: 'symbol',  context: 'Reactivo de la fotosíntesis' },
    { id: 'en2', value: 'O₂',      type: 'symbol',  context: 'Producto de la fase luminosa' },
    { id: 'en3', value: 'glucosa', type: 'symbol',  context: 'Producto de la fase oscura' },
    { id: 'en4', value: '6CO₂ + 6H₂O + luz → C₆H₁₂O₆ + 6O₂', type: 'formula', context: 'Ecuación global de la fotosíntesis' },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockCreate.mockReset();
});

describe('extractKnowledge — A. Matemáticas', () => {
  it('extrae concepts, examples y procedures', async () => {
    mockResponse(MATH_GRAPH);
    const result = await extractKnowledge({
      transcription: 'Texto de álgebra: reducción de términos semejantes.',
      subject: 'matemáticas',
      curso: '1º Medio',
    });

    expect(result.concepts.length).toBeGreaterThanOrEqual(1);
    expect(result.examples.length).toBeGreaterThanOrEqual(1);
    expect(result.procedures.length).toBeGreaterThanOrEqual(1);
  });

  it('auto-computa metadata (no confía en el modelo)', async () => {
    mockResponse(MATH_GRAPH);
    const result = await extractKnowledge({ transcription: 'álgebra' });

    expect(result.metadata.conceptCount).toBe(result.concepts.length);
    expect(result.metadata.exampleCount).toBe(result.examples.length);
    expect(result.metadata.procedureCount).toBe(result.procedures.length);
    expect(result.metadata.entityCount).toBe(result.entities.length);
    expect(result.metadata.extractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('extrae errores comunes y relaciones', async () => {
    mockResponse(MATH_GRAPH);
    const result = await extractKnowledge({ transcription: 'álgebra' });

    expect(result.mistakes.length).toBeGreaterThanOrEqual(1);
    expect(result.relationships.length).toBeGreaterThanOrEqual(1);
  });
});

describe('extractKnowledge — B. Historia', () => {
  it('extrae eventos (entities) y fechas', async () => {
    mockResponse(HISTORY_GRAPH);
    const result = await extractKnowledge({
      transcription: 'Historia de Chile: independencia.',
      subject: 'historia',
    });

    const dates = result.entities.filter(e => e.type === 'date');
    expect(dates.length).toBeGreaterThanOrEqual(1);
    expect(dates.some(e => e.value === '1818')).toBe(true);
  });

  it('extrae nombres de figuras históricas', async () => {
    mockResponse(HISTORY_GRAPH);
    const result = await extractKnowledge({ transcription: 'historia' });

    const names = result.entities.filter(e => e.type === 'name');
    expect(names.length).toBeGreaterThanOrEqual(1);
  });

  it('extrae relaciones entre conceptos y entidades', async () => {
    mockResponse(HISTORY_GRAPH);
    const result = await extractKnowledge({ transcription: 'historia' });

    expect(result.relationships.length).toBeGreaterThanOrEqual(1);
    const types = result.relationships.map(r => r.type);
    expect(types).toContain('occurred-at');
  });
});

describe('extractKnowledge — C. Biología', () => {
  it('extrae concepts y definitions', async () => {
    mockResponse(BIOLOGY_GRAPH);
    const result = await extractKnowledge({
      transcription: 'Biología celular: fotosíntesis.',
      subject: 'biología',
    });

    expect(result.concepts.length).toBeGreaterThanOrEqual(1);
    expect(result.definitions.length).toBeGreaterThanOrEqual(1);
    expect(result.definitions[0]).toMatchObject({ term: 'Fotosíntesis' });
  });

  it('extrae funciones como procedures', async () => {
    mockResponse(BIOLOGY_GRAPH);
    const result = await extractKnowledge({ transcription: 'biología' });

    expect(result.procedures.length).toBeGreaterThanOrEqual(1);
    expect(result.procedures[0].steps.length).toBeGreaterThanOrEqual(1);
  });

  it('extrae fórmulas como entities de tipo formula', async () => {
    mockResponse(BIOLOGY_GRAPH);
    const result = await extractKnowledge({ transcription: 'biología' });

    const formulas = result.entities.filter(e => e.type === 'formula');
    expect(formulas.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// validateKnowledgeGraph — error cases
// ---------------------------------------------------------------------------

describe('validateKnowledgeGraph', () => {
  it('lanza error si falta un array requerido', () => {
    const bad = { concepts: [], definitions: [], examples: [], procedures: [], mistakes: [], relationships: [] };
    expect(() => validateKnowledgeGraph(bad)).toThrow(KnowledgeValidationError);
  });

  it('lanza error si hay ids duplicados', () => {
    const bad: KnowledgeGraph = {
      concepts:      [{ id: 'c1', name: 'A' }, { id: 'c1', name: 'B' }],
      definitions:   [],
      examples:      [],
      procedures:    [],
      mistakes:      [],
      relationships: [],
      entities:      [],
      metadata:      { conceptCount: 2, exampleCount: 0, procedureCount: 0, entityCount: 0, extractedAt: '' },
    };
    expect(() => validateKnowledgeGraph(bad)).toThrow(KnowledgeValidationError);
  });

  it('lanza error si un concept no tiene name', () => {
    const bad: KnowledgeGraph = {
      concepts:      [{ id: 'c1', name: '' }],
      definitions:   [],
      examples:      [],
      procedures:    [],
      mistakes:      [],
      relationships: [],
      entities:      [],
      metadata:      { conceptCount: 1, exampleCount: 0, procedureCount: 0, entityCount: 0, extractedAt: '' },
    };
    expect(() => validateKnowledgeGraph(bad)).toThrow(KnowledgeValidationError);
  });

  it('lanza error si un example tiene content vacío', () => {
    const bad: KnowledgeGraph = {
      concepts:      [],
      definitions:   [],
      examples:      [{ id: 'e1', content: '   ' }],
      procedures:    [],
      mistakes:      [],
      relationships: [],
      entities:      [],
      metadata:      { conceptCount: 0, exampleCount: 1, procedureCount: 0, entityCount: 0, extractedAt: '' },
    };
    expect(() => validateKnowledgeGraph(bad)).toThrow(KnowledgeValidationError);
  });

  it('acepta un graph válido sin lanzar error', () => {
    const valid: KnowledgeGraph = {
      concepts:      [{ id: 'c1', name: 'Fotosíntesis' }],
      definitions:   [{ id: 'd1', term: 'Fotosíntesis', definition: 'Proceso…', conceptId: 'c1' }],
      examples:      [{ id: 'e1', content: 'Las plantas absorben CO₂', conceptId: 'c1' }],
      procedures:    [{ id: 'p1', name: 'Fase luminosa', steps: ['Paso 1'] }],
      mistakes:      [],
      relationships: [{ id: 'r1', from: 'c1', to: 'd1', type: 'defines' }],
      entities:      [{ id: 'en1', value: 'CO₂', type: 'symbol' }],
      metadata:      { conceptCount: 1, exampleCount: 1, procedureCount: 1, entityCount: 1, extractedAt: '2026-01-01T00:00:00.000Z' },
    };
    expect(() => validateKnowledgeGraph(valid)).not.toThrow();
  });
});
