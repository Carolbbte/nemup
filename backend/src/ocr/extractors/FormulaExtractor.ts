import type { IBlockExtractor, RawRegion } from './IBlockExtractor.js';
import type { FormulaBlock } from '../contracts/FormulaBlock.js';

/**
 * Future responsibility: specialize a detected region into a `FormulaBlock`,
 * transcribing it symbolically (e.g. LaTeX) when possible, or falling back
 * to a rendered-image reference when it can't be transcribed. Used
 * internally by `OcrExtractor`/`DigitalPdfExtractor`. Not implemented in
 * Phase 1.
 */
export class FormulaExtractor implements IBlockExtractor<FormulaBlock> {
  supports(_region: RawRegion): boolean {
    throw new Error('Not implemented');
  }

  async extract(_region: RawRegion): Promise<FormulaBlock> {
    throw new Error('Not implemented');
  }
}
