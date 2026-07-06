/**
 * Public surface of the OCR Engine module.
 *
 * Consumers should only import from this barrel — never reach into
 * `extractors/`, `normalizer/`, `validators/` or `metrics/` directly. Those
 * are internal collaborators wired together by `OCRService`; exposing only
 * the service, the factory, and the document-model contracts keeps the
 * module's internals free to change across future phases without breaking
 * callers.
 */

// ── Document model contracts ─────────────────────────────────────────────────
export type { DocumentStructure } from './contracts/DocumentStructure.js';
export type { PageStructure, Block } from './contracts/PageStructure.js';
export type { BlockStructure, TextBlock } from './contracts/BlockStructure.js';
export type { BoundingBox } from './contracts/BoundingBox.js';
export type { ImageBlock } from './contracts/ImageBlock.js';
export type { FormulaBlock } from './contracts/FormulaBlock.js';
export type { TableBlock, TableCell } from './contracts/TableBlock.js';
export type { Metadata } from './contracts/Metadata.js';
export type { OCRRequest, OCRResult, OCRProcessingError } from './contracts/OCRResult.js';
export * from './contracts/enums.js';

// ── Public ports ──────────────────────────────────────────────────────────────
export type { IDocumentExtractor } from './extractors/IDocumentExtractor.js';
export type { IBlockExtractor, RawRegion } from './extractors/IBlockExtractor.js';

// ── Public entry points ────────────────────────────────────────────────────────
export { OCRService } from './OCRService.js';
export { OCRFactory } from './OCRFactory.js';
