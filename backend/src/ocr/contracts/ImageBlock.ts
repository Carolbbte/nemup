import { BlockType, ImageMimeType } from './enums.js';
import type { BlockStructure } from './BlockStructure.js';

/**
 * A block representing an image, photo, diagram or figure detected on a page.
 *
 * Phase 1 note: this contract only describes the STRUCTURE of an image block.
 * Whether/how its pixel data is stored (inline base64, a storage bucket
 * reference, or discarded after description) is a decision for later phases —
 * `storageRef` and `description` are both nullable so early phases can leave
 * them empty without needing to change this contract.
 */
export interface ImageBlock extends BlockStructure {
  type: BlockType.IMAGE;
  /** MIME type of the underlying image data. */
  mimeType: ImageMimeType;
  /** Intrinsic width of the image, in pixels. */
  width: number;
  /** Intrinsic height of the image, in pixels. */
  height: number;
  /**
   * Human-readable description of what the image depicts (e.g. a caption or
   * a generated alt-text). Null until a future phase populates it.
   */
  description: string | null;
  /**
   * Reference to where the image bytes are persisted (e.g. a storage bucket
   * path or URL). Null when the image hasn't been persisted separately.
   */
  storageRef: string | null;
}
