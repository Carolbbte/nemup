import { isExercisableSubject } from '../generation/v2/exerciseGenerator.js';
import type { KnowledgeObject } from '../generation/v2/types.js';
import type { ClassificationResult } from './pedagogicalClassifier.js';

/**
 * Single source of truth for "conceptual vs procedural vs mixed", replacing
 * the three previously-decoupled signals (classifyContent's regex label,
 * `ko.workedExamples.length >= 1`, `isExercisableSubject`) that never
 * consulted each other — see orchestrator.ts's own history for why that was
 * a real, diagnosed problem (a procedural worksheet with a definitional
 * preamble scored CONCEPTUAL under the old regex classifier, silently
 * enabling match_pairs on content it was designed to skip).
 *
 * Behind FEATURE_CONTENT_TYPE_V2 (config.ts, off by default) — see
 * orchestrator.ts for how the flag picks which source actually drives
 * `capabilities` today vs when it's on.
 */
export type ContentType = 'conceptual' | 'procedural' | 'mixed';

/**
 * What a given ContentType enables. Only `allowMatchPairs`/
 * `allowExampleReinforcement` are wired into assemble.ts/buildDesafio today
 * — those are the only two flags that code actually reads (confirmed by
 * grepping every consumption site before writing this). fill_blank,
 * classify, and worked_example each have their OWN independent, data-driven
 * eligibility (sibling concept names, ko.categories, workedExampleResults
 * respectively) — they are NOT content-type-gated today, and this table
 * does not change that.
 *
 * `roleAware` (Paso 3) is a REAL gate too — consumed by assemble.ts's
 * per-concept loop and threaded into exerciseGenerator.ts's buildSlotPlan —
 * see each one's own comment for exactly what it changes.
 *
 * `findError` is ALSO a real gate — consumed by orchestrator.ts (whether to
 * call findError.ts's generateFindError at all) and assemble.ts's
 * per-concept loop (whether to replace a `role === 'procedure'` concept's
 * micro_challenge with its find_error result). Kept `false` in every profile
 * below on purpose — "ship inert first": the plumbing is complete and fully
 * wired, but stays a no-op even with FEATURE_CONTENT_TYPE_V2 on until a
 * later, separate change flips it to `true` for `procedural`/`mixed` once
 * validated. Do not assume it has any effect while it reads `false` here.
 *
 * `quizStyle`/`missionExercises`/`workedSteps` are still RESERVED for future
 * iterations — declared here so that work has a shape to fill in, but
 * nothing reads them yet. Do not assume they have any effect until something
 * is wired to consume them.
 */
export interface ContentCapabilities {
  // ── Real gates — consumed by assemble.ts/buildDesafio/exerciseGenerator ─
  allowMatchPairs: boolean;
  allowExampleReinforcement: boolean;
  // When true, assemble.ts consults each concept's `role` (comprehension.ts)
  // to lighten a "supporting" concept's footprint (skips its second
  // reinforcement_challenge) and exerciseGenerator.ts's buildSlotPlan
  // concentrates variant/practice slots on "procedure" concepts. Both
  // consumers ALSO require at least one concept actually tagged "procedure"
  // in the session — if the model tagged none (or `role` is absent
  // entirely), both fall back to today's unweighted behavior instead of
  // stripping every concept's reinforcement. See assemble.ts's
  // `hasProcedureConcept` guard.
  roleAware: boolean;

  // ── Reserved for future iterations — NOT wired into assemble.ts yet ────
  quizStyle: 'conceptual' | 'exercise';
  missionExercises: Array<'fill_blank' | 'match_pairs' | 'worked_example'>;
  workedSteps: boolean;
  findError: boolean;
}

/** Default for any existing/new caller that doesn't pass capabilities —
 * identical to today's `allowMatchPairs = true, allowExampleReinforcement =
 * true` function defaults in assemble.ts, so omitting this parameter stays
 * byte-identical to before it existed. `roleAware: false` for the same
 * reason — never consults `role` unless a caller opts in explicitly. */
export const DEFAULT_CAPABILITIES: ContentCapabilities = {
  allowMatchPairs: true,
  allowExampleReinforcement: true,
  roleAware: false,
  quizStyle: 'conceptual',
  missionExercises: ['fill_blank', 'match_pairs'],
  workedSteps: false,
  findError: false,
};

export const CAPABILITIES: Record<ContentType, ContentCapabilities> = {
  conceptual: {
    allowMatchPairs: true,
    allowExampleReinforcement: true,
    // Every concept is "supporting" by convention in conceptual sessions
    // (per comprehension.ts's own instruction) — role-awareness would be a
    // no-op here anyway, kept false for clarity and to match DEFAULT.
    roleAware: false,
    quizStyle: 'conceptual',
    missionExercises: ['fill_blank', 'match_pairs'],
    workedSteps: false,
    findError: false,
  },
  procedural: {
    // The actual fix for the diagnosed bug: a worksheet with a
    // definitional preamble but no real category grouping no longer gets
    // match_pairs just because a regex miscounted it as CONCEPTUAL.
    allowMatchPairs: false,
    allowExampleReinforcement: false,
    roleAware: true,
    quizStyle: 'exercise',
    missionExercises: ['worked_example'],
    workedSteps: true,
    findError: true,
  },
  mixed: {
    // `mixed` here means real category grouping WAS detected alongside
    // exercise/worked-example content — the grouping is exactly the signal
    // that justifies match_pairs, so it stays enabled.
    allowMatchPairs: true,
    allowExampleReinforcement: true,
    roleAware: true,
    quizStyle: 'exercise',
    missionExercises: ['fill_blank', 'match_pairs', 'worked_example'],
    workedSteps: true,
    findError: false,
  },
};

export interface ContentTypeSignals {
  isExercisable: boolean;
  hasSolved: boolean;
  hasGrouping: boolean;
}

/**
 * Pure function — resolves ContentType from the KnowledgeObject's own
 * STRUCTURED signals (subject, workedExamples, categories), not from a
 * regex over the raw transcription. `classificationHint` (classifyContent's
 * existing result) is accepted ONLY as an optional tie-breaker for material
 * that is neither exercisable nor has solved examples nor has grouping —
 * genuinely ambiguous cases where the old regex label is better than
 * nothing. It is never the primary decision.
 */
export function resolveContentType(
  ko: KnowledgeObject,
  classificationHint?: ClassificationResult,
): ContentType {
  const signals: ContentTypeSignals = {
    isExercisable: isExercisableSubject(ko.subject ?? ''),
    hasSolved: ko.workedExamples.length >= 1,
    hasGrouping: (ko.categories?.length ?? 0) >= 1,
  };

  let type: ContentType;
  if (signals.isExercisable || signals.hasSolved) {
    type = signals.hasGrouping ? 'mixed' : 'procedural';
  } else if (classificationHint && classificationHint.type === 'PROCEDURAL') {
    // Tie-break only: neither isExercisable nor hasSolved fired, but the
    // regex classifier still saw strong procedural signal in the raw text
    // (e.g. a subject not on the fixed exercisable-subject list). Softer
    // than the primary structural signals, never overrides them.
    type = signals.hasGrouping ? 'mixed' : 'procedural';
  } else {
    type = 'conceptual';
  }

  console.log(
    '[ContentType] resolved=%s (exercisable=%s, solved=%s, grouping=%s)',
    type, signals.isExercisable, signals.hasSolved, signals.hasGrouping,
  );

  return type;
}
