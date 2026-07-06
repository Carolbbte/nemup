import { BoundingBoxUnit } from './enums.js';

/**
 * Axis-aligned rectangle describing where a block sits on a page.
 *
 * The reference frame is NOT assumed to be pixels — `unit` makes the
 * coordinate system explicit, since a digital-PDF extractor (points), an
 * image-based OCR provider (pixels) and a normalized-coordinate provider
 * (percent) all report geometry differently. Consumers must check `unit`
 * before comparing or converting boxes from different sources.
 */
export interface BoundingBox {
  /** Horizontal distance from the page's top-left origin. */
  x: number;
  /** Vertical distance from the page's top-left origin. */
  y: number;
  /** Width of the box, in `unit`. */
  width: number;
  /** Height of the box, in `unit`. */
  height: number;
  /** Coordinate system `x`, `y`, `width` and `height` are expressed in. */
  unit: BoundingBoxUnit;
}
