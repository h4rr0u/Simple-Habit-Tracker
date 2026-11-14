import { Bot, type Context } from "grammy";

import { incrementCheckinAction, incrementReminderCheckinAction } from "@/actions/habits";
import type { Habit } from "@/db/schema";
import {
  getCheckinsForRange,
  getHabitById,
  getTelegramChatId,
  setBotLanguage,
  setTelegramChatId,
  syncHabitFreezes,
  toggleCheckin,
  upsertCheckin,
} from "@/db/queries";
import {
  buildLanguageChangedMessage,
  buildLanguageMessage,
  buildMainMenuMessage,
  buildReminderMessage,
  buildStatsMessage,
  buildSupportMessage,
  buildTodayMessage,
  buildWebAppMessage,
  formatSavedValue,
  formatTimedValue,
  escapeHtml,
  isHabitDone,
  parseCallbackData,
  parseValueInput,
  WEB_APP_URL,
  type BotMessage,
  type TodayStats,
} from "./messages";
import { botDictionaries, type BotDictionary } from "./dictionaries";
import { getBotText, getChatLanguage } from "./language";
import { actionErrorKind } from "@/lib/action-error";
import { getTodayViews, todayKey } from "./today";

/**
 * Telegram bot entry point (long polling).
 *
 * Commands:
 * - /start    — binds this chat and opens the inline main menu.
 * - /today    — habits scheduled today with quick action buttons.
 * - /cancel   — aborts a pending value input.
 * - /support  — donation link (or a polite "disabled" note when unset).
 * - /language — interface language picker (ru/en), stored in the database.
 *
 * Menu navigation (callbacks `menu_today` / `menu_stats` / `menu_language` /
 * `menu_main`) edits the message the button belongs to instead of sending a new one.
 *
 * Inline actions:
 * - ✅/↩️ toggle check-ins for binary/negative habits;
 * - ➕ +1 increments a quantitative check-in (capped at its daily target);
 *   reminder messages can be used once (repeat taps are rejected);
 * - ✏️/⏱ prompt for a numeric value (timed minutes); the next text message
 *   from the chat is treated as the value.
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
 * Optional donation link from `.env`. When unset or blank, every support
 * affordance (the /support link and the /start hint) is hidden.
 */
function donationUrl(): string | null {
  return process.env.DONATION_URL?.trim() || null;
}

/**
 * Address of the web UI from `.env`. Defaults to the local dev server, which
 * Telegram refuses to use as a button url, so the menu shows it as text then.
 */
function webAppUrl(): string {
  return process.env.WEB_APP_URL?.trim() || WEB_APP_URL;
}

/**
 * Replies with the /today digest and returns the sent message id (used to
 * edit the same message later from callbacks).
 */
async function sendTodayMessage(ctx: Context): Promise<number | undefined> {
  const views = await getTodayViews();
  const language = await getChatLanguage();
  const { text, keyboard } = buildTodayMessage(views, {
    today: todayKey(),
    language,
  });
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
  const language = await getChatLanguage();
  const { text, keyboard } = buildTodayMessage(views, {
    today: todayKey(),
    language,
  });
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

/** Localizes a raw Server Action error for a callback toast. */
function botActionError(message: string, dictionary: BotDictionary): string {
  switch (actionErrorKind(message)) {
    case "habitNotFound":
      return dictionary.habitNotFound;
    case "quantitativeOnly":
      return dictionary.errorQuantitativeOnly;
    case "reminderUsed":
      return dictionary.errorReminderUsed;
    case "reminderStale":
      return dictionary.errorReminderStale;
    default:
      return dictionary.errorGeneric;
  }
}

/**
 * Renders a menu view in place: edits the message the pressed button belongs
 * to, so the chat never collects duplicate menus. Falls back to a fresh
 * message when Telegram refuses the edit (too old, deleted, media-only, ...).
 */
async function showMenuView(ctx: Context, message: BotMessage): Promise<void> {
  const markup = message.keyboard ? { reply_markup: message.keyboard } : {};
  const origin = ctx.callbackQuery?.message;

  if (origin) {
    try {
      if (message.keyboard && origin.text === message.text) {
        // Text already matches (e.g. a repeated /start tap): only refresh buttons.
        await ctx.editMessageReplyMarkup(markup);
      } else {
        await ctx.editMessageText(message.text, { ...HTML, ...markup });
      }
      return;
    } catch (error) {
      // "message is not modified" means the view on screen is already correct.
      if (isMessageNotModified(error)) return;
      console.error("[bot] failed to edit menu message, sending a new one:", error);
    }
  }

  await ctx.reply(message.text, { ...HTML, ...markup });
}

/** Aggregates today's views into the numbers shown by "Моя статистика". */
async function getTodayStats(): Promise<TodayStats> {
  const views = await getTodayViews();
  return {
    streak: views.reduce((best, view) => Math.max(best, view.streak), 0),
    done: views.filter((view) => isHabitDone(view.habit, view.todayCheckin)).length,
    total: views.length,
  };
}

/**
 * Re-renders a reminder message in place after a "+1" tap: the same habit,
 * its reminder time and freshly loaded progress/streak. The callback data
 * carries the reminder id and time so this works across processes (bot vs.
 * reminder cron); `tapped` renders the button as used.
 */
async function editReminderMessage(
  api: Context["api"],
  chatId: number,
  messageId: number,
  habit: Habit,
  time: string,
  options: { reminderId?: number; tapped?: boolean } = {}
): Promise<void> {
  const date = todayKey();
  const [todayCheckin] = await getCheckinsForRange(habit.id, date, date);
  const views = await getTodayViews();
  const streak = views.find((view) => view.habit.id === habit.id)?.streak ?? 0;
  const language = await getChatLanguage();
  const { text, keyboard } = buildReminderMessage(
    {
      reminderId: options.reminderId ?? 0,
      habitId: habit.id,
      habitName: habit.name,
      time,
      daysOfWeek: [],
    },
    streak,
    habit,
    todayCheckin ?? null,
    { tapped: options.tapped, language }
  );
  try {
    await api.editMessageText(chatId, messageId, text, {
      ...HTML,
      reply_markup: keyboard,
    });
  } catch (error) {
    if (!isMessageNotModified(error)) {
      console.error("[bot] failed to edit reminder message:", error);
    }
  }
}

/** Returns true when the update comes from a chat other than the bound one. */
async function isForeignChat(ctx: Context): Promise<boolean> {
  const chatId = ctx.chat?.id;
  const bound = await getTelegramChatId();
  if (chatId == null || (bound != null && bound !== chatId)) {
    if (bound != null && chatId != null && bound !== chatId) {
      await ctx.reply(await getBotText("foreignChat"));
    }
    return true;
  }
  return false;
}

/* ------------------------------ commands ------------------------------ */

bot.command("start", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (chatId == null) return;

  // The bot serves a single chat. Never let a /start from another chat steal
  // the binding: the owner must clear it from the web settings first.
  const boundChatId = await getTelegramChatId();
  if (boundChatId != null && boundChatId !== chatId) {
    await ctx.reply(await getBotText("bindingTaken"));
    return;
  }

  await setTelegramChatId(chatId);
  const language = await getChatLanguage();
  const message = buildMainMenuMessage({
    donationUrl: donationUrl(),
    webUrl: webAppUrl(),
    language,
  });
  await ctx.reply(message.text, message.keyboard ? { ...HTML, reply_markup: message.keyboard } : HTML);
});

bot.command("support", async (ctx) => {
  const language = await getChatLanguage();
  const { text, keyboard } = buildSupportMessage(donationUrl(), language);
  await ctx.reply(text, keyboard ? { ...HTML, reply_markup: keyboard } : HTML);
});

bot.command("language", async (ctx) => {
  const language = await getChatLanguage();
  const message = buildLanguageMessage(language);
  await ctx.reply(
    message.text,
    message.keyboard ? { ...HTML, reply_markup: message.keyboard } : HTML
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
    await ctx.reply(await getBotText("cancelled"));
  }
});

/* ------------------------------ callbacks ----------------------------- */

bot.on("callback_query:data", async (ctx) => {
  const callback = parseCallbackData(ctx.callbackQuery.data);
  const chatId = ctx.chat?.id;
  if (!callback || chatId == null) {
    await ctx.answerCallbackQuery({
      text: await getBotText("unknownAction"),
    });
    return;
  }
  if (await isForeignChat(ctx)) {
    await ctx.answerCallbackQuery({
      text: await getBotText("foreignChatShort"),
    });
    return;
  }

  const language = await getChatLanguage();
  const dictionary = botDictionaries[language];

  if (callback.kind === "language") {
    await setBotLanguage(callback.language);
    await ctx.answerCallbackQuery();
    // Replace the picker with a confirmation in the newly selected language.
    await showMenuView(ctx, buildLanguageChangedMessage(callback.language));
    return;
  }

  if (callback.kind === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }

  // Main-menu navigation: replace the menu message instead of sending new ones.
  if (callback.kind === "menu_main") {
    await ctx.answerCallbackQuery();
    await showMenuView(
      ctx,
      buildMainMenuMessage({
        donationUrl: donationUrl(),
        webUrl: webAppUrl(),
        language,
      })
    );
    return;
  }

  if (callback.kind === "menu_web") {
    await ctx.answerCallbackQuery();
    await showMenuView(ctx, buildWebAppMessage(webAppUrl(), language));
    return;
  }

  if (callback.kind === "menu_language") {
    await ctx.answerCallbackQuery();
    // Same message is replaced by the ru/en picker (which has a back button).
    await showMenuView(ctx, buildLanguageMessage(language));
    return;
  }

  if (callback.kind === "menu_today") {
    await ctx.answerCallbackQuery();
    pendingInputs.delete(chatId); // stale pending state
    const views = await getTodayViews();
    await showMenuView(
      ctx,
      buildTodayMessage(views, { today: todayKey(), language })
    );
    return;
  }

  if (callback.kind === "menu_stats") {
    await ctx.answerCallbackQuery();
    await showMenuView(ctx, buildStatsMessage(await getTodayStats(), language));
    return;
  }

  const habit = await getHabitById(callback.habitId);
  if (!habit || habit.archivedAt) {
    await ctx.answerCallbackQuery({
      text: await getBotText("habitNotFound"),
    });
    return;
  }

  if (callback.kind === "increment") {
    const messageId = ctx.callbackQuery.message?.message_id;
    const result =
      callback.source === "reminder" && callback.reminderId != null
        ? await incrementReminderCheckinAction({
            habitId: habit.id,
            reminderId: callback.reminderId,
            date: todayKey(),
          })
        : await incrementCheckinAction({
            habitId: habit.id,
            date: todayKey(),
          });
    if (!result.ok) {
      await ctx.answerCallbackQuery({
        text: botActionError(result.error, dictionary),
      });
      return;
    }

    const value = result.data;
    const target = habit.targetValue;
    const done = target != null && value >= target;

    if (messageId != null) {
      if (callback.source === "reminder" && callback.time) {
        await editReminderMessage(
          ctx.api,
          chatId,
          messageId,
          habit,
          callback.time,
          { reminderId: callback.reminderId, tapped: true }
        );
      } else {
        await editTodayMessage(ctx.api, chatId, messageId);
      }
    }

    const progress = target != null ? `${value}/${target}` : String(value);
    const unit = habit.unit ? ` ${habit.unit}` : "";
    await ctx.answerCallbackQuery({
      text: done
        ? dictionary.incrementGoal(`${progress}${unit}`)
        : dictionary.incrementPlus(`${progress}${unit}`),
    });
    return;
  }

  if (callback.kind === "toggle") {
    const result = await toggleCheckin(habit.id, todayKey());
    await syncHabitFreezes(habit.id);
    const messageId = ctx.callbackQuery.message?.message_id;
    if (messageId != null) {
      if (callback.time) {
        await editReminderMessage(ctx.api, chatId, messageId, habit, callback.time, {
          tapped: false,
        });
      } else {
        await editTodayMessage(ctx.api, chatId, messageId);
      }
    }
    try {
      await ctx.answerCallbackQuery({
        text:
          habit.type === "negative"
            ? result === "checked"
              ? dictionary.slipLogged(habit.name)
              : dictionary.backOnTrack(habit.name)
            : result === "checked"
              ? dictionary.checked(habit.name)
              : dictionary.unchecked(habit.name),
      });
    } catch (error) {
      // The check-in is already saved; a failed toast must not break the flow.
      console.error("[bot] failed to answer toggle callback:", error);
    }
    return;
  }

  // Value input mode for quantitative/timed habits.
  const messageId = ctx.callbackQuery.message?.message_id;
  pendingInputs.set(chatId, { habitId: habit.id, messageId });
  await ctx.answerCallbackQuery();

  const [todayCheckin] = await getCheckinsForRange(habit.id, todayKey(), todayKey());
  const safeName = escapeHtml(habit.name);
  const safeUnit = habit.unit ? ` ${escapeHtml(habit.unit)}` : "";
  const target =
    habit.type === "timed"
      ? habit.targetValue
        ? dictionary.targetSuffix(formatTimedValue(habit.targetValue * 60))
        : ""
      : habit.targetValue
        ? dictionary.targetSuffix(`${habit.targetValue}${safeUnit}`)
        : "";
  const progress = todayCheckin
    ? dictionary.currentSuffix(escapeHtml(formatSavedValue(habit, todayCheckin.value ?? 0)))
    : "";
  const ask =
    habit.type === "timed"
      ? dictionary.askTimed(safeName, target, progress)
      : dictionary.askQuantitative(safeName, target, progress);
  await ctx.reply(ask, HTML);
});

/* ------------------------- value input by text ------------------------ */

bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id;
  const pending = pendingInputs.get(chatId);
  if (!pending) return;

  const input = ctx.message.text.trim();
  // Command updates are handled by their own handlers; don't treat them as a value.
  if (input.startsWith("/")) return;

  const habit = await getHabitById(pending.habitId);
  if (!habit || habit.archivedAt) {
    pendingInputs.delete(chatId);
    await ctx.reply(await getBotText("habitGone"));
    return;
  }

  if (/^(\/cancel|cancel|отмена)$/i.test(input)) {
    pendingInputs.delete(chatId);
    await ctx.reply(await getBotText("cancelled"));
    return;
  }

  const value = parseValueInput(input);
  if (value == null) {
    await ctx.reply(await getBotText("invalidValue"));
    return;
  }

  // Timed habits store seconds; the bot asks for minutes.
  const stored = habit.type === "timed" ? value * 60 : value;
  const result = await upsertCheckin(habit.id, todayKey(), stored > 0 ? stored : null);
  await syncHabitFreezes(habit.id);
  pendingInputs.delete(chatId);

  if (result === "set" && pending.messageId != null) {
    await editTodayMessage(ctx.api, chatId, pending.messageId);
  }
  if (result === "set") {
    const saved = await getBotText("saved");
    await ctx.reply(saved(formatSavedValue(habit, stored), habit.name));
  } else {
    const cleared = await getBotText("cleared");
    await ctx.reply(cleared(habit.name));
  }
});

/* ------------------------------- startup ------------------------------ */

bot.catch((error) => {
  console.error("[bot] unhandled error:", error.error);
});

void bot.start({
  onStart: async (me) => {
    console.log(`[bot] long polling started as @${me.username}`);
    try {
      await bot.api.setMyCommands([
        { command: "start", description: "Start / Начать" },
        { command: "today", description: "Today's habits / Привычки на сегодня" },
        { command: "language", description: "Language / Язык" },
        { command: "support", description: "Support the author / Поддержать автора" },
      ]);
    } catch (error) {
      // A failed menu sync must not stop polling.
      console.error("[bot] failed to set commands:", error);
    }
  },
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`[bot] received ${signal}, shutting down...`);
    void bot.stop();
  });
}
