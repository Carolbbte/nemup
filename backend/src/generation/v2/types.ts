/**
 * Domain types for the v2 generation engine's knowledge-extraction stage.
 * `KnowledgeObject` is the single structured artifact the engine extracts
 * from a document before any pedagogical content (Desafío slides, quiz
 * questions, flashcards) is generated from it.
 */

/**
 * A single concept extracted from the source document. Fields are split by
 * downstream consumer rather than by "kind of text", since the same concept
 * needs different phrasings depending on where it's rendered:
 * `simpleExplanation` for flashcards/main_concept, `definition` for
 * fill_blank/match_pairs, `distinctiveTrait` for anything that must
 * discriminate this concept from the others in the same session.
 */
export interface KnowledgeConcept {
  /** Stable unique identifier for this concept within its KnowledgeObject. */
  id: string;
  /** Short display name of the concept. */
  name: string;
  /** 1-2 sentence, plain-language explanation — used for flashcards and main_concept slides. */
  simpleExplanation: string;
  /** Formal definition — used for fill_blank and match_pairs exercises. */
  definition: string;
  /** A concrete example illustrating the concept, or null if none applies. */
  example: string | null;
  /** Short study tips or mnemonics associated with this concept. */
  tips: string[];
  /** Difficulty rating of this concept, from 1 (easiest) to 5 (hardest). */
  difficulty: number;
  /**
   * A trait that is true for this concept and NOT true for any other concept
   * in the same KnowledgeObject — required so fill_blank/match_pairs
   * exercises can be built without ambiguity between concepts.
   */
  distinctiveTrait: string;
  /**
   * LITERAL, word-for-word fragment of the transcription this concept was
   * extracted from — never paraphrased. This is what lets `validateGrounding`
   * actually verify flashcards/questions against the source document instead
   * of trusting an empty/placeholder quote.
   */
  sourceQuote: string;
}

/** A classification bucket used by "classify" exercises, grouping concept names by a shared trait. */
export interface KnowledgeCategory {
  /** Name of the category. */
  name: string;
  /** Names of the concepts (or items) that belong to this category. */
  items: string[];
}

/**
 * The full structured knowledge extracted from a single source document —
 * the artifact the v2 engine's extraction stage produces and every later
 * generation stage consumes instead of a flat transcription string.
 */
export interface KnowledgeObject {
  /** Topic of the document, as determined by the extraction stage. */
  topic: string;
  /** Subject area of the document (e.g. "matemáticas", "historia"). */
  subject: string;
  /** Every concept extracted from the document. */
  concepts: KnowledgeConcept[];
  /** Classification categories for "classify" exercises. Empty if the content doesn't support classification. */
  categories: KnowledgeCategory[];
}
