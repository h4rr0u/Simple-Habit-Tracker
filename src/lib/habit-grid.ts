/**
 * Geometry helpers for the free-form "Grid Canvas" on /habits.
 *
 * The canvas is a fixed four-column CSS grid with unbounded rows. Every habit
 * stores its cell in `positionX` (column, 0-3) and `positionY` (row, 0+), so
 * empty cells and empty rows are meaningful and survive reloads.
 */

/** Number of columns in the /habits grid canvas. */
export const HABIT_GRID_COLUMNS = 4;

/** A cell on the canvas; both values are zero-based. */
export interface HabitGridCell {
  x: number;
  y: number;
}

/** Minimal shape needed to place or move an item on the canvas. */
export interface HabitGridItem {
  id: number;
  positionX: number;
  positionY: number;
}

/** Position update produced by {@link resolveHabitMove}. */
export type HabitGridUpdate = HabitGridItem;

/** Clamps a cell into the canvas bounds (columns 0-3, rows 0+). */
export function clampCell(cell: HabitGridCell): HabitGridCell {
  return {
    x: Math.min(HABIT_GRID_COLUMNS - 1, Math.max(0, Math.trunc(cell.x))),
    y: Math.max(0, Math.trunc(cell.y)),
  };
}

/**
 * Finds the first free cell for a new habit.
 *
 * Scanning starts on the last occupied row (or row 0 for an empty canvas), so
 * a freshly created habit appears right below the existing block and fills a
 * hole in that row before opening a new one.
 */
export function nextFreeCell(
  items: ReadonlyArray<Pick<HabitGridItem, "positionX" | "positionY">>
): HabitGridCell {
  const taken = new Set(items.map((item) => `${item.positionX}:${item.positionY}`));
  const lastRow = items.reduce((max, item) => Math.max(max, item.positionY), -1);

  let x = 0;
  let y = Math.max(0, lastRow);
  while (taken.has(`${x}:${y}`)) {
    x += 1;
    if (x >= HABIT_GRID_COLUMNS) {
      x = 0;
      y += 1;
    }
  }
  return { x, y };
}

/**
 * Resolves a drop onto `target`.
 *
 * - An empty cell receives the dragged habit.
 * - An occupied cell swaps the two habits, so cards never overlap.
 * - Dropping a habit onto its own cell is a no-op.
 *
 * Returns the minimal set of position updates (the dragged habit plus, for a
 * swap, the displaced one).
 */
export function resolveHabitMove(
  items: ReadonlyArray<HabitGridItem>,
  movingId: number,
  target: HabitGridCell
): HabitGridUpdate[] {
  const moving = items.find((item) => item.id === movingId);
  if (!moving) return [];

  const cell = clampCell(target);
  if (moving.positionX === cell.x && moving.positionY === cell.y) return [];

  const updates: HabitGridUpdate[] = [
    { id: moving.id, positionX: cell.x, positionY: cell.y },
  ];

  const occupant = items.find(
    (item) =>
      item.id !== moving.id &&
      item.positionX === cell.x &&
      item.positionY === cell.y
  );
  if (occupant) {
    updates.push({
      id: occupant.id,
      positionX: moving.positionX,
      positionY: moving.positionY,
    });
  }
  return updates;
}

/** Measured layout of the grid container, in CSS pixels. */
export interface HabitGridMetrics {
  /** Width of one column. */
  columnWidth: number;
  /** Horizontal gap between columns. */
  columnGap: number;
  /** Heights of the rows that are currently laid out, top to bottom. */
  rowHeights: number[];
  /** Vertical gap between rows. */
  rowGap: number;
  /** Height used for rows below the last laid-out one. */
  defaultRowHeight: number;
}

/**
 * How many empty rows may be opened below the last laid-out one.
 *
 * Without this cap a drop near the bottom of a tall page could land on row 100
 * and strand a single card far below the rest of the canvas.
 */
export const MAX_EXTRAPOLATED_ROWS = 5;

/**
 * Maps a point (relative to the grid's top-left corner) to a canvas cell.
 *
 * Rows below the last laid-out row are extrapolated with the default row
 * height, so dropping into the empty area still resolves to a concrete cell
 * instead of being clamped to the bottom. The result is capped at
 * `lastRow + MAX_EXTRAPOLATED_ROWS`, so a card can never be dropped hundreds
 * of rows below its neighbours.
 */
export function cellFromPoint(
  pointX: number,
  pointY: number,
  metrics: HabitGridMetrics
): HabitGridCell {
  const columnStride = metrics.columnWidth + metrics.columnGap;
  const x =
    columnStride > 0 ? Math.floor(pointX / columnStride) : 0;

  let top = 0;
  for (let index = 0; index < metrics.rowHeights.length; index += 1) {
    const bottom = top + metrics.rowHeights[index] + metrics.rowGap;
    if (pointY < bottom) {
      return clampCell({ x, y: index });
    }
    top = bottom;
  }

  const occupiedRows = metrics.rowHeights.length;
  const lastHeight =
    metrics.rowHeights[occupiedRows - 1] ?? metrics.defaultRowHeight;
  const rowStride = lastHeight + metrics.rowGap;
  const extraRows =
    rowStride > 0 ? Math.max(0, Math.floor((pointY - top) / rowStride)) : 0;

  const lastRow = Math.max(0, occupiedRows - 1);
  const maxY = lastRow + MAX_EXTRAPOLATED_ROWS;

  return clampCell({ x, y: Math.min(maxY, occupiedRows + extraRows) });
}
