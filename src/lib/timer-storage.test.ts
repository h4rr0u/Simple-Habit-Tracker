import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearStoredTimer,
  elapsedSince,
  parseStoredTimer,
  readStoredTimer,
  restoredElapsed,
  timerStorageKey,
  writeStoredTimer,
} from "./timer-storage";

describe("timerStorageKey", () => {
  it("scopes the key to the habit", () => {
    expect(timerStorageKey(7)).toBe("timer_7");
  });
});

describe("parseStoredTimer", () => {
  it("parses a valid stored timer", () => {
    expect(parseStoredTimer('{"startTime":1000,"initialElapsed":30}')).toEqual({
      startTime: 1000,
      initialElapsed: 30,
    });
  });

  it("returns null for missing or malformed data", () => {
    expect(parseStoredTimer(null)).toBeNull();
    expect(parseStoredTimer(undefined)).toBeNull();
    expect(parseStoredTimer("")).toBeNull();
    expect(parseStoredTimer("not json")).toBeNull();
    expect(parseStoredTimer("{}")).toBeNull();
    expect(parseStoredTimer('{"startTime":"1000","initialElapsed":30}')).toBeNull();
  });

  it("rejects negative or non-finite elapsed time", () => {
    expect(parseStoredTimer('{"startTime":1000,"initialElapsed":-1}')).toBeNull();
    expect(parseStoredTimer('{"startTime":1000,"initialElapsed":"30"}')).toBeNull();
    expect(parseStoredTimer('{"startTime":null,"initialElapsed":30}')).toBeNull();
  });
});

describe("restoredElapsed", () => {
  it("adds the seconds elapsed since the segment started", () => {
    const stored = { startTime: 1_000, initialElapsed: 30 };
    expect(elapsedSince(stored, 4_000)).toBe(3);
    expect(restoredElapsed(stored, 4_000)).toBe(33);
  });

  it("ignores clock skew that puts the start in the future", () => {
    const stored = { startTime: 5_000, initialElapsed: 2 };
    expect(elapsedSince(stored, 1_000)).toBe(0);
    expect(restoredElapsed(stored, 1_000)).toBe(2);
  });
});

describe("storage access without a window", () => {
  it("is a safe no-op so server rendering and tests do not crash", () => {
    expect(readStoredTimer(1)).toBeNull();
    expect(() =>
      writeStoredTimer(1, { startTime: 1, initialElapsed: 0 })
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

    writeStoredTimer(3, { startTime: 1_000, initialElapsed: 5 });
    expect(store.get("timer_3")).toBe('{"startTime":1000,"initialElapsed":5}');
    expect(readStoredTimer(3)).toEqual({ startTime: 1_000, initialElapsed: 5 });

    clearStoredTimer(3);
    expect(readStoredTimer(3)).toBeNull();
  });
});
