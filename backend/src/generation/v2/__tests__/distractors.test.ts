/**
 * distractors.ts — unit tests for the pure content-validation gate.
 * Deliberately does NOT mock the OpenAI SDK — only the deterministic
 * logic that decides whether a model-generated distractor set is safe
 * to use is exercised here.
 *
 * Regression coverage for the "blank REFUERZO options" bug: strict
 * json_schema enforces JSON shape but not string content, so the model
 * can satisfy `type: "string"` with `""`.
 */

import { describe, it, expect } from 'vitest';
import { isValidDistractorSet, type DistractorSet } from '../distractors.js';

const VALID: DistractorSet = {
  question: '¿Cuál de las siguientes opciones representa un término algebraico?',
  correctText: '3x²',
  distractors: [
    { text: '2x - 1', explanation: 'Tiene dos términos, no uno.' },
    { text: 'x + 2', explanation: 'Tiene dos términos, no uno.' },
    { text: '5', explanation: 'Es solo un número, sin parte literal.' },
  ],
};

describe('isValidDistractorSet', () => {
  it('accepts a fully populated distractor set', () => {
    expect(isValidDistractorSet(VALID)).toBe(true);
  });

  it('rejects undefined/null (no item at this array position)', () => {
    expect(isValidDistractorSet(undefined)).toBe(false);
    expect(isValidDistractorSet(null)).toBe(false);
  });

  it('rejects an empty-string question', () => {
    expect(isValidDistractorSet({ ...VALID, question: '' })).toBe(false);
  });

  it('rejects a whitespace-only correctText', () => {
    expect(isValidDistractorSet({ ...VALID, correctText: '   ' })).toBe(false);
  });

  it('rejects when any single distractor has an empty text', () => {
    expect(isValidDistractorSet({ ...VALID, distractors: [VALID.distractors[0], { text: '', explanation: 'x' }, VALID.distractors[2]] })).toBe(false);
  });

  it('rejects when any single distractor has an empty explanation', () => {
    expect(isValidDistractorSet({ ...VALID, distractors: [VALID.distractors[0], { text: '5', explanation: '' }, VALID.distractors[2]] })).toBe(false);
  });

  it('rejects when distractors has fewer than 3 entries', () => {
    expect(isValidDistractorSet({ ...VALID, distractors: VALID.distractors.slice(0, 2) })).toBe(false);
  });

  it('rejects when distractors is not an array', () => {
    expect(isValidDistractorSet({ ...VALID, distractors: undefined as unknown as DistractorSet['distractors'] })).toBe(false);
  });
});
