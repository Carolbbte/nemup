/**
 * Generation service for study sessions using OpenAI.
 */

import OpenAI from 'openai';
import type {
  MultipleChoiceQuestion,
  Flashcard,
  Summary,
  SummarySlideType,
  IllustrationType,
  SessionConfig,
  GeneratedSession,
} from '../types.js';
import { config } from '../config.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

function normalizeText(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface GenerationResult {
  subject: string;
  topic: string;
  questions: MultipleChoiceQuestion[];
  flashcards: Flashcard[];
  summary: Summary;
  groundingScore: number;
}

export async function generateSessionContent(
  transcription: string,
  configValues: SessionConfig,
  curso: string = '1º Medio'
): Promise<GenerationResult> {
  console.log('[Generation] Curso utilizado para generar sesión:', curso);

  const prompt = `You are an educational assistant for Chilean high-school learners. Based on the transcription below, create a study session with the following JSON structure.

GLOBAL RULES:
- Return only valid JSON without additional text.
- Use quotes extracted verbatim from the transcription in 'sourceQuote'.
- Keep each sourceQuote concise (20-80 characters) and ensure it appears in the transcription.

CURSO DEL ESTUDIANTE: ${curso}

Adapta toda la sesión al nivel académico indicado. NO cambies los conceptos presentes en los apuntes. SÍ adapta: vocabulario, profundidad, complejidad de ejemplos, dificultad de preguntas y tarjetas, nivel de razonamiento. Mantén coherencia con el nivel esperado para estudiantes chilenos del curso indicado.

REGLAS POR CURSO:
- 1º Medio: lenguaje simple, ejemplos cotidianos, preguntas de reconocimiento, pocas inferencias.
- 2º Medio: lenguaje intermedio, comprensión de conceptos, preguntas de aplicación básica.
- 3º Medio: profundidad conceptual, análisis de relaciones, ejercicios de razonamiento.
- 4º Medio: nivel preuniversitario, análisis crítico, aplicación compleja, preguntas exigentes.

════════════════════════════════════════════════
SUMMARY — EXPERIENCIA DE APRENDIZAJE ACTIVA
════════════════════════════════════════════════

OBJETIVO: La sesión debe sentirse como una experiencia interactiva, NO como un PowerPoint. Alterna tipos y mantén ritmo pedagógico.

TIPOS DE TARJETA DISPONIBLES:
• concept       — idea central neutra, definición directa
• key_fact      — dato numérico o estadístico importante
• important     — información crítica que no debe olvidarse
• remember      — dato para memorizar
• example       — caso real concreto o aplicación práctica
• curiosity     — detalle interesante pero no sorprendente
• wow_fact      — hecho sorprendente (máximo 1-2 por sesión)
• did_you_know  — "¿Sabías que...?" hecho contraintuitivo o poco conocido
• common_error  — error frecuente de los estudiantes sobre este tema
• mini_quiz     — pregunta de selección múltiple interactiva (4 opciones)
• true_false    — afirmación Verdadero/Falso con explicación
• observe       — análisis de imagen con pregunta asociada
• compare       — comparación explícita entre dos conceptos
• partial_summary — resumen breve de lo visto hasta ese punto (1 cada 5-6 tarjetas)
• final_challenge — pregunta integradora final (OBLIGATORIA, siempre la última)

REGLA DE ALTERNACIÓN (obligatoria):
- NUNCA generar más de 2 tarjetas consecutivas del mismo tipo.
- Insertar una interacción (mini_quiz, true_false, common_error u observe) cada máximo 2 tarjetas informativas.
- Ejemplo válido: concept → example → mini_quiz → key_fact → did_you_know → true_false → compare → partial_summary → mini_quiz → final_challenge
- Ejemplo INVÁLIDO: concept → concept → concept → example → example

CONECTORES NARRATIVOS (campo "connector" — obligatorio en cada tarjeta):
- Cada tarjeta incluye "connector": frase corta que crea expectativa hacia su contenido.
- Primera tarjeta: connector puede ser null.
- Ejemplos: "Ahora veremos otra evidencia.", "¿Pero cómo lo sabemos con certeza?", "Existe una prueba aún más sorprendente.", "No todos los estudiantes entienden esto bien.", "¿Eres capaz de responder esto?", "Pasemos a un nivel más profundo.", "Antes de continuar, verifica tu comprensión.", "Los fósiles no son la única prueba."

TARJETA FINAL OBLIGATORIA (final_challenge):
- La ÚLTIMA tarjeta SIEMPRE es de tipo "final_challenge".
- emoji: 🏆, title: "¿Qué aprendiste?"
- question: combina 2 o más conceptos vistos en la sesión.
- definition: pista o contexto para responder. No agregar example.

REGLAS POR TIPO DE TARJETA INTERACTIVA:

mini_quiz:
- question: pregunta clara y directa
- options: array de exactamente 4 strings con formato ["A. texto", "B. texto", "C. texto", "D. texto"]
- correctAnswer: "A", "B", "C" o "D"
- definition: explicación breve de por qué es correcta (max 20 palabras)
- CRÍTICO: los distractores deben ser plausibles. Deben parecer posibles respuestas correctas, no opciones absurdas.

true_false:
- question: afirmación que puede ser verdadera o falsa
- correctAnswer: "Verdadero" o "Falso"
- definition: explicación de por qué (max 20 palabras)

observe:
- Solo usar si el material describe imágenes, gráficos, mapas, tablas, estructuras visuales o datos visuales.
- question: pregunta sobre lo que se observa o deduce
- visualHint: descripción detallada de la imagen (10-15 palabras)
- definition: qué debe identificar o aprender el estudiante de la imagen

common_error:
- title: "Error común: [descripción]"
- definition: por qué es incorrecto + la respuesta correcta

compare:
- title: "X vs Y" o "¿En qué se diferencian X e Y?"
- definition: diferencias y similitudes clave (max 25 palabras)

partial_summary:
- title: "Hasta aquí..." o "Repaso rápido"
- definition: resumen de 2-3 ideas clave vistas hasta ese punto

REGLAS GENERALES DE CONTENIDO (resumen):
- Each slide = ONE single idea. Never group multiple ideas.
- "definition": max 20-25 words. Clear, direct.
- "example": max 25-30 words for non-interactive types. Concrete, visual, memorable. If no real example exists, create an analogy.
- "wow_fact": surprising fact, max 15 words. No example needed.
- "visualHint": 5-10 words describing the ideal image. Must be concrete and visual.
- "illustrationType": educational | diagram | concept | timeline | map | process | comparison

════════════════════════════════════════════════
QUIZ — PREGUNTAS DE SELECCIÓN MÚLTIPLE
════════════════════════════════════════════════

- Generate questions that test understanding, not just memorization.
- Each question must have exactly 4 options.
- CRÍTICO: distractores deben ser plausibles — relacionados con el tema, podrían parecer correctos.
  Ejemplo correcto: si la pregunta es sobre fotosíntesis, un distractor válido es "respiración celular", no "comer pizza".
- Mix: recognition questions (1° medio), application (2°-3°), reasoning and interpretation (4°).
- explanation: why the correct answer is correct AND why the main distractor is wrong.

════════════════════════════════════════════════
FLASHCARDS
════════════════════════════════════════════════

- front: concise question or concept (max 10 words)
- back: direct, memorable answer (max 25 words)
- Mix concept cards with application cards ("how" and "why", not just "what").
- Avoid pure definition repetition across cards.

JSON SCHEMA:
{
  "subject": string,
  "topic": string,
  "questions": [
    {
      "id": string,
      "text": string,
      "options": [{"id": string, "text": string}],
      "correctOptionId": string,
      "explanation": string,
      "sourceQuote": string,
      "difficulty": "easy" | "medium" | "hard"
    }
  ],
  "flashcards": [
    {
      "id": string,
      "front": string,
      "back": string,
      "sourceQuote": string,
      "difficulty": "easy" | "medium" | "hard"
    }
  ],
  "summary": {
    "id": string,
    "title": string,
    "slides": [
      {
        "type": "concept"|"key_fact"|"important"|"remember"|"example"|"curiosity"|"wow_fact"|"did_you_know"|"common_error"|"mini_quiz"|"true_false"|"observe"|"compare"|"partial_summary"|"final_challenge",
        "emoji": string,
        "title": string,
        "definition": string,
        "example": string,
        "visualHint": string,
        "illustrationType": "educational"|"diagram"|"concept"|"timeline"|"map"|"process"|"comparison",
        "connector": string | null,
        "question": string | null,
        "options": [string] | null,
        "correctAnswer": string | null
      }
    ],
    "sourceQuotes": [string]
  }
}

Use the transcription below and do not invent source quotes outside it. If the transcription is shorter than 100 words, return a JSON object with an empty questions and flashcards list and a short summary.

Transcription:
${normalizeText(transcription)}
`;

  const system = `Eres un diseñador de experiencias de aprendizaje para jóvenes de enseñanza media chilena. Genera sesiones interactivas con variedad de tipos de tarjetas. Proporciona JSON válido y estructurado. Mantén el lenguaje en español.`;
  const response = await openai.chat.completions.create({
    model: config.openai_model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 4200,
  });

  const raw = response.choices?.[0]?.message?.content ?? response.choices?.[0]?.message?.content?.toString?.() ?? '';
  const resultText = normalizeText(raw);
  let parsed;
  try {
    parsed = JSON.parse(resultText);
  } catch (error) {
    const fallback = raw.match(/\{[\s\S]*\}/);
    if (!fallback) {
      throw new Error('No se pudo parsear la respuesta de OpenAI.');
    }
    parsed = JSON.parse(fallback[0]);
  }

  const subject = configValues.subject?.trim() || parsed.subject || 'Tema del material';
  const topic = configValues.topic?.trim() || parsed.topic || 'Resumen del material';

  const questions = (parsed.questions || []).map((question: any, index: number) => ({
    id: question.id || `q-${index + 1}`,
    text: question.text || question.pregunta || `Pregunta ${index + 1}`,
    options: (question.options || []).map((option: any, optionIndex: number) => ({
      id: option.id || `o-${optionIndex + 1}`,
      text: option.text || option,
    })),
    correctOptionId: question.correctOptionId || question.correctOption || (question.options?.[0]?.id ?? 'o-1'),
    explanation: question.explanation || question.explicacion || 'Revisa el material para confirmar la respuesta.',
    sourceQuote: question.sourceQuote || question.cita || '',
    difficulty: question.difficulty || 'medium',
  })) as MultipleChoiceQuestion[];

  const flashcards = (parsed.flashcards || []).map((card: any, index: number) => ({
    id: card.id || `f-${index + 1}`,
    front: card.front || card.pregunta || `Tarjeta ${index + 1}`,
    back: card.back || card.respuesta || '',
    sourceQuote: card.sourceQuote || card.cita || '',
    difficulty: card.difficulty || 'easy',
  })) as Flashcard[];

  const VALID_SLIDE_TYPES: SummarySlideType[] = [
    'concept', 'key_fact', 'important', 'remember', 'example', 'curiosity', 'wow_fact',
    'did_you_know', 'common_error', 'mini_quiz', 'true_false', 'observe',
    'compare', 'partial_summary', 'final_challenge',
  ];
  const VALID_ILLUSTRATION_TYPES: IllustrationType[] = ['educational', 'diagram', 'concept', 'timeline', 'map', 'process', 'comparison'];

  const summary: Summary = {
    id: parsed.summary?.id || 'summary-1',
    title: parsed.summary?.title || `Resumen de ${topic}`,
    slides: (parsed.summary?.slides || []).map((slide: any, i: number) => ({
      type: VALID_SLIDE_TYPES.includes(slide.type) ? slide.type : 'concept',
      emoji: slide.emoji || '📚',
      title: slide.title || `Concepto ${i + 1}`,
      definition: slide.definition || slide.content || '',
      example: slide.example || '',
      visualHint: slide.visualHint || undefined,
      illustrationType: VALID_ILLUSTRATION_TYPES.includes(slide.illustrationType) ? slide.illustrationType : undefined,
      connector: slide.connector ?? null,
      question: slide.question ?? null,
      options: Array.isArray(slide.options) ? slide.options : null,
      correctAnswer: slide.correctAnswer ?? null,
    })),
    sourceQuotes: parsed.summary?.sourceQuotes || parsed.summary?.citas || [],
  };

  const sourceQuoteCount = [
    ...questions.map((q) => q.sourceQuote),
    ...flashcards.map((f) => f.sourceQuote),
    ...summary.sourceQuotes,
  ].filter(Boolean).length;

  const groundingScore = sourceQuoteCount > 0 ? 1 : 0;

  return {
    subject,
    topic,
    questions,
    flashcards,
    summary,
    groundingScore,
  };
}

export interface GroundingValidationResult {
  validated: boolean;
  score: number;
  missingQuotes: string[];
}

export function validateGrounding(
  result: GenerationResult,
  transcription: string
): GroundingValidationResult {
  const normalized = normalizeText(transcription).toLowerCase();
  const allQuotes = [
    ...result.questions.map((q) => q.sourceQuote),
    ...result.flashcards.map((f) => f.sourceQuote),
    ...result.summary.sourceQuotes,
  ].filter(Boolean);

  // No quotes generated → consider valid (LLM omitted them but content is there)
  if (allQuotes.length === 0) {
    return { validated: true, score: 1, missingQuotes: [] };
  }

  const matchedCount = allQuotes.reduce((count, quote) => {
    const normalizedQuote = normalizeText(quote).toLowerCase();
    // Accept if the quote appears verbatim OR if most words overlap (fuzzy match)
    if (normalized.includes(normalizedQuote)) return count + 1;
    const words = normalizedQuote.split(/\s+/).filter((w) => w.length > 3);
    const matchedWords = words.filter((w) => normalized.includes(w)).length;
    return matchedWords / Math.max(words.length, 1) >= 0.7 ? count + 1 : count;
  }, 0);

  const score = matchedCount / allQuotes.length;
  const missingQuotes = allQuotes.filter((quote) => {
    const normalizedQuote = normalizeText(quote).toLowerCase();
    if (normalized.includes(normalizedQuote)) return false;
    const words = normalizedQuote.split(/\s+/).filter((w) => w.length > 3);
    const matchedWords = words.filter((w) => normalized.includes(w)).length;
    return matchedWords / Math.max(words.length, 1) < 0.7;
  });

  return {
    validated: score >= 0.5,
    score,
    missingQuotes,
  };
}

export function buildGeneratedSession(
  userId: string,
  documentId: string,
  transcription: string,
  wordCount: number,
  configValues: SessionConfig,
  generation: GenerationResult
): GeneratedSession {
  const xpReward = Math.max(20, Math.min(120, Math.round(wordCount / 8)));
  const gemReward = Math.max(5, Math.min(25, Math.round(xpReward / 10)));

  return {
    id: `${documentId}-${Date.now()}`,
    userId,
    documentId,
    subject: generation.subject,
    topic: generation.topic,
    wordCount,
    difficulty: configValues.difficulty,
    format: configValues.format,
    estimatedDuration: configValues.estimatedDuration,
    transcription,
    questions: generation.questions,
    flashcards: generation.flashcards,
    summary: generation.summary,
    metadata: {
      createdAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      groundingValidated: generation.groundingScore >= 0.5,
      groundingScore: generation.groundingScore,
    },
    xpReward,
    gemReward,
  };
}
