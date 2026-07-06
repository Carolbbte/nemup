import type { IDocumentExtractor } from './extractors/IDocumentExtractor.js';
import type { OCRRequest } from './contracts/OCRResult.js';

/**
 * Selects the correct top-level `IDocumentExtractor` implementation for a
 * given request (based on `DocumentSourceType`/`DocumentType`). Concrete
 * extractor classes are only ever instantiated here, so `OCRService` never
 * depends on them directly (Dependency Inversion) and adding a new
 * extraction strategy never requires touching `OCRService`.
 *
 * Not implemented in Phase 1.
 */
export class OCRFactory {
  createExtractor(_request: OCRRequest): IDocumentExtractor {
    throw new Error('Not implemented');
  }
}
