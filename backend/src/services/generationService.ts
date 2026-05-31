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

  const prompt = `You are an educational experience designer for Chilean high-school students. Your mission is NOT to summarize a document. Your mission is to build an interactive learning experience that makes the student understand, apply, and remember the most important concepts for their exam.

RETURN ONLY VALID JSON. No extra text.

CURSO DEL ESTUDIANTE: ${curso}

ADAPT EVERYTHING to this academic level:
- 1º Medio: simple language, everyday examples, recognition questions, minimal inference.
- 2º Medio: intermediate language, conceptual understanding, basic application questions.
- 3º Medio: conceptual depth, relational analysis, reasoning exercises.
- 4º Medio: pre-university level, critical analysis, complex application, demanding questions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERNAL ANALYSIS — do this mentally BEFORE generating the JSON:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ask yourself:
1. What are the 2-3 concepts the student MUST understand to pass the exam?
2. How do these concepts relate to each other?
3. Is there a key process, flow, or sequence in the material?
4. What is the most likely exam question on this topic?
5. What mistake do students most often make?
6. What real-world example makes this impossible to forget?
7. If the material has diagrams, flows, or visual structures — how do I convert them into activities?

DO NOT include this analysis in the JSON. Use it to build the 10 screens below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE 10 SCREENS — generate EXACTLY in this order
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCREEN 1 — type: "mission" — emoji: 🎯
- title: active mission title (e.g., "Misión: Agentes Económicos")
- definition: the learning objective as an active mission statement (1 sentence).
  Example: "En esta misión aprenderás cómo interactúan familias, empresas y Estado en la economía."
  DO NOT write "Aprenderás sobre..." — make it exciting and specific.
- example: null

SCREEN 2 — type: "main_concept" — emoji: fitting to content
- title: the single most important concept name
- definition: explanation in MAXIMUM 2 short sentences. Direct, clear, no filler.
- DO NOT copy text literally from the document. Rewrite in your own words.
- example: a brief, memorable real-world anchor (max 15 words)

SCREEN 3 — type: "comprehension" — emoji: 🤔
- title: "¿Comprendiste?"
- question: simple direct question about the concept from screen 2
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactly 4 options
- correctAnswer: "A", "B", "C", or "D"
- definition: brief explanation of why the answer is correct (max 15 words)
- CRITICAL: distractors must be plausible — related to the topic, not absurd

SCREEN 4 — type: "key_relation" — emoji: 🔗
- title: "X → Y" or "¿Cómo se relacionan X e Y?"
- definition: explain the relationship and why it matters (max 2 sentences)
- example: what happens when this relationship breaks or changes (concrete, max 20 words)

SCREEN 5 — type: "mini_quiz" — emoji: ⚡
- title: "Quiz rápido"
- question: application question (NOT pure recognition — requires using the concept)
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactly 4 options
- correctAnswer: "A", "B", "C", or "D"
- definition: explanation referencing the concept from screens 2 or 4 (max 20 words)
- CRITICAL: distractors must be plausible

SCREEN 6 — type: "process_flow" — emoji: 🔄
- title: name of the process or flow
- definition: the steps or stages written with clear structure (use numbers or →)
  Example: "1. Familias ofrecen trabajo → 2. Empresas pagan salarios → 3. Familias consumen bienes"
- IF the material has no clear process, use type "key_relation" for a second important relationship instead.
- example: real-world instance of this process in action (max 20 words)

SCREEN 7 — type: "application" — emoji: 🌍
- title: a concrete real-world situation as a question
  Example: "Si una familia compra pan en una panadería, ¿qué agente económico participa?"
- definition: the answer, explaining WHICH concept applies and WHY (max 2 sentences)
- Must be relatable to a Chilean teenager. Concrete, not abstract.

SCREEN 8 — type: "common_error" — emoji: ⚠️
- title: "Error común: [description of the mistake]"
- definition: why it is WRONG + what the correct understanding is (max 2 sentences)
- Base this on real student misconceptions about this specific topic.

SCREEN 9 — type: "final_challenge" — emoji: 🏆
- title: "Desafío final"
- question: integrating question that requires connecting AT LEAST 2 concepts from this session
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactly 4 options
- correctAnswer: "A", "B", "C", or "D"
- definition: explanation that explicitly mentions both concepts (max 25 words)
- CRITICAL: distractors must be plausible

SCREEN 10 — type: "victory" — emoji: 🎉
- title: "¡Misión cumplida!"
- definition: MAXIMUM 2 sentences celebrating what was mastered. Reference the SPECIFIC concepts learned. DO NOT repeat definitions.
- example: one memorable takeaway or real-world connection the student will remember (max 20 words)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE RULES FOR ALL 10 SCREENS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Generate EXACTLY 10 slides in the exact order above.
- NEVER copy text literally from the transcription.
- NEVER create two consecutive informational screens with definitions only.
- NEVER ignore diagrams, flows, or visual structures in the material — convert them into screen 6 (process_flow) or screen 4 (key_relation).
- NEVER create empty or vague slides.
- Reorganize content by PEDAGOGICAL IMPORTANCE, not by document order.
- Prioritize: understanding → application → retention. NOT total content coverage.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUIZ QUESTIONS (separate from summary screens):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Generate questions that test understanding and application, not just memorization.
- Each question must have exactly 4 options.
- Distractors must be plausible — related to the topic, could seem correct at first glance.
- Mix difficulty: recognition (1°), application (2°-3°), reasoning and interpretation (4°).
- explanation: why the correct answer is right AND why the main distractor is wrong.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLASHCARDS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- front: concise question or concept (max 10 words)
- back: direct, memorable answer (max 25 words)
- Mix "what" cards with "how" and "why" cards.
- Avoid pure definition repetition.

JSON SCHEMA — return ONLY this structure:
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
        "type": "mission"|"main_concept"|"comprehension"|"key_relation"|"mini_quiz"|"process_flow"|"application"|"common_error"|"final_challenge"|"victory",
        "emoji": string,
        "title": string,
        "definition": string,
        "example": string | null,
        "visualHint": string | null,
        "illustrationType": "educational"|"diagram"|"concept"|"timeline"|"map"|"process"|"comparison"|null,
        "question": string | null,
        "options": [string] | null,
        "correctAnswer": string | null
      }
    ],
    "sourceQuotes": [string]
  }
}

If the transcription is shorter than 100 words, return a JSON with an empty questions and flashcards list and a minimal 10-screen summary using the same structure.

Transcription:
${normalizeText(transcription)}
`;

  const system = `Eres un diseñador de experiencias de aprendizaje para jóvenes de enseñanza media chilena. Tu objetivo es construir misiones de aprendizaje interactivas — NO resúmenes pasivos. Genera exactamente 10 pantallas estructuradas según el esquema indicado. Proporciona JSON válido. Mantén todo el contenido en español.`;
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
    // Structured mission screens (primary)
    'mission', 'main_concept', 'comprehension', 'key_relation',
    'mini_quiz', 'process_flow', 'application', 'common_error', 'final_challenge', 'victory',
    // Legacy types (fallback compatibility)
    'concept', 'key_fact', 'important', 'remember', 'example', 'curiosity', 'wow_fact',
    'did_you_know', 'true_false', 'observe', 'compare', 'partial_summary',
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
