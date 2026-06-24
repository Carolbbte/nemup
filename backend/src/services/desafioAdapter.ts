/**
 * Desafío adapter — deterministic, no AI calls.
 *
 * Converts session.summary.slides (Mission output) into a DesafioSession,
 * preserving all pedagogical content and rendering it through the Desafío UI.
 *
 * Slide type mapping:
 *   micro_challenge          → discovery_challenge   (interactive)
 *   reinforcement_challenge  → reinforcement_challenge (interactive)
 *   comprehension            → reinforcement_challenge (interactive)
 *   mini_quiz                → spaced_repetition      (interactive)
 *   decide                   → reinforcement_challenge (interactive)
 *   common_error             → reinforcement_challenge (interactive, has question)
 *   application              → spaced_repetition      (interactive, has question)
 *   wow_fact                 → reinforcement_challenge (interactive, has question)
 *   final_challenge          → boss_loop              (interactive)
 *   main_concept             → insight                (non-interactive)
 *   key_relation             → insight                (non-interactive)
 *   process_flow (3-5 steps) → reinforcement_challenge (order_steps interactive)
 *   process_flow (other)     → insight                (non-interactive fallback)
 *   challenge                → instant_feedback       (non-interactive)
 *   common_error (no Q)      → instant_feedback       (non-interactive fallback)
 *   application (no Q)       → instant_feedback       (non-interactive fallback)
 *   wow_fact (no Q)          → instant_feedback       (non-interactive fallback)
 *   victory                  → mastery_screen
 *   mission                  → (skipped)
 */

import { randomUUID } from 'crypto';
import type { DesafioFormatAssignment } from './desafioGenerationService.js';

// Local type mirrors — matches shared/desafio.ts exactly, avoids rootDir constraint
type DesafioSlideType =
  | 'discovery_challenge'
  | 'instant_feedback'
  | 'insight'
  | 'reinforcement_challenge'
  | 'spaced_repetition'
  | 'boss_loop'
  | 'mastery_screen';

interface DesafioChoice { letter: 'A' | 'B' | 'C'; text: string }

interface DesafioSlide {
  type: DesafioSlideType;
  interactionType?: string;
  conceptIndex: number;
  conceptName: string;
  emoji?: string;
  question?: string;
  choices?: DesafioChoice[];
  correctAnswer?: 'A' | 'B' | 'C';
  explanation?: string;
  wrongExplanation?: string;
  wrongHints?: Record<string, string>;
  title?: string;
  body?: string;
  conceptsCovered?: string[];
  examples?: { expression: string; label: string }[];
  // fill_blank
  blankSentence?: string;
  blankChoices?: DesafioChoice[];
  blankAnswer?: 'A' | 'B' | 'C';
  blankExplanation?: string;
  // order_steps
  steps?: string[];
  correctOrder?: number[];
  orderPrompt?: string;
  // match_pairs
  pairsPrompt?: string;
  pairs?: Array<{ id: string; left: string; right: string }>;
  // classify
  classifyPrompt?: string;
  classifyCategories?: string[];
  classifyItems?: Array<{ id: string; text: string; category: string }>;
}

interface DesafioSession {
  id: string;
  topic: string;
  conceptCount: number;
  slides: DesafioSlide[];
  retrySlides?: Record<string, DesafioSlide[]>;
}

const LETTERS = ['A', 'B', 'C'] as const;

// Maps interactive Mission slide types to Desafío interactive types
const INTERACTIVE_MAP: Partial<Record<string, DesafioSlideType>> = {
  micro_challenge:         'discovery_challenge',
  reinforcement_challenge: 'reinforcement_challenge',
  comprehension:           'reinforcement_challenge',
  mini_quiz:               'spaced_repetition',
  decide:                  'reinforcement_challenge',
  common_error:            'reinforcement_challenge',
  application:             'spaced_repetition',
  wow_fact:                'reinforcement_challenge',
  final_challenge:         'boss_loop',
};

// Maps non-interactive Mission slide types to Desafío static types
const STATIC_MAP: Partial<Record<string, DesafioSlideType>> = {
  main_concept:  'insight',
  key_relation:  'insight',
  process_flow:  'insight',
  challenge:     'instant_feedback',
  wow_fact:      'instant_feedback',
  common_error:  'instant_feedback',
  application:   'instant_feedback',
};

/** Extract ordered steps from a process_flow slide (definition → or connector ↓). */
function parseProcessFlowSteps(slide: any): string[] {
  const def = String(slide.definition ?? '');
  if (def.includes('→')) {
    const steps = def.split('→').map((t: string) => t.trim()).filter(Boolean);
    if (steps.length >= 3 && steps.length <= 5) return steps;
  }
  const conn = String(slide.connector ?? '');
  if (conn.includes('↓')) {
    // connector format: "node ↓ verb ↓ node ↓ verb ↓ node" — nodes at even positions
    const parts = conn.split('↓').map((t: string) => t.trim()).filter(Boolean);
    const nodes = parts.filter((_: string, i: number) => i % 2 === 0);
    if (nodes.length >= 3 && nodes.length <= 5) return nodes;
  }
  return [];
}

/** Deterministically shuffle steps and return correctOrder so the UI starts in wrong order. */
function shuffleSteps(correctSteps: string[], seed: number): { steps: string[]; correctOrder: number[] } {
  const n = correctSteps.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  let s = (seed * 1664525 + 1013904223) & 0x7fffffff;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  // Guarantee the shuffle is never identity (so the exercise is always meaningful)
  if (idx.every((v, i) => v === i) && n > 1) { idx.unshift(idx.pop()!); }
  const steps = idx.map(i => correctSteps[i]);
  // correctOrder[pos] = which index in `steps` belongs at position `pos`
  const correctOrder = Array.from({ length: n }, (_, pos) => idx.indexOf(pos));
  return { steps, correctOrder };
}

function parseChoices(options: string[] | null | undefined): DesafioChoice[] {
  if (!Array.isArray(options) || options.length < 2) return [];
  return options.slice(0, 3).map((opt, idx) => ({
    letter: LETTERS[idx],
    text: String(opt).replace(/^[A-D][\.\)]\s*/i, '').trim(),
  }));
}

/**
 * Builds fill_blank choices using concept names from the session.
 * Correct = current concept name; distractors = adjacent concepts (most
 * semantically similar, thus most distracting).
 * Position of correct answer is deterministically shuffled via seed.
 */
function buildFillBlankChoices(
  correctName: string,
  allConceptNames: string[],
  currentConceptIdx: number,
  seed: number,
): { choices: DesafioChoice[]; correctAnswer: 'A' | 'B' | 'C' } | null {
  // Prefer adjacent concepts as distractors — closest semantically
  const distractors: string[] = [];
  for (const offset of [-1, 1, -2, 2, -3, 3]) {
    const idx = currentConceptIdx + offset;
    if (idx >= 0 && idx < allConceptNames.length) {
      const candidate = allConceptNames[idx];
      if (candidate && candidate !== correctName && !distractors.includes(candidate)) {
        distractors.push(candidate);
        if (distractors.length === 2) break;
      }
    }
  }
  // Fallback: any remaining concept not yet picked
  if (distractors.length < 2) {
    for (const name of allConceptNames) {
      if (name !== correctName && !distractors.includes(name)) {
        distractors.push(name);
        if (distractors.length === 2) break;
      }
    }
  }
  if (distractors.length < 2) return null; // not enough concepts — caller falls back to MC

  // Place correct answer at a deterministic but non-obvious position
  const correctPos = seed % 3;
  const texts = [distractors[0], distractors[1]];
  texts.splice(correctPos, 0, correctName);

  const choices: DesafioChoice[] = texts.slice(0, 3).map((text, idx) => ({
    letter: LETTERS[idx],
    text,
  }));

  return { choices, correctAnswer: LETTERS[correctPos] as 'A' | 'B' | 'C' };
}

/**
 * Assigns each slide a conceptIndex and conceptName.
 *
 * The Duolingo Loop order is: micro_challenge → main_concept → reinforcement_challenge.
 * Because micro_challenge comes BEFORE its main_concept, we look AHEAD to assign it
 * to the correct concept. All other slides look back to the most recent main_concept.
 */
function buildConceptAssignment(slides: any[]): Array<{ conceptIndex: number; conceptName: string }> {
  const mainConcepts: Array<{ slideIdx: number; name: string; conceptIndex: number }> = [];
  let cIdx = 0;
  for (let i = 0; i < slides.length; i++) {
    if (slides[i]?.type === 'main_concept') {
      mainConcepts.push({
        slideIdx: i,
        name: String(slides[i].title ?? '').trim() || `Concepto ${cIdx + 1}`,
        conceptIndex: cIdx++,
      });
    }
  }

  if (mainConcepts.length === 0) {
    return slides.map(() => ({ conceptIndex: 0, conceptName: 'General' }));
  }

  return slides.map((slide, i) => {
    if (slide?.type === 'micro_challenge') {
      const nextMain = mainConcepts.find(m => m.slideIdx > i);
      if (nextMain) return { conceptIndex: nextMain.conceptIndex, conceptName: nextMain.name };
    }
    const prevMain = [...mainConcepts].reverse().find(m => m.slideIdx <= i);
    if (prevMain) return { conceptIndex: prevMain.conceptIndex, conceptName: prevMain.name };
    return { conceptIndex: 0, conceptName: mainConcepts[0].name };
  });
}

export function buildDesafioFromMission(
  slides: any[],
  topic: string,
  formats?: DesafioFormatAssignment,
): DesafioSession {
  if (!Array.isArray(slides) || slides.length === 0) {
    return { id: randomUUID(), topic: topic || 'Desafío', conceptCount: 0, slides: [] };
  }

  const conceptAssignment = buildConceptAssignment(slides);
  const desafioSlides: DesafioSlide[] = [];

  // Extract mission slide fields for the Desafío cover screen
  const missionSlide = slides.find((s: any) => s?.type === 'mission');
  const missionEmoji = missionSlide?.emoji ? String(missionSlide.emoji) : undefined;
  const missionTitle = missionSlide?.title ? String(missionSlide.title) : undefined;

  // Collect concept names in encounter order
  const conceptNames: string[] = [];
  for (const s of slides) {
    if (s?.type === 'main_concept') {
      const name = String(s.title ?? '').trim();
      if (name) conceptNames.push(name);
    }
  }

  // Track which conceptIndices have had their reinforcement_challenge processed,
  // so we know when to inject special slides (match_pairs, classify).
  const injectedAfter = new Set<number>();

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (!slide || typeof slide !== 'object') continue;

    const type = String(slide.type ?? '');
    if (type === 'mission') continue;

    const { conceptIndex, conceptName } = conceptAssignment[i];
    const base = { conceptIndex, conceptName, emoji: String(slide.emoji ?? '📚') };

    // victory → mastery_screen
    if (type === 'victory') {
      desafioSlides.push({
        ...base,
        type: 'mastery_screen',
        title: String(slide.title ?? '¡Misión completada!'),
        body: String(slide.definition ?? ''),
        conceptsCovered: conceptNames,
      });
      continue;
    }

    const hasQuestion = typeof slide.question === 'string' && slide.question.trim().length > 0;
    const hasOptions  = Array.isArray(slide.options) && slide.options.length >= 2;

    // Interactive branch — slide has a real question + options
    if (hasQuestion && hasOptions) {
      const desafioType = INTERACTIVE_MAP[type] ?? 'reinforcement_challenge';
      const choices = parseChoices(slide.options);
      const rawAnswer = String(slide.correctAnswer ?? '').toUpperCase();
      // Skip slide rather than defaulting to 'A' — a wrong correctAnswer is worse than a missing slide
      if (!(LETTERS as readonly string[]).includes(rawAnswer)) {
        console.warn(`[DesafioAdapter] Slide ${i} (${type}) skipped — invalid correctAnswer: ${slide.correctAnswer}`);
        continue;
      }
      const correctAnswer = rawAnswer as 'A' | 'B' | 'C';

      const wrongHints: Record<string, string> = {};
      if (slide.wrongAnswerHints && typeof slide.wrongAnswerHints === 'object') {
        for (const [k, v] of Object.entries(slide.wrongAnswerHints as Record<string, unknown>)) {
          if (k === 'A' || k === 'B' || k === 'C') wrongHints[k] = String(v);
        }
      }

      // Determine fill_blank: check format assignment (micro_challenge only) then slide field then question fallback
      const assignedFormat = type === 'micro_challenge' ? formats?.conceptFormats[conceptIndex] : undefined;
      const rawBlank = (slide as any).blankSentence
        || (assignedFormat?.interactionType === 'fill_blank' ? assignedFormat.blankSentence : null);
      const questionAsBlank = typeof slide.question === 'string' && slide.question.includes('___') ? slide.question : null;
      const blankSentence = (rawBlank ? String(rawBlank) : null) ?? (questionAsBlank ?? null);

      if (blankSentence) {
        const fillBlank = buildFillBlankChoices(conceptName, conceptNames, conceptIndex, i);
        if (fillBlank) {
          desafioSlides.push({
            ...base,
            type: desafioType,
            interactionType: 'fill_blank',
            blankSentence,
            blankChoices: fillBlank.choices,
            blankAnswer: fillBlank.correctAnswer,
            blankExplanation: String((slide as any).feedbackCorrect ?? slide.definition ?? ''),
            ...((slide as any).feedbackWrong ? { wrongExplanation: String((slide as any).feedbackWrong) } : {}),
          });
        } else {
          // Not enough concepts for meaningful distractors — fall back to multiple_choice
          desafioSlides.push({
            ...base,
            type: desafioType,
            interactionType: 'multiple_choice',
            question: String(slide.question),
            choices,
            correctAnswer,
            explanation: String((slide as any).feedbackCorrect ?? slide.definition ?? ''),
            ...((slide as any).feedbackWrong ? { wrongExplanation: String((slide as any).feedbackWrong) } : {}),
            ...(Object.keys(wrongHints).length > 0 ? { wrongHints } : {}),
          });
        }
      } else {
        desafioSlides.push({
          ...base,
          type: desafioType,
          interactionType: 'multiple_choice',
          question: String(slide.question),
          choices,
          correctAnswer,
          explanation: String((slide as any).feedbackCorrect ?? slide.definition ?? ''),
          ...((slide as any).feedbackWrong ? { wrongExplanation: String((slide as any).feedbackWrong) } : {}),
          ...(Object.keys(wrongHints).length > 0 ? { wrongHints } : {}),
        });
      }

      // After a reinforcement_challenge, check if a special slide should be injected
      if (type === 'reinforcement_challenge' && formats && !injectedAfter.has(conceptIndex)) {
        injectedAfter.add(conceptIndex);

        if (formats.matchPairs?.insertAfterConceptIndex === conceptIndex) {
          const mp = formats.matchPairs;
          desafioSlides.push({
            conceptIndex,
            conceptName: 'Repaso',
            emoji: '🔗',
            type: 'reinforcement_challenge',
            interactionType: 'match_pairs',
            pairsPrompt: mp.prompt,
            pairs: mp.pairs.map((p, idx) => ({ id: `pair-${idx}`, left: p.left, right: p.right })),
          });
          console.log(`[DesafioAdapter] Injected match_pairs after concept ${conceptIndex}`);
        }

        if (formats.classify?.insertAfterConceptIndex === conceptIndex) {
          const cl = formats.classify;
          desafioSlides.push({
            conceptIndex,
            conceptName: 'Clasificación',
            emoji: '🗂️',
            type: 'reinforcement_challenge',
            interactionType: 'classify',
            classifyPrompt: cl.prompt,
            classifyCategories: cl.categories,
            classifyItems: cl.items.map((it, idx) => ({ id: `item-${idx}`, text: it.text, category: it.category })),
          });
          console.log(`[DesafioAdapter] Injected classify after concept ${conceptIndex}`);
        }
      }

      continue;
    }

    // process_flow with parseable steps → order_steps interactive
    if (type === 'process_flow') {
      const correctSteps = parseProcessFlowSteps(slide);
      if (correctSteps.length >= 3) {
        const { steps, correctOrder } = shuffleSteps(correctSteps, i);
        desafioSlides.push({
          ...base,
          type: 'reinforcement_challenge',
          interactionType: 'order_steps',
          orderPrompt: `Ordena los pasos de "${String(slide.title || 'este proceso')}"`,
          steps,
          correctOrder,
        });
        continue;
      }
    }

    // Non-interactive branch
    const desafioType = STATIC_MAP[type];
    if (!desafioType) continue;

    const body = [slide.definition, slide.example]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .join('\n')
      .trim() || String(slide.title ?? '');

    desafioSlides.push({
      ...base,
      type: desafioType,
      title: String(slide.title ?? ''),
      body,
      ...(type === 'main_concept' && typeof slide.example === 'string' && slide.example.trim()
        ? { examples: [{ expression: slide.example.trim(), label: conceptName }] }
        : {}),
    });
  }

  const fillBlankCount = desafioSlides.filter(s => s.interactionType === 'fill_blank').length;
  const matchPairsCount = desafioSlides.filter(s => s.interactionType === 'match_pairs').length;
  const classifyCount = desafioSlides.filter(s => s.interactionType === 'classify').length;
  console.log(
    `[DesafioAdapter] Construido desde Misión — ${conceptNames.length} conceptos, ${desafioSlides.length} slides` +
    ` | fill_blank=${fillBlankCount} match_pairs=${matchPairsCount} classify=${classifyCount}`,
  );

  return {
    id: randomUUID(),
    topic: topic || 'Desafío de Refuerzo',
    conceptCount: conceptNames.length,
    slides: desafioSlides,
    ...(missionEmoji ? { missionEmoji } : {}),
    ...(missionTitle ? { missionTitle } : {}),
  };
}
