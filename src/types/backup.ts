import type { HabitType } from "@/db/schema";
import type { Schedule } from "@/types/schedule";

/**
 * JSON backup format (version 1) used by the export/import feature in
 * /settings. Timestamps are ISO strings so the file is plain JSON, and the
 * import action re-parses them into Dates before touching the database.
 */

export interface BackupHabit {
  id: number;
  name: string;
  description: string | null;
  type: HabitType;
  color: string;
  icon: string | null;
  schedule: Schedule;
  targetValue: number | null;
  unit: string | null;
  freezeBank: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface BackupCheckin {
  id: number;
  habitId: number;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  value: number | null;
  note: string | null;
  createdAt: string;
}

export interface BackupReminder {
  id: number;
  habitId: number;
  /** HH:mm (24h). */
  time: string;
  daysOfWeek: number[];
  enabled: boolean;
}

export interface BackupSetting {
  key: string;
  value: unknown;
}

export interface BackupFile {
  version: 1;
  exportedAt: string;
  habits: BackupHabit[];
  checkins: BackupCheckin[];
  reminders: BackupReminder[];
  settings: BackupSetting[];
}
