import { randomUUID } from 'crypto';
import { classifyContent } from '../../services/pedagogicalClassifier.js';
import { buildGeneratedSession, validateGrounding, type GenerationResult } from '../../services/generationService.js';
import type { GeneratedSession, SessionConfig } from '../../types.js';
import { buildKnowledgeObject } from './comprehension.js';
import { generateDistractors } from './distractors.js';
import { buildFlashcards, buildQuestions, buildDesafio, buildSummarySlides } from './assemble.js';

/**
 * v2 generation entry point — a fixed, 2-AI-call pipeline for every document,
 * regardless of pedagogical type:
 *   1. `buildKnowledgeObject` — one AI call, extracts structured concepts.
 *   2. `generateDistractors`  — one AI call, one question per concept.
 *   3. `assemble.ts`          — pure code, builds every frontend-facing shape.
 *
 * Unlike the legacy PROCEDURAL path in `generationService.ts` (up to 4
 * separate skill-mission AI calls), this NEVER branches the number of AI
 * calls based on content. `classifyContent` is reused ONLY to label
 * `metadata.pedagogicalType` for analytics/display — its result never
 * changes how many calls are made or which functions run.
 *
 * `userId`/`documentId` are not inputs here on purpose — this function only
 * knows how to turn a transcription into content. The caller (the queue
 * worker) owns request/job identity and must overwrite
 * `session.id`/`session.userId`/`session.documentId` before persisting.
 */
export async function generateSessionV2(
  transcription: string,
  config: SessionConfig,
  curso: string,
): Promise<GeneratedSession> {
  const ko = await buildKnowledgeObject(transcription, curso);
  const distractors = await generateDistractors(ko.concepts, ko.concepts.length);

  const classification = classifyContent(transcription);
  const wordCount = transcription.split(/\s+/).filter(Boolean).length;

  const generation: GenerationResult = {
    subject: ko.subject || config.subject || 'Tema del material',
    topic: ko.topic || config.topic || 'Resumen del material',
    questions: buildQuestions(ko, distractors),
    flashcards: buildFlashcards(ko),
    summary: {
      id: randomUUID(),
      title: ko.topic || 'Resumen del material',
      slides: buildSummarySlides(ko, distractors),
      sourceQuotes: [],
    },
    groundingScore: 0, // placeholder — replaced below with the real validateGrounding() result
    pedagogicalType: classification.type,
  };

  // Each concept now carries a literal sourceQuote (see comprehension.ts), so
  // flashcards/questions built from it have a real quote to verify — this
  // makes validateGrounding meaningful again instead of trivially passing on
  // an empty-quote list.
  const grounding = validateGrounding(generation, transcription);
  generation.groundingScore = grounding.score;
  if (!grounding.validated) {
    console.warn(`[v2][grounding] score bajo: ${grounding.score.toFixed(2)} — posibles citas no ancladas`, grounding.missingQuotes);
  }

  const session = buildGeneratedSession('', '', transcription, wordCount, config, generation);

  // `desafio` is not part of the typed `GeneratedSession` interface today —
  // this mirrors the exact same runtime shape the legacy path already
  // produces in routes/sessions.ts (`(session as any).desafio = ...`).
  (session as any).desafio = buildDesafio(ko, distractors);

  return session;
}
