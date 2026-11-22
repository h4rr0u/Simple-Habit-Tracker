import { describe, expect, it } from "vitest";

import {
  cellFromPoint,
  MAX_EXTRAPOLATED_ROWS,
  nextFreeCell,
  resolveHabitMove,
  type HabitGridMetrics,
} from "./habit-grid";

describe("nextFreeCell", () => {
  it("starts at the top-left of an empty canvas", () => {
    expect(nextFreeCell([])).toEqual({ x: 0, y: 0 });
  });

  it("fills a row left to right, then wraps", () => {
    const occupied = [
      { positionX: 0, positionY: 0 },
      { positionX: 1, positionY: 0 },
      { positionX: 2, positionY: 0 },
      { positionX: 3, positionY: 0 },
    ];

    expect(nextFreeCell(occupied)).toEqual({ x: 0, y: 1 });
  });

  it("fills a hole in the last occupied row", () => {
    const occupied = [
      { positionX: 0, positionY: 1 },
      { positionX: 2, positionY: 1 },
    ];

    expect(nextFreeCell(occupied)).toEqual({ x: 1, y: 1 });
  });
});

describe("resolveHabitMove", () => {
  const items = [
    { id: 1, positionX: 0, positionY: 0 },
    { id: 2, positionX: 1, positionY: 0 },
  ];

  it("moves a habit into an empty cell", () => {
    expect(resolveHabitMove(items, 1, { x: 3, y: 5 })).toEqual([
      { id: 1, positionX: 3, positionY: 5 },
    ]);
  });

  it("swaps two habits when the target cell is occupied", () => {
    expect(resolveHabitMove(items, 1, { x: 1, y: 0 })).toEqual([
      { id: 1, positionX: 1, positionY: 0 },
      { id: 2, positionX: 0, positionY: 0 },
    ]);
  });

  it("is a no-op when the habit is dropped on its own cell", () => {
    expect(resolveHabitMove(items, 1, { x: 0, y: 0 })).toEqual([]);
  });

  it("clamps drops outside the canvas", () => {
    expect(resolveHabitMove(items, 1, { x: 9, y: -4 })).toEqual([
      { id: 1, positionX: 3, positionY: 0 },
    ]);
  });

  it("ignores unknown habits", () => {
    expect(resolveHabitMove(items, 99, { x: 2, y: 2 })).toEqual([]);
  });
});

describe("cellFromPoint", () => {
  const metrics: HabitGridMetrics = {
    columnWidth: 100,
    columnGap: 10,
    rowHeights: [200, 150],
    rowGap: 16,
    defaultRowHeight: 200,
  };

  it("maps x to the column under the point", () => {
    expect(cellFromPoint(0, 0, metrics).x).toBe(0);
    expect(cellFromPoint(105, 0, metrics).x).toBe(0);
    expect(cellFromPoint(110, 0, metrics).x).toBe(1);
    expect(cellFromPoint(220, 0, metrics).x).toBe(2);
    expect(cellFromPoint(400, 0, metrics).x).toBe(3);
  });

  it("clamps points left of the canvas", () => {
    expect(cellFromPoint(-50, 0, metrics).x).toBe(0);
  });

  it("maps y through the measured rows and their gaps", () => {
    expect(cellFromPoint(0, 10, metrics).y).toBe(0);
    expect(cellFromPoint(0, 215, metrics).y).toBe(0);
    expect(cellFromPoint(0, 216, metrics).y).toBe(1);
    expect(cellFromPoint(0, 300, metrics).y).toBe(1);
    expect(cellFromPoint(0, 382, metrics).y).toBe(2);
  });

  it("extrapolates rows below the last measured one", () => {
    // Row 2 starts at 382 and is 166 px tall; 598 lands in row 3.
    expect(cellFromPoint(0, 598, metrics).y).toBe(3);
  });

  it("caps extrapolation five rows below the last laid-out row", () => {
    // The last measured row is row 1, so row 6 is the deepest allowed cell.
    expect(cellFromPoint(0, 100_000, metrics).y).toBe(
      metrics.rowHeights.length - 1 + MAX_EXTRAPOLATED_ROWS
    );
  });

  it("caps extrapolation when no rows are laid out", () => {
    expect(cellFromPoint(0, 100_000, { ...metrics, rowHeights: [] }).y).toBe(
      MAX_EXTRAPOLATED_ROWS
    );
  });

  it("falls back to the default height when no rows are laid out", () => {
    expect(
      cellFromPoint(0, 500, { ...metrics, rowHeights: [] }).y
    ).toBe(2);
  });
});
