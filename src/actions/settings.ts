"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createReminder,
  deleteReminder,
  getBotLanguage,
  getHabitById,
  setTelegramChatId,
  updateReminderEnabled,
} from "@/db/queries";
import { botDictionaries, DEFAULT_BOT_LANGUAGE } from "@/bot/dictionaries";

/**
 * Server Actions for the /settings page: binding the Telegram chat and
 * managing reminders. Same contract as the habit actions — Zod-validated
 * input returning `{ ok: true, data } | { ok: false, error }`.
 */

/** Success branch of the action result. */
interface ActionOk<T> {
  ok: true;
  data: T;
}

/** Failure branch of the action result. */
interface ActionErr {
  ok: false;
  error: string;
}

/** Result returned by every settings action. */
export type ActionResult<T> = ActionOk<T> | ActionErr;

/** Flattens a ZodError into a single human-readable message. */
function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

/** Extracts a message from an unknown thrown value. */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

/** Shown when Telegram rejects the chat or the user blocked the bot. */
const CHAT_UNREACHABLE_ERROR = "The bot cannot write to this chat";

/** Shown when the bot token is missing, so no test message can be sent. */
const BOT_TOKEN_MISSING_ERROR = "TELEGRAM_BOT_TOKEN is not set in .env";

/**
 * Sends a test message through the Telegram Bot API. Only after this succeeds
 * is the chat id persisted, so a typo or a blocked bot never binds silently.
 */
async function sendChatBindingTest(chatId: number): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error(BOT_TOKEN_MISSING_ERROR);

  const language = await getBotLanguage();
  const dictionary =
    botDictionaries[language] ?? botDictionaries[DEFAULT_BOT_LANGUAGE];

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: dictionary.chatBindingTest,
      }),
      signal: AbortSignal.timeout(10_000),
    }
  ).catch(() => null);

  if (!response) throw new Error(CHAT_UNREACHABLE_ERROR);

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
  } | null;
  if (!response.ok || payload?.ok !== true) {
    throw new Error(CHAT_UNREACHABLE_ERROR);
  }
}

/* ------------------------------ schemas ------------------------------- */

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm (24h)");

const saveChatIdSchema = z.object({
  /** Telegram chat ids are integers (possibly negative for groups). */
  chatId: z
    .string()
    .trim()
    .regex(/^-?\d{1,15}$/, "Chat id must be a number (send /start to the bot to get it)"),
});

const createReminderSchema = z.object({
  habitId: z.number().int().positive(),
  time: timeSchema,
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Pick at least one day")
    .max(7),
});

const reminderIdSchema = z.object({
  id: z.number().int().positive(),
});

const toggleReminderSchema = reminderIdSchema.extend({
  enabled: z.boolean(),
});

/* ------------------------------- actions ------------------------------ */

/** Saves the Telegram chat id the bot delivers messages to. */
export async function saveChatIdAction(
  input: z.input<typeof saveChatIdSchema>
): Promise<ActionResult<number>> {
  const parsed = saveChatIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error) };
  }

  try {
    const chatId = Number(parsed.data.chatId);
    // Verify delivery first: a wrong id or a blocked bot must not be saved.
    await sendChatBindingTest(chatId);
    await setTelegramChatId(chatId);
    revalidatePath("/settings");
    return { ok: true, data: chatId };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/** Creates a reminder for a habit. */
export async function createReminderAction(
  input: z.input<typeof createReminderSchema>
): Promise<ActionResult<Awaited<ReturnType<typeof createReminder>>>> {
  const parsed = createReminderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error) };
  }

  try {
    const habit = await getHabitById(parsed.data.habitId);
    if (!habit) {
      return { ok: false, error: `Habit ${parsed.data.habitId} not found` };
    }
    const reminder = await createReminder({
      habitId: parsed.data.habitId,
      time: parsed.data.time,
      daysOfWeek: [...parsed.data.daysOfWeek].sort((a, b) => a - b),
      enabled: true,
    });
    revalidatePath("/settings");
    return { ok: true, data: reminder };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/** Deletes a reminder. */
export async function deleteReminderAction(
  input: z.input<typeof reminderIdSchema>
): Promise<ActionResult<boolean>> {
  const parsed = reminderIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error) };
  }

  try {
    const deleted = await deleteReminder(parsed.data.id);
    if (!deleted) {
      return { ok: false, error: `Reminder ${parsed.data.id} not found` };
    }
    revalidatePath("/settings");
    return { ok: true, data: true };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/** Enables or disables a reminder without deleting it. */
export async function toggleReminderAction(
  input: z.input<typeof toggleReminderSchema>
): Promise<ActionResult<boolean>> {
  const parsed = toggleReminderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error) };
  }

  try {
    await updateReminderEnabled(parsed.data.id, parsed.data.enabled);
    revalidatePath("/settings");
    return { ok: true, data: parsed.data.enabled };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}
