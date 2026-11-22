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

/**
 * Every selectable accent palette, in display order. This is the single
 * source of truth for validation; the pre-paint script in app/layout.tsx
 * repeats the list because inline scripts cannot import modules.
 */
export const ACCENTS = ["blue", "violet", "emerald", "orange", "rose"] as const;

export type AccentId = (typeof ACCENTS)[number];
export type DensityId = "comfortable" | "compact";

/** Narrows an untrusted value (localStorage etc.) to a known accent. */
export function isAccent(value: unknown): value is AccentId {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value);
}

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

export const ACCENT_OPTIONS: AccentOption[] = ACCENTS.map((id) => ({
  id,
  swatchClass: `accent-swatch-${id}`,
}));

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
  return isAccent(raw) ? raw : DEFAULT_ACCENT;
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
