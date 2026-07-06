import type { IDocumentExtractor } from './IDocumentExtractor.js';
import type { OCRRequest, OCRResult } from '../contracts/OCRResult.js';

/**
 * Future responsibility: extract text and structure from a scanned PDF or a
 * photographed page using a vision-capable OCR provider, delegating
 * image/formula/table regions to the corresponding `IBlockExtractor`
 * specialists. Not implemented in Phase 1.
 */
export class OcrExtractor implements IDocumentExtractor {
  supports(_request: OCRRequest): boolean {
    throw new Error('Not implemented');
  }

  async extract(_request: OCRRequest): Promise<OCRResult> {
    throw new Error('Not implemented');
  }
}
