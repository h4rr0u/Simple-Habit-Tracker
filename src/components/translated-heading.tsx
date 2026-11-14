"use client";

import { useLanguage, type TranslationKey } from "@/components/language-provider";

/**
 * Translated page heading for Server Components.
 *
 * Server Components cannot read the language context, so pages delegate their
 * title to this client island; it re-renders on language changes like any
 * other client component.
 */
export function TranslatedHeading({
  translationKey,
  className = "text-2xl font-bold tracking-tight",
}: {
  translationKey: TranslationKey;
  /** Overrides the default h1 typography. */
  className?: string;
}) {
  const { t } = useLanguage();

  return <h1 className={className}>{t(translationKey)}</h1>;
}
