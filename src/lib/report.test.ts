import { describe, expect, it } from "vitest";

import type { Checkin, Habit } from "@/db/schema";
import { buildCsv, buildReport, reportRange } from "./report";

/** Monday, 3 November 2025. */
const PERIOD_START = "2025-11-03";
/** Sunday, 9 November 2025. */
const TODAY = new Date(2025, 10, 9);

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 1,
    name: "Read",
    description: null,
    type: "binary",
    color: "#3b82f6",
    icon: null,
    schedule: { mode: "daily" },
    targetValue: null,
    unit: null,
    category: null,
    tags: [],
    positionX: 0,
    positionY: 0,
    freezeBank: 0,
    createdAt: new Date(2025, 9, 1),
    archivedAt: null,
    ...overrides,
  };
}

function checkin(date: string, value: number | null = null): Checkin {
  return {
    id: 1,
    habitId: 1,
    date,
    value,
    note: null,
    createdAt: new Date(2025, 10, 9),
  };
}

describe("reportRange", () => {
  it("uses an inclusive 7-day window ending today", () => {
    const range = reportRange("7", [habit()], TODAY);
    expect(range.from.getTime()).toBe(new Date(2025, 10, 3).getTime());
    expect(range.to.getTime()).toBe(TODAY.getTime());
  });

  it("starts all-time reports at the earliest habit creation day", () => {
    const range = reportRange(
      "all",
      [habit({ createdAt: new Date(2025, 9, 1) }), habit({ id: 2, createdAt: new Date(2025, 8, 15) })],
      TODAY
    );
    expect(range.from.getTime()).toBe(new Date(2025, 8, 15).getTime());
  });

  it("falls back to today for an empty all-time report", () => {
    const range = reportRange("all", [], TODAY);
    expect(range.from.getTime()).toBe(TODAY.getTime());
  });
});

describe("buildReport", () => {
  it("aggregates completion, streaks and raw history", () => {
    const rows = [
      checkin("2025-11-06"),
      checkin("2025-11-07"),
      checkin("2025-11-08"),
    ];
    const report = buildReport(
      [habit()],
      new Map([[1, rows]]),
      "7",
      TODAY
    );

    expect(report.from).toBe(PERIOD_START);
    expect(report.to).toBe("2025-11-09");
    expect(report.habits[0].scheduledDays).toBe(7);
    expect(report.habits[0].completedDays).toBe(3);
    expect(report.habits[0].completionRate).toBeCloseTo(3 / 7);
    expect(report.habits[0].currentStreak).toBe(3);
    expect(report.habits[0].longestStreak).toBe(3);
    expect(report.habits[0].checkins.map((row) => row.date)).toEqual([
      "2025-11-06",
      "2025-11-07",
      "2025-11-08",
    ]);
    expect(report.totals).toMatchObject({
      scheduledDays: 7,
      completedDays: 3,
      checkins: 3,
    });
  });

  it("does not count days before a habit was created as scheduled", () => {
    const createdMidPeriod = habit({ createdAt: new Date(2025, 10, 5) });
    const rows = [checkin("2025-11-06"), checkin("2025-11-07")];
    const report = buildReport(
      [createdMidPeriod],
      new Map([[1, rows]]),
      "7",
      TODAY
    );

    // 5, 6, 7, 8, 9 November: five scheduled days, two completed.
    expect(report.habits[0].scheduledDays).toBe(5);
    expect(report.habits[0].completedDays).toBe(2);
    expect(report.habits[0].completionRate).toBeCloseTo(2 / 5);
  });

  it("keeps below-target values in the raw history", () => {
    const quantitative = habit({ type: "quantitative", targetValue: 10 });
    const rows = [checkin("2025-11-06", 4), checkin("2025-11-07", 10)];
    const report = buildReport(
      [quantitative],
      new Map([[1, rows]]),
      "7",
      TODAY
    );

    expect(report.habits[0].completedDays).toBe(1);
    expect(report.habits[0].checkins).toHaveLength(2);
    expect(report.habits[0].checkins[0].value).toBe(4);
  });
});

describe("buildCsv", () => {
  it("starts with a UTF-8 BOM and a Russian Excel separator directive", () => {
    const csv = buildCsv(
      buildReport([habit()], new Map(), "7", TODAY),
      "ru"
    );

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).startsWith("sep=;\r\n")).toBe(true);
    expect(csv).toContain("Привычка;Тип;Расписание;Период");
    expect(csv).toContain("\r\n");
  });

  it("writes a plain comma-separated English file", () => {
    const csv = buildCsv(
      buildReport([habit()], new Map(), "7", TODAY),
      "en"
    );

    expect(csv.slice(1).startsWith("Habit,Type,Schedule,Period")).toBe(true);
    expect(csv).not.toContain("sep=");
  });

  it("escapes delimiters and quotes in habit names", () => {
    const csv = buildCsv(
      buildReport(
        [habit({ name: 'Read, "daily"' })],
        new Map([[1, [checkin("2025-11-08", 10)]]]),
        "7",
        TODAY
      ),
      "en"
    );

    expect(csv).toContain('"Read, ""daily"""');
    expect(csv).toContain("2025-11-08: 10");
  });

  it("quotes values containing the semicolon delimiter", () => {
    const csv = buildCsv(
      buildReport(
        [habit({ name: "Read; write" })],
        new Map([[1, [checkin("2025-11-08", 10)]]]),
        "7",
        TODAY
      ),
      "ru"
    );

    expect(csv).toContain('"Read; write"');
    expect(csv).toContain("2025-11-08: 10");
  });
});
