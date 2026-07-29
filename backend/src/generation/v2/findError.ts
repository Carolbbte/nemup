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

// "Reordering terms" is never a real error (a + b = b + a) — the prompt
// explicitly forbids it (see SYSTEM_PROMPT's PROHIBIDO section), but a model
// can still slip past a prompt instruction, so this is a cheap backstop.
// Deliberately does NOT match "orden de operaciones" (a real, still-allowed
// error type, e.g. sumar antes de multiplicar) — only the commutativity
// mistake ("orden de los términos" / "mal ubicados" / "reordenó").
const ORDER_ERROR_RE = /\bt[eé]rminos?\s+mal\s+ubicad|\bmal\s+ubicad|\breorden|\borden\s+de\s+los\s+t[eé]rminos|posici[oó]n\s+de\s+los\s+t[eé]rminos/i;

/**
 * A validated "find the error" exercise for one `role === 'procedure'`
 * concept, ALWAYS multiple choice. Structured by construction, not
 * free-text: the model never authors `wrongStep` or the correct diagnosis
 * directly (an earlier free-text version let the model swap which of the
 * MC options was actually correct, since nothing tied the diagnosis text to
 * the real term that changed). Instead:
 *   - `wrongStep` is DERIVED here (reconcileFindError) by substituting
 *     `correctTerm` → `wrongTerm` inside `correctForm` — a mechanical
 *     string operation, not model prose.
 *   - `errorExplanation` (the correct MC option) is TEMPLATED from
 *     `correctTerm`/`wrongTerm`/`errorReason` — it can only ever name the
 *     term that actually changed, by construction.
 * `errorDistractors` (2 honest-but-wrong diagnoses of OTHER terms) still
 * come from the model, same option-building convention as every other MC
 * slide (shuffleWithLetterAnswer in assemble.ts).
 */
export interface FindErrorResult {
  conceptId: string;
  expression: string;
  /** The correct, unsimplified step — a genuine intermediate resolution of `expression`. */
  correctForm: string;
  /** `correctForm` with `correctTerm` swapped for `wrongTerm` — mechanically derived, never model-authored. */
  wrongStep: string;
  correctTerm: string;
  wrongTerm: string;
  question: string;
  /** Templated from correctTerm/wrongTerm/errorReason — see FindErrorResult's own comment. */
  errorExplanation: string;
  errorDistractors: string[];
}

/** Raw per-item shape returned by the model, before validation. Exported for testability only. */
export interface RawFindErrorItem {
  conceptId: string;
  matched: boolean;
  expression: string;
  correctForm: string;
  correctTerm: string;
  wrongTerm: string;
  /** Short reason phrase — always present in the schema (strict mode requires it), empty string when there's nothing to add beyond the term swap itself. */
  errorReason: string;
  errorDistractors: string[];
}

const SYSTEM_PROMPT = `Eres un diseñador de ejercicios "encuentra el error" para estudiantes chilenos de enseñanza media.
Para cada concepto de tipo PROCEDIMIENTO que se te entregue, buscá entre los ejercicios YA RESUELTOS del material
el que mejor corresponda a ese concepto. Si encontrás uno que calza, generá el ejercicio siguiendo este orden
EXACTO. El backend construye el paso mal y el diagnóstico correcto a partir de lo que entregues acá — vos NUNCA
escribís el paso mal ni el texto de la opción correcta directamente, solo los ingredientes:

1. Tomá la operación del material (expression, copiada literal — nunca la recalculés ni la cambies).

2. Escribí "correctForm": la forma CORRECTA de resolver expression, con TODOS los términos bien, en
   texto plano sintaxis mathjs (usa * y ^). Debe ser matemáticamente igual a expression — es un paso
   correcto de resolverla, no la respuesta final simplificada.
     Ej. para expression="(x+6)(x+4)-x^2": correctForm = "x^2 + 6*x + 4*x + 24 - x^2"

3. Elegí UN término de correctForm que un estudiante escribiría mal por un error común real (no
   distribuir a todos los términos, error de signo al abrir paréntesis, combinar términos no
   semejantes, no aplicar el exponente a todo el factor, orden de operaciones equivocado — ej. sumar
   antes de multiplicar —, aritmética mal en un producto/suma), y dá:
   - "correctTerm": ese término tal como aparece literal en correctForm (ej. "4*x"). DEBE ser una
     transcripción EXACTA de una porción de correctForm — el backend lo busca ahí como substring.
   - "wrongTerm": cómo queda ese término al cometer el error (ej. "4"). Matemáticamente DISTINTO de
     correctTerm.
   - "errorReason": frase corta del porqué, máximo 10 palabras (ej. "olvidó multiplicar por x"), o
     string vacío si el nombre de los campos ya es autoexplicativo.

4. "errorDistractors": exactamente 2 diagnósticos INCORRECTOS pero que sean errores PLAUSIBLES DE ESTE
   MISMO ejercicio, sobre OTROS términos u operaciones — NUNCA otra explicación del mismo correctTerm,
   y NUNCA errores de otro tema ni categorías genéricas que no apliquen a este ejercicio.
     ✓ Para (x+6)(x+4), si el error elegido fue en el término 4x: "Sumó 6+4 en vez de multiplicar los
       términos cruzados", "Multiplicó mal 6·4".
     ✗ Para el mismo caso: otra frase que describa el mismo término 4x con otras palabras — sería una
       segunda "correcta" encubierta. ✗ "No aplicar el exponente a todo el factor" — no hay exponente
       sobre un factor acá, es de otro tema.
   Los 2 distractores deben ser DISTINTOS entre sí.

PROHIBIDO:
  - Usar "orden de los términos" / "términos mal ubicados" / "reordenó los términos" como error, ni
    como correctTerm/wrongTerm ni como errorDistractor: reordenar una suma NO es un error
    (a + b = b + a). Distinto de "orden de operaciones equivocado" (sumar antes de multiplicar), que
    sí es un error real y sigue permitido.
  - Elegir un correctTerm que en realidad ya está bien en cualquier resolución razonable — tiene que
    ser un término donde el error que describís en errorReason realmente aplica.

Si NINGÚN ejercicio resuelto corresponde de forma razonable a un concepto, o no podés construir
correctForm/correctTerm/wrongTerm/2 distractores honestos para esta operación, marcá "matched": false
y dejá los demás campos como string vacío (o array vacío para errorDistractors) — nunca fuerces una
correspondencia que no tiene sentido.
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
          required: ['conceptId', 'matched', 'expression', 'correctForm', 'correctTerm', 'wrongTerm', 'errorReason', 'errorDistractors'],
          properties: {
            conceptId: { type: 'string', description: 'Debe ser exactamente uno de los conceptId indicados en el prompt.' },
            matched: { type: 'boolean', description: 'true si construiste correctForm/correctTerm/wrongTerm/2 distractores honestos; false si no.' },
            expression: { type: 'string', description: 'El planteo del ejercicio resuelto, copiado literal del material. String vacío si matched=false.' },
            correctForm: { type: 'string', description: 'La forma correcta (no simplificada) de resolver expression, con todos los términos bien, sintaxis mathjs. String vacío si matched=false.' },
            correctTerm: { type: 'string', description: 'Un término de correctForm, transcripto EXACTO — debe aparecer literal dentro de correctForm. String vacío si matched=false.' },
            wrongTerm: { type: 'string', description: 'Ese mismo término tal como queda al cometer el error, matemáticamente distinto de correctTerm. String vacío si matched=false.' },
            errorReason: { type: 'string', description: 'Frase corta (máx 10 palabras) del porqué del error, o string vacío si no hace falta.' },
            errorDistractors: {
              type: 'array',
              minItems: 2,
              maxItems: 2,
              items: { type: 'string' },
              description: '2 diagnósticos incorrectos pero plausibles sobre OTROS términos de este mismo ejercicio. Array vacío si matched=false.',
            },
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
 * Pure safety gate. No ground truth is handed to the model — this is the
 * only place standing between a math mistake and the student being taught
 * the WRONG thing as "the error". Unlike the earlier free-text design,
 * `wrongStep` and the correct MC option are never trusted as model prose:
 *
 *   1. `correctTerm` must appear literally inside `correctForm` (a plain
 *      substring search) — this is what lets `wrongStep` be DERIVED by
 *      substitution instead of authored, so it can never drift from
 *      `errorExplanation` (the bug this whole redesign fixes: a correct
 *      diagnosis and a wrong-but-unrelated wrongStep, or the correct/
 *      distractor swapped).
 *   2. `correctForm` must be CONFIRMED (via exerciseValidator.ts's
 *      expressionsEqual — the same mathjs engine generateExercises uses,
 *      not a second heuristic) to equal `expression`'s own value.
 *   3. `correctTerm` must be CONFIRMED different from `wrongTerm`.
 *   4. Coherence: `correctForm − wrongStep` must be CONFIRMED equal to
 *      `correctTerm − wrongTerm` — since wrongStep is a literal-substring
 *      substitution, this holds algebraically only when that substitution
 *      touched exactly the intended term and nothing else (it fails, for
 *      example, if `correctTerm` didn't actually occur where intended, or
 *      collided with an unrelated substring).
 * Any of these returning unconfirmed (`false` or, for the boolean checks,
 * `null`/not-found) rejects the whole item — find_error has no separate
 * 'log-only' mode like generateExercises's math validator, an item that
 * can't be confirmed correct is never shown. Exported for testing without
 * mocking the SDK.
 */
export function reconcileFindError(item: RawFindErrorItem): FindErrorResult | null {
  if (!item.matched) return null;

  const expression = sanitizeMathText(item.expression).trim();
  const correctForm = sanitizeMathText(item.correctForm).trim();
  const correctTerm = sanitizeMathText(item.correctTerm).trim();
  const wrongTerm = sanitizeMathText(item.wrongTerm).trim();
  const errorReason = sanitizeMathText(item.errorReason ?? '').trim();
  const errorDistractors = (item.errorDistractors ?? [])
    .map((d) => sanitizeMathText(d).trim())
    .filter((d) => d.length > 0);

  if (!expression || !correctForm || !correctTerm || !wrongTerm) return null;
  if (errorDistractors.length < 2) return null;

  // Derive wrongStep by substitution (first occurrence only — "changed
  // exactly one term" means one specific instance, not every textual match
  // of the same substring).
  const termIdx = correctForm.indexOf(correctTerm);
  if (termIdx === -1) {
    console.warn(`[FindError] descartado (unverifiable) — correctTerm "${correctTerm}" no aparece literal en correctForm "${correctForm}".`);
    return null;
  }
  const wrongStep = correctForm.slice(0, termIdx) + wrongTerm + correctForm.slice(termIdx + correctTerm.length);

  const errorExplanation = `El término ${correctTerm} quedó como ${wrongTerm}${errorReason ? ` — ${errorReason}` : ''}.`;

  // Cheap format checks, before the more expensive mathjs evaluation below.
  const alternatives = [errorExplanation, ...errorDistractors.slice(0, 2)];
  const distinctCount = new Set(alternatives.map(normalizeForDedupe)).size;
  if (distinctCount < alternatives.length) {
    console.warn(`[FindError] descartado (formato) — errorExplanation/errorDistractors tienen duplicados o casi-duplicados: ${JSON.stringify(alternatives)}`);
    return null;
  }
  if ([errorReason, ...errorDistractors].some((a) => ORDER_ERROR_RE.test(a))) {
    console.warn(`[FindError] descartado (reason=orden-invalido) — un diagnóstico menciona reordenar/mal ubicar términos, que no es un error real: ${JSON.stringify(alternatives)}`);
    return null;
  }
  // A distractor mentioning correctTerm would be a second (encubierta)
  // description of the SAME term the correct option already covers — best
  // effort literal check, not semantic (same discipline as the checks above).
  if (errorDistractors.slice(0, 2).some((d) => d.includes(correctTerm))) {
    console.warn(`[FindError] descartado (formato) — un distractor menciona correctTerm "${correctTerm}", sería una segunda "correcta" encubierta.`);
    return null;
  }

  const exprMathjs = toMathjsSyntax(expression);
  const formMathjs = toMathjsSyntax(correctForm);
  const wrongMathjs = toMathjsSyntax(wrongStep);
  const correctTermMathjs = toMathjsSyntax(correctTerm);
  const wrongTermMathjs = toMathjsSyntax(wrongTerm);

  const formVsExpr = expressionsEqual(formMathjs, exprMathjs, {});
  if (formVsExpr === false) {
    console.warn(`[FindError] descartado (invalid) — correctForm no resuelve expression. expression="${expression}" correctForm="${correctForm}"`);
    return null;
  }
  if (formVsExpr === null) {
    console.warn(`[FindError] descartado (unverifiable) — no se pudo comparar correctForm vs expression. expression="${expression}" correctForm="${correctForm}"`);
    return null;
  }

  const termsDiffer = expressionsEqual(correctTermMathjs, wrongTermMathjs, {});
  if (termsDiffer === true) {
    console.warn(`[FindError] descartado (invalid) — correctTerm y wrongTerm son matemáticamente iguales, no hay error real. correctTerm="${correctTerm}" wrongTerm="${wrongTerm}"`);
    return null;
  }
  if (termsDiffer === null) {
    console.warn(`[FindError] descartado (unverifiable) — no se pudo comparar correctTerm vs wrongTerm. correctTerm="${correctTerm}" wrongTerm="${wrongTerm}"`);
    return null;
  }

  // Coherence — the check that makes the correct/distractor-swap bug
  // structurally impossible: confirms the ONLY value-level difference
  // between correctForm and the derived wrongStep is exactly this term swap.
  const coherent = expressionsEqual(`(${formMathjs}) - (${wrongMathjs})`, `(${correctTermMathjs}) - (${wrongTermMathjs})`, {});
  if (coherent === false) {
    console.warn(`[FindError] descartado (invalid) — la sustitución no es coherente: correctForm-wrongStep no coincide con correctTerm-wrongTerm. correctForm="${correctForm}" wrongStep="${wrongStep}" correctTerm="${correctTerm}" wrongTerm="${wrongTerm}"`);
    return null;
  }
  if (coherent === null) {
    console.warn(`[FindError] descartado (unverifiable) — no se pudo verificar la coherencia de la sustitución. correctForm="${correctForm}" wrongStep="${wrongStep}"`);
    return null;
  }

  return {
    conceptId: item.conceptId,
    expression,
    correctForm,
    wrongStep,
    correctTerm,
    wrongTerm,
    question: FIND_ERROR_QUESTION,
    errorExplanation,
    errorDistractors: errorDistractors.slice(0, 2),
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
