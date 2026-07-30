import { parse, evaluate } from 'mathjs';
import OpenAI from 'openai';
import { config } from '../../config.js';
import { withOpenAIRetry } from '../../services/openaiRetry.js';
import { recordUsage } from '../../services/usageTracking.js';
import { sanitizeMathText } from '../../services/mathNotation.js';
import { toMathjsSyntax, expressionsEqual, extractFreeSymbols, parseMonomial, signatureFromPowers, isAdditiveTermOf, combineLikeTerms } from './exerciseValidator.js';
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

// ── Single-term-delta guard (see reconcileFindError's own comment) ─────────

/**
 * Canonical "variable shape" of a single monomial (e.g. "4*x" -> "x^1",
 * "5*x^2*y" -> "x^2y^1", "24" -> ""), or `null` if the expression is not a
 * pure product/power/constant — i.e. it has a top-level +/-, meaning it's
 * not one term at all. Thin wrapper over exerciseValidator.ts's
 * parseMonomial/signatureFromPowers (shared with combineLikeTerms/
 * isAdditiveTermOf — same monomial-decomposition engine, not reimplemented
 * here).
 *
 * This is the mechanism behind the "single-term delta" guarantee, and it
 * deliberately does NOT ask mathjs's `simplify()` to prove that property
 * structurally on a full expression — empirically, `simplify()` doesn't
 * reliably reduce even simple cases to a canonical single-node form (e.g.
 * `simplify("4*(x+1) - 4*x")` returns the UNREDUCED `"4 * (x + 1) - 4 * x"`,
 * which LOOKS like two terms at the top level despite being the constant 4
 * — a naive "is the top node an add/subtract" check would wrongly reject
 * it). Comparing correctTerm's and wrongTerm's shapes directly sidesteps
 * that: two same-shape monomials always combine into exactly one term when
 * subtracted, by definition — no need to trust simplify's output shape.
 */
function monomialSignature(mathjsExpr: string): string | null {
  let node: any;
  try {
    node = parse(mathjsExpr);
  } catch {
    return null;
  }
  const monomial = parseMonomial(node);
  return monomial ? signatureFromPowers(monomial.powers) : null;
}

/** True iff `mathjsExpr` evaluates to (very close to) zero — checked at two
 * distinct fixed points for every free symbol, so a coincidental single-
 * point zero (e.g. "x - 3" at x=3) doesn't produce a false positive. */
function isZeroValue(mathjsExpr: string): boolean {
  try {
    const node: any = parse(mathjsExpr);
    if (node.type === 'ConstantNode') return Number(node.value) === 0;
    const symbols = extractFreeSymbols(mathjsExpr);
    if (symbols.length === 0) {
      const value = evaluate(mathjsExpr, {});
      return typeof value === 'number' && Math.abs(value) < 1e-9;
    }
    for (const trial of [3, 7]) {
      const scope = Object.fromEntries(symbols.map((s) => [s, trial]));
      const value = evaluate(mathjsExpr, scope);
      if (!(typeof value === 'number' && Math.abs(value) < 1e-9)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── Voz cercana: template de la opción correcta por tipo de error ─────────

type FindErrorKind = 'omission' | 'sign' | 'value';

/** Distingue los 3 tipos de error que la validación estructural ya admite
 * (misma forma monomial, o wrongTerm cero) — determinístico a partir de
 * correctTerm/wrongTerm, sin depender de texto libre del modelo. */
function detectErrorKind(correctTermMathjs: string, wrongTermMathjs: string): FindErrorKind {
  if (isZeroValue(wrongTermMathjs)) return 'omission';
  if (expressionsEqual(wrongTermMathjs, `-(${correctTermMathjs})`, {}) === true) return 'sign';
  return 'value';
}

/**
 * Arma el texto de la opción correcta en voz cercana ("como alguien mayor
 * que te explica"), no de manual — un template fijo por tipo de error,
 * nunca texto libre del modelo (mismo espíritu que el resto del diseño
 * estructurado: la coherencia se garantiza construyendo el texto, no
 * confiando en que el modelo lo redacte bien). Ya no usa `errorReason` — los
 * 3 templates cubren, sin ambigüedad, los únicos 3 tipos de error que la
 * validación de arriba permite, así que no hace falta pedirle al modelo una
 * razón adicional en texto libre.
 */
function buildErrorExplanation(correctTermMathjs: string, wrongTermMathjs: string, correctTermDisplay: string, wrongTermDisplay: string): string {
  switch (detectErrorKind(correctTermMathjs, wrongTermMathjs)) {
    case 'omission':
      return `Le faltó el ${correctTermDisplay}: se olvidó de ese término.`;
    case 'sign':
      return `Le cambió el signo: puso ${wrongTermDisplay} en vez de ${correctTermDisplay}.`;
    case 'value':
    default:
      return `Puso ${wrongTermDisplay} en vez de ${correctTermDisplay}.`;
  }
}

const SUPERSCRIPT_DIGITS: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/**
 * Conversión LIVIANA de sintaxis mathjs incrustada en texto libre (la prosa
 * de un distractor, ej. "Multiplicó mal 6*4") a notación de alumno — un
 * swap de tokens sobre el string, NUNCA un parseo completo de expresión
 * (rompería con la prosa en español mezclada alrededor). Red de seguridad
 * de presentación: se aplica siempre, incluso si el modelo ya siguió la
 * instrucción del prompt de usar notación de alumno directamente.
 *   - "x*x" (mismo símbolo) -> "x²".
 *   - "6*4" (número·número) -> "6·4" — multiplicación EXPLÍCITA, porque
 *     "64" sería ambiguo con el número 64.
 *   - "6*x" (coeficiente·variable) -> "6x" — multiplicación implícita,
 *     misma convención que toDisplayMath usa para expresiones puras.
 *   - "^2"/"^3" -> "²"/"³" (un solo dígito).
 */
function lightPrettyPrint(text: string): string {
  return text
    .replace(/\b([a-zA-Z]\w*)\*\1\b/g, '$1²')
    .replace(/(\d)\s*\*\s*(\d)/g, '$1·$2')
    .replace(/\*/g, '')
    .replace(/\^([0-9])/g, (_, d: string) => SUPERSCRIPT_DIGITS[d]);
}

/**
 * A validated "find the error" exercise for one `role === 'procedure'`
 * concept, ALWAYS multiple choice. Structured by construction, not
 * free-text: the model never authors `wrongStep` or the correct diagnosis
 * directly (an earlier free-text version let the model swap which of the
 * MC options was actually correct, since nothing tied the diagnosis text to
 * the real term that changed). Instead:
 *   - `wrongStep` is DERIVED here (reconcileFindError) MATHEMATICALLY as
 *     `correctForm − correctTerm + wrongTerm` — an arithmetic expression,
 *     not a text substitution, so formatting (spacing, glued vs spaced
 *     signs) can never break it the way a substring search could (see
 *     isAdditiveTermOf's own comment for the exact false-reject this fixed).
 *   - `errorExplanation` (the correct MC option) is TEMPLATED (by error
 *     kind — omission/sign/value, see buildErrorExplanation) from
 *     `correctTerm`/`wrongTerm` — it can only ever name the term that
 *     actually changed, by construction.
 * `errorDistractors` (2 honest-but-wrong diagnoses of OTHER terms) still
 * come from the model, same option-building convention as every other MC
 * slide (shuffleWithLetterAnswer in assemble.ts).
 */
export interface FindErrorResult {
  conceptId: string;
  expression: string;
  /** The correct, COMBINED final answer (via combineLikeTerms — never simplify(), see its own comment) — never the raw unsimplified step. */
  correctForm: string;
  /** correctForm − correctTerm + wrongTerm, mathematically derived and then combined — never model-authored, never a text substitution. */
  wrongStep: string;
  correctTerm: string;
  wrongTerm: string;
  question: string;
  /** Templated by tipo de error (omisión/signo/valor) desde correctTerm/wrongTerm — ver buildErrorExplanation. */
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

3. Elegí UN término COMPLETO de correctForm y un error real que lo afecte ENTERO — preferí siempre
   estos tipos, que dan un resultado final limpio y un delta de un solo término:
   - Omitir un término cruzado por completo (ej. olvidó sumar 4x): wrongTerm = "0".
   - Aritmética mal en un coeficiente o constante (ej. 6·4 debía ser 24, puso 20): correctTerm="24",
     wrongTerm="20".
   - Olvidar restar un término (ej. no restar x²): wrongTerm = "0" para ese término.
   - Error de signo en un término completo (ej. +4x en vez de -4x): correctTerm="-4*x",
     wrongTerm="+4*x" (o "4*x", da igual — el backend interpreta el signo matemáticamente).
   EVITÁ corromper una PARTE interna de un término (ej. "6*x" → "6+x") — eso da un resultado final
   raro e irreconocible. El error va SIEMPRE sobre el término completo, nunca dentro de él.
   Dá:
   - "correctTerm": ese término tal como aparece en correctForm (ej. "4*x"). El backend lo confirma
     MATEMÁTICAMENTE contra los términos de correctForm — no hace falta que el formato coincida al
     pie de la letra (espacios, signo pegado o no), pero SÍ debe ser realmente uno de los términos
     que aparecen en correctForm, no uno inventado.
   - "wrongTerm": cómo queda ese término al cometer el error. REGLA INNEGOCIABLE: wrongTerm debe tener
     EXACTAMENTE la misma parte literal que correctTerm (mismas letras, mismos exponentes — solo puede
     cambiar el coeficiente o el signo), O ser exactamente "0" si el error es omitir el término
     completo. Nunca uses un wrongTerm con letras o exponentes distintos a los de correctTerm (ej.
     correctTerm="4*x" con wrongTerm="4" está PROHIBIDO — cambia la parte literal). Matemáticamente
     DISTINTO de correctTerm en valor.

4. "errorDistractors": exactamente 2 diagnósticos INCORRECTOS pero que sean errores PLAUSIBLES DE ESTE
   MISMO ejercicio, sobre OTROS términos u operaciones — NUNCA otra explicación del mismo correctTerm,
   y NUNCA errores de otro tema ni categorías genéricas que no apliquen a este ejercicio.
     ✓ Para (x+6)(x+4), si el error elegido fue en el término 4x: "Sumó 6+4 en vez de multiplicar los
       términos cruzados", "Multiplicó mal 6·4".
     ✗ Para el mismo caso: otra frase que describa el mismo término 4x con otras palabras — sería una
       segunda "correcta" encubierta. ✗ "No aplicar el exponente a todo el factor" — no hay exponente
       sobre un factor acá, es de otro tema.
   Los 2 distractores deben ser DISTINTOS entre sí.
   NOTACIÓN DE ALUMNO en el texto de errorDistractors — nunca sintaxis de código: usá "·" o "×" para
   multiplicar y superíndices (x²) para potencias. NUNCA "*" ni "^". Ej.: "Multiplicó mal 6·4", nunca
   "Multiplicó mal 6*4".
   VOZ: cercana y directa, como alguien mayor que sabe del tema explicándole a un adolescente — nunca
   de manual. Nombrá el término concreto, nunca "dicho término" ni "el mencionado término". Corto
   (máximo 12 palabras aprox.).

PROHIBIDO:
  - Usar "orden de los términos" / "términos mal ubicados" / "reordenó los términos" como error, ni
    como correctTerm/wrongTerm ni como errorDistractor: reordenar una suma NO es un error
    (a + b = b + a).
  - Elegir un correctTerm que en realidad ya está bien en cualquier resolución razonable — tiene que
    ser un término donde el error elegido realmente aplica.
  - wrongTerm con una parte literal (letras/exponentes) DISTINTA de correctTerm, salvo que sea
    exactamente "0" (omisión total). Esto es lo más importante de todo el ejercicio: si lo violás, el
    resultado final del ejercicio no se puede calcular de forma limpia y el ítem se descarta entero.

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
          required: ['conceptId', 'matched', 'expression', 'correctForm', 'correctTerm', 'wrongTerm', 'errorDistractors'],
          properties: {
            conceptId: { type: 'string', description: 'Debe ser exactamente uno de los conceptId indicados en el prompt.' },
            matched: { type: 'boolean', description: 'true si construiste correctForm/correctTerm/wrongTerm/2 distractores honestos; false si no.' },
            expression: { type: 'string', description: 'El planteo del ejercicio resuelto, copiado literal del material. String vacío si matched=false.' },
            correctForm: { type: 'string', description: 'La forma correcta (no simplificada) de resolver expression, con todos los términos bien, sintaxis mathjs. String vacío si matched=false.' },
            correctTerm: { type: 'string', description: 'Un término de correctForm, transcripto EXACTO — debe aparecer literal dentro de correctForm. String vacío si matched=false.' },
            wrongTerm: { type: 'string', description: 'Ese mismo término tal como queda al cometer el error, matemáticamente distinto de correctTerm. String vacío si matched=false.' },
            errorDistractors: {
              type: 'array',
              minItems: 2,
              maxItems: 2,
              items: { type: 'string' },
              description: '2 diagnósticos incorrectos pero plausibles sobre OTROS términos de este mismo ejercicio, en notación de alumno (· y superíndices, nunca * ni ^). Array vacío si matched=false.',
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
 * the WRONG thing as "the error". `wrongStep` and the correct MC option are
 * never trusted as model prose:
 *
 *   1. `correctTerm` must be CONFIRMED (via exerciseValidator.ts's
 *      isAdditiveTermOf — a mathjs-based comparison, not a substring search)
 *      to be one of `correctForm`'s additive terms. A plain substring search
 *      (`correctForm.indexOf(correctTerm)`) used to live here — it falsely
 *      rejected valid items whose formatting merely differed (a
 *      model-authored "-5*x^2*y" not matching the literal "- 5*x^2*y" that
 *      appears inside correctForm, minus rendered as a spaced binary
 *      operator instead of glued to the coefficient), starving find_error
 *      down to 1 of 3 concepts in a real production run.
 *   2. `correctForm` must be CONFIRMED (via exerciseValidator.ts's
 *      expressionsEqual — the same mathjs engine generateExercises uses,
 *      not a second heuristic) to equal `expression`'s own value.
 *   3. `correctTerm` must be CONFIRMED different from `wrongTerm`.
 *   4. `correctTerm`/`wrongTerm` must share the same monomial "shape" (same
 *      variables and exponents — see monomialSignature's own comment for
 *      why this, not a structural inspection of a fully-simplified
 *      expression, is what actually guarantees the final answer's delta
 *      reduces to a single term), or `wrongTerm` must be a confirmed zero
 *      (a full term omission).
 * Any of these returning unconfirmed (`false`/`null`/not-found/mismatched
 * shape) rejects the whole item — find_error has no separate 'log-only'
 * mode like generateExercises's math validator, an item that can't be
 * confirmed correct is never shown. Exported for testing without mocking
 * the SDK.
 *
 * `correctForm`/`wrongStep` in the returned FindErrorResult are NOT the raw
 * unsimplified step text — they're the COMBINED (via combineLikeTerms —
 * exerciseValidator.ts's deterministic, non-simplify()-based term combiner)
 * FINAL answers, since the student is meant to see "a student got this
 * final answer, find the error", not an intermediate expansion. Kept under
 * the same field names to avoid touching assemble.ts/the frontend, which
 * only ever read them as "the correct thing"/"the wrong thing" — see
 * FindErrorResult's own comment.
 */
export function reconcileFindError(item: RawFindErrorItem): FindErrorResult | null {
  if (!item.matched) return null;

  const expression = sanitizeMathText(item.expression).trim();
  const correctForm = sanitizeMathText(item.correctForm).trim();
  const correctTerm = sanitizeMathText(item.correctTerm).trim();
  const wrongTerm = sanitizeMathText(item.wrongTerm).trim();
  // lightPrettyPrint acá también — red de seguridad uniforme sobre TODO
  // texto de opción (correcta + distractores), por si el modelo no siguió
  // la instrucción de notación de alumno en su prosa libre.
  const errorDistractors = (item.errorDistractors ?? [])
    .map((d) => lightPrettyPrint(sanitizeMathText(d).trim()))
    .filter((d) => d.length > 0);

  if (!expression || !correctForm || !correctTerm || !wrongTerm) return null;
  if (errorDistractors.length < 2) return null;

  const correctTermMathjs = toMathjsSyntax(correctTerm);
  const wrongTermMathjs = toMathjsSyntax(wrongTerm);
  // combineLikeTerms doubles as a safe single-term pretty-printer here (a
  // lone monomial is just "one group, nothing to combine") — never uses
  // simplify() internally, unlike the old toDisplayMath-based version, so
  // there's no risk of the same factoring corruption Fix 2a exists to fix.
  const correctTermDisplay = combineLikeTerms(correctTermMathjs);
  const wrongTermDisplay = combineLikeTerms(wrongTermMathjs);
  // Voz cercana, por tipo de error — nunca texto libre del modelo (ver
  // buildErrorExplanation's own comment).
  const errorExplanation = lightPrettyPrint(buildErrorExplanation(correctTermMathjs, wrongTermMathjs, correctTermDisplay, wrongTermDisplay));

  // Cheap format checks, before the more expensive mathjs evaluation below.
  const alternatives = [errorExplanation, ...errorDistractors.slice(0, 2)];
  const distinctCount = new Set(alternatives.map(normalizeForDedupe)).size;
  if (distinctCount < alternatives.length) {
    console.warn(`[FindError] descartado (formato) — errorExplanation/errorDistractors tienen duplicados o casi-duplicados: ${JSON.stringify(alternatives)}`);
    return null;
  }
  if (errorDistractors.some((a) => ORDER_ERROR_RE.test(a))) {
    console.warn(`[FindError] descartado (reason=orden-invalido) — un diagnóstico menciona reordenar/mal ubicar términos, que no es un error real: ${JSON.stringify(alternatives)}`);
    return null;
  }
  // A distractor mentioning correctTerm would be a second (encubierta)
  // description of the SAME term the correct option already covers — best
  // effort literal check (both notations), not semantic.
  if (errorDistractors.slice(0, 2).some((d) => d.includes(correctTerm) || d.includes(correctTermDisplay))) {
    console.warn(`[FindError] descartado (formato) — un distractor menciona correctTerm "${correctTermDisplay}", sería una segunda "correcta" encubierta.`);
    return null;
  }

  const exprMathjs = toMathjsSyntax(expression);
  const formMathjs = toMathjsSyntax(correctForm);

  const formVsExpr = expressionsEqual(formMathjs, exprMathjs, {});
  if (formVsExpr === false) {
    console.warn(`[FindError] descartado (invalid) — correctForm no resuelve expression. expression="${expression}" correctForm="${correctForm}"`);
    return null;
  }
  if (formVsExpr === null) {
    console.warn(`[FindError] descartado (unverifiable) — no se pudo comparar correctForm vs expression. expression="${expression}" correctForm="${correctForm}"`);
    return null;
  }

  // Bug 1 fix: confirms correctTerm is MATHEMATICALLY one of correctForm's
  // additive terms — replaces a plain substring search
  // (correctForm.indexOf(correctTerm)), which was fragile to formatting (a
  // model-authored "-5*x^2*y" failing to match the literal "- 5*x^2*y" that
  // appears inside correctForm, minus rendered as a spaced binary operator
  // instead of glued to the coefficient — a real false-reject seen in
  // production logs, starving find_error down to 1 of 3 concepts).
  if (!isAdditiveTermOf(formMathjs, correctTermMathjs)) {
    console.warn(`[FindError] descartado (invalid) — correctTerm "${correctTerm}" no es un término de correctForm "${correctForm}" (comparación matemática, no substring). `);
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

  // The single-term-delta guarantee (Fix 3) — see monomialSignature's own
  // comment for why this shape comparison, not a structural check on a
  // simplified full expression, is what's actually reliable here.
  const correctSig = monomialSignature(correctTermMathjs);
  const wrongSig = isZeroValue(wrongTermMathjs) ? correctSig : monomialSignature(wrongTermMathjs);
  if (correctSig === null || wrongSig === null || correctSig !== wrongSig) {
    console.warn(`[FindError] descartado (invalid) — correctTerm y wrongTerm no comparten la misma parte literal (y wrongTerm no es una omisión total) — el resultado final no tendría un delta de un solo término. correctTerm="${correctTerm}" wrongTerm="${wrongTerm}"`);
    return null;
  }

  // Bug 1's second half: wrongStep is now derived MATHEMATICALLY
  // (correctForm − correctTerm + wrongTerm) instead of by text substitution
  // — formatting (spacing, glued vs spaced signs) can never break this,
  // since it's an arithmetic expression, not a string edit.
  const wrongMathjs = `(${formMathjs}) - (${correctTermMathjs}) + (${wrongTermMathjs})`;

  return {
    conceptId: item.conceptId,
    expression,
    // Bug 2 fix: combineLikeTerms (deterministic, never simplify()) instead
    // of toDisplayMath — the student sees a genuinely combined final
    // answer, with every coefficient intact.
    correctForm: combineLikeTerms(formMathjs),
    wrongStep: combineLikeTerms(wrongMathjs),
    correctTerm: correctTermDisplay,
    wrongTerm: wrongTermDisplay,
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
