import { describe, expect, it } from "vitest";

import type { Checkin, Habit } from "@/db/schema";
import type { DueReminder } from "@/lib/reminders";
import {
  buildCallbackData,
  buildReminderMessage,
  buildTodayMessage,
  escapeHtml,
  formatSavedValue,
  formatTimedValue,
  isHabitDone,
  parseCallbackData,
  parseValueInput,
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

  it("round-trips input callbacks", () => {
    const data = buildCallbackData({ kind: "input", habitId: 7 });
    expect(data).toBe("in:7");
    expect(parseCallbackData(data)).toEqual({ kind: "input", habitId: 7 });
  });

  it("returns null for unknown or malformed payloads", () => {
    expect(parseCallbackData("nope:1")).toBeNull();
    expect(parseCallbackData("ck:")).toBeNull();
    expect(parseCallbackData("ck:abc")).toBeNull();
    expect(parseCallbackData("ck:-1")).toBeNull();
  });
});

describe("isHabitDone", () => {
  it("counts presence for binary and negative habits", () => {
    const habit = makeHabit({ type: "negative" });
    expect(isHabitDone(habit, makeCheckin())).toBe(true);
    expect(isHabitDone(habit, null)).toBe(false);
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

describe("buildTodayMessage", () => {
  it("renders an empty state when nothing is scheduled", () => {
    const { text, keyboard } = buildTodayMessage([], { today: "2026-11-12" });
    expect(text).toContain("Nothing scheduled");
    expect(keyboard).toBeUndefined();
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

    // Keyboard: one action row per habit with the right callback kind.
    const rows = message.keyboard?.inline_keyboard ?? [];
    expect(rows).toHaveLength(3);
    expect(buttonAt(message, 0)).toEqual({ text: "✅ Meditate", callback_data: "ck:1" }); // binary undone -> toggle
    expect(buttonAt(message, 1)).toEqual({ text: "✏️ Water", callback_data: "in:2" }); // quantitative -> value input
    expect(buttonAt(message, 2)).toEqual({ text: "⏱ Reading", callback_data: "in:3" }); // timed -> minutes input
  });

  it("offers an undo button for completed binary habits", () => {
    const message = buildTodayMessage(
      [{ habit: makeHabit(), todayCheckin: makeCheckin(), streak: 3 }],
      { today: "2026-11-12" }
    );
    expect(buttonAt(message, 0).text).toBe("↩️ Drink water");
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

  it("renders name, time and streak", () => {
    const message = buildReminderMessage(due, 4, { type: "binary" });
    expect(message.text).toContain("<b>Stretch</b>");
    expect(message.text).toContain("09:00");
    expect(message.text).toContain("🔥 Streak: 4");
    expect(buttonAt(message, 0)).toEqual({ text: "✅ Mark done", callback_data: "ck:5" });
  });

  it("escapes HTML-significant habit names", () => {
    const { text } = buildReminderMessage({ ...due, habitName: "a<b>&c" }, 0, { type: "binary" });
    expect(text).toContain("a&lt;b&gt;&amp;c");
  });

  it("uses value-input buttons for quantitative and timed habits", () => {
    expect(buttonAt(buildReminderMessage(due, 0, { type: "quantitative" })).text).toBe(
      "✏️ Enter value"
    );
    expect(buttonAt(buildReminderMessage(due, 0, { type: "timed" })).callback_data).toBe(
      "in:5"
    );
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
