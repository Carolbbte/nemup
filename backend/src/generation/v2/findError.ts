import OpenAI from 'openai';
import { config } from '../../config.js';
import { withOpenAIRetry } from '../../services/openaiRetry.js';
import { recordUsage } from '../../services/usageTracking.js';
import { sanitizeMathText } from '../../services/mathNotation.js';
import { resultsMatch } from './procedural.js';
import type { KnowledgeConcept, WorkedExample } from './types.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

/**
 * A validated "find the error" exercise for one `role === 'procedure'`
 * concept. `expression`/`correctStep` are always the material's own
 * workedExample statement/answer, copied verbatim — never recalculated.
 * `wrongStep`/`errorExplanation` are model-invented but only ever reach this
 * shape after passing `reconcileFindError`'s validation below.
 */
export interface FindErrorResult {
  conceptId: string;
  expression: string;
  wrongStep: string;
  question: string;
  errorExplanation: string;
  correctStep: string;
}

/** Raw per-item shape returned by the model, before validation. Exported for testability only. */
export interface RawFindErrorItem {
  conceptId: string;
  matched: boolean;
  expression: string;
  wrongStep: string;
  question: string;
  errorExplanation: string;
  correctStep: string;
}

const SYSTEM_PROMPT = `Eres un diseñador de ejercicios "encuentra el error" para estudiantes chilenos de enseñanza media.
Para cada concepto de tipo PROCEDIMIENTO que se te entregue, buscá entre los ejercicios YA RESUELTOS del material
el que mejor corresponda a ese concepto. Si encontrás uno que calza:
  - Copiá "expression" (el planteo) y "correctStep" (la respuesta correcta) LITERALES del ejercicio resuelto —
    nunca los recalculés ni los cambies.
  - Inventá "wrongStep": UN error común y plausible que un estudiante cometería resolviendo ese ejercicio —
    debe ser un resultado o paso intermedio DISTINTO al correcto, nunca una simple reescritura de correctStep.
  - Escribí "errorExplanation": por qué wrongStep está mal, en máximo 15 palabras, específico (nunca "está mal").
  - Escribí "question": una pregunta corta que invite a encontrar el error (ej. "¿Qué está mal en este paso?").
Si NINGÚN ejercicio resuelto corresponde de forma razonable a un concepto, marcá "matched": false y dejá los
demás campos como string vacío — nunca fuerces una correspondencia que no tiene sentido.
Si hay más de un concepto y suficientes ejercicios resueltos distintos, usá un ejercicio DIFERENTE para cada
concepto en vez de repetir el mismo — evitá que dos conceptos generen el mismo "encuentra el error".
NOTACIÓN MATEMÁTICA: escribe todo en texto plano, NUNCA en LaTeX. Prohibido usar backslash o comandos LaTeX
(nada de \\frac, \\left, \\right, \\(...\\), \\[...\\], ni llaves {} para agrupar). Fracciones: "2/3", nunca
"\\frac{2}{3}". Exponentes: "x^2" o "x²", nunca en llaves.`;

function buildUserPrompt(concepts: KnowledgeConcept[], examples: WorkedExample[]): string {
  const conceptLines = concepts
    .map((c) => `- [conceptId="${c.id}"] "${c.name}" — definición: ${c.definition}`)
    .join('\n');
  const exampleLines = examples
    .map((e, i) => `${i + 1}. Enunciado: "${e.statement}" — Respuesta correcta: "${e.answer}"`)
    .join('\n');

  return `CONCEPTOS DE TIPO PROCEDIMIENTO (genera un ítem por cada uno, ecoando su conceptId exacto):
${conceptLines}

EJERCICIOS YA RESUELTOS DISPONIBLES EN EL MATERIAL:
${exampleLines}`;
}

/** Chunks + flattens newlines before logging, same convention as procedural.ts/exerciseGenerator.ts. */
function logPrompt(label: string, text: string): void {
  const flat = text.replace(/\r?\n/g, ' ⏎ ');
  const CHUNK = 3500;
  const total = Math.max(1, Math.ceil(flat.length / CHUNK));
  console.log(`[${label}] ── INICIO (${text.length} chars, ${total} partes) ──`);
  for (let i = 0; i < total; i++) {
    console.log(`[${label}][${i + 1}/${total}] ${flat.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  }
  console.log(`[${label}] ── FIN ──`);
}

function buildFindErrorSchema(itemCount: number) {
  const schema: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        minItems: itemCount,
        maxItems: itemCount,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['conceptId', 'matched', 'expression', 'wrongStep', 'question', 'errorExplanation', 'correctStep'],
          properties: {
            conceptId: { type: 'string', description: 'Debe ser exactamente uno de los conceptId indicados en el prompt.' },
            matched: { type: 'boolean', description: 'true si encontraste un ejercicio resuelto del material que corresponde a este concepto; false si ninguno calza.' },
            expression: { type: 'string', description: 'El planteo del ejercicio resuelto, copiado literal del material. String vacío si matched=false.' },
            wrongStep: { type: 'string', description: 'Un paso/resultado erróneo plausible, inventado por vos, nunca copiado del material. String vacío si matched=false.' },
            question: { type: 'string', description: 'Pregunta corta que invita a encontrar el error. String vacío si matched=false.' },
            errorExplanation: { type: 'string', description: 'Por qué wrongStep es incorrecto, máximo 15 palabras. String vacío si matched=false.' },
            correctStep: { type: 'string', description: 'La respuesta correcta, copiada literal del material. String vacío si matched=false.' },
          },
        },
      },
    },
  };

  return {
    type: 'json_schema',
    json_schema: { name: 'find_error_list', strict: true, schema },
  } as const;
}

/**
 * Pure safety gate — mirrors procedural.ts's reconcileWorkedExample: the
 * model invents `wrongStep`/`errorExplanation` with no ground truth to check
 * against, so this is the only place standing between a math mistake and the
 * student being taught the WRONG thing as "the error". Reuses procedural.ts's
 * own validated `resultsMatch` comparator (rather than inventing a second
 * one) to reject a `wrongStep` that's merely a reformatting of `correctStep`
 * — i.e. not actually wrong. Exported for testing without mocking the SDK.
 */
export function reconcileFindError(item: RawFindErrorItem): FindErrorResult | null {
  if (!item.matched) return null;

  const expression = sanitizeMathText(item.expression).trim();
  const wrongStep = sanitizeMathText(item.wrongStep).trim();
  const question = sanitizeMathText(item.question).trim();
  const errorExplanation = sanitizeMathText(item.errorExplanation).trim();
  const correctStep = sanitizeMathText(item.correctStep).trim();

  if (!expression || !wrongStep || !question || !errorExplanation || !correctStep) return null;
  if (resultsMatch(wrongStep, correctStep)) return null;

  return { conceptId: item.conceptId, expression, wrongStep, question, errorExplanation, correctStep };
}

/**
 * Generates find_error candidates for `role === 'procedure'` concepts in a
 * single batched call, keyed by conceptId — a concept with no valid result
 * (model returned matched=false, or reconcileFindError rejected it) is
 * simply absent from the returned map, so assemble.ts falls back to that
 * concept's default micro_challenge exactly as if this stage never ran (same
 * "no concept left without an exercise" discipline as Paso 3's roleAware).
 * Returns `new Map()` immediately (no AI call) when there are no procedure
 * concepts or no worked examples to derive from.
 */
export async function generateFindError(
  procedureConcepts: KnowledgeConcept[],
  workedExamples: WorkedExample[],
): Promise<Map<string, FindErrorResult>> {
  const results = new Map<string, FindErrorResult>();
  if (procedureConcepts.length === 0 || workedExamples.length === 0) return results;

  const userPrompt = buildUserPrompt(procedureConcepts, workedExamples);
  logPrompt('FindError-System', SYSTEM_PROMPT);
  logPrompt('FindError-User', userPrompt);

  const raw = await withOpenAIRetry(async () => {
    const response = await openai.chat.completions.create({
      model: config.openai_model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1200,
      response_format: buildFindErrorSchema(procedureConcepts.length),
    });
    recordUsage('FindError', response.usage);
    return response.choices?.[0]?.message?.content ?? '';
  }, 'FindError', 2);

  if (!raw) {
    console.warn('[FindError] respuesta vacía del modelo — se omite find_error para esta sesión.');
    return results;
  }

  const parsed = JSON.parse(raw) as { items: RawFindErrorItem[] };
  const conceptIds = new Set(procedureConcepts.map((c) => c.id));

  for (const item of parsed.items) {
    if (!conceptIds.has(item.conceptId)) continue;
    const validated = reconcileFindError(item);
    if (validated) results.set(item.conceptId, validated);
  }

  console.log(`[FindError] ${results.size}/${procedureConcepts.length} concepto(s) procedure con find_error válido.`);
  return results;
}
