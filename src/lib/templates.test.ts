import { describe, expect, it } from "vitest";

import en from "@/locales/en.json";
import ru from "@/locales/ru.json";
import { HABIT_ICONS } from "@/lib/habit-ui";
import {
  HABIT_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_KEYS,
} from "@/lib/templates";

/**
 * The template catalogue is static data, so these tests guard the invariants
 * the gallery and the habit form rely on: unique ids, valid values, icons from
 * the shared picker and translations present in both dictionaries.
 */

describe("habit templates", () => {
  it("contains between 8 and 10 templates", () => {
    expect(HABIT_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    expect(HABIT_TEMPLATES.length).toBeLessThanOrEqual(10);
  });

  it("has unique ids", () => {
    const ids = HABIT_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses valid colors, icons, types and schedules", () => {
    for (const template of HABIT_TEMPLATES) {
      expect(template.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(HABIT_ICONS as readonly string[]).toContain(template.icon);
      expect(["binary", "quantitative", "timed", "negative"]).toContain(
        template.type
      );

      if (template.type === "quantitative" || template.type === "timed") {
        expect(template.targetValue).toBeGreaterThan(0);
      }

      const schedule = template.schedule;
      expect(["daily", "weekly", "specific_days", "flexible"]).toContain(
        schedule.mode
      );
      if (schedule.mode === "specific_days") {
        expect(schedule.daysOfWeek?.length).toBeGreaterThan(0);
        for (const day of schedule.daysOfWeek ?? []) {
          expect(day).toBeGreaterThanOrEqual(0);
          expect(day).toBeLessThanOrEqual(6);
        }
      }
      if (schedule.mode === "weekly") {
        expect(schedule.timesPerWeek).toBeGreaterThanOrEqual(1);
        expect(schedule.timesPerWeek).toBeLessThanOrEqual(7);
      }
      if (schedule.mode === "flexible") {
        expect(schedule.intervalDays).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("has every name and description translated in both languages", () => {
    for (const template of HABIT_TEMPLATES) {
      expect(ru[template.nameKey].length).toBeGreaterThan(0);
      expect(ru[template.descKey].length).toBeGreaterThan(0);
      expect(en[template.nameKey].length).toBeGreaterThan(0);
      expect(en[template.descKey].length).toBeGreaterThan(0);
    }
  });

  it("has every category translated in both languages", () => {
    for (const category of TEMPLATE_CATEGORIES) {
      const key = TEMPLATE_CATEGORY_KEYS[category];
      expect(ru[key].length).toBeGreaterThan(0);
      expect(en[key].length).toBeGreaterThan(0);
    }
  });
});
