import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearStoredTimer,
  elapsedSince,
  isStoredTimerFromDate,
  parseStoredTimer,
  readStoredTimer,
  restoredElapsed,
  timerDateKey,
  timerStorageKey,
  writeStoredTimer,
} from "./timer-storage";

describe("timerStorageKey", () => {
  it("scopes the key to the habit", () => {
    expect(timerStorageKey(7)).toBe("timer_7");
  });
});

describe("timerDateKey", () => {
  it("formats the local calendar day as YYYY-MM-DD", () => {
    expect(timerDateKey(new Date(2026, 10, 14, 23, 59))).toBe("2026-11-14");
    expect(timerDateKey(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });
});

describe("isStoredTimerFromDate", () => {
  it("compares the stored day with the given day", () => {
    expect(isStoredTimerFromDate({ date: "2026-11-14" }, "2026-11-14")).toBe(true);
    expect(isStoredTimerFromDate({ date: "2026-11-13" }, "2026-11-14")).toBe(false);
  });
});

describe("parseStoredTimer", () => {
  it("parses a valid stored timer", () => {
    expect(
      parseStoredTimer('{"startTime":1000,"initialElapsed":30,"date":"2026-11-14"}')
    ).toEqual({
      startTime: 1000,
      initialElapsed: 30,
      date: "2026-11-14",
    });
  });

  it("returns null for missing or malformed data", () => {
    expect(parseStoredTimer(null)).toBeNull();
    expect(parseStoredTimer(undefined)).toBeNull();
    expect(parseStoredTimer("")).toBeNull();
    expect(parseStoredTimer("not json")).toBeNull();
    expect(parseStoredTimer("{}")).toBeNull();
    expect(
      parseStoredTimer('{"startTime":"1000","initialElapsed":30,"date":"2026-11-14"}')
    ).toBeNull();
  });

  it("rejects negative or non-finite elapsed time", () => {
    expect(
      parseStoredTimer('{"startTime":1000,"initialElapsed":-1,"date":"2026-11-14"}')
    ).toBeNull();
    expect(
      parseStoredTimer('{"startTime":1000,"initialElapsed":"30","date":"2026-11-14"}')
    ).toBeNull();
    expect(
      parseStoredTimer('{"startTime":null,"initialElapsed":30,"date":"2026-11-14"}')
    ).toBeNull();
  });

  it("rejects timers without a valid day key", () => {
    expect(parseStoredTimer('{"startTime":1000,"initialElapsed":30}')).toBeNull();
    expect(
      parseStoredTimer('{"startTime":1000,"initialElapsed":30,"date":""}')
    ).toBeNull();
    expect(
      parseStoredTimer('{"startTime":1000,"initialElapsed":30,"date":"14.11.2026"}')
    ).toBeNull();
    expect(
      parseStoredTimer('{"startTime":1000,"initialElapsed":30,"date":20261114}')
    ).toBeNull();
  });
});

describe("restoredElapsed", () => {
  it("adds the seconds elapsed since the segment started", () => {
    const stored = { startTime: 1_000, initialElapsed: 30, date: "2026-11-14" };
    expect(elapsedSince(stored, 4_000)).toBe(3);
    expect(restoredElapsed(stored, 4_000)).toBe(33);
  });

  it("ignores clock skew that puts the start in the future", () => {
    const stored = { startTime: 5_000, initialElapsed: 2, date: "2026-11-14" };
    expect(elapsedSince(stored, 1_000)).toBe(0);
    expect(restoredElapsed(stored, 1_000)).toBe(2);
  });
});

describe("storage access without a window", () => {
  it("is a safe no-op so server rendering and tests do not crash", () => {
    expect(readStoredTimer(1)).toBeNull();
    expect(() =>
      writeStoredTimer(1, { startTime: 1, initialElapsed: 0, date: "2026-11-14" })
    ).not.toThrow();
    expect(() => clearStoredTimer(1)).not.toThrow();
  });
});

describe("read/write/clear with localStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a running timer under the habit's key", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });

    writeStoredTimer(3, {
      startTime: 1_000,
      initialElapsed: 5,
      date: "2026-11-14",
    });
    expect(store.get("timer_3")).toBe(
      '{"startTime":1000,"initialElapsed":5,"date":"2026-11-14"}'
    );
    expect(readStoredTimer(3)).toEqual({
      startTime: 1_000,
      initialElapsed: 5,
      date: "2026-11-14",
    });

    clearStoredTimer(3);
    expect(readStoredTimer(3)).toBeNull();
  });
});
