import { BlockType } from './enums.js';
import type { BoundingBox } from './BoundingBox.js';

/**
 * Common shape shared by every block variant a page can contain
 * (`TextBlock`, `ImageBlock`, `FormulaBlock`, `TableBlock`).
 *
 * This is the base contract of the OCR document model — think of it as an
 * abstract "block" that concrete variants extend and narrow via `type`.
 * See `contracts/PageStructure.ts` for the `Block` discriminated union that
 * ties all variants together.
 */
export interface BlockStructure {
  /** Stable unique identifier for this block within its document. */
  id: string;
  /** Discriminant used to narrow a `Block` union member to its concrete shape. */
  type: BlockType;
  /** Zero-based reading order of this block within its page. */
  order: number;
  /** Where this block is located on the page. */
  boundingBox: BoundingBox;
  /** Extraction confidence for this block, from 0 (no confidence) to 1 (certain). */
  confidence: number;
}

/**
 * A block whose content is plain text: a paragraph, heading, list item, or a
 * handwritten annotation. Covers every `BlockType` that doesn't need its own
 * specialized shape (unlike images, formulas and tables).
 */
export interface TextBlock extends BlockStructure {
  type: BlockType.TEXT | BlockType.HEADING | BlockType.LIST | BlockType.ANNOTATION;
  /** The extracted text content of this block. */
  text: string;
}
