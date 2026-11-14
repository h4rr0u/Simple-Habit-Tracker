import { getBotLanguage } from "@/db/queries";
import {
  botDictionaries,
  DEFAULT_BOT_LANGUAGE,
  type BotDictionary,
  type BotLanguage,
  type BotTextKey,
} from "./dictionaries";

/**
 * DB-aware accessors for the bot's interface language.
 *
 * Kept separate from `./dictionaries` so pure message builders and their tests
 * can import the copy without opening the SQLite connection at module load.
 */

/**
 * Language configured for the bot. The tracker supports a single linked chat
 * (`user_preferences` has one row), so the language is installation-wide and
 * does not depend on a chat id.
 */
export async function getChatLanguage(): Promise<BotLanguage> {
  return getBotLanguage();
}

/** Looks up one translated string/function for the bot's language. */
export async function getBotText<K extends BotTextKey>(
  key: K
): Promise<BotDictionary[K]> {
  const language = await getChatLanguage();
  const dictionary =
    botDictionaries[language] ?? botDictionaries[DEFAULT_BOT_LANGUAGE];
  return dictionary[key];
}
