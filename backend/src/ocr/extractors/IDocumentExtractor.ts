import type { OCRRequest, OCRResult } from '../contracts/OCRResult.js';

/**
 * Port implemented by every top-level, document-wide extraction strategy
 * (e.g. `DigitalPdfExtractor`, `OcrExtractor`). `OCRFactory` selects a single
 * implementation at runtime based on the request's source/document type, and
 * `OCRService` depends only on this abstraction — never on a concrete class
 * (Dependency Inversion).
 *
 * Not to be confused with `IBlockExtractor`: that port is for specialists
 * that turn one already-detected region into a single block, and is used
 * internally by these document-level strategies rather than selected by
 * `OCRFactory`.
 */
export interface IDocumentExtractor {
  /** Whether this extractor is able to handle the given request. */
  supports(request: OCRRequest): boolean;
  /** Runs the extraction strategy end-to-end and returns a full OCRResult. */
  extract(request: OCRRequest): Promise<OCRResult>;
}
