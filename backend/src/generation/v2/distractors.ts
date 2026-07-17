import OpenAI from 'openai';
import { config } from '../../config.js';
import { withOpenAIRetry } from '../../services/openaiRetry.js';
import { recordUsage } from '../../services/usageTracking.js';
import { sanitizeMathText } from '../../services/mathNotation.js';
import type { KnowledgeConcept } from './types.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

/** One multiple-choice question generated for a single concept. */
export interface DistractorSet {
  question: string;
  correctText: string;
  distractors: { text: string; explanation: string }[];
}

/**
 * Strict json_schema mode enforces JSON shape (types/required/
 * additionalProperties) but NOT string content — the model can satisfy
 * `type: "string"` with `""`. A concept with an empty correctText/distractor
 * used to render as a blank option (a visible lettered circle with no text),
 * with nothing to signal the failure. Pure so it's directly unit-testable
 * without mocking the OpenAI SDK, same pattern as procedural.ts's
 * reconcileWorkedExample.
 */
export function isValidDistractorSet(item: DistractorSet | null | undefined): item is DistractorSet {
  return (
    !!item?.question?.trim() &&
    !!item?.correctText?.trim() &&
    Array.isArray(item?.distractors) &&
    item.distractors.length === 3 &&
    item.distractors.every((d) => !!d?.text?.trim() && !!d?.explanation?.trim())
  );
}

/** Defensive normalization applied to every model-authored string field —
 * the SYSTEM_PROMPT forbids LaTeX, but prompt compliance alone isn't
 * reliable enough (the model still occasionally emits \frac{}{} etc.), so
 * this converts any that slips through to the plain-text notation MathText
 * actually renders. */
function sanitizeDistractorSet(item: DistractorSet): DistractorSet {
  return {
    question: sanitizeMathText(item.question),
    correctText: sanitizeMathText(item.correctText),
    distractors: item.distractors?.map((d) => ({
      text: sanitizeMathText(d.text),
      explanation: sanitizeMathText(d.explanation),
    })),
  };
}

const SYSTEM_PROMPT = `Eres un diseñador de preguntas de opción múltiple para estudiantes chilenos de enseñanza media.
Para cada concepto que se te entregue, genera UNA pregunta de opción múltiple con su respuesta correcta y
exactamente 3 distractores (opciones incorrectas) del mismo dominio temático.
Los distractores deben ser plausibles: alguien que no domine el concepto podría dudar entre ellos y la
respuesta correcta. Nunca uses distractores obviamente falsos, absurdos o "trampa" por ambigüedad de redacción.
Prefiere enunciados CONCRETOS o de escenario en vez de enunciados meta-abstractos que solo piden identificar
la etiqueta de un concepto:
  ✗ META-ABSTRACTO: "¿A cuál de estos conceptos corresponde esta característica: 'Es el proceso general de
    cambio...'?"
  ✓ CONCRETO/ESCENARIO: "Encuentras el esqueleto de un animal antiguo dentro de una roca sedimentaria. ¿Qué
    evidencia de la evolución estás viendo?" (correcta: Registro fósil)
El escenario debe ser correcto y estar anclado al concepto/material — nunca inventes hechos solo para que
suene vívido. Si un concepto no admite un escenario natural, un enunciado directo y claro está bien: no
fuerces una historia donde no cabe. Esto no cambia la exactitud, la cantidad de distractores ni su
plausibilidad — solo el fraseo del enunciado se vuelve más concreto.
Cada distractor debe incluir además una explicación BREVE (máximo 20 palabras) de por qué esa opción es
incorrecta y qué la distingue de la correcta — el error conceptual específico que representa, nunca un
genérico "está mal" o "no es correcta". Tono amable, nunca de castigo o burla: es una pista para aprender, no
una corrección punitiva. El frontend la muestra tal cual como feedback real al estudiante después de responder
mal, así que debe ser específica y útil.
  ✗ GENÉRICA (prohibida): "Esta opción no es correcta."
  ✗ CON TONO DE CASTIGO (prohibida): "Incorrecto, deberías haber estudiado mejor este concepto."
  ✓ ESPECÍFICA Y AMABLE: "Los fósiles muestran restos físicos, no comparan el ADN entre especies vivas — eso
    es bioquímica comparada."
Responde los ítems en el MISMO ORDEN en que se listan los conceptos, uno por concepto, sin omitir ninguno.
NOTACIÓN MATEMÁTICA: escribe todo en texto plano, NUNCA en LaTeX. Prohibido usar backslash o comandos LaTeX
(nada de \\frac, \\left, \\right, \\(...\\), \\[...\\], ni llaves {} para agrupar). Fracciones: "2/3", nunca
"\\frac{2}{3}". Exponentes: "x^2" o "x²", nunca en llaves.`;

type ConceptInput = Pick<KnowledgeConcept, 'name' | 'definition' | 'distinctiveTrait'>;

function buildUserPrompt(concepts: ConceptInput[]): string {
  return `EJEMPLOS DE BUENOS DISTRACTORES (con su explicación):

Concepto: "Fotosíntesis" (proceso por el cual las plantas producen glucosa usando luz solar, agua y CO₂)
Pregunta: "¿Qué producto libera la fotosíntesis como subproducto?"
Correcta: "Oxígeno"
Distractores buenos:
  - "Dióxido de carbono" — explicación: "Es lo que la planta consume para la fotosíntesis, no lo que libera."
  - "Nitrógeno" — explicación: "No participa en la fotosíntesis — es parte del ciclo del nitrógeno, un
    proceso distinto."
  - "Glucosa" — explicación: "La glucosa es el alimento que produce la planta, no el subproducto liberado al
    ambiente."
Son productos o reactivos reales de procesos biológicos relacionados, no opciones absurdas como "Oro" o "Agua
salada".

Concepto: "Monomio" (expresión algebraica de un solo término)
Pregunta: "¿Cuál de las siguientes expresiones es un monomio?"
Correcta: "5x²"
Distractores buenos:
  - "3x + 2" — explicación: "Tiene dos términos separados por una suma — un monomio es un solo término."
  - "x² - 1" — explicación: "También tiene dos términos — le falta ser una sola expresión sin sumas ni restas."
  - "2x/y + 5" — explicación: "Combina una división entre variables con una suma — dos términos, no uno."
Son expresiones algebraicas reales con más de un término: el mismo tipo de confusión que tendría un
estudiante que no domina el concepto.

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
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['text', 'explanation'],
                properties: {
                  text: { type: 'string', description: 'Texto de la opción incorrecta.' },
                  explanation: { type: 'string', description: 'Por qué esta opción está mal — el error conceptual específico que representa, breve y amable, nunca genérica ni punitiva.' },
                },
              },
              description: 'Exactamente 3 opciones incorrectas, plausibles y del mismo dominio, cada una con su explicación.',
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

  const result: Record<string, DistractorSet> = {};
  selected.forEach((concept, i) => {
    const item = parsed.items[i] ? sanitizeDistractorSet(parsed.items[i]) : parsed.items[i];
    if (isValidDistractorSet(item)) {
      result[concept.id] = item;
    } else {
      console.warn(`[Distractors] Concept "${concept.name}" got empty/malformed distractor content from the model — skipping its interactive slides.`);
    }
  });
  return result;
}
