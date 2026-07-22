import OpenAI from 'openai';
import { config } from '../../config.js';
import { withOpenAIRetry } from '../../services/openaiRetry.js';
import { recordUsage } from '../../services/usageTracking.js';
import { sanitizeMathText } from '../../services/mathNotation.js';
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
la respuesta dada sin haber razonado el camino.
Los pasos son TELEGRÁFICOS pero claros: una sola idea por paso, mostrando la operación concreta — el
estudiante debe poder leer cada paso de un vistazo, no estudiarlo como un párrafo.
NOTACIÓN MATEMÁTICA: escribe todo en texto plano, NUNCA en LaTeX. Prohibido usar backslash o comandos LaTeX
(nada de \\frac, \\left, \\right, \\(...\\), \\[...\\], ni llaves {} para agrupar). Fracciones: "2/3", nunca
"\\frac{2}{3}". Exponentes: "x^2" o "x²", nunca en llaves.`;

function buildUserPrompt(examples: WorkedExample[]): string {
  return `EJERCICIOS YA RESUELTOS (enunciado y respuesta correcta, en este orden — responde en el mismo orden,
un ítem por ejercicio, sin omitir ninguno):

${examples.map((e, i) => `${i + 1}. Enunciado: "${e.statement}" — Respuesta correcta: "${e.answer}"`).join('\n')}

INSTRUCCIONES:
1. Para cada ejercicio, escribe entre 2 y 4 pasos que muestren el camino desde el enunciado hasta la
   respuesta. Cada paso:
   - Máximo ~12 palabras — que quepa en 1 línea, nunca más de 2. Pensado para un estudiante de 14-18 años
     que no quiere leer texto largo: breve, pero no críptico.
   - UNA sola idea. Si un paso tiene dos ideas, sepáralo en dos pasos o recórtalo a la idea principal.
   - Muestra la OPERACIÓN concreta, no la describas en prosa larga.
   - Tono directo y simple: sin relleno ("como podemos ver", "es importante notar que…"), sin jerga
     innecesaria, pero sin sonar infantil.
   ✓ BREVE (así): "Multiplica los binomios: x² + 4x + 6x + 24.", "Suma los semejantes: 4x + 6x = 10x.",
     "Resta x²: se cancelan, queda 10x + 24."
   ✗ LARGO (evitar): "Aplica la propiedad distributiva para multiplicar (x + 6)(x + 4): multiplica x por
     x, x por 4, 6 por x y 6 por 4, obteniendo así la suma de los productos."
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
              maxItems: 4,
              items: { type: 'string' },
              description: 'Very short steps (max ~12 words each, one idea per step) showing the concrete operation from statement to answer.',
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
// strip whitespace, normalize common unicode math symbols to ASCII, drop
// parentheses, and strip a TRAILING unit suffix (never a bare single letter
// like "m" — that's indistinguishable from an algebra variable, e.g. "7m").
// Only ever used for the internal validation comparison below — never
// applied to text actually shown to the student.
const TRAILING_UNIT_RE = /(cm2|cm²|m2|m²|km|mm|kg|g|s)$/i;

function normalizeForMathComparison(s: string): string {
  return s
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/−/g, '-')
    .replace(/×/g, '*')
    .replace(/·/g, '*')
    .replace(/[()]/g, '')
    .replace(/\.+$/, '')
    .replace(TRAILING_UNIT_RE, '');
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

// Spanish framing phrases that commonly wrap a final result in prose
// ("Por lo tanto, la expresión ... es X.", "El resultado ... es X.",
// "Resultado: X"). `.*?\bes\b` is deliberately unbounded (any number of
// words) since real sentences vary a lot in length between "expresión"/
// "resultado" and the "es" that introduces the actual value. Global so
// extractMathResult can find the LAST occurrence when several appear.
const RESULT_MARKER_RE = /(?:por\s+lo\s+tanto|en\s+consecuencia|la\s+expresi[oó]n.*?\bes\b|el\s+resultado.*?\bes\b|resultado\s*:|respuesta\s*:|resp\s*:|es\s+igual\s+a)\s*[,:]?\s*/gi;

/**
 * Best-effort extraction of the bare mathematical tail of a result string —
 * NOT a parser, just enough to strip the two shapes that break naive string
 * comparison: an "a = b = c" chain (keep only the last "c") and Spanish
 * framing prose ("Por lo tanto, la expresión ... es X."). Falls back to the
 * original string untouched when nothing recognizable is found — never
 * invents or removes content that isn't clearly wrapping/chaining.
 * Exported for testing.
 */
export function extractMathResult(s: string): string {
  let out = s.trim();

  const lastEq = out.lastIndexOf('=');
  if (lastEq !== -1 && lastEq < out.length - 1) {
    out = out.slice(lastEq + 1).trim();
  }

  RESULT_MARKER_RE.lastIndex = 0;
  let lastEnd = -1;
  let match: RegExpExecArray | null;
  while ((match = RESULT_MARKER_RE.exec(out)) !== null) {
    lastEnd = match.index + match[0].length;
    if (match[0].length === 0) RESULT_MARKER_RE.lastIndex++;
  }
  if (lastEnd !== -1) out = out.slice(lastEnd);

  out = out.replace(/[.\s]+$/, '').trim();
  return out.length > 0 ? out : s.trim();
}

/** Exported for testing. Compares two results with light math-aware normalization — never a full CAS, just enough to catch trivial reordering/whitespace/case differences, plus a "clean result wrapped in prose/units" case (see extractMathResult). */
export function resultsMatch(a: string, b: string): boolean {
  if (normalizeForMathComparison(a) === normalizeForMathComparison(b)) return true;
  if (sortedTermsKey(a) === sortedTermsKey(b)) return true;

  // Wrapped-in-prose case: a clean derived result ("10x + 24") is often the
  // literal tail of a longer answer written as prose with units/framing
  // ("...la expresión...es (10x + 24) cm²."). Comparing the EXTRACTED math
  // tail of each side by containment (not equality) catches this without
  // turning into a full CAS. The length>=3 guard on BOTH sides blocks
  // trivial-substring false positives (a short "5" inside "125", or an
  // empty string — which `"x".includes("")` would otherwise always match).
  const na = normalizeForMathComparison(extractMathResult(a));
  const nb = normalizeForMathComparison(extractMathResult(b));
  if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) return true;

  return false;
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

  // Sanitized before reconciliation too — the SYSTEM_PROMPT forbids LaTeX but
  // prompt compliance alone isn't reliable, and an un-sanitized resultShown
  // would also spuriously fail resultsMatch() against the material's plain-
  // text answer even when they're mathematically identical.
  const results = examples.map((example, i) =>
    reconcileWorkedExample(
      example,
      parsed.items[i].steps.map(sanitizeMathText),
      sanitizeMathText(parsed.items[i].resultShown),
    ),
  );

  const validatedCount = results.filter((r) => r.steps !== null).length;
  console.log(
    `[Procedural] ${validatedCount}/${results.length} worked examples validados — ${results.length - validatedCount} cayeron a respuesta sin pasos (B-mínima).`,
  );

  return results;
}
