/**
 * Generation service for study sessions using OpenAI.
 */

import OpenAI from 'openai';
import type {
  MultipleChoiceQuestion,
  Flashcard,
  Summary,
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
- Use Spanish field names in the JSON keys exactly as requested.
- Use quotes extracted verbatim from the transcription in 'sourceQuote'.
- Keep each sourceQuote concise (20-80 characters) and ensure it appears in the transcription.
- Use the provided difficulty and duration values from the configuration.

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
    "sections": [
      {
        "heading": string,
        "content": string,
        "keyPoints": [string]
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
    max_tokens: 2200,
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

  const summary: Summary = {
    id: parsed.summary?.id || 'summary-1',
    title: parsed.summary?.title || `Resumen de ${topic}`,
    sections: (parsed.summary?.sections || []).map((section: any) => ({
      heading: section.heading || section.titulo || 'Sección',
      content: section.content || section.contenido || '',
      keyPoints: section.keyPoints || section.puntosClave || [],
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

  const matchedCount = allQuotes.reduce((count, quote) => {
    const normalizedQuote = normalizeText(quote).toLowerCase();
    return normalized.includes(normalizedQuote) ? count + 1 : count;
  }, 0);

  const score = allQuotes.length > 0 ? matchedCount / allQuotes.length : 0;
  const missingQuotes = allQuotes.filter((quote) => {
    const normalizedQuote = normalizeText(quote).toLowerCase();
    return !normalized.includes(normalizedQuote);
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
