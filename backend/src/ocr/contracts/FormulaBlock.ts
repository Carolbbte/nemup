import { BlockType, FormulaNotation } from './enums.js';
import type { BlockStructure } from './BlockStructure.js';
import type { ImageBlock } from './ImageBlock.js';

/**
 * A block representing a mathematical/scientific formula detected on a page.
 *
 * Kept separate from `TextBlock` because formulas need their own notation
 * metadata (`notation`) and, unlike plain text, may only be recoverable as an
 * image when a provider can't transcribe them symbolically — hence
 * `renderedAs`.
 */
export interface FormulaBlock extends BlockStructure {
  type: BlockType.FORMULA;
  /** Notation the formula's raw expression is encoded in. */
  notation: FormulaNotation;
  /** The formula's expression, encoded per `notation`. */
  rawExpression: string;
  /**
   * If the extractor could not transcribe the formula symbolically and
   * instead captured it as a cropped image, this references that image
   * block. Null when `rawExpression` was extracted directly.
   */
  renderedAs: ImageBlock | null;
}
