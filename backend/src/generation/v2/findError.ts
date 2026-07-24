import OpenAI from 'openai';
import { config } from '../../config.js';
import { withOpenAIRetry } from '../../services/openaiRetry.js';
import { recordUsage } from '../../services/usageTracking.js';
import { sanitizeMathText } from '../../services/mathNotation.js';
import type { KnowledgeConcept, WorkedExample } from './types.js';

/**
 * "Encuentra el error" exercise — FEATURE_FIND_ERROR_EXERCISE (off by
 * default, see config.ts's find_error_exercise). Shows a solved step with
 * a plausible mistake in it ("2(x + 3) → 2x + 3") and asks the student what
 * went wrong, tap-to-reveal — the ejercicio version of the B2 "error común"
 * teacherExplanation pattern.
 *
 * Gated at the SESSION level (Capa 3, orchestrator.ts — same shape as
 * allowMatchPairs), applied uniformly to every concept of a qualifying
 * session, NOT per-individual-concept — KnowledgeConcept has no
 * conceptual-vs-procedural field to hook a finer gate into.
 *
 * Sourcing is hybrid, per concept: `ko.workedExamples` (statement/answer
 * the MATERIAL already shows solved) has no conceptId of its own, so this
 * stage is handed the whole pool alongside the concept list and asked, per
 * concept, to either (a) match a workedExample that genuinely fits — then
 * expression/correctStep are copied verbatim from it (sourceType
 * "material", same anchor-to-source discipline as procedural.ts) — or
 * (b) synthesize expression/correctStep from the concept's own
 * example/definition when nothing fits (sourceType "generated" — the same
 * unverified-but-concept-grounded tier exerciseGenerator.ts already
 * accepts for its own generated exercises). A concept the model can't
 * handle either way is simply left out of the response — see
 * isValidFindErrorResult / generateFindError's own filtering — and
 * assemble.ts's gate (Capa 3) falls back to the existing conceptual MC for
 * that one concept.
 */

const openai = new OpenAI({ apiKey: config.openai_api_key });

/**
 * One concept's find_error output, after generateFindError has already
 * resolved which concept it belongs to (conceptId is stripped — see
 * RawFindErrorResult). `sourceType` is backend-only telemetry (logged, not
 * persisted onto SummarySlide) — it never reaches the frontend.
 */
export interface FindErrorResult {
  /** The correct original planteo — verbatim from a matched workedExample ("material"), or built from the concept's own example/definition ("generated"). */
  expression: string;
  /** The INCORRECT result shown to the student — a plausible common mistake for this step, never the correct value. */
  wrongStep: string;
  /** "¿Qué salió mal?" (fixed copy today, kept as a field rather than hardcoded in the frontend in case it's varied later). */
  question: string;
  /** Short (≤15 word), friendly explanation of the specific mistake. */
  errorExplanation: string;
  /** The correct result — verbatim from a matched workedExample ("material"), or the model's own construction ("generated"), never recalculated in the "material" case. */
  correctStep: string;
  /** Backend-only telemetry: whether expression/correctStep came from a real workedExample or were synthesized. Not exposed on SummarySlide. */
  sourceType: 'material' | 'generated';
}

/** FindErrorResult plus the concept-id label the model must echo back — same
 * echo-mapping discipline as exerciseGenerator.ts's RawGeneratedExercise
 * (never trust response order/count, concepts can be omitted entirely).
 * Exported for testability only — generateFindError() strips `conceptId`
 * before returning to callers. */
export interface RawFindErrorResult extends FindErrorResult {
  conceptId: string;
}

/** Structural validation only (shape/non-empty), same reasoning as
 * exerciseGenerator.ts's isValidGeneratedExercise — plus a sanity check
 * that wrongStep and correctStep actually differ, since an identical pair
 * isn't a real "find the error" exercise regardless of what the schema
 * allowed through. Exported for testing. */
export function isValidFindErrorResult(item: RawFindErrorResult | null | undefined): item is RawFindErrorResult {
  return (
    !!item?.conceptId?.trim() &&
    !!item?.expression?.trim() &&
    !!item?.wrongStep?.trim() &&
    !!item?.question?.trim() &&
    !!item?.errorExplanation?.trim() &&
    !!item?.correctStep?.trim() &&
    (item.sourceType === 'material' || item.sourceType === 'generated') &&
    item.wrongStep.trim().toLowerCase() !== item.correctStep.trim().toLowerCase()
  );
}

/** Defensive normalization applied to every model-authored string field —
 * same reasoning as exerciseGenerator.ts's sanitizeExercise: the
 * SYSTEM_PROMPT forbids LaTeX, but prompt compliance alone isn't reliable
 * enough. Exported for testing. */
export function sanitizeFindError(item: RawFindErrorResult): RawFindErrorResult {
  return {
    ...item,
    expression: sanitizeMathText(item.expression),
    wrongStep: sanitizeMathText(item.wrongStep),
    question: sanitizeMathText(item.question),
    errorExplanation: sanitizeMathText(item.errorExplanation),
    correctStep: sanitizeMathText(item.correctStep),
  };
}

const SYSTEM_PROMPT = `Eres un generador de ejercicios "Encuentra el error" para estudiantes chilenos de enseñanza media,
en materias procedimentales (matemática, física). Para cada concepto que se te entregue, con su propio
[id="..."], evalúa primero si alguno de los EJERCICIOS YA RESUELTOS del material corresponde de verdad
a ese concepto:
  - Si SÍ corresponde uno: expression = su enunciado copiado literal, correctStep = su respuesta
    copiada literal — NUNCA recalculada — y sourceType="material".
  - Si NINGUNO corresponde (o el material no trae ejercicios resueltos): construye expression y
    correctStep a partir del ejemplo o la definición del concepto — un planteo y resultado plausibles
    y coherentes con ese contenido — y sourceType="generated". Aquí el resultado no proviene de un
    ejercicio ya resuelto en el material; es tu propia construcción, pero debe seguir siendo fiel al
    concepto (nunca datos que lo contradigan).
En AMBOS casos, wrongStep es un resultado con un ERROR COMÚN y plausible que un estudiante real
cometería en ESE paso (no distribuir, invertir un signo, operar en el orden equivocado, olvidar un
término) — nunca un disparate, y nunca igual al resultado correcto.
question es siempre "¿Qué salió mal?". errorExplanation es una frase corta (≤15 palabras), amable,
que nombra el error específico (nunca genérica como "está mal").
Si para un concepto no se te ocurre ni un workedExample que calce ni un ejercicio plausible que
construir, OMITE ese concepto por completo de tu respuesta (no lo incluyas en items) — no fuerces nada.
conceptId en tu respuesta debe ser EXACTAMENTE el [id="..."] del concepto que estás respondiendo.
NOTACIÓN MATEMÁTICA: escribe todo en texto plano, NUNCA en LaTeX. Prohibido usar backslash o comandos
LaTeX (nada de \\frac, \\left, \\right, \\(...\\), \\[...\\], ni llaves {} para agrupar). Fracciones:
"2/3", nunca "\\frac{2}{3}". Exponentes: "x^2" o "x²", nunca en llaves.
✓ BUENO (material): expression="2(x + 3)", wrongStep="2x + 3", errorExplanation="Olvidó multiplicar
  el 3.", correctStep="2x + 6", sourceType="material".
✗ MALO (absurdo): wrongStep="banana" o un resultado imposible de justificar como error real.
✗ MALO (inventar sobre un workedExample real): correctStep recalculado por ti en vez de copiado
  cuando SÍ existía un ejercicio resuelto que calzaba.
✗ MALO (error trivial): wrongStep idéntico a correctStep — no es un error, no muestra nada.`;

type ConceptInput = Pick<KnowledgeConcept, 'id' | 'name' | 'definition' | 'example'>;

function buildUserPrompt(concepts: ConceptInput[], workedExamples: WorkedExample[]): string {
  const weBlock = workedExamples.length > 0
    ? workedExamples.map((w, i) => `${i + 1}. Enunciado: "${w.statement}" — Respuesta: "${w.answer}"`).join('\n')
    : '(el material no trae ejercicios ya resueltos — construye expression/correctStep desde el ejemplo o la definición de cada concepto, sourceType="generated" para todos)';

  const conceptBlock = concepts
    .map((c) => `[id="${c.id}"] "${c.name}" — definición: ${c.definition}${c.example ? ` — ejemplo: ${c.example}` : ''}`)
    .join('\n');

  return `EJERCICIOS YA RESUELTOS EN EL MATERIAL (revisa si alguno corresponde a cada concepto de abajo):
${weBlock}

CONCEPTOS (evalúa cada uno por separado, uno por [id="..."]; omite los que no puedas resolver):
${conceptBlock}`;
}

/** Chunks + flattens newlines before logging, same convention as every other v2 generation stage. */
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

/**
 * No minItems/maxItems on `items` (unlike distractors.ts/exerciseGenerator.ts's
 * exact-count schemas) — every concept here is allowed to be skipped
 * entirely by the model (see SYSTEM_PROMPT's "omite ese concepto" rule),
 * so the response can legitimately contain anywhere from 0 to
 * concepts.length items.
 */
function buildFindErrorSchema() {
  const schema: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['conceptId', 'expression', 'wrongStep', 'question', 'errorExplanation', 'correctStep', 'sourceType'],
          properties: {
            conceptId: { type: 'string', description: 'Debe ser exactamente uno de los [id="..."] indicados en el prompt.' },
            expression: { type: 'string', description: 'El planteo correcto — copiado de un workedExample si aplica, o construido desde el concepto.' },
            wrongStep: { type: 'string', description: 'El resultado incorrecto con un error común plausible.' },
            question: { type: 'string', description: '"¿Qué salió mal?"' },
            errorExplanation: { type: 'string', description: 'Explicación breve y amable del error específico.' },
            correctStep: { type: 'string', description: 'El resultado correcto — copiado del workedExample si aplica, nunca recalculado en ese caso.' },
            sourceType: { type: 'string', enum: ['material', 'generated'] },
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
 * Generates a find_error exercise for as many of the given concepts as
 * possible in a single batched call — procedural missions have few enough
 * concepts (3-6, per comprehension.ts's own extraction rule) that this
 * doesn't need exerciseGenerator.ts's chunking/truncation machinery, same
 * single-call shape as distractors.ts/procedural.ts.
 *
 * Returns a Map keyed by conceptId, containing ONLY the concepts the model
 * successfully handled — never throws for a partial/empty result, and
 * returns an empty Map (not an error) if the whole call fails, so the
 * caller's per-concept fallback to the existing conceptual MC (Capa 3)
 * always has a well-defined "nothing generated" case to fall into.
 */
export async function generateFindError(
  concepts: KnowledgeConcept[],
  workedExamples: WorkedExample[],
): Promise<Map<string, FindErrorResult>> {
  if (concepts.length === 0) return new Map();

  const userPrompt = buildUserPrompt(concepts, workedExamples);
  logPrompt('FindError-System', SYSTEM_PROMPT);
  logPrompt('FindError-User', userPrompt);

  const conceptIds = new Set(concepts.map((c) => c.id));

  try {
    const parsed = await withOpenAIRetry(async () => {
      const response = await openai.chat.completions.create({
        model: config.openai_model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 2000,
        response_format: buildFindErrorSchema(),
      });
      recordUsage('FindError', response.usage);
      const raw = response.choices?.[0]?.message?.content;
      if (!raw) throw new Error('Respuesta vacía del modelo.');
      return JSON.parse(raw) as { items: RawFindErrorResult[] };
    }, 'FindError', 2);

    const result = new Map<string, FindErrorResult>();
    for (const rawItem of parsed.items) {
      const item = sanitizeFindError(rawItem);
      if (!isValidFindErrorResult(item) || !conceptIds.has(item.conceptId)) {
        console.warn(`[FindError] ítem con forma inválida o conceptId desconocido descartado (conceptId="${item?.conceptId}").`);
        continue;
      }
      const { conceptId, ...rest } = item;
      result.set(conceptId, rest);
    }

    const materialCount = [...result.values()].filter((r) => r.sourceType === 'material').length;
    console.log(`[FindError] ${result.size}/${concepts.length} conceptos con find_error generado (material=${materialCount}, generated=${result.size - materialCount}).`);
    return result;
  } catch (err) {
    console.warn(`[FindError] generación falló definitivamente — se omite para todos los conceptos (fallback a MC conceptual en cada uno). Motivo: ${err instanceof Error ? err.message : String(err)}`);
    return new Map();
  }
}
