import type { OCRProvider, ProcessingStatus } from '../contracts/enums.js';

/**
 * A single recorded metrics snapshot for one OCR run. Colocated here for the
 * same reason as `DocumentValidationResult` — it's an implementation-specific
 * output of this collector, not a cross-cutting domain contract.
 */
export interface OCRMetricsSnapshot {
  /** Provider that handled the run this snapshot describes. */
  provider: OCRProvider;
  /** Final status of the run. */
  status: ProcessingStatus;
  /** Total wall-clock duration of the run, in milliseconds. */
  durationMs: number;
  /** Number of pages processed. */
  pageCount: number;
  /** Number of blocks extracted across all pages. */
  blockCount: number;
}

/**
 * Future responsibility: collect timing and volume metrics across an OCR run
 * for observability and cost-tracking (e.g. correlating provider + duration
 * + block count with OpenAI/Vision spend). Not implemented in Phase 1.
 */
export class OCRMetrics {
  startTimer(): void {
    throw new Error('Not implemented');
  }

  stopTimer(): void {
    throw new Error('Not implemented');
  }

  snapshot(): OCRMetricsSnapshot {
    throw new Error('Not implemented');
  }
}
