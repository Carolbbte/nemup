import type { BoundingBox } from '../contracts/BoundingBox.js';

/**
 * Minimal raw input a block-level extractor receives once a document-level
 * extractor has detected a region but before it's been specialized into a
 * typed `Block`.
 */
export interface RawRegion {
  /** Page the region was found on. */
  pageNumber: number;
  /** Location of the region on its page. */
  boundingBox: BoundingBox;
  /** Raw content of the region — bytes for an image crop, text for a text run. */
  rawContent: Buffer | string;
}

/**
 * Port for a specialist that turns a `RawRegion` into a single fully-typed
 * block (`ImageBlock`, `FormulaBlock` or `TableBlock`). Used internally by
 * document-level extractors (`OcrExtractor`, `DigitalPdfExtractor`) once a
 * region has been classified as belonging to this specialist's domain.
 *
 * Deliberately generic over `TBlock` rather than sharing `IDocumentExtractor`:
 * a block-level specialist operates on one region and returns one block, not
 * a whole document — reusing the document-level contract here would violate
 * Liskov Substitution.
 */
export interface IBlockExtractor<TBlock> {
  /** Whether this specialist can process the given region. */
  supports(region: RawRegion): boolean;
  /** Produces a fully-typed block from the raw region. */
  extract(region: RawRegion): Promise<TBlock>;
}
