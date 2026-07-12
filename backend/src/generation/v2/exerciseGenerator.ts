import OpenAI from 'openai';
import { config } from '../../config.js';
import { withOpenAIRetry } from '../../services/openaiRetry.js';
import { recordUsage } from '../../services/usageTracking.js';
import type { KnowledgeConcept } from './types.js';

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
}

/**
 * Structural validation only (shape/non-empty) — strict json_schema mode
 * guarantees types but not non-empty content, same reasoning as
 * distractors.ts's isValidDistractorSet.
 */
export function isValidGeneratedExercise(item: GeneratedExercise | null | undefined): item is GeneratedExercise {
  return (
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
Cada ejercicio debe incluir exactamente 3 distractores plausibles, cada uno con una explicación breve del error
conceptual o de cálculo que produciría esa respuesta incorrecta, y una pista que oriente el método sin revelar
la respuesta.
Responde exactamente la cantidad de ítems solicitada, distribuidos entre los conceptos listados (algunos pueden
tener más de un ejercicio si tiene sentido).`;

function buildUserPrompt(
  concepts: Pick<KnowledgeConcept, 'name' | 'definition' | 'example'>[],
  subject: string,
  itemCount: number,
): string {
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

CONCEPTOS (genera ${itemCount} ejercicio(s) en total, con al menos uno por concepto):
${concepts.map((c, i) => `${i + 1}. "${c.name}" — definición: ${c.definition}${c.example ? ` — ejemplo: ${c.example}` : ''}`).join('\n')}`;
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
          required: ['statement', 'correctAnswer', 'distractors', 'hint', 'kind'],
          properties: {
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

const MAX_CONCEPTS_PER_CALL = 6;
const EXERCISES_PER_CONCEPT = 2;

async function generateExercisesForChunk(
  concepts: KnowledgeConcept[],
  subject: string,
  itemCount: number,
): Promise<GeneratedExercise[]> {
  if (concepts.length === 0 || itemCount <= 0) return [];

  const userPrompt = buildUserPrompt(
    concepts.map(({ name, definition, example }) => ({ name, definition, example })),
    subject,
    itemCount,
  );

  logPrompt('ExerciseGenerator-System', SYSTEM_PROMPT);
  logPrompt('ExerciseGenerator-User', userPrompt);

  const raw = await withOpenAIRetry(async () => {
    const response = await openai.chat.completions.create({
      model: config.openai_model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 2200,
      response_format: buildExerciseSchema(itemCount),
    });
    recordUsage('ExerciseGenerator', response.usage);
    return response.choices?.[0]?.message?.content ?? '';
  }, 'ExerciseGenerator', 2);

  if (!raw) {
    console.warn('[ExerciseGenerator] respuesta vacía del modelo — se omite este lote de ejercicios.');
    return [];
  }

  const parsed = JSON.parse(raw) as { items: GeneratedExercise[] };
  return parsed.items.filter((item) => {
    const ok = isValidGeneratedExercise(item);
    if (!ok) console.warn('[ExerciseGenerator] ejercicio con forma inválida/vacía descartado.');
    return ok;
  });
}

/**
 * Generates NEW practice exercises (not copied from the material) for
 * exercisable subjects. TROCEADO: each call receives only concept
 * name/definition/example — never the source document — and concepts are
 * chunked so a single call never scales with document size (the failure
 * mode that killed the legacy engine with "Premature close" errors on long
 * documents).
 *
 * ===== PUNTO DE EXTENSIÓN: capa de validación (Fase futura) =====
 * Hoy `correctAnswer` se devuelve SIN verificar que sea correcta — riesgo
 * de producto asumido en esta fase (a diferencia de workedExamples, aquí no
 * hay una respuesta ya escrita en el material contra la cual reconciliar).
 * Cuando exista un verificador (math.js para álgebra, o un segundo LLM),
 * debe llamarse justo después de esta función, antes de assemble.ts:
 *   exercises = await validateExercises(exercises);
 * Firma prevista: validateExercises(exercises: GeneratedExercise[]): Promise<GeneratedExercise[]>
 * ================================================================
 */
export async function generateExercises(
  concepts: KnowledgeConcept[],
  subject: string,
): Promise<GeneratedExercise[]> {
  if (concepts.length === 0) return [];

  const chunks: KnowledgeConcept[][] = [];
  for (let i = 0; i < concepts.length; i += MAX_CONCEPTS_PER_CALL) {
    chunks.push(concepts.slice(i, i + MAX_CONCEPTS_PER_CALL));
  }

  // +1 on the first chunk only, reserved for the mission's final_challenge
  // boss slide so it isn't left without a generated exercise of its own.
  const results = await Promise.all(
    chunks.map((chunk, idx) =>
      generateExercisesForChunk(chunk, subject, chunk.length * EXERCISES_PER_CONCEPT + (idx === 0 ? 1 : 0)),
    ),
  );
  return results.flat();
}
