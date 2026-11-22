"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  archiveHabit,
  claimReminderTap,
  createHabit,
  getHabitById,
  incrementCheckin,
  moveHabits,
  syncAllFreezes,
  syncHabitFreezes,
  toggleCheckin,
  updateHabit,
  upsertCheckin,
} from "@/db/queries";
import { habitTypeEnum, type NewHabit } from "@/db/schema";
import { HABIT_GRID_COLUMNS } from "@/lib/habit-grid";
import type { Schedule } from "@/types/schedule";

/**
 * Server Actions for habit CRUD and check-in toggling.
 *
 * Every action validates its input with Zod, performs the mutation through
 * the query layer, and returns a discriminated-union result:
 * `{ ok: true, data } | { ok: false, error }`.
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

/** Result returned by every habit action. */
export type ActionResult<T> = ActionOk<T> | ActionErr;

/** Flattens a ZodError into a single human-readable message. */
function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

/** Extracts a message from an unknown thrown value. */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

/* ------------------------------ schemas ------------------------------- */

const scheduleSchema = z.object({
  mode: z.enum(["daily", "weekly", "specific_days", "flexible"]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  timesPerWeek: z.number().int().min(1).max(7).optional(),
  intervalDays: z.number().int().min(1).optional(),
});

const habitTypeSchema = z.enum(habitTypeEnum);

/**
 * Tags arrive either as a comma-separated string from the form input or as an
 * already-split array (e.g. from the bot). Both shapes normalize to a trimmed,
 * de-duplicated string array with each tag capped at 20 characters.
 */
const tagsSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const raw = typeof value === "string" ? value.split(",") : value;
    const cleaned = raw.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
    return Array.from(new Set(cleaned));
  })
  .refine((tags) => tags === undefined || tags.every((tag) => tag.length <= 20), {
    message: "Each tag must be 20 characters or fewer",
  });

const createHabitSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  type: habitTypeSchema.default("binary"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #3b82f6")
    .default("#3b82f6"),
  icon: z.string().trim().max(16).optional().nullable(),
  schedule: scheduleSchema,
  targetValue: z.number().int().min(1).optional().nullable(),
  unit: z.string().trim().max(16).optional().nullable(),
  category: z.string().trim().max(50).optional().nullable(),
  tags: tagsSchema,
  freezeBank: z.number().int().min(0).max(2).default(0),
});

const updateHabitSchema = createHabitSchema.partial().extend({
  id: z.number().int().positive(),
});

const archiveHabitSchema = z.object({
  id: z.number().int().positive(),
});

/** One habit's new cell on the /habits grid canvas. */
const habitPositionSchema = z.object({
  id: z.string().regex(/^\d+$/, "Habit ids must be numeric"),
  positionX: z.number().int().min(0).max(HABIT_GRID_COLUMNS - 1),
  positionY: z.number().int().min(0),
});

const moveHabitsSchema = z.object({
  positions: z
    .array(habitPositionSchema)
    .min(1, "At least one habit is required")
    .refine(
      (positions) =>
        new Set(positions.map((position) => position.id)).size === positions.length,
      { message: "Habit ids must be unique" }
    )
    .refine(
      (positions) =>
        new Set(
          positions.map((position) => `${position.positionX}:${position.positionY}`)
        ).size === positions.length,
      { message: "Habit cells must be unique" }
    ),
});

const toggleCheckinSchema = z.object({
  habitId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  value: z.number().int().optional().nullable(),
});

const incrementCheckinSchema = z.object({
  habitId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
});

const incrementReminderCheckinSchema = incrementCheckinSchema.extend({
  reminderId: z.number().int().positive(),
});

const setCheckinValueSchema = z.object({
  habitId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  /** Recorded value; null or <= 0 clears the check-in for the day. */
  value: z.number().int().nullable(),
});

/* ------------------------------- helpers ------------------------------ */

/**
 * Revalidates every habit view after any habit or check-in mutation.
 *
 * Actions are also called from the standalone Telegram bot process, where
 * there is no Next.js request/static-generation store; revalidation is a
 * web-only concern, so it is skipped there instead of failing the mutation.
 */
function revalidateDashboard(): void {
  try {
    revalidatePath("/");
    revalidatePath("/habits");
    revalidatePath("/habits/[id]", "page");
    revalidatePath("/analytics");
    revalidatePath("/settings");
  } catch {
    /* not running inside a Next.js request (e.g. the bot process) */
  }
}

/* ------------------------------- actions ------------------------------ */

/** Creates a habit. */
export async function createHabitAction(
  input: z.input<typeof createHabitSchema>
): Promise<ActionResult<Awaited<ReturnType<typeof createHabit>>>> {
  const parsed = createHabitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error) };
  }

  try {
    const data = parsed.data;
    const habit = await createHabit({
      name: data.name,
      description: data.description ?? null,
      type: data.type,
      color: data.color,
      icon: data.icon ?? null,
      schedule: data.schedule as unknown as Schedule,
      targetValue: data.targetValue ?? null,
      unit: data.unit ?? null,
      category: data.category || null,
      tags: data.tags ?? [],
      freezeBank: data.freezeBank,
    });
    revalidateDashboard();
    return { ok: true, data: habit };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/** Updates an existing habit. */
export async function updateHabitAction(
  input: z.input<typeof updateHabitSchema>
): Promise<ActionResult<Awaited<ReturnType<typeof updateHabit>>>> {
  const parsed = updateHabitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error) };
  }

  try {
    const { id, ...fields } = parsed.data;
    const data: Partial<Omit<NewHabit, "id" | "createdAt">> = {};
    if (fields.name !== undefined) data.name = fields.name;
    if (fields.description !== undefined) data.description = fields.description ?? null;
    if (fields.type !== undefined) data.type = fields.type;
    if (fields.color !== undefined) data.color = fields.color;
    if (fields.icon !== undefined) data.icon = fields.icon ?? null;
    if (fields.schedule !== undefined) {
      data.schedule = fields.schedule as unknown as Schedule;
    }
    if (fields.targetValue !== undefined) data.targetValue = fields.targetValue ?? null;
    if (fields.unit !== undefined) data.unit = fields.unit ?? null;
    if (fields.category !== undefined) data.category = fields.category || null;
    if (fields.tags !== undefined) data.tags = fields.tags ?? [];
    if (fields.freezeBank !== undefined) data.freezeBank = fields.freezeBank;

    const habit = await updateHabit(id, data);
    if (!habit) {
      return { ok: false, error: `Habit ${id} not found` };
    }
    revalidateDashboard();
    return { ok: true, data: habit };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/** Soft-archives a habit. */
export async function archiveHabitAction(
  input: z.input<typeof archiveHabitSchema>
): Promise<ActionResult<Awaited<ReturnType<typeof archiveHabit>>>> {
  const parsed = archiveHabitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error) };
  }

  try {
    const habit = await archiveHabit(parsed.data.id);
    if (!habit) {
      return { ok: false, error: `Habit ${parsed.data.id} not found` };
    }
    revalidateDashboard();
    return { ok: true, data: habit };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/**
 * Persists canvas positions for one move.
 *
 * `positions` holds the dragged habit's new cell and, when the drop lands on
 * an occupied cell, the displaced habit's new cell (a swap). The update runs
 * in one transaction in the query layer, and only /habits is revalidated
 * because no other view shows the canvas layout.
 */
export async function moveHabitsAction(
  positions: z.input<typeof habitPositionSchema>[]
): Promise<ActionResult<true>> {
  const parsed = moveHabitsSchema.safeParse({ positions });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error) };
  }

  try {
    await moveHabits(
      parsed.data.positions.map(({ id, positionX, positionY }) => ({
        id: Number(id),
        positionX,
        positionY,
      }))
    );
    try {
      revalidatePath("/habits");
    } catch {
      /* not running inside a Next.js request */
    }
    return { ok: true, data: true };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/** Toggles a check-in for a habit on a given day. */
export async function toggleCheckinAction(
  input: z.input<typeof toggleCheckinSchema>
): Promise<ActionResult<Awaited<ReturnType<typeof toggleCheckin>>>> {
  const parsed = toggleCheckinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error) };
  }

  try {
    const { habitId, date, value } = parsed.data;
    const habit = await getHabitById(habitId);
    if (!habit) {
      return { ok: false, error: `Habit ${habitId} not found` };
    }
    const result = await toggleCheckin(habitId, date, value ?? undefined);
    await syncHabitFreezes(habitId);
    revalidateDashboard();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/**
 * Adds one to a quantitative habit's check-in for a day, capped at the
 * habit's target. Creates the row with value 1 when none exists. Returns the
 * new value so the bot can render "X/Y" progress.
 */
export async function incrementCheckinAction(
  input: z.input<typeof incrementCheckinSchema>
): Promise<ActionResult<number>> {
  const parsed = incrementCheckinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error) };
  }

  try {
    const { habitId, date } = parsed.data;
    const habit = await getHabitById(habitId);
    if (!habit) {
      return { ok: false, error: `Habit ${habitId} not found` };
    }

    const value = await incrementCheckin(habitId, date, habit.targetValue);
    await syncHabitFreezes(habitId);
    revalidateDashboard();
    return { ok: true, data: value };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/**
 * Adds one to a quantitative check-in from a reminder message. Each sent
 * reminder may be used at most once: its reminder_log row is claimed
 * atomically, so repeated taps on the same message do not inflate progress.
 * A tap on a message whose log row no longer exists (stale button) is
 * rejected instead of being counted.
 */
export async function incrementReminderCheckinAction(
  input: z.input<typeof incrementReminderCheckinSchema>
): Promise<ActionResult<number>> {
  const parsed = incrementReminderCheckinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error) };
  }

  try {
    const { habitId, reminderId, date } = parsed.data;
    const habit = await getHabitById(habitId);
    if (!habit) {
      return { ok: false, error: `Habit ${habitId} not found` };
    }
    if (habit.type !== "quantitative") {
      return { ok: false, error: "Only quantitative habits can be incremented" };
    }

    const tap = await claimReminderTap(reminderId, habitId, date);
    if (tap === "not-found") {
      return { ok: false, error: "Reminder is stale" };
    }
    if (tap === "already-tapped") {
      return { ok: false, error: "This reminder has already been used" };
    }

    const value = await incrementCheckin(habitId, date, habit.targetValue);
    await syncHabitFreezes(habitId);
    revalidateDashboard();
    return { ok: true, data: value };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/** Sets (or clears) the recorded value for quantitative/timed habits. */
export async function setCheckinValueAction(
  input: z.input<typeof setCheckinValueSchema>
): Promise<ActionResult<Awaited<ReturnType<typeof upsertCheckin>>>> {
  const parsed = setCheckinValueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error) };
  }

  try {
    const { habitId, date, value } = parsed.data;
    const habit = await getHabitById(habitId);
    if (!habit) {
      return { ok: false, error: `Habit ${habitId} not found` };
    }
    const result = await upsertCheckin(habitId, date, value ?? null);
    await syncHabitFreezes(habitId);
    revalidateDashboard();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/**
 * Reconciles freeze banks for all active habits. Called by the client's
 * midnight/catch-up hook; returns the number of freezes spent so the UI can
 * refresh only when something actually changed.
 */
export async function syncFreezesAction(): Promise<ActionResult<number>> {
  try {
    const spent = await syncAllFreezes();
    // Accrual can change a bank even when nothing was spent, so views are
    // always revalidated after a sync.
    revalidateDashboard();
    return { ok: true, data: spent };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}
