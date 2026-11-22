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
  DEFAULT_ACCENT,
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
  /** Currently selected accent palette. */
  accent: AccentId;
  /** Changes the accent, applies it to <html> and persists it. */
  setAccent: (accent: AccentId) => void;
}

const AccentContext = createContext<AccentContextValue | null>(null);

export function AccentProvider({ children }: { children: React.ReactNode }) {
  // Server render and first client render use the default so hydration stays
  // consistent; the stored choice is applied right after mount.
  const [accent, setAccentState] = useState<AccentId>(DEFAULT_ACCENT);

  useEffect(() => {
    setAccentState(getStoredAccent());
  }, []);

  const setAccent = useCallback((next: AccentId) => {
    setAccentState(next);
    applyAccent(next);
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
