/**
 * Desafío generation service.
 *
 * Pipeline:
 *   1. classifyContent()       — determina tipo pedagógico y detecta habilidades
 *   2. buildDesafioPrompt()    — construye el prompt para la IA
 *   3. generateDesafioContent()— llama a OpenAI y valida el JSON
 *   4. buildDesafioSession()   — ensambla el DesafioSession final
 *
 * Reutiliza:
 *   - transcriptionService.ts (upstream — la transcripción llega ya procesada)
 *   - classifyContent() de pedagogicalClassifier.ts
 *   - Tipo A concept extraction (implementada en el prompt conceptual — la IA
 *     hace el mismo análisis de Fase 1–4 que en buildConceptualPrompt)
 */

import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { classifyContent } from './pedagogicalClassifier.js';
import { config } from '../config.js';

// Local copies of shared types — kept in sync with shared/desafio.ts
type DesafioSlideType =
  | 'discovery_challenge'
  | 'instant_feedback'
  | 'insight'
  | 'reinforcement_challenge'
  | 'boss_loop'
  | 'mastery_screen';

interface DesafioChoice { letter: 'A' | 'B' | 'C'; text: string; }

interface DesafioSlide {
  type: DesafioSlideType;
  conceptIndex: number;
  conceptName: string;
  emoji?: string;
  question?: string;
  choices?: DesafioChoice[];
  correctAnswer?: 'A' | 'B' | 'C';
  explanation?: string;
  wrongHints?: Record<string, string>;
  title?: string;
  body?: string;
  conceptsCovered?: string[];
}

interface DesafioSession {
  id: string;
  topic: string;
  conceptCount: number;
  slides: DesafioSlide[];
}

const openai = new OpenAI({ apiKey: config.openai_api_key });

function normalizeText(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── JSON schema emitido al modelo ────────────────────────────────────────────

const DESAFIO_SCHEMA = `
SCHEMA JSON — devuelve EXACTAMENTE esta estructura, sin texto adicional:
{
  "topic": string,
  "slides": [
    // Para cada concepto Tipo A (repetir el bloque de 4 slides):
    {
      "type": "discovery_challenge",
      "conceptIndex": number (0-based),
      "conceptName": string,
      "emoji": string,
      "question": string,
      "choices": [
        { "letter": "A", "text": string },
        { "letter": "B", "text": string },
        { "letter": "C", "text": string }
      ],
      "correctAnswer": "A" | "B" | "C",
      "explanation": string,
      "wrongHints": { "A": string, "B": string } // solo letras incorrectas
    },
    {
      "type": "instant_feedback",
      "conceptIndex": number,
      "conceptName": string,
      "title": string,
      "body": string
    },
    {
      "type": "insight",
      "conceptIndex": number,
      "conceptName": string,
      "emoji": string,
      "title": string,
      "body": string
    },
    {
      "type": "reinforcement_challenge",
      "conceptIndex": number,
      "conceptName": string,
      "question": string,
      "choices": [ { "letter": "A", ... }, { "letter": "B", ... }, { "letter": "C", ... } ],
      "correctAnswer": "A" | "B" | "C",
      "explanation": string,
      "wrongHints": { ... }
    },
    // Al terminar todos los conceptos:
    {
      "type": "boss_loop",
      "conceptIndex": -1,
      "conceptName": "Boss Battle",
      "emoji": "🏆",
      "question": string,
      "choices": [ { "letter": "A", ... }, { "letter": "B", ... }, { "letter": "C", ... } ],
      "correctAnswer": "A" | "B" | "C",
      "explanation": string,
      "wrongHints": { ... }
    },
    {
      "type": "mastery_screen",
      "conceptIndex": -1,
      "conceptName": "Completado",
      "title": string,
      "body": string,
      "conceptsCovered": [string, ...]
    }
  ]
}`;

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildDesafioPrompt(transcription: string, curso: string): string {
  return `Eres un diseñador de sesiones de aprendizaje para estudiantes chilenos de enseñanza media (${curso}).
Tu tarea es generar un modo "Desafío" a partir de una transcripción de apuntes.

⚠️ REGLA CRÍTICA DE CONTENIDO:
TODO el contenido DEBE derivarse EXCLUSIVAMENTE de la transcripción.
NO introduzcas conceptos, términos ni ejemplos ajenos a la transcripción.
DEVUELVE SOLO JSON VÁLIDO. Sin texto adicional. Todo en español.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 1 — EXTRACCIÓN DE CONCEPTOS TIPO A [MENTAL]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Analiza la transcripción e identifica los CONCEPTOS TIPO A:
  → Su ausencia impide alcanzar el objetivo de aprendizaje del documento
  → Tiene significado propio y puede evaluarse de forma independiente
  → Requiere comprensión profunda, no solo memorización

LÍMITE: máximo 4 conceptos Tipo A.
Documento corto (< 400 palabras) → máximo 2 conceptos.
Si hay más candidatos → selecciona los más esenciales para el objetivo de aprendizaje.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 2 — DISEÑO DEL DESAFÍO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Para CADA concepto Tipo A, genera exactamente 4 slides en este orden:

[1] discovery_challenge — PREGUNTA ANTES DEL INSIGHT
  El estudiante DESCUBRE el concepto respondiendo una pregunta concreta.
  - question: pregunta de descubrimiento con ejemplo del documento. Max 20 palabras.
  - choices: EXACTAMENTE 3 opciones (A, B, C). Una correcta. Dos distractores plausibles.
    Max 10 palabras por opción. Variar posición de la respuesta correcta.
  - correctAnswer: "A", "B" o "C"
  - explanation: por qué esa respuesta es correcta. Texto plano, max 100 caracteres.
    NO usar "Correcto" ni emojis de resultado.
  - wrongHints: para cada letra incorrecta: "Elegiste X porque... La pregunta buscaba..."
    Exactamente 2 oraciones, 20-40 palabras total por hint.
  - emoji: emoji representativo del concepto

[2] instant_feedback — PUENTE ENTRE PREGUNTA E INSIGHT
  Slide no interactiva. Aparece DESPUÉS de que el estudiante responde el discovery_challenge.
  Conecta la pregunta recién respondida con el concepto que viene.
  - title: "¿Por qué?" o nombre corto del concepto (max 5 palabras)
  - body: explica en 1-2 oraciones qué estaba probando el discovery_challenge y
    anticipa el concepto del insight. Max 35 palabras.
    Ejemplo: "El desafío probaba si reconocías cuándo un número es periódico.
    La respuesta correcta era B porque el residuo se repite → hay período."

[3] insight — EL CONCEPTO COMPLETO
  Slide no interactiva. Explica el concepto de forma directa y memorable.
  - title: nombre del concepto (max 5 palabras)
  - body: definición concisa + analogía cotidiana. Formato: "Idea principal. Analogía."
    Max 35 palabras total. Sin lenguaje académico.
  - emoji: emoji que representa el concepto

[4] reinforcement_challenge — APLICA EL CONCEPTO
  Igual que discovery_challenge pero en una SITUACIÓN DIFERENTE. Mismo concepto, nuevo contexto.
  PROHIBIDO: repetir la misma pregunta o contexto del discovery_challenge.
  - question: nueva situación, mismo concepto. Max 20 palabras.
  - choices, correctAnswer, explanation, wrongHints: mismas reglas que discovery_challenge.
  ⚠️ SIN emoji (omitir el campo)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 3 — BOSS LOOP Y MASTERY SCREEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Después de todos los conceptos, genera:

[boss_loop] — DESAFÍO INTEGRADOR
  Una sola pregunta que solo puede responderse dominando TODOS los conceptos enseñados.
  - question: pregunta integradora. Max 30 palabras.
    Debe involucrar al menos el 70% de los conceptos Tipo A.
  - choices: 3 opciones (A, B, C). Todas plausibles para alguien que estudió el material.
  - correctAnswer, explanation, wrongHints: mismas reglas que arriba.

[mastery_screen] — PANTALLA FINAL
  - title: "¡Desafío superado!" o frase de celebración (max 6 palabras)
  - body: 1-2 oraciones celebrando lo aprendido. Max 25 palabras.
  - conceptsCovered: lista de nombres exactos de los conceptos enseñados
    (mismos nombres que en los campos conceptName de los insights).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS DE CALIDAD (aplican a TODAS las preguntas interactivas):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Distractores plausibles: un estudiante que no estudió el tema no puede eliminarlos por descarte.
• Sin "Todas las anteriores" ni "Ninguna de las anteriores".
• La respuesta correcta NO puede ser siempre la más larga.
• Distribuir posición de correctAnswer: no siempre A, no siempre B.
• wrongHints OBLIGATORIOS para cada letra incorrecta. Formato:
  Oración 1: "Elegiste [descripción de la opción incorrecta]."
  Oración 2: "La pregunta buscaba [criterio exacto de la pregunta]."

ADAPTACIÓN POR CURSO:
  1° Medio: vocabulario simple, situaciones cotidianas, sin razonamiento multivariable.
  2° Medio: lenguaje claro, aplicación directa, contextos familiares.
  3° Medio: razonamiento relacional, vocabulario técnico moderado.
  4° Medio: pensamiento crítico, profundidad preuniversitaria.

Transcripción:
${normalizeText(transcription)}

${DESAFIO_SCHEMA}`;
}

// ── Validation ────────────────────────────────────────────────────────────────

const INTERACTIVE_TYPES = new Set<DesafioSlideType>([
  'discovery_challenge',
  'reinforcement_challenge',
  'boss_loop',
]);

function validateSlide(slide: unknown, idx: number): DesafioSlide {
  const s = slide as Partial<DesafioSlide>;
  if (!s.type) throw new Error(`Slide ${idx}: missing type`);

  const VALID_TYPES: DesafioSlideType[] = [
    'discovery_challenge', 'instant_feedback', 'insight',
    'reinforcement_challenge', 'boss_loop', 'mastery_screen',
  ];
  if (!VALID_TYPES.includes(s.type)) throw new Error(`Slide ${idx}: invalid type "${s.type}"`);

  if (INTERACTIVE_TYPES.has(s.type)) {
    if (!s.question) throw new Error(`Slide ${idx} (${s.type}): missing question`);
    if (!Array.isArray(s.choices) || s.choices.length < 3) {
      throw new Error(`Slide ${idx} (${s.type}): choices must have 3 items`);
    }
    if (!s.correctAnswer) throw new Error(`Slide ${idx} (${s.type}): missing correctAnswer`);
  }

  return {
    type:         s.type,
    conceptIndex: typeof s.conceptIndex === 'number' ? s.conceptIndex : -1,
    conceptName:  s.conceptName ?? '',
    emoji:        s.emoji,
    question:     s.question,
    choices:      s.choices,
    correctAnswer:s.correctAnswer,
    explanation:  s.explanation,
    wrongHints:   s.wrongHints,
    title:        s.title,
    body:         s.body,
    conceptsCovered: s.conceptsCovered,
  };
}

function parseDesafioJson(raw: string): { topic: string; slides: DesafioSlide[] } {
  const cleaned = raw
    .replace(/```json\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const startBrace = cleaned.indexOf('{');
    const endBrace   = cleaned.lastIndexOf('}');
    if (startBrace >= 0 && endBrace > startBrace) {
      parsed = JSON.parse(cleaned.slice(startBrace, endBrace + 1));
    } else {
      throw new Error('No valid JSON found in response');
    }
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.slides)) throw new Error('Missing slides array');
  if (typeof obj.topic !== 'string') throw new Error('Missing topic string');

  const slides = (obj.slides as unknown[]).map((s, i) => validateSlide(s, i));

  // Ensure sequence ends with mastery_screen
  if (slides.length === 0 || slides[slides.length - 1].type !== 'mastery_screen') {
    throw new Error('Last slide must be mastery_screen');
  }

  return { topic: obj.topic as string, slides };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DesafioGenerationResult {
  session: DesafioSession;
  pedagogicalType: string;
}

export async function generateDesafioContent(
  transcription: string,
  curso: string,
): Promise<DesafioGenerationResult> {
  // Audit the document structure to inform generation
  const classification = classifyContent(transcription);

  const prompt = buildDesafioPrompt(transcription, curso);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 4096,
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  const { topic, slides } = parseDesafioJson(raw);

  const conceptCount = slides.filter(s => s.type === 'insight').length;

  const session: DesafioSession = {
    id:           randomUUID(),
    topic,
    conceptCount,
    slides,
  };

  return { session, pedagogicalType: classification.type };
}

export function buildDesafioSession(
  session: DesafioSession,
): DesafioSession {
  return session;
}
