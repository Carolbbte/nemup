import OpenAI from 'openai';
import { config } from '../../config.js';
import { withOpenAIRetry } from '../../services/openaiRetry.js';
import { recordUsage } from '../../services/usageTracking.js';
import type { WorkedExample } from './types.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

/**
 * A worked example after step generation + safety validation.
 * `steps` is null when the model's derivation didn't reproduce the
 * material's own answer — in that case the caller must fall back to showing
 * only `statement`/`answer` (no steps), never a step sequence that doesn't
 * actually arrive at the guide's answer.
 */
export interface WorkedExampleResult {
  statement: string;
  answer: string;
  steps: string[] | null;
}

const SYSTEM_PROMPT = `Eres un tutor que explica CÓMO se llega de un enunciado a una respuesta YA CONOCIDA y correcta.
NUNCA cuestionas, corriges ni recalculas la respuesta que se te entrega — se toma como el resultado correcto
por definición. Tu única tarea es describir el camino lógico/algebraico que conecta el enunciado con ella,
en pasos cortos que un estudiante de enseñanza media pueda seguir. Si no puedes justificar el camino exacto,
igual debes indicar en "resultShown" a qué resultado llegas tú siguiendo tu propio razonamiento — nunca copies
la respuesta dada sin haber razonado el camino.`;

function buildUserPrompt(examples: WorkedExample[]): string {
  return `EJERCICIOS YA RESUELTOS (enunciado y respuesta correcta, en este orden — responde en el mismo orden,
un ítem por ejercicio, sin omitir ninguno):

${examples.map((e, i) => `${i + 1}. Enunciado: "${e.statement}" — Respuesta correcta: "${e.answer}"`).join('\n')}

INSTRUCCIONES:
1. Para cada ejercicio, escribe entre 2 y 5 pasos explicativos cortos que muestren el camino desde el
   enunciado hasta la respuesta (ej. "Agrupa los términos con la misma parte literal", "Suma los coeficientes
   de los términos en m: 6m − m = 5m").
2. En "resultShown", escribe el resultado final tal como TÚ llegas siguiendo esos pasos, en la misma notación
   que usarías para responder el ejercicio — no copies la respuesta dada, razónala de verdad paso a paso.
3. No agregues ejercicios nuevos ni cambies el enunciado o la respuesta dados.`;
}

/** Chunks + flattens newlines before logging so an embedded-newline-heavy prompt can't burst a log-rate limit. */
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

function buildProceduralSchema(itemCount: number) {
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
          required: ['steps', 'resultShown'],
          properties: {
            steps: {
              type: 'array',
              minItems: 2,
              maxItems: 5,
              items: { type: 'string' },
              description: 'Short explanatory steps connecting the statement to the answer.',
            },
            resultShown: {
              type: 'string',
              description: 'The final result the model actually arrives at by following its own steps — used to verify against the material\'s answer, never copied from it.',
            },
          },
        },
      },
    },
  };

  return {
    type: 'json_schema',
    json_schema: {
      name: 'worked_example_steps',
      strict: true,
      schema,
    },
  } as const;
}

// Aggressive normalization for comparing two math/text results: lowercase,
// strip whitespace, normalize common unicode math symbols to ASCII.
function normalizeForMathComparison(s: string): string {
  return s
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/−/g, '-')
    .replace(/×/g, '*')
    .replace(/·/g, '*');
}

// Best-effort term-order-independent comparison for simple additive expressions
// (e.g. "7m + 6n" vs "6n + 7m") — splits on +/- at the top level and compares
// the sorted set of terms. Not a CAS: won't simplify "14n/2" vs "7n", but
// covers the reordering case explicitly called out in the spec.
function sortedTermsKey(s: string): string {
  const normalized = normalizeForMathComparison(s);
  const terms = normalized.match(/[+-]?[^+-]+/g) ?? [normalized];
  return terms
    .map((t) => (t.startsWith('+') ? t.slice(1) : t))
    .filter((t) => t.length > 0)
    .sort()
    .join('|');
}

/** Exported for testing. Compares two results with light math-aware normalization — never a full CAS, just enough to catch trivial reordering/whitespace/case differences. */
export function resultsMatch(a: string, b: string): boolean {
  if (normalizeForMathComparison(a) === normalizeForMathComparison(b)) return true;
  return sortedTermsKey(a) === sortedTermsKey(b);
}

/**
 * Pure safety gate — no I/O. Accepts the model's proposed steps/result for a
 * single worked example and decides whether the steps are safe to show:
 * only when the model's own derivation reproduces the material's answer.
 * Otherwise falls back to `steps: null` (statement/answer only, no path).
 *
 * Exported so this decision — the actual safety-critical logic — is testable
 * without mocking the OpenAI SDK.
 */
export function reconcileWorkedExample(
  example: WorkedExample,
  modelSteps: string[],
  modelResult: string,
): WorkedExampleResult {
  const valid = resultsMatch(modelResult, example.answer);
  return {
    statement: example.statement,
    answer: example.answer,
    steps: valid ? modelSteps : null,
  };
}

/**
 * Generates explanatory steps for each worked example in a single batched
 * call, then validates every one against the material's own answer before
 * trusting it. Returns `[]` immediately (no AI call) when there are no
 * worked examples — this is what keeps procedural mode a no-op on documents
 * without solved exercises.
 */
export async function buildWorkedExampleSteps(
  examples: WorkedExample[],
): Promise<WorkedExampleResult[]> {
  if (examples.length === 0) {
    return [];
  }

  const userPrompt = buildUserPrompt(examples);

  logPrompt('Procedural-System', SYSTEM_PROMPT);
  logPrompt('Procedural-User', userPrompt);

  const raw = await withOpenAIRetry(async () => {
    const response = await openai.chat.completions.create({
      model: config.openai_model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2500,
      response_format: buildProceduralSchema(examples.length),
    });
    recordUsage('Procedural', response.usage);
    return response.choices?.[0]?.message?.content ?? '';
  }, 'Procedural', 2);

  if (!raw) {
    throw new Error('[Procedural] empty response from model');
  }

  const parsed = JSON.parse(raw) as { items: Array<{ steps: string[]; resultShown: string }> };

  const results = examples.map((example, i) =>
    reconcileWorkedExample(example, parsed.items[i].steps, parsed.items[i].resultShown),
  );

  const validatedCount = results.filter((r) => r.steps !== null).length;
  console.log(
    `[Procedural] ${validatedCount}/${results.length} worked examples validados — ${results.length - validatedCount} cayeron a respuesta sin pasos (B-mínima).`,
  );

  return results;
}
