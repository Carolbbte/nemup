import { Language, OCRProvider, ProcessingStatus } from './enums.js';

/**
 * Cross-cutting metadata about a processed document. Attached at the
 * `DocumentStructure` level (not nested under any particular block) since it
 * describes the document/run as a whole, not any single piece of content.
 */
export interface Metadata {
  /** Original file name as uploaded by the user. */
  sourceFileName: string;
  /** Size of the original file, in bytes. */
  fileSizeBytes: number;
  /** Total number of pages in the document. */
  pageCount: number;
  /** Provider that produced the extraction (or `UNKNOWN` before processing). */
  ocrProvider: OCRProvider;
  /** Current lifecycle status of the extraction that produced this document. */
  processingStatus: ProcessingStatus;
  /** Wall-clock time the extraction took, in milliseconds. Null until finished. */
  processingDurationMs: number | null;
  /** ISO-8601 timestamp of when extraction completed. Null until finished. */
  extractedAt: string | null;
  /** Detected (or declared) primary language of the document's content. */
  languageDetected: Language;
  /** Content hash of the source file, for future caching/dedup. Null if not computed. */
  checksum: string | null;
  /**
   * Open-ended bag for provider-specific or experimental fields that don't
   * yet warrant a first-class property. Using this instead of widening the
   * interface for every one-off field is what lets `Metadata` stay stable
   * across future phases without breaking changes.
   */
  custom: Record<string, unknown>;
}
