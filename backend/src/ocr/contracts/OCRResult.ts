import { DocumentSourceType, OCRProvider, ProcessingStatus } from './enums.js';
import type { DocumentStructure } from './DocumentStructure.js';

/**
 * A single recoverable or fatal issue raised while processing a document.
 * `fatal: true` means the run could not produce a usable `DocumentStructure`;
 * `fatal: false` means processing continued despite this issue (e.g. one
 * page failed but others succeeded).
 */
export interface OCRProcessingError {
  /** Stable machine-readable error code (e.g. "UNSUPPORTED_FORMAT"). */
  code: string;
  /** Human-readable description, safe to log. */
  message: string;
  /** Page the error relates to, if applicable. Null for document-level errors. */
  pageNumber: number | null;
  /** Whether this error prevented the run from producing a usable result. */
  fatal: boolean;
}

/**
 * Input accepted by `OCRService.process()`.
 *
 * Colocated with `OCRResult` (rather than in its own contracts file) because
 * request and result form a single cohesive request/response pair for the
 * OCR pipeline's public entry point, and Phase 1's folder structure has no
 * dedicated slot for a standalone request contract.
 */
export interface OCRRequest {
  /** Raw bytes of the uploaded file. */
  buffer: Buffer;
  /** Original file name as uploaded by the user. */
  fileName: string;
  /** MIME type reported for the upload. */
  mimeType: string;
  /**
   * Caller-provided hint about how the document was produced. The engine may
   * override this after inspecting the file (e.g. a PDF with too little
   * embedded text gets treated as `SCANNED` regardless of this hint).
   */
  sourceType: DocumentSourceType;
  /** Force a specific provider; `null` lets `OCRFactory` decide. */
  requestedProvider: OCRProvider | null;
}

/**
 * Top-level output of the OCR Engine — the full processing envelope returned
 * by `OCRService.process()`. Wraps the resulting `DocumentStructure` (when
 * successful) together with run-level status, provenance and errors.
 */
export interface OCRResult {
  /** Final lifecycle status of this run. */
  status: ProcessingStatus;
  /** Provider that actually handled the request. */
  provider: OCRProvider;
  /** The extracted document, or null if extraction did not succeed. */
  document: DocumentStructure | null;
  /** Every issue encountered during processing, fatal or not. */
  errors: OCRProcessingError[];
  /** ISO-8601 timestamp of when processing started. */
  startedAt: string;
  /** ISO-8601 timestamp of when processing finished. Null while still running. */
  finishedAt: string | null;
}
