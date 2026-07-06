import type { DocumentStructure } from '../contracts/DocumentStructure.js';

/**
 * Future responsibility: normalize a raw extracted `DocumentStructure`
 * (whitespace/encoding cleanup, consistent block ordering, duplicate-block
 * removal) into a clean, consistent shape before validation. Not
 * implemented in Phase 1.
 */
export class DocumentNormalizer {
  normalize(_document: DocumentStructure): DocumentStructure {
    throw new Error('Not implemented');
  }
}
