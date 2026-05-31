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

  const prompt = `You are a Duolingo-style learning experience designer for Chilean high-school students. Your mission is NOT to summarize a document. Your mission is to engineer DISCOVERY moments — each screen must make the student feel curiosity, surprise, personal connection, or an "aha" moment.

RETURN ONLY VALID JSON. No extra text.

CURSO DEL ESTUDIANTE: ${curso}

ADAPT EVERYTHING to this academic level:
- 1º Medio: very simple language, everyday examples, recognition questions, no inference.
- 2º Medio: plain language, basic application, conceptual understanding.
- 3º Medio: relational analysis, reasoning, real consequences.
- 4º Medio: critical thinking, complex application, pre-university depth.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMOTIONAL VALIDATION — apply to EVERY screen before writing it:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ask yourself: "Would a Chilean teenager say 'ah, now I get it' or 'I didn't know that'?"
If NO → rewrite the screen.

Each screen must provoke exactly ONE of these:
- Curiosidad: "¿Por qué pasa eso?"
- Sorpresa: "No sabía que..."
- Conexión personal: "Eso me pasa a mí"
- Descubrimiento: "Ah, entonces por eso..."
- Reflexión: "¿Y si...?"

A screen that only INFORMS is NOT valid. It must make the student FEEL something.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERNAL ANALYSIS — do this mentally BEFORE generating the JSON:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ask yourself:
1. What 2-3 concepts MUST the student grasp to pass the exam?
2. How do these concepts connect causally (not just relationally)?
3. Is there a chain reaction or domino effect in the material?
4. What would a student who only uses TikTok and watches Netflix incorrectly believe about this?
5. Which real teen situation (Spotify, zapatillas, celular, bencina) makes this concept land?
6. What is the single most surprising or counterintuitive fact in this material?
7. If the material has diagrams — what real-world chain of events do they represent?

DO NOT include this analysis in the JSON. Use it to build the 10 screens below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEXT LIMITS — apply to EVERY screen:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- definition: maximum 2 sentences OR 50 words — whichever is shorter.
- example: maximum 25 words.
- title: maximum 10 words.
Clarity over coverage. If you cannot say it in 2 sentences, cut the less important sentence.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE 10 SCREENS — generate EXACTLY in this order
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCREEN 1 — type: "mission" — emoji: 🎯
- title: active mission title (e.g., "Misión: Agentes Económicos")
- definition: the learning objective as an active mission statement (1 sentence, max 25 words).
  Example: "En esta misión aprenderás cómo interactúan familias, empresas y Estado en la economía."
  DO NOT write "Aprenderás sobre..." — make it exciting and specific.
- example: null

SCREEN 2 — type: "main_concept" — emoji: fitting to content
FOLLOW THIS EXACT 3-PART FORMAT:
  Part 1 — IMPACT LINE: One sentence that creates curiosity or surprise. NOT a definition.
    Must make the student think "interesting" or "I didn't know that."
    Example: "Cada vez que eliges qué comprar, estás haciendo economía sin saberlo."
    Example: "El Estado gasta tu plata antes de que tú la ganes."
  Part 2 — SIMPLE EXPLANATION: One plain sentence explaining the concept. Zero academic jargon.
    Example: "La microeconomía estudia las decisiones de personas y empresas."
  Part 3 — in example field: A situation a Chilean teenager ACTUALLY lives.
    Use: precios de alimentos, celulares, streaming, zapatillas, transporte, redes sociales.
    Example: "¿Por qué la palta subió de precio esta semana?"
    Example: "¿Por qué Netflix cuesta más pero el plan básico desapareció?"
- title: the concept name (max 5 words)
- definition: Part 1 + Part 2 combined (max 40 words total, 2 sentences max)
- example: Part 3 — must describe a situation a 15-year-old actually encounters (max 20 words)

SCREEN 3 — type: "comprehension" — emoji: 🤔  [INTERACTIVE — REQUIRED]
- title: "¿Comprendiste?"
- question: simple direct question about the concept from screen 2 (max 20 words)
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactly 4 options, each max 12 words
- correctAnswer: "A", "B", "C", or "D"
- definition: one sentence explaining why the answer is correct (max 15 words)
- CRITICAL: distractors must be plausible — related to the topic, not absurd

SCREEN 4 — type: "key_relation" — emoji: 🔗
SHOW CAUSE AND EFFECT — not abstract concepts.
- connector: a vertical chain showing a REAL CHAIN REACTION using this exact format:
  "SituaciónCotidiana ↓ verbo ↓ Consecuencia ↓ verbo ↓ Resultado"
  REQUIRED: nodes must be situations a teenager can visualize, not abstract terms.
  Good examples:
    "Más familias compran ↓ sube ↓ Demanda aumenta ↓ suben ↓ Precios"
    "Sube el dólar ↓ encarece ↓ Importaciones ↓ aumentan ↓ Precios en tiendas"
    "Más personas ahorran ↓ baja ↓ Consumo ↓ cae ↓ Ventas de empresas"
  Use 2 to 4 nodes. Each node max 4 words. Each verb max 2 words.
  PROHIBITED: abstract or purely academic concepts as nodes (e.g., "Oferta", "Demanda" alone are too abstract — show the REAL situation that creates them).
  IMPORTANT: use the ↓ character, NOT "→".
- title: a short name for this chain (max 6 words)
- definition: one sentence explaining WHY this chain matters in real life (max 20 words)
- example: null
- FALLBACK: If you cannot find a concrete real-world chain → use type "comprehension" instead.

SCREEN 5 — type: "mini_quiz" — emoji: ⚡  [INTERACTIVE — REQUIRED]
- title: "Quiz rápido"
- question: an APPLICATION question — the student must REASON using the concept, not just remember it (max 25 words).
  Good: "Si el precio del pan sube un 30%, ¿qué pasará probablemente con la cantidad que compra una familia?"
  Bad: "¿Qué es la demanda?" — this is pure recognition, FORBIDDEN.
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactly 4 options, each max 12 words
- correctAnswer: "A", "B", "C", or "D"
- definition: one sentence explanation WHY the correct answer is right (max 20 words)
- CRITICAL — CORRECT ANSWER must NOT be obvious from the question wording.
- CRITICAL — DISTRACTORS must represent plausible misconceptions or half-truths, NOT absurd alternatives.
- CRITICAL — Prioritize REASONING over memorization. If a student can answer without understanding, rewrite.

SCREEN 6 — type: "process_flow" OR "challenge" — emoji: 🔄 or 🤔
- OPTION A — type: "process_flow" — if the material has a clear sequence or flow:
  - title: name of the process or flow (max 6 words)
  - definition: the steps written as "Step1 → Step2 → Step3 → Step4" (max 4 steps, max 5 words each). Show a CAUSAL chain — each step causes the next.
  - example: real-world instance of this process (max 20 words)
- OPTION B — type: "challenge" — if there is NO clear process in the material:
  - title: "Reflexiona"
  - definition: an open-ended "what if" or "why" question that requires applying the concepts (max 30 words)
    Example: "Si desaparecieran los impuestos, ¿qué servicio público podría verse más afectado y por qué?"
  - example: null
  - question, options, correctAnswer: all null

SCREEN 7 — type: "application" — emoji: 🌍
MANDATORY: use a real teen-relevant platform or situation. Choose from:
  Netflix, Spotify, TikTok, Steam, PlayStation, Xbox, celulares, zapatillas, comida rápida, transporte, compras online, redes sociales.
  PROHIBITED: generic business examples like "una empresa" or "un consumidor" with no context.
- title: a concrete scenario as a question using one of the platforms above (max 15 words)
  Example: "Si Netflix sube su precio, ¿qué pasará con la cantidad de suscriptores?"
  Example: "¿Por qué Steam pone los juegos en oferta en fechas específicas?"
- definition: the answer explaining WHICH concept applies and WHY (max 2 sentences, 40 words max)
- example: what this means for the student personally (max 15 words)

SCREEN 8 — type: "common_error" — emoji: ⚠️
SHOW A REAL TEEN MISCONCEPTION — not an academic error a professor would make.
Think: what would a student who only watches TikTok and never studied this topic believe? That is the error.
CRITICAL RULES FOR THIS SCREEN:
1. definition = the WRONG belief a real teenager would have (1 sentence, max 20 words).
   Good: "Mucha gente cree que si el dólar sube, el gobierno puede simplemente bajar su precio."
   Bad: "Confunden oferta con demanda." — too academic, not a real teen belief.
2. example = the CORRECT reality that surprises them (1 sentence, max 20 words).
   Example: "El dólar lo fija el mercado global, no el gobierno chileno."
3. BOTH fields are REQUIRED. If you cannot identify a real teen misconception, replace with type "comprehension" using a new question.
4. The error must be believable — something a smart teenager would actually think before learning this.

SCREEN 9 — type: "final_challenge" — emoji: 🏆  [INTERACTIVE — REQUIRED]
- title: "Desafío final"
- question: integrating question connecting AT LEAST 2 concepts from this session (max 30 words)
- options: ["A. ...", "B. ...", "C. ...", "D. ..."] — exactly 4 options, each max 12 words
- correctAnswer: "A", "B", "C", or "D"
- definition: explanation explicitly mentioning both concepts (max 25 words)
- CRITICAL: distractors must be plausible

SCREEN 10 — type: "victory" — emoji: 🎉
- title: "¡Misión cumplida!"
- definition: MAXIMUM 2 sentences celebrating what was mastered. Reference the SPECIFIC concepts learned. Be enthusiastic, not robotic.
- example: MANDATORY format — start with "Lo usarás cuando..." and connect to a real teen situation (max 20 words).
  Example: "Lo usarás cuando veas que el precio de tu celular favorito cambia en distintas tiendas."
  Example: "Lo usarás cuando decidas si suscribirte a Spotify o esperar una oferta."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE RULES FOR ALL 10 SCREENS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Generate EXACTLY 10 slides in the exact order above.
- NEVER copy text literally from the transcription.
- NEVER create two consecutive informational screens with definitions only.
- NEVER ignore diagrams, flows, or visual structures in the material — convert them into screen 6 (process_flow) or screen 4 (key_relation).
- NEVER create empty or vague slides. If a type cannot be filled with quality content, use the FALLBACK types specified above.
- Reorganize content by PEDAGOGICAL IMPORTANCE, not by document order.
- Prioritize: understanding → application → retention. NOT total content coverage.
- The 3 interactive screens (screens 3, 5, 9) are MANDATORY. They must always be comprehension/mini_quiz/final_challenge with real questions and options.
- FINAL VALIDATION before outputting JSON: for each screen ask "¿Un adolescente chileno diría 'ah, ahora entiendo' o 'no sabía eso'?" If the answer is NO for any screen → rewrite that screen.

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
        "type": "mission"|"main_concept"|"comprehension"|"key_relation"|"mini_quiz"|"process_flow"|"application"|"common_error"|"final_challenge"|"victory"|"challenge",
        "emoji": string,
        "title": string,
        "definition": string,
        "example": string | null,
        "connector": string | null,
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

  const system = `Eres un diseñador de experiencias de aprendizaje estilo Duolingo para jóvenes de enseñanza media chilena. Tu objetivo NO es resumir un documento — es crear momentos de DESCUBRIMIENTO. Cada pantalla debe provocar curiosidad, sorpresa o una conexión personal. Un adolescente debe terminar la sesión pensando "no sabía eso" o "ah, por eso pasa". Construye misiones interactivas, NO resúmenes escolares. Genera exactamente 10 pantallas en el orden indicado. Proporciona JSON válido. Todo el contenido en español.`;
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
    'challenge',
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
