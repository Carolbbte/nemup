import type { IBlockExtractor, RawRegion } from './IBlockExtractor.js';
import type { ImageBlock } from '../contracts/ImageBlock.js';

/**
 * Future responsibility: specialize a detected region into an `ImageBlock`
 * (dimensions, MIME type, and optionally a generated description). Used
 * internally by `OcrExtractor`/`DigitalPdfExtractor`. Not implemented in
 * Phase 1.
 */
export class ImageExtractor implements IBlockExtractor<ImageBlock> {
  supports(_region: RawRegion): boolean {
    throw new Error('Not implemented');
  }

  async extract(_region: RawRegion): Promise<ImageBlock> {
    throw new Error('Not implemented');
  }
}
