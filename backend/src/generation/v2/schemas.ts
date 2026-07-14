/**
 * JSON Schema definitions mirroring `types.ts`, shaped for OpenAI's
 * Structured Outputs in strict mode (`response_format: { type: 'json_schema', json_schema: { strict: true, ... } }`).
 *
 * Strict-mode rules applied throughout:
 *   - Every property key appears in that object's `required` array — strict
 *     mode has no concept of an optional property.
 *   - Every object has `additionalProperties: false`.
 *   - A field that `types.ts` marks nullable (`example: string | null`) is
 *     expressed as `type: ["string", "null"]`, not as an omitted property.
 */

/** Minimal JSON Schema fragment shape — loose on purpose, this isn't a general-purpose validator, just enough structure for the schemas below. */
type JsonSchema = Record<string, unknown>;

const knowledgeConceptSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'name',
    'simpleExplanation',
    'definition',
    'example',
    'hook',
    'advancedExamples',
    'tips',
    'difficulty',
    'distinctiveTrait',
    'sourceQuote',
  ],
  properties: {
    id: {
      type: 'string',
      description: 'Stable unique identifier for this concept within its KnowledgeObject.',
    },
    name: {
      type: 'string',
      description: 'Short display name of the concept.',
    },
    simpleExplanation: {
      type: 'string',
      description: '1-2 sentence, plain-language explanation — used for flashcards and main_concept slides.',
    },
    definition: {
      type: 'string',
      description: 'Formal definition — used for fill_blank and match_pairs exercises.',
    },
    example: {
      type: ['string', 'null'],
      description: 'A concrete example illustrating the concept, or null if none applies.',
    },
    hook: {
      type: ['string', 'null'],
      description: 'A short (≤20 words) teen-relatable everyday hook/analogy connecting this concept to a teenager\'s life — must be a correct, non-distorting analogy, or null if no honest one applies. Never a substitute for definition/example.',
    },
    advancedExamples: {
      type: 'array',
      items: { type: 'string' },
      description: 'Harder/more advanced examples of the same concept (e.g. distinct exercises from a "Desafío" section) — one entry per distinct variant. Empty if the material only shows one difficulty tier.',
    },
    tips: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short study tips or mnemonics associated with this concept.',
    },
    difficulty: {
      type: 'number',
      minimum: 1,
      maximum: 5,
      description: 'Difficulty rating of this concept, from 1 (easiest) to 5 (hardest).',
    },
    distinctiveTrait: {
      type: 'string',
      description:
        'A trait that is true for this concept and NOT true for any other concept in the same KnowledgeObject — required so fill_blank/match_pairs exercises can be built without ambiguity.',
    },
    sourceQuote: {
      type: 'string',
      description:
        'LITERAL, word-for-word fragment of the transcription this concept was extracted from — never paraphrased, must be findable verbatim in the source text.',
    },
  },
};

const workedExampleSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['statement', 'answer'],
  properties: {
    statement: {
      type: 'string',
      description: 'LITERAL exercise statement, copied word-for-word from the material.',
    },
    answer: {
      type: 'string',
      description: 'LITERAL correct answer, copied word-for-word from the material — never computed by the model.',
    },
  },
};

const knowledgeCategorySchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'items'],
  properties: {
    name: {
      type: 'string',
      description: 'Name of the category.',
    },
    items: {
      type: 'array',
      items: { type: 'string' },
      description: 'Names of the concepts (or items) that belong to this category.',
    },
  },
};

const knowledgeObjectJsonSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['topic', 'subject', 'concepts', 'categories', 'workedExamples'],
  properties: {
    topic: {
      type: 'string',
      description: 'Topic of the document, as determined by the extraction stage.',
    },
    subject: {
      type: 'string',
      description: 'Subject area of the document (e.g. "matemáticas", "historia").',
    },
    concepts: {
      type: 'array',
      items: knowledgeConceptSchema,
      description: 'Every concept extracted from the document.',
    },
    categories: {
      type: 'array',
      items: knowledgeCategorySchema,
      description: "Classification categories for \"classify\" exercises. Empty if the content doesn't support classification.",
    },
    workedExamples: {
      type: 'array',
      items: workedExampleSchema,
      description: 'Exercises from the material that already provide both a statement and its answer. Empty if none.',
    },
  },
};

/**
 * Ready-to-use `response_format` value for
 * `openai.chat.completions.create({ ..., response_format: knowledgeObjectSchema })`,
 * enforcing that the model's output structurally matches `KnowledgeObject`.
 */
export const knowledgeObjectSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'knowledge_object',
    strict: true,
    schema: knowledgeObjectJsonSchema,
  },
} as const;
