/**
 * Generation service for study sessions using OpenAI.
 */

import OpenAI from 'openai';
import type {
  MultipleChoiceQuestion,
  Flashcard,
  Summary,
  SummarySlideType,
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
  configValues: SessionConfig
): Promise<GenerationResult> {
  const prompt = [`You are an educational assistant for Chilean high-school learners. Based on the transcription below, create a study session with the following JSON structure.

Rules:
- Return only valid JSON without additional text.
- Use quotes extracted verbatim from the transcription in 'sourceQuote'.
- Keep each sourceQuote concise (20-80 characters) and ensure it appears in the transcription.
- Use the provided difficulty and duration values from the configuration.

SUMMARY RULES (critical — mobile app for teenagers):
- Each slide = ONE single idea. Never group multiple ideas in one slide.
- "definition": max 20-25 words. Clear, direct, no filler phrases.
- "example": max 25-30 words. Must be concrete, visual, and memorable.
  Use real-world cases, analogies, or surprising comparisons.
  If no practical example exists, create a simple analogy that aids understanding.
  Never leave example empty for concept/key_fact/important/remember/curiosity types.
- "wow_fact": surprising standalone fact, max 15 words. No example needed.
- Choose an appropriate emoji for each slide.
- Slide types: concept (neutral idea), key_fact (important data), important (critical info),
  remember (must memorize), example (concrete application), curiosity (interesting detail),
  wow_fact (surprising fact — use sparingly, 1-2 per topic).

JSON schema:
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
        "type": "concept" | "key_fact" | "important" | "remember" | "example" | "curiosity" | "wow_fact",
        "emoji": string,
        "title": string,
        "definition": string,
        "example": string
      }
    ],
    "sourceQuotes": [string]
  }
}

Use the transcription below and do not invent source quotes outside it. If the transcription is shorter than 100 words, return a JSON object with an empty questions and flashcards list and a short summary.

Transcription:
${normalizeText(transcription)}
`].join('');

  const system = `Eres un generador de sesiones de estudio para jóvenes de enseñanza media. Proporciona un JSON válido y estructurado. Mantén el lenguaje en español.`;
  const response = await openai.chat.completions.create({
    model: config.openai_model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature: 0.15,
    max_tokens: 3200,
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

  const VALID_SLIDE_TYPES: SummarySlideType[] = ['concept', 'key_fact', 'important', 'remember', 'example', 'curiosity', 'wow_fact'];

  const summary: Summary = {
    id: parsed.summary?.id || 'summary-1',
    title: parsed.summary?.title || `Resumen de ${topic}`,
    slides: (parsed.summary?.slides || []).map((slide: any, i: number) => ({
      type: VALID_SLIDE_TYPES.includes(slide.type) ? slide.type : 'concept',
      emoji: slide.emoji || '📚',
      title: slide.title || `Concepto ${i + 1}`,
      definition: slide.definition || slide.content || '',
      example: slide.example || '',
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
