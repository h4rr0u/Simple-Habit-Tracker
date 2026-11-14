import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { addDays, format, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "../src/db/schema";
import type { Checkin, Habit, HabitType } from "../src/db/schema";
import { buildCompletionCheckins } from "../src/lib/habit-target";
import { calculateFreezeConsumption } from "../src/lib/streaks";
import { isHabitDueOn, type Schedule } from "../src/types/schedule";

/**
 * Demo-data seeder for screenshots and manual QA.
 *
 * Writes a realistic year of history for ~12 habits into a SEPARATE database
 * (default `./data/demo.db`) so the real tracker data is never touched:
 *
 *   npm run db:seed:demo
 *   npm run dev -- --port 3000   (with DATABASE_URL=./data/demo.db)
 *
 * The generator is deterministic: re-running produces identical data, so the
 * screenshots in docs/screenshots/ stay reproducible.
 */

const DEFAULT_DB = "./data/demo.db";
const targetUrl = process.env.DATABASE_URL ?? DEFAULT_DB;
const resolvedPath = path.resolve(targetUrl);
const isRealDatabase = path.basename(resolvedPath) === "habit-tracker.db";

if (isRealDatabase && !process.argv.includes("--force")) {
  console.error(
    `[seed] refusing to write demo data into ${resolvedPath}\n` +
      "       point DATABASE_URL at data/demo.db instead, or pass --force."
  );
  process.exit(1);
}

mkdirSync(path.dirname(resolvedPath), { recursive: true });

const sqlite = new Database(resolvedPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: path.resolve("drizzle") });

/* ----------------------------- determinism ----------------------------- */

/** FNV-1a hash → uniform number in [0, 1). Stable across runs and Node versions. */
function rand(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995);
  hash ^= hash >>> 15;
  return (hash >>> 0) / 4294967296;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* ------------------------------- config -------------------------------- */

interface Slump {
  /** Inclusive window, counted backwards from today. */
  fromDaysAgo: number;
  toDaysAgo: number;
  /** Probability subtracted inside the window (e.g. 0.35 = bad stretch). */
  penalty: number;
}

interface HabitSeed {
  name: string;
  description: string;
  type: HabitType;
  icon: string;
  color: string;
  schedule: Schedule;
  targetValue?: number;
  unit?: string;
  createdDaysAgo: number;
  freezeBank: number;
  /** Baseline completion probability on a normal day (0..1). */
  rate: number;
  /** Probability delta on Saturday/Sunday. */
  weekendDelta?: number;
  /** Per-weekday multipliers, index 0 = Sunday. */
  weekdayWeights?: number[];
  slump?: Slump;
  /** Share of missed quantitative/timed days that still record a partial value. */
  partialRate?: number;
  /** Guaranteed run of completed scheduled days ending today. */
  tailDays: number;
  /**
   * A single missed scheduled day inside the guaranteed run (1 = yesterday).
   * The streak engine covers it with a freeze, so the demo shows what a
   * "spent freeze" looks like on the charts.
   */
  tailGapDaysAgo?: number;
  /** Completed run somewhere in the past, for the "longest streak" record. */
  historicStreak?: { endDaysAgo: number; length: number };
  /** Force today's state so the dashboard shows a nice mix. */
  today?: { kind: "complete" } | { kind: "partial"; value: number } | { kind: "miss" };
}

const HABITS: HabitSeed[] = [
  {
    name: "Morning run",
    description: "5 km before breakfast — the anchor habit of the day.",
    type: "binary",
    icon: "Dumbbell",
    color: "#3b82f6",
    schedule: { mode: "daily" },
    createdDaysAgo: 400,
    freezeBank: 2,
    rate: 0.9,
    weekendDelta: -0.04,
    weekdayWeights: [0.8, 1.05, 1.0, 0.95, 1.0, 0.96, 0.86],
    partialRate: 0,
    tailDays: 84,
    tailGapDaysAgo: 34,
    historicStreak: { endDaysAgo: 150, length: 118 },
    today: { kind: "complete" },
  },
  {
    name: "Read 30 min",
    description: "Fiction at night, non-fiction in the morning.",
    type: "timed",
    icon: "BookOpen",
    color: "#8b5cf6",
    schedule: { mode: "daily" },
    targetValue: 30,
    unit: "min",
    createdDaysAgo: 390,
    freezeBank: 2,
    rate: 0.85,
    weekendDelta: 0.05,
    partialRate: 0.6,
    tailDays: 41,
    tailGapDaysAgo: 12,
    today: { kind: "complete" },
  },
  {
    name: "Drink water",
    description: "Eight glasses, spread across the whole day.",
    type: "quantitative",
    icon: "GlassWater",
    color: "#06b6d4",
    schedule: { mode: "daily" },
    targetValue: 8,
    unit: "glasses",
    createdDaysAgo: 380,
    freezeBank: 2,
    rate: 0.87,
    weekendDelta: -0.03,
    weekdayWeights: [0.94, 0.9, 1.06, 0.96, 1.02, 1.0, 0.92],
    partialRate: 0.85,
    tailDays: 32,
    today: { kind: "complete" },
  },
  {
    name: "Meditate",
    description: "Ten quiet minutes, Monday / Wednesday / Friday.",
    type: "binary",
    icon: "Brain",
    color: "#14b8a6",
    schedule: { mode: "specific_days", daysOfWeek: [1, 3, 5] },
    createdDaysAgo: 370,
    freezeBank: 2,
    rate: 0.93,
    partialRate: 0,
    tailDays: 44,
    today: { kind: "complete" },
  },
  {
    name: "Pills",
    description: "Three doses a day — morning, lunch and evening.",
    type: "quantitative",
    icon: "Pill",
    color: "#f97316",
    schedule: { mode: "daily" },
    targetValue: 3,
    unit: "times",
    createdDaysAgo: 360,
    freezeBank: 2,
    rate: 0.91,
    weekdayWeights: [0.88, 1.04, 0.98, 1.0, 1.0, 0.96, 0.9],
    partialRate: 0.7,
    tailDays: 26,
    today: { kind: "partial", value: 1 },
  },
  {
    name: "No sugar",
    description: "Skip desserts and sweetened drinks.",
    type: "negative",
    icon: "Ban",
    color: "#ef4444",
    schedule: { mode: "daily" },
    createdDaysAgo: 350,
    freezeBank: 1,
    rate: 0.84,
    weekendDelta: -0.12,
    tailDays: 21,
    today: { kind: "complete" },
  },
  {
    name: "Walk 10k steps",
    description: "Long walks on the weekend, short loops on weekdays.",
    type: "quantitative",
    icon: "Footprints",
    color: "#eab308",
    schedule: { mode: "daily" },
    targetValue: 10000,
    unit: "steps",
    createdDaysAgo: 340,
    freezeBank: 2,
    rate: 0.78,
    weekendDelta: 0.09,
    weekdayWeights: [1, 0.92, 0.95, 0.9, 0.94, 1.02, 1.05],
    partialRate: 0.9,
    slump: { fromDaysAgo: 96, toDaysAgo: 68, penalty: 0.22 },
    tailDays: 15,
    today: { kind: "partial", value: 3640 },
  },
  {
    name: "Practice guitar",
    description: "Three sessions a week, twenty minutes each.",
    type: "timed",
    icon: "Music",
    color: "#ec4899",
    schedule: { mode: "weekly", timesPerWeek: 3 },
    targetValue: 20,
    unit: "min",
    createdDaysAgo: 330,
    freezeBank: 2,
    rate: 0.62,
    partialRate: 0.5,
    tailDays: 26,
    today: { kind: "complete" },
  },
  {
    name: "Learn Spanish",
    description: "Duolingo plus a podcast on the commute.",
    type: "timed",
    icon: "Star",
    color: "#0ea5e9",
    schedule: { mode: "specific_days", daysOfWeek: [2, 4, 6] },
    targetValue: 15,
    unit: "min",
    createdDaysAgo: 320,
    freezeBank: 2,
    rate: 0.68,
    partialRate: 0.55,
    tailDays: 19,
    today: { kind: "miss" },
  },
  {
    name: "No phone in bed",
    description: "Phone charges in the kitchen after 22:00.",
    type: "negative",
    icon: "Moon",
    color: "#64748b",
    schedule: { mode: "daily" },
    createdDaysAgo: 200,
    freezeBank: 2,
    rate: 0.86,
    weekendDelta: -0.1,
    slump: { fromDaysAgo: 40, toDaysAgo: 31, penalty: 0.18 },
    tailDays: 17,
    today: { kind: "complete" },
  },
  {
    name: "Journal",
    description: "A short entry every other evening.",
    type: "binary",
    icon: "PenLine",
    color: "#a855f7",
    schedule: { mode: "flexible", intervalDays: 2 },
    createdDaysAgo: 110,
    freezeBank: 1,
    rate: 0.82,
    partialRate: 0,
    tailDays: 21,
    today: { kind: "miss" },
  },
  {
    name: "Meal prep",
    description: "Cook once, eat well for three days.",
    type: "binary",
    icon: "Salad",
    color: "#84cc16",
    schedule: { mode: "specific_days", daysOfWeek: [0, 3] },
    createdDaysAgo: 130,
    freezeBank: 1,
    rate: 0.84,
    partialRate: 0,
    tailDays: 8,
  },
];

/* ------------------------------ generation ----------------------------- */

const TODAY = startOfDay(new Date());

function dayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Value that satisfies the habit's target for a completed day. */
function completedValue(seed: HabitSeed, key: string): number | null {
  if (seed.type === "binary" || seed.type === "negative") return null;
  if (seed.type === "quantitative") {
    const target = seed.targetValue ?? 0;
    const bonus = rand(`${key}:bonus-${seed.name}`) < 0.22 ? 1 + Math.floor(rand(`${key}:b2`) * 2) : 0;
    return target + bonus;
  }
  const targetSeconds = (seed.targetValue ?? 0) * 60;
  const extra = Math.floor(rand(`${key}:extra-${seed.name}`) * targetSeconds * 0.2);
  return targetSeconds + extra;
}

/** Below-target value for a missed day, so charts show realistic partials. */
function partialValue(seed: HabitSeed, key: string): number | null {
  if (seed.type !== "quantitative" && seed.type !== "timed") return null;
  const fraction = 0.3 + rand(`${key}:partial-${seed.name}`) * 0.5;
  if (seed.type === "quantitative") {
    return Math.max(1, Math.floor((seed.targetValue ?? 0) * fraction));
  }
  return Math.max(60, Math.floor((seed.targetValue ?? 0) * 60 * fraction));
}

/** Shared rough patches (travel, flu, deadlines) that hit every habit. */
const ROUGH_PATCHES: Slump[] = [
  { fromDaysAgo: 352, toDaysAgo: 345, penalty: 0.5 },
  { fromDaysAgo: 301, toDaysAgo: 295, penalty: 0.42 },
  { fromDaysAgo: 251, toDaysAgo: 245, penalty: 0.48 },
  { fromDaysAgo: 201, toDaysAgo: 192, penalty: 0.55 },
  { fromDaysAgo: 151, toDaysAgo: 146, penalty: 0.4 },
  { fromDaysAgo: 106, toDaysAgo: 100, penalty: 0.5 },
  { fromDaysAgo: 61, toDaysAgo: 57, penalty: 0.35 },
  { fromDaysAgo: 27, toDaysAgo: 24, penalty: 0.3 },
];

function completionProbability(seed: HabitSeed, date: Date, daysAgo: number): number {
  let probability = seed.rate;
  const dow = date.getDay();
  if (dow === 0 || dow === 6) probability += seed.weekendDelta ?? 0;
  probability *= seed.weekdayWeights?.[dow] ?? 1;
  if (
    seed.slump &&
    daysAgo >= seed.slump.toDaysAgo &&
    daysAgo <= seed.slump.fromDaysAgo
  ) {
    probability -= seed.slump.penalty;
  }
  for (const patch of ROUGH_PATCHES) {
    if (daysAgo >= patch.toDaysAgo && daysAgo <= patch.fromDaysAgo) {
      probability -= patch.penalty;
      break;
    }
  }
  return clamp(probability, 0.05, 0.98);
}

interface Entry {
  value: number | null;
}

/** Builds one habit's check-in history (date key → raw row value). */
function generateHistory(seed: HabitSeed): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  const createdAt = addDays(TODAY, -seed.createdDaysAgo);
  const schedule = seed.schedule;

  // Weekly habits are generated with a per-week quota cap.
  const weeklyCount = new Map<string, number>();
  const quota = schedule.mode === "weekly" ? schedule.timesPerWeek ?? 0 : 0;

  for (let offset = seed.createdDaysAgo; offset >= 1; offset--) {
    const date = addDays(TODAY, -offset);
    const key = dayKey(date);
    if (!isHabitDueOn(schedule, date, createdAt)) continue;

    if (schedule.mode === "weekly") {
      const week = dayKey(startOfWeek(date, { weekStartsOn: 1 }));
      if ((weeklyCount.get(week) ?? 0) >= quota) continue;
    }

    const probability = completionProbability(seed, date, offset);
    const completed = rand(`${seed.name}:${key}`) < probability;

    if (seed.type === "negative") {
      if (!completed) {
        // A slip is recorded as a check-in; the day is then not completed.
        entries.set(key, { value: null });
      }
      continue;
    }

    if (completed) {
      entries.set(key, { value: completedValue(seed, key) });
      if (schedule.mode === "weekly") {
        const week = dayKey(startOfWeek(date, { weekStartsOn: 1 }));
        weeklyCount.set(week, (weeklyCount.get(week) ?? 0) + 1);
      }
      continue;
    }

    if (seed.partialRate && rand(`${key}:do-partial-${seed.name}`) < seed.partialRate) {
      const value = partialValue(seed, key);
      if (value != null) entries.set(key, { value });
    }
  }

  // A past unbroken run, used by the "longest streak" record card.
  if (seed.historicStreak) {
    const { endDaysAgo, length } = seed.historicStreak;
    for (let offset = endDaysAgo; offset < endDaysAgo + length; offset++) {
      const date = addDays(TODAY, -offset);
      if (!isHabitDueOn(schedule, date, createdAt)) continue;
      const key = dayKey(date);
      if (seed.type === "negative") {
        // A completed negative day is a day WITHOUT a slip row.
        entries.delete(key);
        continue;
      }
      entries.set(key, { value: completedValue(seed, key) });
    }
  }

  // Guaranteed recent run, so the dashboard shows healthy streaks. Walks
  // backwards from yesterday; today's state is applied afterwards.
  if (seed.type === "negative") {
    for (let offset = 1; offset <= seed.tailDays; offset++) {
      entries.delete(dayKey(addDays(TODAY, -offset)));
    }
  } else if (schedule.mode === "weekly") {
    const tailWeeks = Math.ceil(seed.tailDays / 7);
    for (let weekOffset = 0; weekOffset < tailWeeks; weekOffset++) {
      const weekStart = addDays(startOfWeek(TODAY, { weekStartsOn: 1 }), -7 * weekOffset);
      let count = 0;
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const date = addDays(weekStart, dayOffset);
        if (date > TODAY) break;
        if (entries.has(dayKey(date))) count++;
      }
      for (let dayOffset = 6; dayOffset >= 0 && count < quota; dayOffset--) {
        const date = addDays(weekStart, dayOffset);
        if (date > TODAY) continue;
        const key = dayKey(date);
        entries.set(key, { value: completedValue(seed, key) });
        count++;
      }
    }
  } else {
    for (let offset = 1; offset <= seed.tailDays; offset++) {
      const date = addDays(TODAY, -offset);
      if (!isHabitDueOn(schedule, date, createdAt)) continue;
      const key = dayKey(date);
      entries.set(key, { value: completedValue(seed, key) });
    }
  }

  // A single missed scheduled day inside the recent run. The streak engine
  // covers it with a freeze, so the demo also shows a "used freeze" gap.
  if (seed.tailGapDaysAgo) {
    const key = dayKey(addDays(TODAY, -seed.tailGapDaysAgo));
    if (seed.type === "negative") entries.set(key, { value: null });
    else entries.delete(key);
  }

  return entries;
}

/** Applies the curated today-state so the dashboard screenshot is balanced. */
function applyToday(seed: HabitSeed, entries: Map<string, Entry>): void {
  const key = dayKey(TODAY);
  const due = isHabitDueOn(seed.schedule, TODAY, addDays(TODAY, -seed.createdDaysAgo));
  if (!due) {
    entries.delete(key);
    return;
  }
  if (seed.today?.kind === "complete") {
    // For negative habits completion means "no slip", i.e. no row at all.
    if (seed.type === "negative") entries.delete(key);
    else entries.set(key, { value: completedValue(seed, key) });
  } else if (seed.today?.kind === "partial") {
    entries.set(key, { value: seed.today.value });
  } else if (seed.today?.kind === "miss") {
    entries.delete(key);
  }
}

/* -------------------------------- seeding ------------------------------ */

/**
 * Monthly freeze points earned after `blockedKey` (the day the streak broke),
 * capped like the app's bank at 2.
 */
function accruedSince(blockedKey: string | null, today: Date): number {
  if (!blockedKey) return 0;
  const blocked = startOfDay(new Date(`${blockedKey}T00:00:00`));
  let point = startOfDay(new Date(blocked.getFullYear(), blocked.getMonth() + 1, 1));
  let grants = 0;
  const limit = startOfDay(today);
  while (point <= limit && grants < 2) {
    grants++;
    point = new Date(point.getFullYear(), point.getMonth() + 1, 1);
  }
  return grants;
}

async function main(): Promise<void> {
  console.log(`[seed] writing demo data to ${resolvedPath}`);

  // Clear derived/data tables but keep settings (theme-agnostic, no secrets).
  db.delete(schema.reminderLog).run();
  db.delete(schema.reminders).run();
  db.delete(schema.checkins).run();
  db.delete(schema.habits).run();
  // Reset AUTOINCREMENT counters so ids are 1..N on every run (stable URLs).
  sqlite.exec(
    "DELETE FROM sqlite_sequence WHERE name IN ('habits','checkins','reminders','reminder_log')"
  );

  let checkinCount = 0;
  const freezeState: Record<
    string,
    { accruedThrough: string; paid: string[]; blocked: string[] }
  > = {};

  for (const seed of HABITS) {
    const createdAt = addDays(TODAY, -seed.createdDaysAgo);
    const [habit] = await db
      .insert(schema.habits)
      .values({
        name: seed.name,
        description: seed.description,
        type: seed.type,
        color: seed.color,
        icon: seed.icon,
        schedule: seed.schedule,
        targetValue: seed.targetValue ?? null,
        unit: seed.unit ?? null,
        freezeBank: seed.freezeBank,
        createdAt,
        archivedAt: null,
      })
      .returning();

    const entries = generateHistory(seed);
    applyToday(seed, entries);

    const rows = [...entries.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entry]) => ({ habitId: habit.id, date, value: entry.value }));

    for (let i = 0; i < rows.length; i += 400) {
      await db.insert(schema.checkins).values(rows.slice(i, i + 400));
    }
    checkinCount += rows.length;

    // Persist the freeze bookkeeping the same way the app's first sync would.
    // Without this, opening the demo spends every seeded freeze to cover old
    // gaps and the UI shows "0 freezes" everywhere.
    const seededCheckins = rows.map((row) => ({
      id: 0,
      habitId: habit.id,
      date: row.date,
      value: row.value,
      note: null,
      createdAt: createdAt,
    })) as Checkin[];
    const completion = buildCompletionCheckins(habit, seededCheckins, TODAY);
    const plan = calculateFreezeConsumption(
      completion,
      seed.schedule,
      seed.freezeBank,
      TODAY,
      habit.createdAt
    );
    // The walk stops spending at the first gap it cannot cover, so the bank is
    // empty on that day. Real users then keep accruing one freeze per month,
    // which is why the persisted balance is the accrual since that block.
    const balance = plan.freezesRemaining + accruedSince(plan.blockedUnit, TODAY);
    sqlite.prepare("UPDATE habits SET freeze_bank = ? WHERE id = ?").run(
      balance,
      habit.id
    );
    freezeState[String(habit.id)] = {
      accruedThrough: format(startOfMonth(TODAY), "yyyy-MM-dd"),
      paid: plan.paidUnits,
      blocked: plan.blockedUnit ? [plan.blockedUnit] : [],
    };

    if (seed.name === "Pills") {
      for (const time of ["08:00", "13:00", "20:00"]) {
        await db.insert(schema.reminders).values({
          habitId: habit.id,
          time,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          enabled: true,
        });
      }
    }
    if (seed.name === "Drink water") {
      for (const time of ["10:00", "15:00"]) {
        await db.insert(schema.reminders).values({
          habitId: habit.id,
          time,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          enabled: true,
        });
      }
    }
    if (seed.name === "Morning run") {
      await db.insert(schema.reminders).values({
        habitId: habit.id,
        time: "06:30",
        daysOfWeek: [1, 2, 3, 4, 5, 6],
        enabled: true,
      });
    }
    if (seed.name === "Read 30 min") {
      await db.insert(schema.reminders).values({
        habitId: habit.id,
        time: "21:00",
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
      });
    }
    if (seed.name === "No sugar") {
      await db.insert(schema.reminders).values({
        habitId: habit.id,
        time: "20:30",
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
      });
    }
  }

  const reminderCount = db.select().from(schema.reminders).all().length;

  // Replace any stale bookkeeping so a re-seed always starts from the same
  // state the generator just computed.
  await db
    .insert(schema.settings)
    .values({ key: "freezeState", value: freezeState })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: freezeState },
    });

  const frozenCount = Object.values(freezeState).filter(
    (entry) => entry.paid.length > 0
  ).length;
  console.log(
    `[seed] done — ${HABITS.length} habits, ${checkinCount} check-ins, ${reminderCount} reminders, ${frozenCount} habits with spent freezes.`
  );
  console.log("[seed] run the app against it with:");
  console.log(`       DATABASE_URL=${targetUrl} npm run dev`);
}

main()
  .then(() => sqlite.close())
  .catch((error) => {
    console.error("[seed] failed:", error);
    sqlite.close();
    process.exitCode = 1;
  });
