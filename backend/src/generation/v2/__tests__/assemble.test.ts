/**
 * assemble.ts — unit tests for buildSummarySlides, focused on the
 * "correctAnswer must be a letter, not literal text" regression: the
 * frontend Mission player stores the tapped LETTER and compares it
 * against `slide.correctAnswer` for every interactive slide type. Storing
 * the literal answer text there (as this function used to) made that
 * comparison always false — the student was never marked correct, and
 * the CTA's wrong-answer feedback path fired on every answer.
 */

import { describe, it, expect } from 'vitest';
import { buildSummarySlides, shuffleWithLetterAnswer } from '../assemble.js';
import type { KnowledgeObject } from '../types.js';
import type { DistractorSet } from '../distractors.js';

const LETTERS = ['A', 'B', 'C', 'D'];

describe('shuffleWithLetterAnswer', () => {
  it('returns a correctAnswer letter that indexes back to the correct text', () => {
    for (let i = 0; i < 20; i++) {
      const { options, correctAnswer } = shuffleWithLetterAnswer('3x²', ['2x - 1', 'x + 2', '5']);
      expect(options).toHaveLength(4);
      expect(LETTERS).toContain(correctAnswer);
      expect(options[LETTERS.indexOf(correctAnswer)]).toBe('3x²');
    }
  });
});

const ko: KnowledgeObject = {
  topic: 'Expresiones algebraicas',
  subject: 'Matemática',
  concepts: [
    {
      id: 'c1',
      name: 'Término algebraico',
      simpleExplanation: 'Un número junto a una letra.',
      definition: 'Un término algebraico combina un coeficiente y una parte literal.',
      example: '5x²',
      tips: [],
      difficulty: 2,
      distinctiveTrait: 'Es el único formado por un coeficiente y una parte literal.',
      sourceQuote: 'Un término algebraico está compuesto por un coeficiente numérico y una parte literal.',
    },
    {
      id: 'c2',
      name: 'Términos semejantes',
      simpleExplanation: 'Términos con la misma parte literal.',
      definition: 'Dos términos son semejantes cuando comparten la misma parte literal.',
      example: '3x y 5x',
      tips: [],
      difficulty: 4,
      distinctiveTrait: 'Es el único que exige comparar la parte literal de dos términos.',
      sourceQuote: 'Dos términos son semejantes cuando tienen exactamente la misma parte literal.',
    },
  ],
  categories: [],
  workedExamples: [],
};

const distractors: Record<string, DistractorSet> = {
  c1: {
    question: '¿Cuál de las siguientes opciones representa un término algebraico?',
    correctText: '3x²',
    distractors: ['2x - 1', 'x + 2', '5'],
  },
  c2: {
    question: '¿Cuáles de los siguientes son términos semejantes?',
    correctText: '3x y 5x',
    distractors: ['3x y 3x²', '3x y 3y', '3 y 5'],
  },
};

describe('buildSummarySlides — correctAnswer format', () => {
  it('stores correctAnswer as a letter that resolves to the correct text within options, for every interactive type', () => {
    const slides = buildSummarySlides(ko, distractors);
    const interactive = slides.filter((s) => s.type === 'micro_challenge' || s.type === 'reinforcement_challenge' || s.type === 'final_challenge');

    expect(interactive.length).toBeGreaterThan(0);
    for (const slide of interactive) {
      expect(LETTERS).toContain(slide.correctAnswer);
      const letterIdx = LETTERS.indexOf(slide.correctAnswer!);
      const chosenText = (slide.options as string[])[letterIdx];
      // The boss slide reuses the hardest concept's distractor set (c2 here, difficulty 4);
      // the others use their own concept's set — either way, the letter must resolve to
      // that same set's correctText, never to a distractor.
      const isC1 = chosenText === distractors.c1.correctText;
      const isC2 = chosenText === distractors.c2.correctText;
      expect(isC1 || isC2).toBe(true);
    }
  });

  it('skips a concept entirely (no micro_challenge/main_concept/reinforcement_challenge triple) when it has no distractor', () => {
    const partialDistractors: Record<string, DistractorSet> = { c1: distractors.c1 }; // c2 missing
    const slides = buildSummarySlides(ko, partialDistractors);

    const tripleTypes = new Set(['micro_challenge', 'main_concept', 'reinforcement_challenge']);
    const c2Slides = slides.filter((s) => tripleTypes.has(s.type) && (s.title?.includes('Términos semejantes') || s.definition?.includes('semejantes')));
    expect(c2Slides).toHaveLength(0);
  });

  it('returns an empty array when there are no concepts', () => {
    expect(buildSummarySlides({ ...ko, concepts: [] }, distractors)).toEqual([]);
  });
});
