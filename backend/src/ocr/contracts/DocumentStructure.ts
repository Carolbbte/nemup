import { DocumentSourceType, DocumentType, Language } from './enums.js';
import type { PageStructure } from './PageStructure.js';
import type { Metadata } from './Metadata.js';

/**
 * Root aggregate of the OCR document model: a fully structured
 * representation of an uploaded document, independent of which extractor
 * produced it. This is the shape the future Knowledge Engine and Generation
 * Engine will consume instead of a flat transcription string.
 */
export interface DocumentStructure {
  /** Stable unique identifier for this document. */
  id: string;
  /** How the source document was originally produced/captured. */
  sourceType: DocumentSourceType;
  /** File format of the source document. */
  documentType: DocumentType;
  /** Primary language of the document's content. */
  language: Language;
  /** Every page of the document, in order. */
  pages: PageStructure[];
  /** Cross-cutting metadata about the document and the run that produced it. */
  metadata: Metadata;
}
