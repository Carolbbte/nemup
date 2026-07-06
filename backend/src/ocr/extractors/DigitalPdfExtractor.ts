import type { IDocumentExtractor } from './IDocumentExtractor.js';
import type { OCRRequest, OCRResult } from '../contracts/OCRResult.js';

/**
 * Future responsibility: extract text and structure directly from a digital
 * (non-scanned) PDF's embedded text layer, without any OCR/vision call —
 * the zero-AI-cost path, equivalent to today's `pdf-parse` usage in
 * `transcriptionService`. Not implemented in Phase 1.
 */
export class DigitalPdfExtractor implements IDocumentExtractor {
  supports(_request: OCRRequest): boolean {
    throw new Error('Not implemented');
  }

  async extract(_request: OCRRequest): Promise<OCRResult> {
    throw new Error('Not implemented');
  }
}
