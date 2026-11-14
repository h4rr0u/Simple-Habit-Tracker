"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import en from "@/locales/en.json";
import ru from "@/locales/ru.json";

/**
 * Lightweight client-side i18n: a React context backed by the JSON
 * dictionaries in src/locales. The selected language lives in localStorage,
 * so URLs stay untouched and the choice survives a reload.
 */

/** localStorage key; keep in sync with the pre-paint script in app/layout.tsx. */
export const LANGUAGE_STORAGE_KEY = "habit-tracker:language";

export const dictionaries = { ru, en } as const;

export type Language = keyof typeof dictionaries;
export type TranslationKey = keyof typeof ru;

/** Values interpolated into `{placeholder}` slots of a translation. */
export type TranslationVars = Record<string, string | number>;

export const LANGUAGE_OPTIONS: Array<{ id: Language; label: string }> = [
  { id: "ru", label: "Русский" },
  { id: "en", label: "English" },
];

export const DEFAULT_LANGUAGE: Language = "ru";

function isLanguage(value: unknown): value is Language {
  return value === "ru" || value === "en";
}

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

/** Returns the stored language, falling back to the default. */
export function getStoredLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

interface LanguageContextValue {
  /** Currently selected language. */
  language: Language;
  /** Changes the language, persists it and updates <html lang>. */
  setLanguage: (language: Language) => void;
  /** Looks up a dictionary key and interpolates `{placeholders}`. */
  t: (key: TranslationKey, vars?: TranslationVars) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // The server render and the first client render both use the default, so
  // hydration stays consistent; the stored choice is applied after mount.
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  useEffect(() => {
    const stored = getStoredLanguage();
    setLanguageState(stored);
    document.documentElement.lang = stored;
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    document.documentElement.lang = next;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Private mode / disabled storage: the language still changes for this session.
    }
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const dictionary = dictionaries[language] as Record<TranslationKey, string>;
    return {
      language,
      setLanguage,
      t: (key, vars) => interpolate(dictionary[key] ?? ru[key] ?? key, vars),
    };
  }, [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Accesses the current language and translation helper. */
export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
