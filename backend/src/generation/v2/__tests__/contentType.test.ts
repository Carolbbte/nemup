import { describe, it, expect } from 'vitest';
import { resolveContentType, CAPABILITIES } from '../../../services/contentType.js';
import type { KnowledgeObject } from '../types.js';
import type { ClassificationResult } from '../../../services/pedagogicalClassifier.js';

const baseKo: KnowledgeObject = {
  isSchoolContent: true,
  rejectionReason: null,
  topic: 'Test',
  subject: 'Historia',
  concepts: [],
  categories: [],
  workedExamples: [],
};

describe('resolveContentType', () => {
  it('returns "conceptual" when the subject is not exercisable and there are no solved examples/categories', () => {
    expect(resolveContentType(baseKo)).toBe('conceptual');
  });

  it('returns "procedural" when the subject is exercisable and there is no category grouping', () => {
    const ko: KnowledgeObject = { ...baseKo, subject: 'Matemática' };
    expect(resolveContentType(ko)).toBe('procedural');
  });

  it('returns "procedural" when there is a solved example, regardless of subject', () => {
    const ko: KnowledgeObject = {
      ...baseKo,
      subject: 'Historia',
      workedExamples: [{ statement: '2m - 5n + 6m - m + 11n', answer: '7m + 6n' }],
    };
    expect(resolveContentType(ko)).toBe('procedural');
  });

  it('returns "mixed" when exercisable/solved AND there is real category grouping (the diagnosed "Términos semejantes" shape)', () => {
    const ko: KnowledgeObject = {
      ...baseKo,
      subject: 'Matemática',
      workedExamples: [{ statement: '2m - 5n + 6m - m + 11n', answer: '7m + 6n' }],
      categories: [{ name: 'Monomios', items: ['5x²', '3y'] }],
    };
    expect(resolveContentType(ko)).toBe('mixed');
  });

  it('returns "conceptual" for a non-exercisable subject even with category grouping (grouping alone never implies procedural)', () => {
    const ko: KnowledgeObject = {
      ...baseKo,
      subject: 'Biología',
      categories: [{ name: 'Órganos homólogos', items: ['Brazo humano', 'Ala de murciélago'] }],
    };
    expect(resolveContentType(ko)).toBe('conceptual');
  });

  it('uses classificationHint only as a tie-break when no structural signal fired', () => {
    const proceduralHint: ClassificationResult = {
      type: 'PROCEDURAL', confidence: 0.8,
      scores: { conceptual: 0.2, procedural: 0.8, memorization: 0 },
      detectedSkills: [],
    };
    expect(resolveContentType(baseKo, proceduralHint)).toBe('procedural');

    // A structural signal (exercisable subject) always wins over the hint,
    // even if the hint disagrees.
    const conceptualHint: ClassificationResult = {
      type: 'CONCEPTUAL', confidence: 0.8,
      scores: { conceptual: 0.8, procedural: 0.2, memorization: 0 },
      detectedSkills: [],
    };
    const ko: KnowledgeObject = { ...baseKo, subject: 'Matemática' };
    expect(resolveContentType(ko, conceptualHint)).toBe('procedural');
  });
});

describe('CAPABILITIES', () => {
  it('disallows match_pairs/example-reinforcement for pure procedural content (the actual fix for the diagnosed bug)', () => {
    expect(CAPABILITIES.procedural.allowMatchPairs).toBe(false);
    expect(CAPABILITIES.procedural.allowExampleReinforcement).toBe(false);
  });

  it('allows match_pairs/example-reinforcement for conceptual and mixed content', () => {
    expect(CAPABILITIES.conceptual.allowMatchPairs).toBe(true);
    expect(CAPABILITIES.mixed.allowMatchPairs).toBe(true);
  });
});
