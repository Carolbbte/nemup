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
  /**
   * A short (3-6 word) label identifying `example` — concrete and complete
   * enough to stand alone (e.g. "Mano humana vs. ala de murciélago" for a
   * long-form example about homologous bones), used where `example`'s full
   * sentence is too long to display (match_pairs' right-column cards — see
   * assemble.ts's buildMisionMatchPairs). Null when no honest short label
   * applies — never a truncation of `example`, and never a substitute for
   * it as a source of truth (the long form is still what concept cards show).
   */
  exampleShort: string | null;
  /**
   * A short (≤20 words), teen-relatable everyday hook or analogy connecting
   * this concept to a teenager's life (e.g. for "evolution": a family recipe
   * each generation tweaks) — purely an engagement device, never a source of
   * truth. Must be a CORRECT analogy that doesn't distort the concept; null
   * when no honest one applies rather than forcing a misleading comparison.
   * `definition`/`example` remain the actual anchor to the material.
   */
  hook: string | null;
  /**
   * A single thematic emoji representing THIS concept's subject (e.g. 🧬 for
   * "Evolución", 🦴 for "Registro fósil") — never a generic one shared across
   * every concept (💡/✅/📚). Null when no clear thematic emoji applies.
   * Reused as match_pairs' left-column icon (see assemble.ts's
   * buildMisionMatchPairs) as well as the main_concept slide's own emoji.
   */
  emoji: string | null;
  /**
   * A single emoji representing `exampleShort` specifically (the concrete
   * example, not the concept itself) — MUST differ from `emoji` (e.g. 🧬 for
   * the concept "Evolución" but 🐦 for its example "Pico del pinzón de
   * Darwin"). Used only as match_pairs' right-column icon: the right column
   * is shuffled, so a matching emoji on both sides would give the correct
   * pair away before the student reads the text. Null when no clear,
   * distinct-from-`emoji` example emoji applies. Optional (unlike the other
   * extraction fields) so existing code/fixtures built before this field
   * existed don't need updating — the AI-extraction schema always sets it
   * (see schemas.ts's `required`), this laxer TS type is only for callers
   * constructing a KnowledgeConcept by hand.
   */
  exampleEmoji?: string | null;
  /**
   * A short (2-5 word) fragment to highlight in color on the concept card —
   * the single most important idea in `simpleExplanation`. MUST be a LITERAL
   * substring of `simpleExplanation` (verbatim, not paraphrased) since the
   * frontend locates it by string search to color it; a non-literal value
   * simply won't be found and nothing gets highlighted. Null when no clear
   * fragment is worth highlighting.
   */
  keyPhrase: string | null;
  /**
   * Harder/more advanced examples of the SAME concept — plural because a
   * document can show MULTIPLE distinct harder variants for one concept
   * (e.g. a "Desafío" section with one exercise that adds parentheses and
   * another that adds parentheses AND fractions). A singular field here
   * would force a choice between them, silently dropping whichever variant
   * lost and starving exerciseGenerator.ts of any signal it existed — this
   * is exactly what happened before: two concepts both grabbed the same
   * first "Desafío" item, and the fraction-bearing one was never captured
   * anywhere. Empty array if the material only shows one difficulty tier.
   */
  advancedExamples: string[];
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

/**
 * An exercise the source material already solves — both the statement and
 * its correct answer are copied LITERALLY from the material, never computed
 * or invented. This is the safety anchor for the procedural mode: the engine
 * only ever explains the path to an answer that was already given, never
 * derives a new one.
 */
export interface WorkedExample {
  /** LITERAL exercise statement, copied word-for-word from the material. */
  statement: string;
  /** LITERAL correct answer, copied word-for-word from the material — never computed by the model. */
  answer: string;
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
  /**
   * Whether the material corresponds to any school subject at all — the
   * model's own judgment call, made before it tries to extract concepts.
   * `orchestrator.ts` unconditionally rejects non-academic uploads (a
   * receipt, a random photo) based on this, before spending the second
   * (paid) AI call — NemUp is a school-support app, so this is never
   * gated behind a flag.
   */
  isSchoolContent: boolean;
  /** Short explanation of why `isSchoolContent` is false — null when true. Logged/surfaced on rejection, never shown verbatim to the end user (the rejection message is a fixed string). */
  rejectionReason: string | null;
  /** Topic of the document, as determined by the extraction stage. */
  topic: string;
  /** Subject area of the document (e.g. "matemáticas", "historia"). */
  subject: string;
  /** Every concept extracted from the document. */
  concepts: KnowledgeConcept[];
  /** Classification categories for "classify" exercises. Empty if the content doesn't support classification. */
  categories: KnowledgeCategory[];
  /**
   * Exercises from the material that already provide both a statement and
   * its answer — the trigger for procedural mode (see generation/v2/procedural.ts).
   * Empty when the material has no solved exercises, in which case the engine
   * stays on the conceptual path unchanged.
   */
  workedExamples: WorkedExample[];
}
