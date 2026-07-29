import OpenAI from 'openai';
import { config } from '../../config.js';
import { withOpenAIRetry } from '../../services/openaiRetry.js';
import { recordUsage } from '../../services/usageTracking.js';
import { sanitizeMathText } from '../../services/mathNotation.js';
import { toMathjsSyntax, expressionsEqual } from './exerciseValidator.js';
import type { KnowledgeConcept, WorkedExample } from './types.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

/** Fixed prompt shown above the alternatives — always the same phrasing, so
 * it's assigned here rather than asked of the model (one less thing an AI
 * call can get wrong or phrase inconsistently across concepts). */
const FIND_ERROR_QUESTION = '¿Cuál es el error?';

/** Cheap trim+lowercase+collapsed-whitespace normalization for the
 * duplicate-alternative check below — never a semantic comparison (that's
 * the prompt's job), just enough to catch a literal or near-literal repeat
 * across errorExplanation/errorDistractors. */
function normalizeForDedupe(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * A validated "find the error" exercise for one `role === 'procedure'`
 * concept, ALWAYS multiple choice: `errorExplanation` (the correct
 * diagnosis) and `errorDistractors` (2 honest-but-wrong diagnoses) become
 * the slide's options via shuffleWithLetterAnswer in assemble.ts — same
 * option-building convention as every other MC slide in this app.
 * `expression`/`correctStep` are always the material's own workedExample
 * statement/answer, copied verbatim — never recalculated. `wrongStep`/
 * `errorExplanation`/`errorDistractors` are model-invented but only ever
 * reach this shape after passing `reconcileFindError`'s validation below,
 * which uses REAL math evaluation (exerciseValidator.ts's mathjs-based
 * expressionsEqual), not just a text-similarity heuristic.
 */
export interface FindErrorResult {
  conceptId: string;
  expression: string;
  wrongStep: string;
  question: string;
  errorExplanation: string;
  errorDistractors: string[];
  correctStep: string;
}

/** Raw per-item shape returned by the model, before validation. Exported for testability only. */
export interface RawFindErrorItem {
  conceptId: string;
  matched: boolean;
  expression: string;
  wrongStep: string;
  errorExplanation: string;
  errorDistractors: string[];
  correctStep: string;
}

const SYSTEM_PROMPT = `Eres un diseñador de ejercicios "encuentra el error" para estudiantes chilenos de enseñanza media.
Para cada concepto de tipo PROCEDIMIENTO que se te entregue, buscá entre los ejercicios YA RESUELTOS del material
el que mejor corresponda a ese concepto. Si encontrás uno que calza, genera el ejercicio siguiendo estos 3 pasos:

1. "wrongStep" — una resolución con UN error deliberado, tomado de un error común real (no distribuir
   a todos los términos, error de signo al abrir paréntesis, combinar términos no semejantes, no
   aplicar el exponente a todo el factor, orden de operaciones, aritmética en un producto/suma).
   El error debe ser:
     - ÚNICO: exactamente un error, el resto del paso correcto.
     - LIMPIO y NATURAL: el paso mal debe ser lo que un estudiante REALMENTE escribiría al cometer
       ese error, no un artefacto raro. Ej. para (x+6)(x+4), un error de "olvidó un producto
       cruzado" se ve como "x² + 4x + 24" (falta el 6x entero), NO como "x² + 6 + 4x + 24" (un 6
       suelto que nadie escribe).
     - VERIFICABLE distinto del correcto (wrongStep ≠ correctStep).

2. "errorExplanation" — describe con PRECISIÓN el error que efectivamente está en wrongStep: nombrá el
   término o paso exacto que quedó mal y por qué. Debe corresponder término a término con la
   diferencia real entre wrongStep y correctStep. No una descripción vaga ni de un error distinto al
   que aplicaste. Máximo 15 palabras.

3. "errorDistractors" — exactamente 2 diagnósticos INCORRECTOS pero que sean errores PLAUSIBLES DE ESTE
   MISMO ejercicio: otras maneras en que alguien podría equivocarse resolviendo ESTA operación. NUNCA
   errores de otro tema ni categorías genéricas que no apliquen a este ejercicio.
     ✓ Para (x+6)(x+4): "Sumó 6+4 en vez de multiplicar los términos cruzados", "Olvidó el producto
       4·x", "Multiplicó mal 6·4".
     ✗ Para (x+6)(x+4): "No aplicar el exponente a todo el factor" o "Error de signo al eliminar
       paréntesis" — no hay exponente sobre un factor ni signos que eliminar aquí; son de otro tema.
   Los 2 distractores deben ser DISTINTOS entre sí y del diagnóstico correcto, y solo el correcto debe
   describir realmente el error de wrongStep.

Copiá "expression" (el planteo) y "correctStep" (la respuesta correcta) LITERALES del ejercicio
resuelto — nunca los recalculés ni los cambies.
Si NINGÚN ejercicio resuelto corresponde de forma razonable a un concepto, o no podés construir un
error real/único/natural/localizable para esta operación con 2 distractores honestos DEL MISMO
problema, marcá "matched": false y dejá los demás campos como string vacío (o array vacío para
errorDistractors) — nunca fuerces una correspondencia que no tiene sentido.
Si hay más de un concepto y suficientes ejercicios resueltos distintos, usá un ejercicio DIFERENTE para
cada concepto en vez de repetir el mismo — evitá que dos conceptos generen el mismo "encuentra el error".
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
          required: ['conceptId', 'matched', 'expression', 'wrongStep', 'errorExplanation', 'errorDistractors', 'correctStep'],
          properties: {
            conceptId: { type: 'string', description: 'Debe ser exactamente uno de los conceptId indicados en el prompt.' },
            matched: { type: 'boolean', description: 'true si construiste un error real, único y localizable con 2 distractores honestos; false si no.' },
            expression: { type: 'string', description: 'El planteo del ejercicio resuelto, copiado literal del material. String vacío si matched=false.' },
            wrongStep: { type: 'string', description: 'Un paso/resultado con UN error real del catálogo indicado, matemáticamente distinto de correctStep. String vacío si matched=false.' },
            errorExplanation: { type: 'string', description: 'El diagnóstico CORRECTO: por qué wrongStep es incorrecto, máximo 15 palabras. String vacío si matched=false.' },
            errorDistractors: {
              type: 'array',
              minItems: 2,
              maxItems: 2,
              items: { type: 'string' },
              description: '2 diagnósticos incorrectos pero plausibles (otros errores reales que NO se cometieron). Array vacío si matched=false.',
            },
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
 * Pure safety gate — no ground truth is handed to the model (unlike
 * procedural.ts's known-answer reconcile), so this is the only place
 * standing between a math mistake and the student being taught the WRONG
 * thing as "the error". Two independent mathjs checks, both required to
 * pass (see exerciseValidator.ts's expressionsEqual — the same real
 * evaluation engine generateExercises uses, not a second heuristic):
 *   1. wrongStep must be CONFIRMED different from correctStep — rejects the
 *      exact reported bug ("x²+6x+4x+24−x²" is the same value as "10x+24",
 *      just unsimplified — not an error at all).
 *   2. correctStep must be CONFIRMED to equal expression's own evaluated
 *      value — catches a correctStep that doesn't actually solve the
 *      stated problem.
 * Either check returning `null` (unverifiable — couldn't parse/evaluate,
 * NOT proof the math is wrong) is ALSO a reject, same as a confirmed
 * mismatch: find_error has no separate 'log-only' mode like
 * generateExercises's math validator — an item that can't be confirmed
 * correct is never shown, only silently skipped in favor of the concept's
 * default mechanic. Exported for testing without mocking the SDK.
 */
export function reconcileFindError(item: RawFindErrorItem): FindErrorResult | null {
  if (!item.matched) return null;

  const expression = sanitizeMathText(item.expression).trim();
  const wrongStep = sanitizeMathText(item.wrongStep).trim();
  const correctStep = sanitizeMathText(item.correctStep).trim();
  const errorExplanation = sanitizeMathText(item.errorExplanation).trim();
  const errorDistractors = (item.errorDistractors ?? [])
    .map((d) => sanitizeMathText(d).trim())
    .filter((d) => d.length > 0);

  if (!expression || !wrongStep || !correctStep || !errorExplanation) return null;
  if (errorDistractors.length < 2) return null;

  // Cheap format check, before the more expensive mathjs evaluation below —
  // the 3 alternatives (correct diagnosis + 2 distractors) must all read as
  // distinct options, or the MC slide has a duplicate/near-duplicate
  // alternative (either a giveaway or a broken "pick the right one"
  // question). Not a semantic check — see normalizeForDedupe's own comment.
  const alternatives = [errorExplanation, ...errorDistractors.slice(0, 2)];
  const distinctCount = new Set(alternatives.map(normalizeForDedupe)).size;
  if (distinctCount < alternatives.length) {
    console.warn(`[FindError] descartado (formato) — errorExplanation/errorDistractors tienen duplicados o casi-duplicados: ${JSON.stringify(alternatives)}`);
    return null;
  }

  const exprMathjs = toMathjsSyntax(expression);
  const wrongMathjs = toMathjsSyntax(wrongStep);
  const correctMathjs = toMathjsSyntax(correctStep);

  const wrongVsCorrect = expressionsEqual(wrongMathjs, correctMathjs, {});
  if (wrongVsCorrect === true) {
    console.warn(`[FindError] descartado (invalid) — wrongStep es matemáticamente igual a correctStep, no hay error real. wrongStep="${wrongStep}" correctStep="${correctStep}"`);
    return null;
  }
  if (wrongVsCorrect === null) {
    console.warn(`[FindError] descartado (unverifiable) — no se pudo comparar wrongStep vs correctStep. wrongStep="${wrongStep}" correctStep="${correctStep}"`);
    return null;
  }

  const exprVsCorrect = expressionsEqual(exprMathjs, correctMathjs, {});
  if (exprVsCorrect === false) {
    console.warn(`[FindError] descartado (invalid) — correctStep no resuelve expression. expression="${expression}" correctStep="${correctStep}"`);
    return null;
  }
  if (exprVsCorrect === null) {
    console.warn(`[FindError] descartado (unverifiable) — no se pudo comparar expression vs correctStep. expression="${expression}" correctStep="${correctStep}"`);
    return null;
  }

  return {
    conceptId: item.conceptId,
    expression,
    wrongStep,
    question: FIND_ERROR_QUESTION,
    errorExplanation,
    errorDistractors: errorDistractors.slice(0, 2),
    correctStep,
  };
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
      max_tokens: 1400,
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
