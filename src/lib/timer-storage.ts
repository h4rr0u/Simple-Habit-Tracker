/**
 * Persistence helpers for the timed-habit stopwatch.
 *
 * The running segment is stored in `localStorage` under `timer_<habitId>` as
 * `{ startTime, initialElapsed }`: the epoch milliseconds when the segment
 * started plus the seconds that were already on the clock. Recomputing
 * `initialElapsed + (now - startTime)` on mount restores the stopwatch after a
 * reload or a closed tab. The key is removed whenever the timer is paused or
 * stopped.
 */

export interface StoredTimer {
  /** Epoch milliseconds when the current running segment started. */
  startTime: number;
  /** Elapsed seconds before the current segment started. */
  initialElapsed: number;
}

/** Prefix of the localStorage key; the habit id is appended. */
const STORAGE_PREFIX = "timer_";

/** localStorage key that holds a habit's running timer. */
export function timerStorageKey(habitId: number): string {
  return `${STORAGE_PREFIX}${habitId}`;
}

/**
 * Parses a raw localStorage value. Returns `null` when it is missing,
 * malformed or carries values that cannot describe a real timer.
 */
export function parseStoredTimer(
  raw: string | null | undefined
): StoredTimer | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { startTime, initialElapsed } = parsed as Record<string, unknown>;
    if (
      typeof startTime !== "number" ||
      !Number.isFinite(startTime) ||
      startTime <= 0
    ) {
      return null;
    }
    if (
      typeof initialElapsed !== "number" ||
      !Number.isFinite(initialElapsed) ||
      initialElapsed < 0
    ) {
      return null;
    }

    return { startTime, initialElapsed };
  } catch {
    return null;
  }
}

/** Whole seconds elapsed since the stored segment started (never negative). */
export function elapsedSince(
  stored: Pick<StoredTimer, "startTime">,
  now: number = Date.now()
): number {
  return Math.max(0, Math.floor((now - stored.startTime) / 1000));
}

/** Full elapsed seconds: the stored base plus time since the segment started. */
export function restoredElapsed(
  stored: StoredTimer,
  now: number = Date.now()
): number {
  return stored.initialElapsed + elapsedSince(stored, now);
}

/** Reads a habit's stored timer, tolerating disabled/unavailable storage. */
export function readStoredTimer(habitId: number): StoredTimer | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredTimer(window.localStorage.getItem(timerStorageKey(habitId)));
  } catch {
    return null;
  }
}

/** Persists a running timer. No-op when storage is unavailable. */
export function writeStoredTimer(habitId: number, state: StoredTimer): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(timerStorageKey(habitId), JSON.stringify(state));
  } catch {
    // Private mode / disabled storage: the timer still runs for this session.
  }
}

/** Removes a habit's stored timer. No-op when storage is unavailable. */
export function clearStoredTimer(habitId: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(timerStorageKey(habitId));
  } catch {
    // Private mode / disabled storage: nothing to clean up.
  }
}
