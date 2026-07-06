import { Orientation } from './enums.js';
import type { TextBlock } from './BlockStructure.js';
import type { ImageBlock } from './ImageBlock.js';
import type { FormulaBlock } from './FormulaBlock.js';
import type { TableBlock } from './TableBlock.js';

/**
 * Discriminated union of every concrete block variant a page can contain.
 * Narrow on `.type` (a `BlockType` value) to access variant-specific fields.
 */
export type Block = TextBlock | ImageBlock | FormulaBlock | TableBlock;

/**
 * A single page of a document, holding its blocks in reading order along
 * with the page's own geometry and orientation.
 */
export interface PageStructure {
  /** 1-based page number within the document. */
  pageNumber: number;
  /** Physical orientation of the page as captured/scanned. */
  orientation: Orientation;
  /** Page width, in the same unit family used by its blocks' bounding boxes. */
  width: number;
  /** Page height, in the same unit family used by its blocks' bounding boxes. */
  height: number;
  /** Every block detected on this page, in reading order. */
  blocks: Block[];
  /**
   * Convenience concatenation of every text-bearing block's content, for
   * consumers that only need a flat string and don't care about structure.
   * Null until an extractor populates it.
   */
  rawText: string | null;
}
