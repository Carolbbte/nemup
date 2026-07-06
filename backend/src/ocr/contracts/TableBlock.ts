import { BlockType } from './enums.js';
import type { BlockStructure } from './BlockStructure.js';

/**
 * A single cell within a `TableBlock`'s grid. Spans default to 1 for a
 * regular (non-merged) cell.
 */
export interface TableCell {
  /** Zero-based row position of this cell's top-left corner. */
  rowIndex: number;
  /** Zero-based column position of this cell's top-left corner. */
  columnIndex: number;
  /** How many rows this cell spans (>1 for a merged cell). */
  rowSpan: number;
  /** How many columns this cell spans (>1 for a merged cell). */
  columnSpan: number;
  /** Extracted text content of the cell. */
  text: string;
}

/**
 * A block representing a table detected on a page, modeled as an explicit
 * grid of cells rather than raw text — this is what lets later phases
 * (Knowledge Engine) reason about rows/columns instead of re-parsing text.
 */
export interface TableBlock extends BlockStructure {
  type: BlockType.TABLE;
  /** Total number of rows in the table's grid. */
  rowCount: number;
  /** Total number of columns in the table's grid. */
  columnCount: number;
  /** Flat list of every cell in the table. */
  cells: TableCell[];
}
