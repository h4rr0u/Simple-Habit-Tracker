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
 * Language configured for the linked chat. The tracker supports a single
 * linked chat (`user_preferences` has one row), so `chatId` is accepted for
 * future multi-chat support but does not affect the lookup yet.
 */
export async function getChatLanguage(
  chatId: number | null | undefined
): Promise<BotLanguage> {
  void chatId;
  return getBotLanguage();
}

/** Looks up one translated string/function for the chat's language. */
export async function getBotText<K extends BotTextKey>(
  chatId: number | null | undefined,
  key: K
): Promise<BotDictionary[K]> {
  const language = await getChatLanguage(chatId);
  const dictionary =
    botDictionaries[language] ?? botDictionaries[DEFAULT_BOT_LANGUAGE];
  return dictionary[key];
}
