import type { TranslationKey, TranslationVars } from "@/components/language-provider";

/**
 * Server Actions return plain error strings. They originate on the server
 * (validation, missing rows, backup parsing) and therefore cannot call the
 * client translation helper. This module classifies those messages so every
 * surface — web toasts and the Telegram bot — can show localized copy instead
 * of raw English/Russian text.
 */

export type ActionErrorKind =
  | "invalidInput"
  | "unexpected"
  | "habitNotFound"
  | "reminderNotFound"
  | "quantitativeOnly"
  | "reminderUsed"
  | "reminderStale"
  | "invalidJson"
  | "invalidBackup"
  | "orphanHabit"
  | "invalidColor"
  | "invalidDate"
  | "invalidTime"
  | "invalidChatId"
  | "chatUnreachable"
  | "botTokenMissing"
  | "autostartReadFailed"
  | "autostartUpdateFailed"
  | "pickDay"
  | "generic";

/** Maps a raw action error message to a stable, language-neutral kind. */
export function actionErrorKind(message: string): ActionErrorKind {
  const value = message.trim();
  if (value === "Invalid input") return "invalidInput";
  if (value === "Unexpected error") return "unexpected";
  if (/^Habit \d+ not found$/.test(value)) return "habitNotFound";
  if (/^Reminder \d+ not found$/.test(value)) return "reminderNotFound";
  if (value === "Only quantitative habits can be incremented") return "quantitativeOnly";
  if (value === "This reminder has already been used") return "reminderUsed";
  if (value === "Это напоминание уже использовано") return "reminderUsed";
  if (value === "Reminder is stale") return "reminderStale";
  if (value === "Напоминание устарело") return "reminderStale";
  if (value === "Backup file is not valid JSON") return "invalidJson";
  if (value.startsWith("Invalid backup file")) return "invalidBackup";
  if (value.startsWith("Backup references habit")) return "orphanHabit";
  if (value.startsWith("Color must be a hex value")) return "invalidColor";
  if (value.startsWith("Date must be YYYY-MM-DD")) return "invalidDate";
  if (value.startsWith("Time must be HH:mm")) return "invalidTime";
  if (value.startsWith("Chat id must be a number")) return "invalidChatId";
  if (value === "The bot cannot write to this chat") return "chatUnreachable";
  if (value === "Бот не может написать в этот чат") return "chatUnreachable";
  if (value === "TELEGRAM_BOT_TOKEN is not set in .env") return "botTokenMissing";
  if (value === "TELEGRAM_BOT_TOKEN не задан в .env") return "botTokenMissing";
  if (value === "Could not read auto-start settings") return "autostartReadFailed";
  if (value === "Could not update auto-start settings") return "autostartUpdateFailed";
  if (value === "Pick at least one day") return "pickDay";
  return "generic";
}

const ERROR_KEYS: Record<ActionErrorKind, TranslationKey> = {
  invalidInput: "errors.invalidInput",
  unexpected: "errors.unexpected",
  habitNotFound: "errors.habitNotFound",
  reminderNotFound: "errors.reminderNotFound",
  quantitativeOnly: "errors.quantitativeOnly",
  reminderUsed: "errors.reminderUsed",
  reminderStale: "errors.reminderStale",
  invalidJson: "errors.invalidJson",
  invalidBackup: "errors.invalidBackup",
  orphanHabit: "errors.orphanHabit",
  invalidColor: "errors.invalidColor",
  invalidDate: "errors.invalidDate",
  invalidTime: "errors.invalidTime",
  invalidChatId: "errors.invalidChatId",
  chatUnreachable: "errors.chatUnreachable",
  botTokenMissing: "errors.botTokenMissing",
  autostartReadFailed: "errors.autostartReadFailed",
  autostartUpdateFailed: "errors.autostartUpdateFailed",
  pickDay: "errors.pickDay",
  generic: "errors.generic",
};

/** Localizes a raw action error message for the web UI. */
export function translateActionError(
  t: (key: TranslationKey, vars?: TranslationVars) => string,
  message: string
): string {
  return t(ERROR_KEYS[actionErrorKind(message)]);
}
