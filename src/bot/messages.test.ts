import { describe, expect, it } from "vitest";

import type { Checkin, Habit } from "@/db/schema";
import type { DueReminder } from "@/lib/reminders";
import {
  buildCallbackData,
  buildLanguageChangedMessage,
  buildLanguageMessage,
  buildMainMenuMessage,
  buildReminderMessage,
  buildStatsMessage,
  buildSupportMessage,
  buildTodayMessage,
  buildWebAppMessage,
  escapeHtml,
  formatSavedValue,
  formatTimedValue,
  isHabitDone,
  parseCallbackData,
  parseValueInput,
  pluralDays,
  telegramSafeUrl,
  type BotMessage,
} from "./messages";

/** First button of a keyboard row, narrowed to a callback button. */
function buttonAt(
  message: BotMessage,
  row = 0,
  col = 0
): { text: string; callback_data: string } {
  const button = message.keyboard?.inline_keyboard[row]?.[col];
  if (!button || !("callback_data" in button) || button.callback_data == null) {
    throw new Error(`Expected a callback button at row ${row}, col ${col}`);
  }
  return { text: button.text, callback_data: button.callback_data };
}

/** First button of a keyboard row, narrowed to a url button. */
function urlButtonAt(
  message: BotMessage,
  row = 0,
  col = 0
): { text: string; url: string } {
  const button = message.keyboard?.inline_keyboard[row]?.[col];
  if (!button || !("url" in button) || button.url == null) {
    throw new Error(`Expected a url button at row ${row}, col ${col}`);
  }
  return { text: button.text, url: button.url };
}

/** Minimal habit factory for rendering tests. */
function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 1,
    name: "Drink water",
    description: null,
    type: "binary",
    color: "#3b82f6",
    icon: "Droplets",
    schedule: { mode: "daily" },
    targetValue: null,
    unit: null,
    category: null,
    tags: [],
    positionX: 0,
    positionY: 0,
    freezeBank: 0,
    createdAt: new Date(0),
    archivedAt: null,
    ...overrides,
  };
}

function makeCheckin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    id: 1,
    habitId: 1,
    date: "2026-11-12",
    value: null,
    note: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

describe("callback data codecs", () => {
  it("round-trips toggle callbacks", () => {
    const data = buildCallbackData({ kind: "toggle", habitId: 42 });
    expect(data).toBe("ck:42");
    expect(parseCallbackData(data)).toEqual({ kind: "toggle", habitId: 42 });
  });

  it("carries the reminder time in toggle callbacks", () => {
    const data = buildCallbackData({ kind: "toggle", habitId: 5, time: "09:00" });
    expect(data).toBe("ck:5:09:00");
    expect(parseCallbackData(data)).toEqual({
      kind: "toggle",
      habitId: 5,
      time: "09:00",
    });
    expect(parseCallbackData("ck:5:9:00")).toBeNull();
  });

  it("round-trips input callbacks", () => {
    const data = buildCallbackData({ kind: "input", habitId: 7 });
    expect(data).toBe("in:7");
    expect(parseCallbackData(data)).toEqual({ kind: "input", habitId: 7 });
  });

  it("round-trips increment callbacks for /today and reminders", () => {
    expect(buildCallbackData({ kind: "increment", habitId: 42, source: "today" })).toBe("inc:42");
    expect(parseCallbackData("inc:42")).toEqual({
      kind: "increment",
      habitId: 42,
      source: "today",
    });

    expect(
      buildCallbackData({
        kind: "increment",
        habitId: 42,
        reminderId: 7,
        source: "reminder",
        time: "09:00",
      })
    ).toBe("inc:42:7:09:00");
    expect(parseCallbackData("inc:42:7:09:00")).toEqual({
      kind: "increment",
      habitId: 42,
      reminderId: 7,
      source: "reminder",
      time: "09:00",
    });
  });

  it("still parses reminder callbacks sent before reminder ids were encoded", () => {
    expect(parseCallbackData("inc:42:09:00")).toEqual({
      kind: "increment",
      habitId: 42,
      source: "reminder",
      time: "09:00",
    });
  });

  it("round-trips the noop callback used for disabled buttons", () => {
    expect(buildCallbackData({ kind: "noop" })).toBe("noop");
    expect(parseCallbackData("noop")).toEqual({ kind: "noop" });
  });

  it("round-trips main-menu navigation callbacks", () => {
    expect(buildCallbackData({ kind: "menu_today" })).toBe("menu_today");
    expect(buildCallbackData({ kind: "menu_stats" })).toBe("menu_stats");
    expect(buildCallbackData({ kind: "menu_web" })).toBe("menu_web");
    expect(buildCallbackData({ kind: "menu_language" })).toBe("menu_language");
    expect(buildCallbackData({ kind: "menu_main" })).toBe("menu_main");
    expect(parseCallbackData("menu_today")).toEqual({ kind: "menu_today" });
    expect(parseCallbackData("menu_stats")).toEqual({ kind: "menu_stats" });
    expect(parseCallbackData("menu_web")).toEqual({ kind: "menu_web" });
    expect(parseCallbackData("menu_language")).toEqual({ kind: "menu_language" });
    expect(parseCallbackData("menu_main")).toEqual({ kind: "menu_main" });
  });

  it("round-trips language picker callbacks", () => {
    expect(buildCallbackData({ kind: "language", language: "ru" })).toBe("lang_ru");
    expect(buildCallbackData({ kind: "language", language: "en" })).toBe("lang_en");
    expect(parseCallbackData("lang_ru")).toEqual({ kind: "language", language: "ru" });
    expect(parseCallbackData("lang_en")).toEqual({ kind: "language", language: "en" });
    expect(parseCallbackData("lang_de")).toBeNull();
  });

  it("returns null for unknown or malformed payloads", () => {
    expect(parseCallbackData("nope:1")).toBeNull();
    expect(parseCallbackData("ck:")).toBeNull();
    expect(parseCallbackData("ck:abc")).toBeNull();
    expect(parseCallbackData("ck:-1")).toBeNull();
    expect(parseCallbackData("inc:abc")).toBeNull();
  });
});

describe("isHabitDone", () => {
  it("inverts negative habits: a clean day is done, a slip is not", () => {
    const habit = makeHabit({ type: "negative" });
    expect(isHabitDone(habit, makeCheckin())).toBe(false);
    expect(isHabitDone(habit, null)).toBe(true);
  });

  it("requires the target value for quantitative habits", () => {
    const habit = makeHabit({ type: "quantitative", targetValue: 8, unit: "glasses" });
    expect(isHabitDone(habit, makeCheckin({ value: 3 }))).toBe(false);
    expect(isHabitDone(habit, makeCheckin({ value: 8 }))).toBe(true);
  });

  it("requires the target seconds for timed habits", () => {
    const habit = makeHabit({ type: "timed", targetValue: 30 });
    expect(isHabitDone(habit, makeCheckin({ value: 600 }))).toBe(false);
    expect(isHabitDone(habit, makeCheckin({ value: 1800 }))).toBe(true);
  });
});

describe("buildMainMenuMessage", () => {
  it("renders the greeting with three rows of menu buttons", () => {
    const message = buildMainMenuMessage();

    expect(message.text).toContain("👋 Привет! Я твой трекер привычек. Выбери действие:");
    expect(message.text).toContain("нажимай на кнопки");

    const rows = message.keyboard?.inline_keyboard ?? [];
    expect(rows).toHaveLength(3); // no donation row when the link is unset

    expect(buttonAt(message, 0)).toEqual({
      text: "📅 Привычки на сегодня",
      callback_data: "menu_today",
    });
    expect(buttonAt(message, 1, 0)).toEqual({
      text: "📊 Моя статистика",
      callback_data: "menu_stats",
    });
    expect(buttonAt(message, 2, 0)).toEqual({
      text: "🌐 Сменить язык / Change language",
      callback_data: "menu_language",
    });
  });

  it("uses a callback button for the local web app, which Telegram refuses as a url", () => {
    const message = buildMainMenuMessage({ webUrl: "http://localhost:3000" });
    expect(buttonAt(message, 1, 1)).toEqual({
      text: "⚙️ Открыть веб-версию",
      callback_data: "menu_web",
    });
  });

  it("uses a url button once a public web address is configured", () => {
    const message = buildMainMenuMessage({ webUrl: "https://habits.example.com/" });
    expect(urlButtonAt(message, 1, 1)).toEqual({
      text: "⚙️ Открыть веб-версию",
      url: "https://habits.example.com/",
    });
  });

  it("adds the donation row when a link is configured", () => {
    const message = buildMainMenuMessage({ donationUrl: "  https://example.com/donate  " });
    const rows = message.keyboard?.inline_keyboard ?? [];
    expect(rows).toHaveLength(4);
    expect(urlButtonAt(message, 3, 0)).toEqual({
      text: "💖 Поддержать автора",
      url: "https://example.com/donate",
    });
  });

  it("hides the donation row for blank or unusable links", () => {
    for (const value of [null, undefined, "", "   ", "not a url", "javascript:alert(1)"]) {
      const rows = buildMainMenuMessage({ donationUrl: value }).keyboard?.inline_keyboard ?? [];
      expect(rows).toHaveLength(3);
    }
  });
});

describe("telegramSafeUrl", () => {
  it("rejects loopback and non-http links that Telegram reports as invalid", () => {
    for (const value of [
      null,
      undefined,
      "",
      "   ",
      "localhost:3000",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
      "http://app.localhost:3000",
      "ftp://example.com",
      "javascript:alert(1)",
    ]) {
      expect(telegramSafeUrl(value)).toBeNull();
    }
  });

  it("keeps public http(s) urls and trims them", () => {
    expect(telegramSafeUrl("  https://example.com/donate  ")).toBe("https://example.com/donate");
    expect(telegramSafeUrl("http://192.168.1.10:3000")).toBe("http://192.168.1.10:3000");
  });
});

describe("buildWebAppMessage", () => {
  it("prints the address as text with a way back", () => {
    const message = buildWebAppMessage("http://localhost:3000");
    expect(message.text).toContain("http://localhost:3000");
    expect(message.text).toContain("Открыть веб-версию");
    expect(buttonAt(message, 0)).toEqual({
      text: "⬅️ В главное меню",
      callback_data: "menu_main",
    });
  });

  it("falls back to the default local address", () => {
    for (const value of [null, undefined, "", "  "]) {
      expect(buildWebAppMessage(value).text).toContain("http://localhost:3000");
    }
  });
});

describe("buildStatsMessage", () => {
  it("renders streak and today's completion with a way back", () => {
    const message = buildStatsMessage({ streak: 12, done: 3, total: 4 });
    expect(message.text).toContain("📊 <b>Моя статистика</b>");
    expect(message.text).toContain("Твой текущий стрик: <b>12 дней</b>.");
    expect(message.text).toContain("Выполнено сегодня: <b>3 из 4</b>.");
    expect(buttonAt(message, 0)).toEqual({
      text: "⬅️ В главное меню",
      callback_data: "menu_main",
    });
  });

  it("uses the singular form for a one-day streak", () => {
    expect(buildStatsMessage({ streak: 1, done: 0, total: 0 }).text).toContain(
      "<b>1 день</b>"
    );
  });
});

describe("pluralDays", () => {
  it("follows Russian plural rules", () => {
    expect([0, 5, 11, 12, 14, 21, 25].map(pluralDays)).toEqual([
      "дней",
      "дней",
      "дней",
      "дней",
      "дней",
      "день",
      "дней",
    ]);
    expect([1, 2, 3, 4, 22, 24].map(pluralDays)).toEqual([
      "день",
      "дня",
      "дня",
      "дня",
      "дня",
      "дня",
    ]);
  });
});

describe("buildTodayMessage", () => {
  it("renders an empty state when nothing is scheduled", () => {
    const { text, keyboard } = buildTodayMessage([], { today: "2026-11-12" });
    expect(text).toContain("На сегодня ничего не запланировано");
    expect(keyboard?.inline_keyboard).toHaveLength(1);
  });

  it("renders per-type lines, buttons and progress", () => {
    const items = [
      {
        habit: makeHabit({ id: 1, name: "Meditate" }),
        todayCheckin: null,
        streak: 12,
      },
      {
        habit: makeHabit({
          id: 2,
          name: "Water",
          type: "quantitative",
          targetValue: 8,
          unit: "glasses",
        }),
        todayCheckin: makeCheckin({ habitId: 2, value: 3 }),
        streak: 5,
      },
      {
        habit: makeHabit({ id: 3, name: "Reading", type: "timed", targetValue: 30 }),
        todayCheckin: makeCheckin({ habitId: 3, value: 900 }),
        streak: 0,
      },
    ];

    const message = buildTodayMessage(items, { today: "2026-11-12" });

    // Text: one status line per habit, streaks and progress suffixes.
    expect(message.text).toContain("⬜ <b>Meditate</b> — 🔥 12");
    expect(message.text).toContain("⬜ <b>Water</b> — 🔥 5 · 3/8 glasses"); // 3/8: in progress, not done
    expect(message.text).toContain("⬜ <b>Reading</b> — 🔥 0 · 15m/30m"); // 15m of 30m: not done

    // Keyboard: one action row per habit plus the back-to-menu row.
    const rows = message.keyboard?.inline_keyboard ?? [];
    expect(rows).toHaveLength(4);
    expect(buttonAt(message, 0)).toEqual({ text: "✅ Meditate", callback_data: "ck:1" }); // binary undone -> toggle
    expect(buttonAt(message, 1)).toEqual({ text: "➕ +1 (3/8)", callback_data: "inc:2" }); // quantitative -> increment
    expect(buttonAt(message, 2)).toEqual({ text: "⏱ Reading", callback_data: "in:3" }); // timed -> minutes input
    expect(buttonAt(message, 3)).toEqual({
      text: "⬅️ В главное меню",
      callback_data: "menu_main",
    });
  });

  it("shows an increment button for quantitative habits without a check-in", () => {
    const message = buildTodayMessage(
      [
        {
          habit: makeHabit({
            id: 4,
            name: "Pills",
            type: "quantitative",
            targetValue: 3,
            unit: "times",
          }),
          todayCheckin: null,
          streak: 0,
        },
      ],
      { today: "2026-11-12" }
    );
    expect(message.text).toContain("⬜ <b>Pills</b> — 🔥 0");
    expect(buttonAt(message, 0)).toEqual({ text: "➕ +1 (0/3)", callback_data: "inc:4" });
  });

  it("disables the quantitative button once the target is reached", () => {
    const message = buildTodayMessage(
      [
        {
          habit: makeHabit({
            id: 4,
            name: "Pills",
            type: "quantitative",
            targetValue: 3,
            unit: "times",
          }),
          todayCheckin: makeCheckin({ habitId: 4, value: 3 }),
          streak: 1,
        },
      ],
      { today: "2026-11-12" }
    );
    expect(message.text).toContain("Цель дня достигнута!");
    expect(buttonAt(message, 0)).toEqual({ text: "✅ Выполнено", callback_data: "noop" });
  });

  it("offers an undo button for completed binary habits", () => {
    const message = buildTodayMessage(
      [{ habit: makeHabit(), todayCheckin: makeCheckin(), streak: 3 }],
      { today: "2026-11-12" }
    );
    expect(buttonAt(message, 0).text).toBe("↩️ Drink water");
  });

  it("inverts negative habit status and actions", () => {
    const clean = buildTodayMessage(
      [{ habit: makeHabit({ type: "negative", name: "No sugar" }), todayCheckin: null, streak: 4 }],
      { today: "2026-11-12" }
    );
    expect(clean.text).toContain("✅ <b>No sugar</b>");
    expect(buttonAt(clean, 0).text).toBe("❌ Срыв · No sugar");

    const slipped = buildTodayMessage(
      [
        {
          habit: makeHabit({ type: "negative", name: "No sugar" }),
          todayCheckin: makeCheckin(),
          streak: 0,
        },
      ],
      { today: "2026-11-12" }
    );
    expect(slipped.text).toContain("❌ <b>No sugar</b>");
    expect(slipped.text).toContain(" · срыв");
    expect(buttonAt(slipped, 0).text).toBe("↩️ Отменить срыв · No sugar");
  });
});

describe("buildReminderMessage", () => {
  const due: DueReminder = {
    reminderId: 1,
    habitId: 5,
    habitName: "Stretch",
    time: "09:00",
    daysOfWeek: [1, 2, 3],
  };

  const stretch = makeHabit({ id: 5, name: "Stretch" });

  it("renders name, time and streak", () => {
    const message = buildReminderMessage(due, 4, stretch);
    expect(message.text).toContain("<b>Stretch</b>");
    expect(message.text).toContain("09:00");
    expect(message.text).toContain("🔥 Стрик: 4");
    expect(buttonAt(message, 0)).toEqual({ text: "✅ Выполнено", callback_data: "ck:5:09:00" });
  });

  it("escapes HTML-significant habit names", () => {
    const { text } = buildReminderMessage({ ...due, habitName: "a<b>&c" }, 0, stretch);
    expect(text).toContain("a&lt;b&gt;&amp;c");
  });

  it("escapes HTML-significant units in progress", () => {
    const pills = makeHabit({
      id: 5,
      name: "Pills",
      type: "quantitative",
      targetValue: 3,
      unit: "a<b&c",
    });
    const message = buildReminderMessage(
      due,
      0,
      pills,
      makeCheckin({ habitId: 5, value: 1 })
    );
    expect(message.text).toContain("1/3 a&lt;b&amp;c");
  });

  it("renders an increment button with today's progress for quantitative habits", () => {
    const pills = makeHabit({
      id: 5,
      name: "Pills",
      type: "quantitative",
      targetValue: 3,
      unit: "times",
    });
    const message = buildReminderMessage(
      due,
      0,
      pills,
      makeCheckin({ habitId: 5, value: 1 })
    );
    expect(message.text).toContain("1/3 times");
    expect(buttonAt(message, 0)).toEqual({
      text: "➕ +1 (1/3)",
      callback_data: "inc:5:1:09:00",
    });
  });

  it("turns the button into an inert acknowledgement after the reminder was used", () => {
    const pills = makeHabit({
      id: 5,
      name: "Pills",
      type: "quantitative",
      targetValue: 3,
      unit: "times",
    });
    const message = buildReminderMessage(
      due,
      0,
      pills,
      makeCheckin({ habitId: 5, value: 2 }),
      { tapped: true }
    );
    expect(buttonAt(message, 0)).toEqual({
      text: "✅ Отмечено (2/3)",
      callback_data: "noop",
    });
  });

  it("marks a completed quantitative reminder as done", () => {
    const pills = makeHabit({
      id: 5,
      name: "Pills",
      type: "quantitative",
      targetValue: 3,
      unit: "times",
    });
    const message = buildReminderMessage(
      due,
      2,
      pills,
      makeCheckin({ habitId: 5, value: 3 })
    );
    expect(message.text).toContain("Цель дня достигнута!");
    expect(buttonAt(message, 0)).toEqual({ text: "✅ Выполнено", callback_data: "noop" });
  });

  it("uses a value-input button for timed habits", () => {
    expect(
      buttonAt(buildReminderMessage(due, 0, makeHabit({ type: "timed", targetValue: 30 })))
        .callback_data
    ).toBe("in:5");
  });

  it("labels negative habit reminders as slip logging", () => {
    expect(
      buttonAt(buildReminderMessage(due, 0, makeHabit({ type: "negative" }))).text
    ).toBe("❌ Срыв");
  });

  it("renders English copy when asked", () => {
    const message = buildReminderMessage(due, 4, stretch, null, { language: "en" });
    expect(message.text).toContain("Scheduled for 09:00");
    expect(message.text).toContain("🔥 Streak: 4");
    expect(buttonAt(message, 0)).toEqual({ text: "✅ Mark done", callback_data: "ck:5:09:00" });
  });
});

describe("buildSupportMessage", () => {
  it("renders a url button when a donation link is configured", () => {
    const message = buildSupportMessage("https://www.donationalerts.com/r/h4rr0u");
    const button = message.keyboard?.inline_keyboard[0]?.[0];
    expect(button).toEqual({
      text: "💖 Поддержать",
      url: "https://www.donationalerts.com/r/h4rr0u",
    });
    expect(message.text).toContain("Поддержать автора");
  });

  it("trims the configured link", () => {
    const message = buildSupportMessage("  https://example.com/donate  ");
    expect(message.keyboard?.inline_keyboard[0]?.[0]).toEqual({
      text: "💖 Поддержать",
      url: "https://example.com/donate",
    });
  });

  it("has no keyboard when donations are disabled", () => {
    for (const value of [null, undefined, "", "   "]) {
      const message = buildSupportMessage(value);
      expect(message.keyboard).toBeUndefined();
      expect(message.text).toBe("Спасибо! Донаты для этой сборки отключены.");
    }
  });
});

describe("language selection", () => {
  it("renders the picker with both options and a way back", () => {
    const message = buildLanguageMessage("ru");
    expect(message.text).toContain("Выберите язык / Choose language:");
    expect(buttonAt(message, 0)).toEqual({
      text: "🇷🇺 Русский",
      callback_data: "lang_ru",
    });
    expect(buttonAt(message, 1, 0)).toEqual({
      text: "🇬🇧 English",
      callback_data: "lang_en",
    });
    expect(buttonAt(message, 2)).toEqual({
      text: "⬅️ В главное меню",
      callback_data: "menu_main",
    });
  });

  it("confirms the change in the selected language", () => {
    const ru = buildLanguageChangedMessage("ru");
    expect(ru.text).toBe("Язык изменён на Русский 🇷🇺");
    expect(buttonAt(ru, 0)).toEqual({
      text: "⬅️ В главное меню",
      callback_data: "menu_main",
    });

    const en = buildLanguageChangedMessage("en");
    expect(en.text).toBe("Language changed to English 🇬🇧");
    expect(buttonAt(en, 0)).toEqual({
      text: "⬅️ Back to main menu",
      callback_data: "menu_main",
    });
  });

  it("switches the menu, today and stats copy to English", () => {
    const menu = buildMainMenuMessage({ language: "en" });
    expect(menu.text).toContain("Hi! I'm your habit tracker");
    expect(buttonAt(menu, 0).text).toBe("📅 Today's habits");
    expect(buttonAt(menu, 2, 0).text).toBe("🌐 Change language / Сменить язык");

    const today = buildTodayMessage([], {
      today: "2026-11-12",
      language: "en",
    });
    expect(today.text).toContain("Nothing scheduled for today");

    const stats = buildStatsMessage({ streak: 12, done: 3, total: 4 }, "en");
    expect(stats.text).toContain("Your current streak: <b>12 days</b>");
    expect(stats.text).toContain("Done today: <b>3 of 4</b>");
  });

  it("uses English action labels in the today digest", () => {
    const message = buildTodayMessage(
      [
        {
          habit: makeHabit({ id: 1, name: "Meditate" }),
          todayCheckin: null,
          streak: 12,
        },
        {
          habit: makeHabit({ type: "negative", name: "No sugar" }),
          todayCheckin: null,
          streak: 4,
        },
      ],
      { today: "2026-11-12", language: "en" }
    );
    expect(message.text).toContain("· avoid");
    expect(buttonAt(message, 0)).toEqual({
      text: "✅ Meditate",
      callback_data: "ck:1",
    });
    expect(buttonAt(message, 1).text).toBe("❌ Log slip · No sugar");
  });
});

describe("formatSavedValue", () => {
  it("formats raw units and timed seconds", () => {
    expect(formatSavedValue({ type: "quantitative", unit: "glasses" }, 3)).toBe("3 glasses");
    expect(formatSavedValue({ type: "quantitative", unit: null }, 5)).toBe("5");
    expect(formatSavedValue({ type: "timed", unit: null }, 900)).toBe("15m");
  });
});

describe("escapeHtml", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml("a<b>&c")).toBe("a&lt;b&gt;&amp;c");
    expect(escapeHtml("plain")).toBe("plain");
  });
});

describe("formatTimedValue", () => {
  it("formats minutes and hours", () => {
    expect(formatTimedValue(0)).toBe("0m");
    expect(formatTimedValue(900)).toBe("15m");
    expect(formatTimedValue(3900)).toBe("1h 05m");
    expect(formatTimedValue(null)).toBe("0m");
  });
});

describe("parseValueInput", () => {
  it("accepts non-negative integers with optional spacing", () => {
    expect(parseValueInput("12")).toBe(12);
    expect(parseValueInput(" 7 ")).toBe(7);
    expect(parseValueInput("0")).toBe(0);
  });

  it("rejects anything that is not an integer", () => {
    expect(parseValueInput("")).toBeNull();
    expect(parseValueInput("abc")).toBeNull();
    expect(parseValueInput("-3")).toBeNull();
    expect(parseValueInput("1.5")).toBeNull();
    expect(parseValueInput("1 000")).toBeNull(); // internal spacing is not accepted
  });
});
