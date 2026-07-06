import type { IBlockExtractor, RawRegion } from './IBlockExtractor.js';
import type { TableBlock } from '../contracts/TableBlock.js';

/**
 * Future responsibility: specialize a detected region into a `TableBlock`,
 * recognizing its row/column grid and populating individual cells. Used
 * internally by `OcrExtractor`/`DigitalPdfExtractor`. Not implemented in
 * Phase 1.
 */
export class TableExtractor implements IBlockExtractor<TableBlock> {
  supports(_region: RawRegion): boolean {
    throw new Error('Not implemented');
  }

  async extract(_region: RawRegion): Promise<TableBlock> {
    throw new Error('Not implemented');
  }
}
