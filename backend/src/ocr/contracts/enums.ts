/**
 * Central enum definitions for the OCR Engine module.
 *
 * Every discrete/categorical value used across the OCR contracts is declared
 * here as a real TypeScript `enum` — never as a magic string — so that
 * consumers get compile-time exhaustiveness checks and refactors are safe.
 */

/**
 * How the source document was originally produced/captured.
 * Mirrors the distinction the legacy `transcriptionService` already makes
 * between a digital PDF and a scanned one, generalized for future sources.
 */
export enum DocumentSourceType {
  /** Text is natively embedded in the file (e.g. exported from Word/LaTeX). */
  DIGITAL = 'DIGITAL',
  /** The file is a raster scan of a physical page (little/no embedded text). */
  SCANNED = 'SCANNED',
  /** The file is a photo taken with a camera/phone of a physical page. */
  PHOTO = 'PHOTO',
  /** Source type could not be determined yet. */
  UNKNOWN = 'UNKNOWN',
}

/** File format of the uploaded document. */
export enum DocumentType {
  PDF = 'PDF',
  IMAGE = 'IMAGE',
  DOCX = 'DOCX',
  PPTX = 'PPTX',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Discriminant for every variant of `BlockStructure`. Used to narrow the
 * `Block` union (see `contracts/PageStructure.ts`) to a concrete shape.
 */
export enum BlockType {
  TEXT = 'TEXT',
  HEADING = 'HEADING',
  LIST = 'LIST',
  ANNOTATION = 'ANNOTATION',
  IMAGE = 'IMAGE',
  FORMULA = 'FORMULA',
  TABLE = 'TABLE',
  UNKNOWN = 'UNKNOWN',
}

/** MIME type of an extracted image block. */
export enum ImageMimeType {
  PNG = 'image/png',
  JPEG = 'image/jpeg',
  WEBP = 'image/webp',
  GIF = 'image/gif',
  BMP = 'image/bmp',
  TIFF = 'image/tiff',
  UNKNOWN = 'application/octet-stream',
}

/**
 * Backing provider that produced (or will produce) an OCR result.
 * `NATIVE_PDF_TEXT` covers the no-AI-cost path (e.g. `pdf-parse`).
 */
export enum OCRProvider {
  OPENAI_VISION = 'OPENAI_VISION',
  GOOGLE_VISION = 'GOOGLE_VISION',
  TESSERACT = 'TESSERACT',
  NATIVE_PDF_TEXT = 'NATIVE_PDF_TEXT',
  UNKNOWN = 'UNKNOWN',
}

/** Detected or declared natural language of a document's content. */
export enum Language {
  ES = 'es',
  EN = 'en',
  PT = 'pt',
  UNKNOWN = 'unknown',
}

/** Physical orientation of a page as captured/scanned. */
export enum Orientation {
  PORTRAIT = 'PORTRAIT',
  LANDSCAPE = 'LANDSCAPE',
  ROTATED_90 = 'ROTATED_90',
  ROTATED_180 = 'ROTATED_180',
  ROTATED_270 = 'ROTATED_270',
}

/** Lifecycle status of an OCR run or of the document it produced. */
export enum ProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  PARTIAL_SUCCESS = 'PARTIAL_SUCCESS',
  FAILED = 'FAILED',
}

/**
 * Coordinate system a `BoundingBox` is expressed in. Different providers use
 * different reference frames (PDF points, rendered-image pixels, or a
 * normalized 0–1 percentage of the page) — this makes the difference explicit
 * instead of silently assuming one.
 */
export enum BoundingBoxUnit {
  PIXEL = 'PIXEL',
  POINT = 'POINT',
  PERCENT = 'PERCENT',
}

/** Notation a captured formula's raw expression is encoded in. */
export enum FormulaNotation {
  LATEX = 'LATEX',
  PLAIN_TEXT = 'PLAIN_TEXT',
  MATHML = 'MATHML',
  UNKNOWN = 'UNKNOWN',
}
