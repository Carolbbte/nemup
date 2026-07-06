import { OCRFactory } from './OCRFactory.js';
import { DocumentNormalizer } from './normalizer/DocumentNormalizer.js';
import { DocumentValidator } from './validators/DocumentValidator.js';
import { OCRMetrics } from './metrics/OCRMetrics.js';
import type { OCRRequest, OCRResult } from './contracts/OCRResult.js';

/**
 * Public entry point / application-service facade for the OCR Engine.
 *
 * Future orchestration (not implemented in Phase 1): pick an extractor via
 * `OCRFactory` → run it → normalize the result via `DocumentNormalizer` →
 * validate it via `DocumentValidator`, while `OCRMetrics` observes timing and
 * volume across the run. Consumers should depend only on this class (and the
 * `contracts/`), never on the extractor implementations directly.
 */
export class OCRService {
  constructor(
    private readonly factory: OCRFactory = new OCRFactory(),
    private readonly normalizer: DocumentNormalizer = new DocumentNormalizer(),
    private readonly validator: DocumentValidator = new DocumentValidator(),
    private readonly metrics: OCRMetrics = new OCRMetrics(),
  ) {}

  async process(_request: OCRRequest): Promise<OCRResult> {
    throw new Error('Not implemented');
  }
}
