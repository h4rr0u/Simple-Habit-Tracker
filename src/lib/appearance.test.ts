import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACCENTS,
  ACCENT_OPTIONS,
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  getStoredAccent,
  isAccent,
} from "@/lib/appearance";

/** Minimal window/localStorage stub for the storage-reading helpers. */
function stubStorage(entries: Record<string, string>) {
  const store = new Map(Object.entries(entries));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("appearance accents", () => {
  it("lists every accent option in palette order", () => {
    expect(ACCENT_OPTIONS.map((option) => option.id)).toEqual([...ACCENTS]);
  });

  it("paints each swatch through its own CSS class", () => {
    for (const option of ACCENT_OPTIONS) {
      expect(option.swatchClass).toBe(`accent-swatch-${option.id}`);
    }
  });

  it("narrows known accent ids and rejects anything else", () => {
    for (const accent of ACCENTS) {
      expect(isAccent(accent)).toBe(true);
    }
    for (const value of ["purple", "", "BLUE", null, undefined, 0, {}, []]) {
      expect(isAccent(value)).toBe(false);
    }
  });

  it("keeps the default accent selectable", () => {
    expect(isAccent(DEFAULT_ACCENT)).toBe(true);
  });

  it("reads a stored accent", () => {
    stubStorage({ [ACCENT_STORAGE_KEY]: "violet" });
    expect(getStoredAccent()).toBe("violet");
  });

  it("falls back to the default for junk in localStorage", () => {
    stubStorage({ [ACCENT_STORAGE_KEY]: "garbage" });
    expect(getStoredAccent()).toBe(DEFAULT_ACCENT);
  });

  it("falls back to the default when storage is unavailable", () => {
    expect(getStoredAccent()).toBe(DEFAULT_ACCENT);
  });
});
