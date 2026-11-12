import { Bot, type Context } from "grammy";

import {
  getCheckinsForRange,
  getHabitById,
  getTelegramChatId,
  setTelegramChatId,
  toggleCheckin,
  upsertCheckin,
} from "@/db/queries";
import {
  buildTodayMessage,
  formatSavedValue,
  formatTimedValue,
  parseCallbackData,
  parseValueInput,
} from "./messages";
import { getTodayViews, todayKey } from "./today";

/**
 * Telegram bot entry point (long polling).
 *
 * Commands:
 * - /start  — binds this chat (stores the chat id in settings).
 * - /today  — habits scheduled today with quick action buttons.
 * - /cancel — aborts a pending value input.
 *
 * Inline actions:
 * - ✅/↩️ toggle check-ins for binary/negative habits;
 * - ✏️/⏱ prompt for a numeric value (quantitative units, timed minutes);
 *   the next text message from the chat is treated as the value.
 *
 * Run with: npm run bot:dev
 */

/** Per-chat state of a pending value input (quantitative/timed habits). */
interface PendingInput {
  habitId: number;
  /** Message id of the /today digest to refresh after saving. */
  messageId?: number;
}

/** The token is required before anything else can run. */
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error(
    "[bot] TELEGRAM_BOT_TOKEN is not set.\n" +
      "Create a bot with @BotFather, then put the token into the .env file:\n" +
      "  TELEGRAM_BOT_TOKEN=123456:ABC-DEF..."
  );
  process.exit(1);
}

const bot = new Bot(token);

/** chat id -> pending value input. Kept in memory of the bot process. */
const pendingInputs = new Map<number, PendingInput>();

/** Telegram API needs `parse_mode: "HTML"` for our markup. */
const HTML = { parse_mode: "HTML" } as const;

/**
 * Replies with the /today digest and returns the sent message id (used to
 * edit the same message later from callbacks).
 */
async function sendTodayMessage(ctx: Context): Promise<number | undefined> {
  const views = await getTodayViews();
  const { text, keyboard } = buildTodayMessage(views, { today: todayKey() });
  const sent = await ctx.reply(text, { ...HTML, reply_markup: keyboard });
  return sent.message_id;
}

/** Rebuilds and edits an existing /today digest, tolerating no-op edits. */
async function editTodayMessage(
  api: Context["api"],
  chatId: number,
  messageId: number
): Promise<void> {
  const views = await getTodayViews();
  const { text, keyboard } = buildTodayMessage(views, { today: todayKey() });
  try {
    await api.editMessageText(chatId, messageId, text, { ...HTML, reply_markup: keyboard });
  } catch (error) {
    // Editing to identical content is a harmless race (e.g. double taps).
    if (!isMessageNotModified(error)) {
      console.error("[bot] failed to edit message:", error);
    }
  }
}

function isMessageNotModified(error: unknown): boolean {
  return error instanceof Error && error.message.includes("message is not modified");
}

/** Returns true when the update comes from a chat other than the bound one. */
async function isForeignChat(ctx: Context): Promise<boolean> {
  const chatId = ctx.chat?.id;
  const bound = await getTelegramChatId();
  if (chatId == null || (bound != null && bound !== chatId)) {
    if (bound != null && chatId != null && bound !== chatId) {
      await ctx.reply("This bot is linked to another chat. Send /start here to rebind it.");
    }
    return true;
  }
  return false;
}

/* ------------------------------ commands ------------------------------ */

bot.command("start", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (chatId == null) return;
  await setTelegramChatId(chatId);
  await ctx.reply(
    "✅ <b>Habit Tracker is linked to this chat!</b>\n\n" +
      "Reminders will be delivered here. Commands:\n" +
      "/today — today's habits with quick check-in buttons\n" +
      "/cancel — abort a value input",
    HTML
  );
});

bot.command("today", async (ctx) => {
  if (await isForeignChat(ctx)) return;
  pendingInputs.delete(ctx.chat.id); // stale pending state
  await sendTodayMessage(ctx);
});

bot.command("cancel", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (chatId == null) return;
  if (pendingInputs.delete(chatId)) {
    await ctx.reply("Cancelled.");
  }
});

/* ------------------------------ callbacks ----------------------------- */

bot.on("callback_query:data", async (ctx) => {
  const callback = parseCallbackData(ctx.callbackQuery.data);
  const chatId = ctx.chat?.id;
  if (!callback || chatId == null) {
    await ctx.answerCallbackQuery({ text: "Unknown action" });
    return;
  }
  if (await isForeignChat(ctx)) {
    await ctx.answerCallbackQuery({ text: "This bot is linked to another chat" });
    return;
  }

  const habit = await getHabitById(callback.habitId);
  if (!habit || habit.archivedAt) {
    await ctx.answerCallbackQuery({ text: "Habit not found" });
    return;
  }

  if (callback.kind === "toggle") {
    const result = await toggleCheckin(habit.id, todayKey());
    const messageId = ctx.callbackQuery.message?.message_id;
    if (messageId != null) {
      await editTodayMessage(ctx.api, chatId, messageId);
    }
    await ctx.answerCallbackQuery({
      text: result === "checked" ? `✅ ${habit.name}` : `↩️ ${habit.name} removed`,
    });
    return;
  }

  // Value input mode for quantitative/timed habits.
  const messageId = ctx.callbackQuery.message?.message_id;
  pendingInputs.set(chatId, { habitId: habit.id, messageId });
  await ctx.answerCallbackQuery();

  const [todayCheckin] = await getCheckinsForRange(habit.id, todayKey(), todayKey());
  const target =
    habit.type === "timed"
      ? habit.targetValue
        ? ` (target ${formatTimedValue(habit.targetValue * 60)})`
        : ""
      : habit.targetValue
        ? ` (target ${habit.targetValue}${habit.unit ? ` ${habit.unit}` : ""})`
        : "";
  const progress = todayCheckin
    ? ` Current: ${formatSavedValue(habit, todayCheckin.value ?? 0)}.`
    : "";
  const ask =
    habit.type === "timed"
      ? `⏱ <b>${habit.name}</b>${target}\nHow many minutes? Send a number${progress}`
      : `✏️ <b>${habit.name}</b>${target}\nSend a number${progress}`;
  await ctx.reply(ask, HTML);
});

/* ------------------------- value input by text ------------------------ */

bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id;
  const pending = pendingInputs.get(chatId);
  if (!pending) return;

  const habit = await getHabitById(pending.habitId);
  if (!habit || habit.archivedAt) {
    pendingInputs.delete(chatId);
    await ctx.reply("This habit no longer exists.");
    return;
  }

  const input = ctx.message.text.trim();
  if (/^(\/cancel|cancel|отмена)$/i.test(input)) {
    pendingInputs.delete(chatId);
    await ctx.reply("Cancelled.");
    return;
  }

  const value = parseValueInput(input);
  if (value == null) {
    await ctx.reply('Please send a whole non-negative number, or send "cancel" to abort.');
    return;
  }

  // Timed habits store seconds; the bot asks for minutes.
  const stored = habit.type === "timed" ? value * 60 : value;
  const result = await upsertCheckin(habit.id, todayKey(), stored > 0 ? stored : null);
  pendingInputs.delete(chatId);

  if (result === "set" && pending.messageId != null) {
    await editTodayMessage(ctx.api, chatId, pending.messageId);
  }
  await ctx.reply(
    result === "set"
      ? `✅ Saved ${formatSavedValue(habit, stored)} for "${habit.name}"`
      : `🧹 Check-in cleared for "${habit.name}"`
  );
});

/* ------------------------------- startup ------------------------------ */

bot.catch((error) => {
  console.error("[bot] unhandled error:", error.error);
});

void bot.start({
  onStart: (me) => console.log(`[bot] long polling started as @${me.username}`),
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`[bot] received ${signal}, shutting down...`);
    void bot.stop();
  });
}
