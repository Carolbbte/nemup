import type { DocumentStructure } from '../contracts/DocumentStructure.js';

/**
 * Outcome of validating a `DocumentStructure`. Colocated here rather than in
 * `contracts/` because it's an implementation-specific output of this
 * validator, not a cross-cutting domain contract other layers depend on.
 */
export interface DocumentValidationResult {
  /** Whether the document passed every structural invariant check. */
  isValid: boolean;
  /** Human-readable description of each failed invariant, if any. */
  issues: string[];
}

/**
 * Future responsibility: enforce structural invariants on a normalized
 * `DocumentStructure` (e.g. non-empty pages, valid bounding boxes,
 * consistent block ordering) before it's handed to the Knowledge Engine.
 * Not implemented in Phase 1.
 */
export class DocumentValidator {
  validate(_document: DocumentStructure): DocumentValidationResult {
    throw new Error('Not implemented');
  }
}
