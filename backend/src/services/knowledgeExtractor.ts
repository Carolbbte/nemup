/**
 * Knowledge Extractor — transforms raw transcription into structured pedagogical knowledge.
 *
 * This layer is the intended future "single source of truth" for:
 *   - pedagogicalClassifier  (skill and subject detection)
 *   - generationService      (slide generation grounded in extracted structure)
 *   - truthValidator         (concept-aware answer validation)
 *
 * NOT yet connected to the main pipeline. Use extractKnowledge() as a standalone call.
 *
 * Subject-agnostic: mathematics, history, biology, chemistry, language, physics, etc.
 *
 * Responsibilities:
 *   ✓ Transform raw OCR text into structured knowledge
 *   ✗ Generate slides
 *   ✗ Generate questions or distractors
 *   ✗ Generate UX or pedagogical feedback
 *   ✗ Invent content not present in the source
 */

import OpenAI from 'openai';
import { config } from '../config.js';
import { withOpenAIRetry } from './openaiRetry.js';
import { recordUsage } from './usageTracking.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

// ── Public input type ─────────────────────────────────────────────────────────

export interface KnowledgeExtractionInput {
  transcription: string;
  subject?: string;   // e.g. "matemáticas", "historia", "biología"
  curso?: string;     // e.g. "1º Medio", "2º Básico"
}

// ── Knowledge graph entity types ──────────────────────────────────────────────

export interface KnowledgeConcept {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
}

export interface KnowledgeDefinition {
  id: string;
  term: string;
  definition: string;
  conceptId?: string;   // links to a KnowledgeConcept.id
}

export interface KnowledgeExample {
  id: string;
  content: string;
  conceptId?: string;
  type?: 'numeric' | 'symbolic' | 'textual' | 'graphical' | 'other';
}

export interface KnowledgeProcedure {
  id: string;
  name: string;
  steps: string[];
  conceptId?: string;
}

export interface KnowledgeMistake {
  id: string;
  description: string;
  conceptId?: string;
  correction?: string;
}

export interface KnowledgeRelationship {
  id: string;
  from: string;       // id of source concept or entity
  to: string;         // id of target concept or entity
  /** Semantic type: 'causes' | 'is-a' | 'part-of' | 'leads-to' | 'enables' | 'occurred-at' | 'other' */
  type: string;
  description?: string;
}

export interface KnowledgeEntity {
  id: string;
  value: string;
  type: 'date' | 'formula' | 'name' | 'symbol' | 'event' | 'other';
  context?: string;
}

export interface KnowledgeMetadata {
  conceptCount: number;
  exampleCount: number;
  procedureCount: number;
  entityCount: number;
  extractedAt: string;   // ISO 8601
}

// ── Knowledge graph ───────────────────────────────────────────────────────────

export interface KnowledgeGraph {
  concepts:      KnowledgeConcept[];
  definitions:   KnowledgeDefinition[];
  examples:      KnowledgeExample[];
  procedures:    KnowledgeProcedure[];
  mistakes:      KnowledgeMistake[];
  relationships: KnowledgeRelationship[];
  entities:      KnowledgeEntity[];
  metadata:      KnowledgeMetadata;
}

// ── Validation error ──────────────────────────────────────────────────────────

export class KnowledgeValidationError extends Error {
  constructor(
    message: string,
    public readonly violations: string[],
  ) {
    super(`${message}: ${violations.join('; ')}`);
    this.name = 'KnowledgeValidationError';
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validates that the parsed LLM output is a structurally sound KnowledgeGraph.
 * Throws KnowledgeValidationError with the full list of violations on failure.
 */
export function validateKnowledgeGraph(graph: unknown): asserts graph is KnowledgeGraph {
  const violations: string[] = [];

  if (!graph || typeof graph !== 'object') {
    throw new KnowledgeValidationError('KnowledgeGraph must be an object', ['received non-object']);
  }

  const g = graph as Record<string, unknown>;

  // ── Required arrays ───────────────────────────────────────────────────────
  const ARRAY_KEYS = [
    'concepts', 'definitions', 'examples',
    'procedures', 'mistakes', 'relationships', 'entities',
  ] as const;

  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(g[key])) violations.push(`"${key}" must be an array`);
  }

  if (violations.length > 0) {
    throw new KnowledgeValidationError('Missing required arrays', violations);
  }

  const allIds = new Set<string>();

  function checkId(entityType: string, id: unknown): boolean {
    if (!id || typeof id !== 'string') {
      violations.push(`${entityType} missing id`);
      return false;
    }
    if (allIds.has(id)) {
      violations.push(`duplicate id: "${id}"`);
    }
    allIds.add(id);
    return true;
  }

  // ── Concepts ──────────────────────────────────────────────────────────────
  for (const c of g.concepts as unknown[]) {
    const obj = c as Record<string, unknown>;
    checkId('concept', obj.id);
    if (!obj.name || typeof obj.name !== 'string' || !obj.name.trim()) {
      violations.push(`concept "${obj.id ?? '?'}" missing name`);
    }
  }

  // ── Definitions ───────────────────────────────────────────────────────────
  for (const d of g.definitions as unknown[]) {
    const obj = d as Record<string, unknown>;
    checkId('definition', obj.id);
    if (!obj.term)       violations.push(`definition "${obj.id ?? '?'}" missing term`);
    if (!obj.definition) violations.push(`definition "${obj.id ?? '?'}" missing definition text`);
  }

  // ── Examples (content must not be empty) ─────────────────────────────────
  for (const e of g.examples as unknown[]) {
    const obj = e as Record<string, unknown>;
    checkId('example', obj.id);
    if (!obj.content || !String(obj.content).trim()) {
      violations.push(`example "${obj.id ?? '?'}" content is empty`);
    }
  }

  // ── Procedures ────────────────────────────────────────────────────────────
  for (const p of g.procedures as unknown[]) {
    const obj = p as Record<string, unknown>;
    checkId('procedure', obj.id);
    if (!Array.isArray(obj.steps)) {
      violations.push(`procedure "${obj.id ?? '?'}" steps must be an array`);
    }
  }

  // ── Mistakes ──────────────────────────────────────────────────────────────
  for (const m of g.mistakes as unknown[]) {
    const obj = m as Record<string, unknown>;
    checkId('mistake', obj.id);
    if (!obj.description) violations.push(`mistake "${obj.id ?? '?'}" missing description`);
  }

  // ── Relationships ─────────────────────────────────────────────────────────
  for (const r of g.relationships as unknown[]) {
    const obj = r as Record<string, unknown>;
    checkId('relationship', obj.id);
    if (!obj.from || !obj.to) violations.push(`relationship "${obj.id ?? '?'}" missing from/to`);
    if (!obj.type)            violations.push(`relationship "${obj.id ?? '?'}" missing type`);
  }

  // ── Entities ──────────────────────────────────────────────────────────────
  for (const en of g.entities as unknown[]) {
    const obj = en as Record<string, unknown>;
    checkId('entity', obj.id);
    if (!obj.value) violations.push(`entity "${obj.id ?? '?'}" missing value`);
    if (!obj.type)  violations.push(`entity "${obj.id ?? '?'}" missing type`);
  }

  // ── Metadata ──────────────────────────────────────────────────────────────
  if (!g.metadata || typeof g.metadata !== 'object') {
    violations.push('metadata missing');
  } else {
    const m = g.metadata as Record<string, unknown>;
    if (typeof m.conceptCount   !== 'number') violations.push('metadata.conceptCount must be a number');
    if (typeof m.exampleCount   !== 'number') violations.push('metadata.exampleCount must be a number');
    if (typeof m.procedureCount !== 'number') violations.push('metadata.procedureCount must be a number');
    if (typeof m.entityCount    !== 'number') violations.push('metadata.entityCount must be a number');
    if (typeof m.extractedAt    !== 'string') violations.push('metadata.extractedAt must be a string');
  }

  if (violations.length > 0) {
    throw new KnowledgeValidationError('KnowledgeGraph validation failed', violations);
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildMessages(
  input: KnowledgeExtractionInput,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const context = [
    input.subject ? `Asignatura: ${input.subject}.` : '',
    input.curso   ? `Nivel: ${input.curso}.`        : '',
  ].filter(Boolean).join(' ');

  const system = [
    'Eres un extractor de conocimiento académico.',
    'Tu única función es analizar texto educativo y devolver JSON estructurado.',
    context,
    'No enseñes. No expliques. No reformules. No inventes.',
  ].filter(Boolean).join(' ');

  const user = `Analiza el contenido y extrae únicamente conocimiento estructurado.

Devuelve SOLO JSON con esta estructura exacta:
{
  "concepts":      [{ "id": "c1", "name": "...", "description": "...", "tags": [] }],
  "definitions":   [{ "id": "d1", "term": "...", "definition": "...", "conceptId": "c1" }],
  "examples":      [{ "id": "e1", "content": "...", "conceptId": "c1", "type": "numeric|symbolic|textual|graphical|other" }],
  "procedures":    [{ "id": "p1", "name": "...", "steps": ["paso 1", "paso 2"], "conceptId": "c1" }],
  "mistakes":      [{ "id": "m1", "description": "...", "conceptId": "c1", "correction": "..." }],
  "relationships": [{ "id": "r1", "from": "c1", "to": "c2", "type": "causes|is-a|part-of|leads-to|enables|occurred-at|other", "description": "..." }],
  "entities":      [{ "id": "en1", "value": "...", "type": "date|formula|name|symbol|event|other", "context": "..." }]
}

REGLAS:
- No enseñes. No expliques. No reformules. No inventes.
- No generes preguntas. No generes ejercicios.
- Usa grounding estricto: extrae solo lo que está presente en el texto.
- Si algo no existe en el texto, devuelve array vacío [].
- Los ids deben ser únicos en todo el documento (c1, c2, d1, d2, e1, e2, …).
- Las relaciones deben referenciar ids existentes en concepts o entities.

CONTENIDO:
${input.transcription}`;

  return [
    { role: 'system', content: system },
    { role: 'user',   content: user   },
  ];
}

// ── Metadata builder (auto-computed, never LLM-generated) ─────────────────────

function buildMetadata(graph: Record<string, unknown>): KnowledgeMetadata {
  return {
    conceptCount:   Array.isArray(graph.concepts)   ? graph.concepts.length   : 0,
    exampleCount:   Array.isArray(graph.examples)   ? graph.examples.length   : 0,
    procedureCount: Array.isArray(graph.procedures) ? graph.procedures.length : 0,
    entityCount:    Array.isArray(graph.entities)   ? graph.entities.length   : 0,
    extractedAt:    new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extracts a structured KnowledgeGraph from raw transcription text.
 *
 * Makes a single AI call with temperature 0.1 (factual extraction, not creative).
 * Injects auto-computed metadata and validates the result before returning.
 *
 * @throws KnowledgeValidationError if the model returns invalid structure
 * @throws Error if the model returns empty or non-JSON content
 */
export async function extractKnowledge(
  input: KnowledgeExtractionInput,
): Promise<KnowledgeGraph> {
  console.log('[KnowledgeExtractor] start');

  const response = await withOpenAIRetry(() => openai.chat.completions.create({
    model:           config.openai_model,
    response_format: { type: 'json_object' },
    messages:        buildMessages(input),
    temperature:     0.1,
    max_tokens:      4096,
  }), 'KnowledgeExtractor');
  recordUsage('KnowledgeExtractor-V1', response.usage);

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('[KnowledgeExtractor] empty response from model');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`[KnowledgeExtractor] invalid JSON from model: ${raw.slice(0, 200)}`);
  }

  // Metadata is always auto-computed — never trusted from the LLM
  const graph = parsed as Record<string, unknown>;
  graph.metadata = buildMetadata(graph);

  validateKnowledgeGraph(graph);

  const result = graph as KnowledgeGraph;

  console.log(`[KnowledgeExtractor] concepts=${result.metadata.conceptCount}`);
  console.log(`[KnowledgeExtractor] examples=${result.metadata.exampleCount}`);
  console.log(`[KnowledgeExtractor] procedures=${result.metadata.procedureCount}`);
  console.log(`[KnowledgeExtractor] entities=${result.metadata.entityCount}`);
  console.log('[KnowledgeExtractor] done');

  return result;
}
