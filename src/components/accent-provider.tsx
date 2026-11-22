"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  applyAccent,
  getStoredAccent,
  type AccentId,
} from "@/lib/appearance";

/**
 * Accent color context. The selected palette lives in localStorage and is
 * mirrored onto <html data-accent> by src/lib/appearance.ts; the pre-paint
 * script in app/layout.tsx applies it before first paint to avoid a flash.
 */

interface AccentContextValue {
  /**
   * Currently applied accent, or `null` until the stored value has been read
   * on the client. The server cannot know the stored accent, so consumers must
   * render selection state only once this is non-null — otherwise the default
   * accent flashes for one frame after hydration.
   */
  accent: AccentId | null;
  /** Changes the accent, applies it to <html> and persists it. */
  setAccent: (accent: AccentId) => void;
}

const AccentContext = createContext<AccentContextValue | null>(null);

/** CSS class (globals.css) that suppresses transitions for one frame. */
const TRANSITION_LOCK_CLASS = "disable-transitions";

/**
 * Swaps the palette with transitions disabled, then releases the lock after
 * the new colours have been painted. Without this, surfaces that transition
 * `background-color`/`color` would ease from the old accent to the new one.
 */
function applyAccentImmediately(accent: AccentId) {
  const root = document.documentElement;
  root.classList.add(TRANSITION_LOCK_CLASS);
  applyAccent(accent);
  // Force a style recalculation so the new tokens are committed while the
  // lock is still on; two frames guarantee at least one painted frame with
  // the lock before transitions come back.
  void root.offsetWidth;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove(TRANSITION_LOCK_CLASS));
  });
}

export function AccentProvider({ children }: { children: React.ReactNode }) {
  // Server render and first client render stay on `null` so hydration matches;
  // the stored choice is resolved right after mount.
  const [accent, setAccentState] = useState<AccentId | null>(null);

  useEffect(() => {
    setAccentState(getStoredAccent());
  }, []);

  const setAccent = useCallback((next: AccentId) => {
    setAccentState(next);
    applyAccentImmediately(next);
  }, []);

  const value = useMemo<AccentContextValue>(
    () => ({ accent, setAccent }),
    [accent, setAccent]
  );

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

export function useAccent(): AccentContextValue {
  const context = useContext(AccentContext);
  if (!context) {
    throw new Error("useAccent must be used inside <AccentProvider>");
  }
  return context;
}
