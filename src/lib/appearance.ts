/**
 * Appearance customization: accent color and UI density.
 *
 * Preferences live in localStorage and are applied to <html> through the
 * `data-accent` / `data-density` attributes, which globals.css maps to CSS
 * variable overrides. The root layout runs a tiny inline script that applies
 * them before first paint so there is no flash of the default theme — keep
 * that script's keys in sync with the constants below.
 */

export const ACCENT_STORAGE_KEY = "habit-tracker:accent";
export const DENSITY_STORAGE_KEY = "habit-tracker:density";

export type AccentId = "blue" | "violet" | "emerald" | "orange" | "rose";
export type DensityId = "comfortable" | "compact";

/** One selectable accent theme. */
export interface AccentOption {
  id: AccentId;
  /** CSS class that paints the picker swatch (no inline colors). */
  swatchClass: string;
}

/** One selectable density mode. */
export interface DensityOption {
  id: DensityId;
}

export const ACCENT_OPTIONS: AccentOption[] = [
  { id: "blue", swatchClass: "accent-swatch-blue" },
  { id: "violet", swatchClass: "accent-swatch-violet" },
  { id: "emerald", swatchClass: "accent-swatch-emerald" },
  { id: "orange", swatchClass: "accent-swatch-orange" },
  { id: "rose", swatchClass: "accent-swatch-rose" },
];

export const DENSITY_OPTIONS: DensityOption[] = [
  { id: "comfortable" },
  { id: "compact" },
];

export const DEFAULT_ACCENT: AccentId = "blue";
export const DEFAULT_DENSITY: DensityId = "comfortable";

/** Reads a localStorage key, tolerating disabled storage (private mode etc.). */
function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Reads the stored accent, falling back to the default on anything unknown. */
export function getStoredAccent(): AccentId {
  const raw = readStored(ACCENT_STORAGE_KEY);
  return ACCENT_OPTIONS.some((option) => option.id === raw)
    ? (raw as AccentId)
    : DEFAULT_ACCENT;
}

/** Reads the stored density, falling back to the default on anything unknown. */
export function getStoredDensity(): DensityId {
  const raw = readStored(DENSITY_STORAGE_KEY);
  return raw === "compact" ? "compact" : DEFAULT_DENSITY;
}

/** Applies the accent theme to <html> and persists it. */
export function applyAccent(accent: AccentId): void {
  if (typeof document === "undefined") return;
  if (accent === DEFAULT_ACCENT) {
    delete document.documentElement.dataset.accent;
  } else {
    document.documentElement.dataset.accent = accent;
  }
  try {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
  } catch {
    // Storage unavailable — the theme still applies for this session.
  }
}

/** Applies the density mode to <html> and persists it. */
export function applyDensity(density: DensityId): void {
  if (typeof document === "undefined") return;
  if (density === DEFAULT_DENSITY) {
    delete document.documentElement.dataset.density;
  } else {
    document.documentElement.dataset.density = density;
  }
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    // Storage unavailable — the theme still applies for this session.
  }
}
