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
 *   process_flow             → insight                (non-interactive)
 *   challenge                → instant_feedback       (non-interactive)
 *   common_error (no Q)      → instant_feedback       (non-interactive fallback)
 *   application (no Q)       → instant_feedback       (non-interactive fallback)
 *   wow_fact (no Q)          → instant_feedback       (non-interactive fallback)
 *   victory                  → mastery_screen
 *   mission                  → (skipped)
 */

import { randomUUID } from 'crypto';

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

function parseChoices(options: string[] | null | undefined): DesafioChoice[] {
  if (!Array.isArray(options) || options.length < 2) return [];
  return options.slice(0, 3).map((opt, idx) => ({
    letter: LETTERS[idx],
    text: String(opt).replace(/^[A-D][\.\)]\s*/i, '').trim(),
  }));
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

export function buildDesafioFromMission(slides: any[], topic: string): DesafioSession {
  if (!Array.isArray(slides) || slides.length === 0) {
    return { id: randomUUID(), topic: topic || 'Desafío', conceptCount: 0, slides: [] };
  }

  const conceptAssignment = buildConceptAssignment(slides);
  const desafioSlides: DesafioSlide[] = [];

  // Collect concept names in encounter order
  const conceptNames: string[] = [];
  for (const s of slides) {
    if (s?.type === 'main_concept') {
      const name = String(s.title ?? '').trim();
      if (name) conceptNames.push(name);
    }
  }

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
      continue;
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

  console.log(`[DesafioAdapter] Construido desde Misión — ${conceptNames.length} conceptos, ${desafioSlides.length} slides`);

  return {
    id: randomUUID(),
    topic: topic || 'Desafío de Refuerzo',
    conceptCount: conceptNames.length,
    slides: desafioSlides,
  };
}
