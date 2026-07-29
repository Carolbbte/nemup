import OpenAI from 'openai';
import { config } from '../../config.js';
import { withOpenAIRetry } from '../../services/openaiRetry.js';
import { recordUsage } from '../../services/usageTracking.js';
import { sanitizeMathText } from '../../services/mathNotation.js';
import { validateCalculationExercise } from './exerciseValidator.js';
import type { KnowledgeConcept } from './types.js';

/**
 * Controls what validateCalculationExercise's verdict does to the pool — a
 * plain source constant, NOT an env flag (every other content-type/rollout
 * gate in this codebase routes through capabilities.* / config.ts; this one
 * doesn't need per-environment control, just a deliberate two-step rollout):
 *   'log-only' — validate and console.warn every discard candidate, but
 *     never actually remove anything. Output is byte-identical to before
 *     this layer existed. Start here to measure how many/which exercises
 *     WOULD be discarded, and — critically — to see the 'unverifiable' rate
 *     separately from 'invalid' (see exerciseValidator.ts's own comment on
 *     why those two must never be conflated).
 *   'enforce' — actually discard 'invalid'/'unverifiable' exercises, with
 *     one regeneration attempt for the exact discarded slots before giving
 *     up on them. Only flip this once log-only's logs show a low
 *     'unverifiable' rate — a high one means the preprocessor/prompt needs
 *     work first, not that enforce is safe.
 */
const EXERCISE_VALIDATION_MODE: 'log-only' | 'enforce' = 'log-only';

const openai = new OpenAI({ apiKey: config.openai_api_key });

/**
 * Subjects worth generating NEW practice exercises for, matched by partial
 * accent-stripped inclusion (so "Álgebra", "física", "Matemáticas" all
 * match). A fixed list rather than an AI-judged boolean field on the
 * KnowledgeObject: cheap, deterministic, and doesn't risk the same
 * run-to-run inconsistency that plagued workedExamples. Trade-off: subjects
 * outside this list (economía, estadística, etc.) never get generated
 * exercises even if they'd benefit — extend this list as NemUp's catalogue
 * of exercisable subjects grows.
 */
const EXERCISABLE_SUBJECTS = [
  'matematica', 'matematicas', 'algebra', 'geometria', 'calculo',
  'fisica', 'quimica', 'trigonometria', 'aritmetica',
];

export function isExercisableSubject(subject: string): boolean {
  const normalized = subject
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return EXERCISABLE_SUBJECTS.some((s) => normalized.includes(s));
}

/** One AI-generated (not copied from the material) practice exercise. */
export interface GeneratedExercise {
  statement: string;
  correctAnswer: string;
  distractors: { text: string; explanation: string }[];
  hint: string;
  kind: 'calculation' | 'recognition';
  // checkExpression/variables — machine-checkable math contract, only
  // meaningful for kind === 'calculation' (empty/[] for 'recognition', which
  // isn't numeric). Consumed by exerciseValidator.ts's
  // validateCalculationExercise: `checkExpression` evaluated with
  // `variables` substituted must equal `correctAnswer`, never the reverse —
  // correctAnswer is never recalculated, only checked against it. See
  // exerciseValidator.ts for why this can't be a free-form
  // Record<string,number> (OpenAI strict-mode schemas forbid dynamic keys).
  checkExpression?: string;
  variables?: { name: string; value: number }[];
}

/** GeneratedExercise plus the slot label the model must echo back — the
 * label is how we map a returned item to its planned difficulty (for boss
 * selection) without trusting response order. Exported for testability
 * only — generateExercises() strips `slotId` before returning to callers,
 * who only ever see plain GeneratedExercise. */
export interface RawGeneratedExercise extends GeneratedExercise {
  slotId: string;
}

/**
 * Structural validation only (shape/non-empty) — strict json_schema mode
 * guarantees types but not non-empty content, same reasoning as
 * distractors.ts's isValidDistractorSet.
 */
/** Defensive normalization applied to every model-authored string field —
 * the SYSTEM_PROMPT forbids LaTeX, but prompt compliance alone isn't
 * reliable enough (the model still occasionally emits \frac{}{} etc.), so
 * this converts any that slips through to the plain-text notation MathText
 * actually renders. */
function sanitizeExercise(item: RawGeneratedExercise): RawGeneratedExercise {
  return {
    ...item,
    statement: sanitizeMathText(item.statement),
    correctAnswer: sanitizeMathText(item.correctAnswer),
    hint: sanitizeMathText(item.hint),
    distractors: item.distractors?.map((d) => ({
      text: sanitizeMathText(d.text),
      explanation: sanitizeMathText(d.explanation),
    })),
  };
}

export function isValidGeneratedExercise(item: RawGeneratedExercise | null | undefined): item is RawGeneratedExercise {
  return (
    !!item?.slotId?.trim() &&
    !!item?.statement?.trim() &&
    !!item?.correctAnswer?.trim() &&
    !!item?.hint?.trim() &&
    Array.isArray(item?.distractors) &&
    item.distractors.length === 3 &&
    item.distractors.every((d) => !!d?.text?.trim() && !!d?.explanation?.trim()) &&
    (item.kind === 'calculation' || item.kind === 'recognition')
  );
}

const SYSTEM_PROMPT = `Eres un diseñador de ejercicios de práctica para estudiantes chilenos de enseñanza media,
especializado en materias con procedimientos o cálculos (matemáticas, física, química y similares).
Para cada concepto que se te entregue, genera ejercicios NUEVOS (no copiados del material) de opción múltiple,
practicables: de tipo "calculation" (el estudiante debe calcular o resolver algo) o "recognition" (debe identificar
o reconocer una propiedad) — el que tenga más sentido para ese concepto, no fuerces un cálculo donde no aplica.
Prefiere enunciados CONCRETOS o de escenario en vez de enunciados meta-abstractos que solo piden identificar
la etiqueta de un concepto:
  ✗ META-ABSTRACTO: "¿A cuál concepto corresponde esta característica: 'se forma por acumulación de sedimentos'?"
  ✓ CONCRETO/ESCENARIO: "Encuentras un esqueleto dentro de una roca sedimentaria. ¿Qué evidencia es?"
Mismo rigor y la misma respuesta verificable — solo un enunciado más vívido, nunca una pregunta más fácil,
más ambigua o menos precisa.
Cada ejercicio debe incluir exactamente 3 distractores plausibles, cada uno con una explicación breve del error
conceptual o de cálculo que produciría esa respuesta incorrecta, y una pista que oriente el método sin revelar
la respuesta. El frontend muestra ambas cosas como feedback real al estudiante, así que deben ser específicas
y útiles — nunca genéricas ("está mal" no sirve). Esto no agrega campos nuevos: son los mismos que ya generas.
Cada concepto listado abajo indica EXACTAMENTE cuántos ejercicios generar y de qué tipo (básico, una variante
avanzada específica, o práctica adicional) — respeta esa cantidad al pie de la letra: nunca fusiones, omitas ni
agregues ítems de los indicados.
Cada ejercicio pedido tiene una etiqueta [id="..."] — el campo "slotId" de tu respuesta para ese ejercicio DEBE
ser EXACTAMENTE esa etiqueta. Así identificamos cuál ejercicio es cuál sin depender del orden en que respondas.
NOTACIÓN MATEMÁTICA: escribe todo en texto plano, NUNCA en LaTeX. Prohibido usar backslash o comandos LaTeX
(nada de \\frac, \\left, \\right, \\(...\\), \\[...\\], ni llaves {} para agrupar). Fracciones: "2/3", nunca
"\\frac{2}{3}". Exponentes: "x^2" o "x²", nunca en llaves. Estas reglas aplican a TODO texto que escribas:
enunciado, respuesta correcta, distractores y pista.
Para ejercicios de tipo "calculation", además de las opciones incluye checkExpression y variables —
un motor matemático (no vos) evalúa checkExpression para verificar que la opción correcta sea real:
  - checkExpression: transcribe la operación EXACTA del enunciado a texto plano mathjs (usa * y ^),
    SIN resolverla, expandirla ni simplificarla — el motor hace la cuenta.
      ✓ Para "(5x²y+8)(5x²y+5)": checkExpression = "(5*x^2*y + 8) * (5*x^2*y + 5)"
      ✗ NO la expandas vos: "25*x^4*y^2 + 40*x^2*y + 40" — si te equivocás al expandir a mano,
        invalidás una respuesta que en realidad era correcta.
  - variables: las sustituciones numéricas que el enunciado fija, como un array de {"name","value"}
    (ej. [{"name":"x","value":1},{"name":"y","value":2}]). Si el enunciado fija valores, ponelos acá
    (o directamente como números concretos dentro de checkExpression, ej. "7^2") — nunca dejes una
    variable libre sin valor cuando la respuesta correcta es un número concreto, el motor no puede
    verificarla así. Array vacío [] solo cuando el ejercicio es puramente simbólico (ej. desarrollar
    un producto sin valores dados, con una respuesta también simbólica).
La opción correcta DEBE ser exactamente el resultado de evaluar checkExpression con esas variables —
no la aproximes ni la redondees distinto. Para ejercicios "recognition" (no numéricos), dejá
checkExpression como string vacío y variables como array vacío.`;

type SlotKind = 'base' | 'variant' | 'practice';

/** One planned exercise slot — carries its own difficulty (used only for
 * boss selection after generation) and a stable `id` the model must echo
 * back in `slotId`, so mapping a response item to its plan never relies on
 * response order. Exported for testability only. */
export interface SlotDescriptor {
  id: string;
  concept: KnowledgeConcept;
  kind: SlotKind;
  variantIndex?: number;
  difficulty: number;
}

function slotInstruction(slot: SlotDescriptor): string {
  if (slot.kind === 'base') {
    return `ejercicio básico${slot.concept.example ? ` (basado en: ${slot.concept.example})` : ''}`;
  }
  if (slot.kind === 'variant') {
    return `ejercicio para la variante avanzada: "${slot.concept.advancedExamples[slot.variantIndex!]}"`;
  }
  return 'ejercicio de práctica adicional, mismo estilo que los anteriores de este concepto';
}

function buildUserPrompt(batchPlan: SlotDescriptor[], subject: string): string {
  const order: string[] = [];
  const byConcept = new Map<string, { concept: KnowledgeConcept; slots: SlotDescriptor[] }>();
  for (const slot of batchPlan) {
    if (!byConcept.has(slot.concept.id)) {
      byConcept.set(slot.concept.id, { concept: slot.concept, slots: [] });
      order.push(slot.concept.id);
    }
    byConcept.get(slot.concept.id)!.slots.push(slot);
  }

  const conceptLines = order.map((id, i) => {
    const { concept, slots } = byConcept.get(id)!;
    const numbered = slots.map((s) => `[id="${s.id}"] ${slotInstruction(s)}`).join('; ');
    return `${i + 1}. "${concept.name}" — definición: ${concept.definition}\n   Genera ${slots.length} ejercicio(s): ${numbered}`;
  });

  return `MATERIA: ${subject}

EJEMPLO DE BUEN EJERCICIO (materia: álgebra, concepto: "Reducción de términos semejantes"):
Enunciado: "Reduce la expresión: 4x + 3y − 2x + 5y"
Respuesta correcta: "2x + 8y"
Distractores:
  - "6x + 8y" — explicación: "Resulta de sumar los coeficientes de x en vez de restarlos (4x + 2x en vez de 4x − 2x)."
  - "2x + 2y" — explicación: "Resulta de restar los coeficientes de y en vez de sumarlos (3y − 5y en vez de 3y + 5y)."
  - "2xy + 8xy" — explicación: "Mezcla los términos en x e y como si fueran semejantes entre sí."
Pista: "Agrupa por separado los términos con x y los términos con y antes de operar."
kind: "calculation"

CONCEPTOS (genera ${batchPlan.length} ejercicios en total, uno por cada [id="..."] listado):
${conceptLines.join('\n')}`;
}

/** Chunks + flattens newlines before logging, same convention as comprehension.ts/distractors.ts. */
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

function buildExerciseSchema(itemCount: number) {
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
          required: ['slotId', 'statement', 'correctAnswer', 'distractors', 'hint', 'kind', 'checkExpression', 'variables'],
          properties: {
            slotId: { type: 'string', description: 'Debe ser exactamente uno de los [id="..."] indicados en el prompt — identifica cuál ejercicio pedido es este.' },
            statement: { type: 'string', description: 'Enunciado del ejercicio nuevo.' },
            correctAnswer: { type: 'string', description: 'Respuesta correcta del ejercicio.' },
            distractors: {
              type: 'array',
              minItems: 3,
              maxItems: 3,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['text', 'explanation'],
                properties: {
                  text: { type: 'string', description: 'Texto de la opción incorrecta.' },
                  explanation: { type: 'string', description: 'Por qué esta opción está mal — el error que representa.' },
                },
              },
            },
            hint: { type: 'string', description: 'Pista que orienta el método sin revelar la respuesta.' },
            kind: { type: 'string', enum: ['calculation', 'recognition'] },
            checkExpression: { type: 'string', description: 'Solo para kind="calculation": la expresión matemática concreta que resuelve el ejercicio, sintaxis mathjs (* para multiplicar, ^ para potencias). String vacío para kind="recognition".' },
            variables: {
              type: 'array',
              description: 'Solo para kind="calculation": sustituciones numéricas que el enunciado fija. Array vacío si el ejercicio es simbólico o kind="recognition".',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'value'],
                properties: {
                  name: { type: 'string', description: 'Nombre de la variable, una sola letra (ej. "x").' },
                  value: { type: 'number', description: 'Valor numérico sustituido.' },
                },
              },
            },
          },
        },
      },
    },
  };

  return {
    type: 'json_schema',
    json_schema: { name: 'generated_exercise_list', strict: true, schema },
  } as const;
}

// ── Session-size planning ──────────────────────────────────────────────────

/** Every session targets this many generated exercises — a fixed, predictable
 * size instead of one that emerged from however many advancedExamples a
 * document happened to have (18 one run, 13 the next — see the bug this
 * replaces). */
export const TARGET_EXERCISES_PER_SESSION = 12;
/** Exercises per AI call — keeps each response comfortably small regardless
 * of session size, so no single call risks hitting its token budget. */
const CHUNK_SIZE = 6;
/** Tokens budgeted per exercise in a batch's max_tokens — derived from real
 * usage (11 exercises ≈ 1771 completion_tokens ≈ 161/item), with margin. */
const PER_ITEM_TOKENS = 250;
/** Fixed overhead added on top of the per-item budget (JSON envelope/keys). */
const ENVELOPE_OVERHEAD = 300;
/** gpt-4.1-mini's actual max output tokens (confirmed against OpenAI's
 * documented limits) — only relevant as a last-resort ceiling when a batch
 * truncates even after retrying once at this cap; assumes config.openai_model
 * stays gpt-4.1-mini (the config.ts default) — a differently configured model
 * may have a different real ceiling. */
const OUTPUT_CEILING = 32768;

function computeMaxTokens(itemCount: number): number {
  return Math.min(OUTPUT_CEILING, itemCount * PER_ITEM_TOKENS + ENVELOPE_OVERHEAD);
}

/**
 * Plans exactly which exercises to generate for a session, deterministically
 * sized at TARGET_EXERCISES_PER_SESSION (or more, only when there are more
 * concepts than that — see the explicit branch below).
 *
 * Two passes:
 *   1. Breadth — one base slot per concept, then one slot per distinct
 *      advanced variant (concept-by-concept, "every concept's 1st variant"
 *      before "any concept's 2nd variant") — guarantees every variant shows
 *      up at least once. If this alone reaches the target, trim to it
 *      breadth-first, so trimming never empties one concept's coverage
 *      before touching another's.
 *   2. Depth — if breadth fell short of the target, fill the remainder with
 *      extra practice reps (round-robin, concepts with more variants first)
 *      until the session reaches exactly the target.
 */
/**
 * `roleAware` (FEATURE_CONTENT_TYPE_V2, Paso 3, default false — every
 * existing caller/test is byte-identical without it) concentrates variant
 * and depth-fill slots on `role === 'procedure'` concepts instead of
 * spreading them evenly, so a procedural/mixed session's exercise pool
 * leans toward the concept(s) that are an actual method/operation rather
 * than the vocabulary that supports them. Only takes effect when the
 * session has at least one concept tagged "procedure" — if `role` is
 * absent entirely (older data) or the model tagged none, the plan is
 * IDENTICAL to `roleAware: false` (see `procedureConcepts.length > 0`
 * guards below), same fallback discipline assemble.ts's own
 * `hasProcedureConcept` check applies on its side.
 */
export function buildSlotPlan(concepts: KnowledgeConcept[], roleAware: boolean = false): SlotDescriptor[] {
  const n = concepts.length;
  let nextId = 1;
  const makeId = () => `ej${nextId++}`;

  // Edge case, made explicit rather than an incidental side effect of the
  // breadth/depth math below: with >= TARGET concepts, every concept still
  // gets its one guaranteed base exercise (no concept is ever dropped), but
  // advanced-variant coverage is deliberately NOT attempted — chasing it too
  // would keep inflating the session past a reasonable size for however many
  // concepts+variants a given document happens to have.
  if (n >= TARGET_EXERCISES_PER_SESSION) {
    if (n > TARGET_EXERCISES_PER_SESSION) {
      console.warn(`[ExerciseGenerator] ${n} conceptos exceden el objetivo de ${TARGET_EXERCISES_PER_SESSION} — sesión de ${n} ejercicios (1 básico por concepto, sin variantes avanzadas; ningún concepto se descarta).`);
    }
    return concepts.map((c) => ({ id: makeId(), concept: c, kind: 'base', difficulty: c.difficulty }));
  }

  const target = TARGET_EXERCISES_PER_SESSION;
  const procedureConcepts = roleAware ? concepts.filter((c) => c.role === 'procedure') : [];
  const roleWeighted = procedureConcepts.length > 0;

  const pass1: SlotDescriptor[] = concepts.map((c) => ({ id: makeId(), concept: c, kind: 'base', difficulty: c.difficulty }));
  const maxVariants = concepts.reduce((max, c) => Math.max(max, c.advancedExamples.length), 0);
  for (let v = 0; v < maxVariants; v++) {
    for (const c of concepts) {
      // A "supporting" concept skips its own variant slots once the session
      // is role-weighted — caps it to its 1 base exercise, concentrating
      // variant coverage on the procedure concept(s) instead. Every concept
      // still gets every variant (today's exact behavior) when roleWeighted
      // is false.
      const isCappedSupporting = roleWeighted && c.role !== 'procedure';
      if (!isCappedSupporting && c.advancedExamples.length > v) {
        pass1.push({ id: makeId(), concept: c, kind: 'variant', variantIndex: v, difficulty: c.difficulty + 0.1 * (v + 1) });
      }
    }
  }

  if (pass1.length >= target) return pass1.slice(0, target);

  const plan = pass1.slice();
  let remaining = target - pass1.length;
  // Depth-fill round-robin: concentrated on procedure concepts when
  // role-weighted, the original "everyone, hardest-variant-count first"
  // order otherwise.
  const priority = (roleWeighted ? procedureConcepts : concepts)
    .slice()
    .sort((a, b) => b.advancedExamples.length - a.advancedExamples.length);
  let i = 0;
  while (remaining > 0) {
    const c = priority[i % priority.length];
    plan.push({ id: makeId(), concept: c, kind: 'practice', difficulty: c.difficulty });
    remaining--;
    i++;
  }
  return plan;
}

/** Groups a plan into AI-call-sized batches, keeping each concept's slots
 * together (base, then variants in order, then practice) and accumulating
 * whole concepts up to CHUNK_SIZE per batch — a single concept with more
 * slots than CHUNK_SIZE is simply alone in its own (larger) batch. */
function batchPlan(plan: SlotDescriptor[]): SlotDescriptor[][] {
  const conceptOrder: KnowledgeConcept[] = [];
  const seen = new Set<string>();
  const slotsByConcept = new Map<string, SlotDescriptor[]>();
  const rank: Record<SlotKind, number> = { base: 0, variant: 1, practice: 2 };

  for (const slot of plan) {
    if (!seen.has(slot.concept.id)) {
      seen.add(slot.concept.id);
      conceptOrder.push(slot.concept);
    }
    const arr = slotsByConcept.get(slot.concept.id) ?? [];
    arr.push(slot);
    slotsByConcept.set(slot.concept.id, arr);
  }
  for (const arr of slotsByConcept.values()) {
    arr.sort((a, b) => rank[a.kind] - rank[b.kind] || (a.variantIndex ?? 0) - (b.variantIndex ?? 0));
  }

  const batches: SlotDescriptor[][] = [];
  let current: SlotDescriptor[] = [];
  for (const concept of conceptOrder) {
    const slots = slotsByConcept.get(concept.id)!;
    if (current.length > 0 && current.length + slots.length > CHUNK_SIZE) {
      batches.push(current);
      current = [];
    }
    current.push(...slots);
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

// ── Generation, with truncation-safe retry ─────────────────────────────────

// `exercise` keeps `slotId` (RawGeneratedExercise, not GeneratedExercise)
// all the way through generateExercises internally — needed so 'enforce'
// mode can regenerate the EXACT discarded slot rather than an approximation.
// Stripped to plain GeneratedExercise only at generateExercises's final
// return. Exported for testability only (same convention as SlotDescriptor/
// RawGeneratedExercise above) — external callers only ever see GeneratedExercise.
export interface RankedExercise {
  exercise: RawGeneratedExercise;
  difficulty: number;
}

/**
 * Generates one batch, mapping each returned item back to its planned slot
 * BY LABEL (`slotId`), never by array position — the model's own response
 * order is never trusted for this.
 *
 * Truncation handling: `finish_reason === 'length'` (checked inside the
 * retried call, alongside JSON.parse — both now retry via withOpenAIRetry
 * instead of a parse failure skipping retry entirely, the bug this replaces)
 * escalates max_tokens to OUTPUT_CEILING once; if the batch is still too
 * big even at the ceiling, it's split in half and each half is generated
 * independently. A batch that fails definitively (after all of the above)
 * is dropped with a warning — Option A: the session ships with fewer
 * exercises rather than failing outright for the student.
 */
async function generateBatch(
  slots: SlotDescriptor[],
  subject: string,
  maxTokens: number = computeMaxTokens(slots.length),
): Promise<RankedExercise[]> {
  if (slots.length === 0) return [];

  const itemCount = slots.length;
  const userPrompt = buildUserPrompt(slots, subject);
  logPrompt('ExerciseGenerator-System', SYSTEM_PROMPT);
  logPrompt('ExerciseGenerator-User', userPrompt);

  try {
    const parsed = await withOpenAIRetry(async () => {
      const response = await openai.chat.completions.create({
        model: config.openai_model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: maxTokens,
        response_format: buildExerciseSchema(itemCount),
      });
      recordUsage('ExerciseGenerator', response.usage);

      if (response.choices?.[0]?.finish_reason === 'length') {
        throw new Error(`TRUNCATED: la respuesta se cortó por max_tokens (${maxTokens}).`);
      }
      const raw = response.choices?.[0]?.message?.content;
      if (!raw) throw new Error('Respuesta vacía del modelo.');
      // Parsing lives INSIDE the retried block now — a malformed/truncated
      // JSON response retries the whole call instead of crashing past
      // withOpenAIRetry's boundary uncaught (the original bug).
      return JSON.parse(raw) as { items: RawGeneratedExercise[] };
    }, 'ExerciseGenerator', 2);

    const difficultyById = new Map(slots.map((s) => [s.id, s.difficulty]));
    return parsed.items
      .map(sanitizeExercise)
      .filter((item) => {
        const ok = isValidGeneratedExercise(item) && difficultyById.has(item.slotId);
        if (!ok) console.warn(`[ExerciseGenerator] ejercicio con forma inválida o slotId desconocido descartado (slotId="${item?.slotId}").`);
        return ok;
      })
      .map((item) => ({ exercise: item, difficulty: difficultyById.get(item.slotId)! }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTruncation = message.startsWith('TRUNCATED');

    if (isTruncation && maxTokens < OUTPUT_CEILING) {
      console.warn(`[ExerciseGenerator] lote de ${itemCount} truncado en ${maxTokens} tokens — subiendo a ${OUTPUT_CEILING} y reintentando.`);
      return generateBatch(slots, subject, OUTPUT_CEILING);
    }
    if (isTruncation && slots.length > 1) {
      console.warn(`[ExerciseGenerator] lote de ${itemCount} sigue truncado en el techo (${OUTPUT_CEILING}) — partiendo en 2 y reintentando cada mitad por separado.`);
      const mid = Math.ceil(slots.length / 2);
      const [a, b] = await Promise.all([
        generateBatch(slots.slice(0, mid), subject),
        generateBatch(slots.slice(mid), subject),
      ]);
      return [...a, ...b];
    }

    console.warn(`[ExerciseGenerator] lote de ${itemCount} ejercicios falló definitivamente tras los reintentos — se omite (sesión sigue sin estos ${itemCount}). Motivo: ${message}`);
    return [];
  }
}

/**
 * Generates NEW practice exercises (not copied from the material) for
 * exercisable subjects. TROCEADO: each call receives only concept
 * name/definition/example/advancedExamples — never the source document —
 * batched to CHUNK_SIZE items per call so a single response never scales
 * with document size (the failure mode that killed the legacy engine with
 * "Premature close" errors on long documents, and the same principle behind
 * this module's own truncation fix above).
 *
 * Math-truth validation (exerciseValidator.ts's validateCalculationExercise,
 * mathjs-based) runs right below, controlled by EXERCISE_VALIDATION_MODE —
 * see that constant's own comment for the log-only → enforce rollout.
 */
export async function generateExercises(
  concepts: KnowledgeConcept[],
  subject: string,
  // FEATURE_CONTENT_TYPE_V2, Paso 3 — see buildSlotPlan's own doc comment.
  // Default false: byte-identical to before this parameter existed.
  roleAware: boolean = false,
): Promise<GeneratedExercise[]> {
  if (concepts.length === 0) return [];

  const plan = buildSlotPlan(concepts, roleAware);
  const batches = batchPlan(plan);

  const results = await Promise.all(batches.map((batch) => generateBatch(batch, subject)));
  let ranked = results.flat();
  if (ranked.length === 0) return [];

  ranked = await applyMathValidation(ranked, plan, subject);
  if (ranked.length === 0) return [];

  // Boss selection scans the ACTUALLY GENERATED (and valid) exercises, never
  // the plan — if whichever slot was intended as hardest failed to generate
  // (its batch was dropped, or it failed validation), the boss falls to
  // whatever next-hardest exercise genuinely exists, never to something
  // that was only ever planned.
  let bossIdx = 0;
  for (let i = 1; i < ranked.length; i++) {
    if (ranked[i].difficulty > ranked[bossIdx].difficulty) bossIdx = i;
  }
  const [boss] = ranked.splice(bossIdx, 1);
  ranked.push(boss);

  return ranked.map(({ exercise: { slotId, ...exercise } }) => exercise);
}

/**
 * Runs validateCalculationExercise over every ranked exercise and applies
 * EXERCISE_VALIDATION_MODE's policy:
 *   - 'log-only': logs each discard candidate (split 'invalid' vs
 *     'unverifiable' — see exerciseValidator.ts) and returns `ranked`
 *     UNCHANGED. Byte-identical output to before this function existed.
 *   - 'enforce': removes 'invalid'/'unverifiable' items, attempts ONE
 *     regeneration pass for exactly those slots (reusing batchPlan/
 *     generateBatch), validates the retry, and keeps it only if it now
 *     passes — otherwise that slot is simply dropped from the pool (never
 *     forced through). The Misión's pool targets 12 and consumes ~9-10, so a
 *     handful of drops is safe; assemble.ts's fieldsFromDistractorSet
 *     fallback covers a concept that ends up with no generated exercise at
 *     all, same as when shouldGenerateExercises is false upstream.
 *
 * Exported for testability only — see exerciseGenerator.test.ts. The
 * 'enforce' regeneration branch calls generateBatch (real OpenAI SDK) and is
 * therefore only exercised there when EXERCISE_VALIDATION_MODE is actually
 * 'enforce' AND bad slots exist; with the constant at its current 'log-only'
 * value this function never reaches that branch, so testing it here never
 * needs network mocking.
 */
export async function applyMathValidation(
  ranked: RankedExercise[],
  plan: SlotDescriptor[],
  subject: string,
): Promise<RankedExercise[]> {
  const checked = ranked.map((r) => ({ ...r, validation: validateCalculationExercise(r.exercise) }));
  const invalidCount = checked.filter((c) => !c.validation.ok && c.validation.reason === 'invalid').length;
  const unverifiableCount = checked.filter((c) => !c.validation.ok && c.validation.reason === 'unverifiable').length;

  for (const c of checked) {
    if (!c.validation.ok) {
      console.warn(
        `[ExerciseValidator] mode=${EXERCISE_VALIDATION_MODE} reason=${c.validation.reason} slotId=${c.exercise.slotId} — ${c.validation.message}`,
      );
    }
  }
  if (invalidCount > 0 || unverifiableCount > 0) {
    console.log(`[ExerciseValidator] resumen: invalid=${invalidCount} unverifiable=${unverifiableCount} de ${checked.length} ejercicio(s) evaluados.`);
  }

  if (EXERCISE_VALIDATION_MODE === 'log-only') {
    return ranked;
  }

  // 'enforce' from here down.
  const badSlotIds = new Set(checked.filter((c) => !c.validation.ok).map((c) => c.exercise.slotId));
  if (badSlotIds.size === 0) return ranked;

  const retrySlots = plan.filter((s) => badSlotIds.has(s.id));
  console.warn(`[ExerciseValidator] enforce: regenerando ${retrySlots.length} slot(s) inválido(s), un solo intento.`);
  const retryBatches = batchPlan(retrySlots);
  const retryResults = (await Promise.all(retryBatches.map((b) => generateBatch(b, subject)))).flat();
  const retryById = new Map(retryResults.map((r) => [r.exercise.slotId, r]));

  const survivors: RankedExercise[] = [];
  for (const c of checked) {
    if (c.validation.ok) {
      survivors.push({ exercise: c.exercise, difficulty: c.difficulty });
      continue;
    }
    const retry = retryById.get(c.exercise.slotId);
    if (retry && validateCalculationExercise(retry.exercise).ok) {
      survivors.push(retry);
    } else {
      console.warn(`[ExerciseValidator] enforce: slotId=${c.exercise.slotId} sigue inválido tras un reintento — se descarta del pool.`);
    }
  }
  return survivors;
}
