import OpenAI from 'openai';
import { config } from '../../config.js';
import { withOpenAIRetry } from '../../services/openaiRetry.js';
import { recordUsage } from '../../services/usageTracking.js';
import type { KnowledgeConcept } from './types.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

/** One multiple-choice question generated for a single concept. */
export interface DistractorSet {
  question: string;
  correctText: string;
  distractors: string[];
}

const SYSTEM_PROMPT = `Eres un diseñador de preguntas de opción múltiple para estudiantes chilenos de enseñanza media.
Para cada concepto que se te entregue, genera UNA pregunta de opción múltiple con su respuesta correcta y
exactamente 3 distractores (opciones incorrectas) del mismo dominio temático.
Los distractores deben ser plausibles: alguien que no domine el concepto podría dudar entre ellos y la
respuesta correcta. Nunca uses distractores obviamente falsos, absurdos o "trampa" por ambigüedad de redacción.
Responde los ítems en el MISMO ORDEN en que se listan los conceptos, uno por concepto, sin omitir ninguno.`;

type ConceptInput = Pick<KnowledgeConcept, 'name' | 'definition' | 'distinctiveTrait'>;

function buildUserPrompt(concepts: ConceptInput[]): string {
  return `EJEMPLOS DE BUENOS DISTRACTORES:

Concepto: "Fotosíntesis" (proceso por el cual las plantas producen glucosa usando luz solar, agua y CO₂)
Pregunta: "¿Qué producto libera la fotosíntesis como subproducto?"
Correcta: "Oxígeno"
Distractores buenos: ["Dióxido de carbono", "Nitrógeno", "Glucosa"] — son productos o reactivos reales de
procesos biológicos relacionados, no opciones absurdas como "Oro" o "Agua salada".

Concepto: "Monomio" (expresión algebraica de un solo término)
Pregunta: "¿Cuál de las siguientes expresiones es un monomio?"
Correcta: "5x²"
Distractores buenos: ["3x + 2", "x² - 1", "2x/y + 5"] — son expresiones algebraicas reales con más de un
término: el mismo tipo de confusión que tendría un estudiante que no domina el concepto.

CONCEPTOS A PROCESAR (en este orden, una pregunta por cada uno):
${concepts.map((c, i) => `${i + 1}. "${c.name}" — definición: ${c.definition} — rasgo distintivo: ${c.distinctiveTrait}`).join('\n')}`;
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

/**
 * Builds the strict json_schema response_format for a batch of exactly
 * `itemCount` distractor sets. `itemCount` is baked into `minItems`/`maxItems`
 * so the model is structurally bound to return one item per input concept —
 * the mapping back to `conceptId` is then done by array position in code,
 * since the model is only ever shown name/definition/distinctiveTrait, never
 * an id to echo back.
 */
function buildDistractorsSchema(itemCount: number) {
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
          required: ['question', 'correctText', 'distractors'],
          properties: {
            question: {
              type: 'string',
              description: 'La pregunta de opción múltiple para este concepto.',
            },
            correctText: {
              type: 'string',
              description: 'El texto de la respuesta correcta.',
            },
            distractors: {
              type: 'array',
              minItems: 3,
              maxItems: 3,
              items: { type: 'string' },
              description: 'Exactamente 3 opciones incorrectas, plausibles y del mismo dominio.',
            },
          },
        },
      },
    },
  };

  return {
    type: 'json_schema',
    json_schema: {
      name: 'distractor_set_list',
      strict: true,
      schema,
    },
  } as const;
}

/**
 * Generates one multiple-choice question (with 3 plausible distractors) per
 * concept, in a single AI call covering every concept at once. Only
 * `name`/`definition`/`distinctiveTrait` are sent to the model — never the
 * full transcription — keeping this call cheap regardless of source
 * document size.
 *
 * @param concepts Full concept list to draw from.
 * @param count How many of `concepts` (from the start of the list) to generate questions for.
 */
export async function generateDistractors(
  concepts: KnowledgeConcept[],
  count: number,
): Promise<Record<string, DistractorSet>> {
  const selected = concepts.slice(0, Math.max(0, count));
  if (selected.length === 0) {
    return {};
  }

  const userPrompt = buildUserPrompt(
    selected.map(({ name, definition, distinctiveTrait }) => ({ name, definition, distinctiveTrait })),
  );

  logPrompt('Distractors-System', SYSTEM_PROMPT);
  logPrompt('Distractors-User', userPrompt);

  const raw = await withOpenAIRetry(async () => {
    const response = await openai.chat.completions.create({
      model: config.openai_model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: buildDistractorsSchema(selected.length),
    });
    recordUsage('Distractors', response.usage);
    return response.choices?.[0]?.message?.content ?? '';
  }, 'Distractors', 2);

  if (!raw) {
    throw new Error('[Distractors] empty response from model');
  }

  const parsed = JSON.parse(raw) as { items: DistractorSet[] };

  // Strict json_schema mode enforces shape (types/required/additionalProperties)
  // but NOT string content — the model can satisfy `type: "string"` with `""`.
  // A concept with an empty correctText/distractor renders as a blank option
  // with a visible letter but no text (REFUERZO/CHECKPOINT reported bug), with
  // no crash to signal it. Validate content here so every consumer downstream
  // (buildQuestions/buildSummarySlides/buildDesafio) gets a clean `!d` skip via
  // their existing "no distractor for this concept" branch, instead of each
  // one needing its own content check.
  const result: Record<string, DistractorSet> = {};
  selected.forEach((concept, i) => {
    const item = parsed.items[i];
    const isValid =
      !!item?.question?.trim() &&
      !!item?.correctText?.trim() &&
      Array.isArray(item?.distractors) &&
      item.distractors.length === 3 &&
      item.distractors.every((d) => !!d?.trim());
    if (isValid) {
      result[concept.id] = item;
    } else {
      console.warn(`[Distractors] Concept "${concept.name}" got empty/malformed distractor content from the model — skipping its interactive slides.`);
    }
  });
  return result;
}
