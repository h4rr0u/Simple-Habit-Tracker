"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { syncFreezesAction } from "@/actions/habits";

/**
 * Refreshes the Server Components when the local calendar day changes, so
 * "today" in the UI never stays frozen on the date that was rendered when the
 * page was opened. Also reconciles freeze banks after midnight (and once on
 * mount, to catch up after the app was closed). This is the only automatic
 * path that accrues and spends freezes: page renders read the stored state
 * without writing to it.
 *
 * The day observed at mount time is compared against the current day once a
 * minute. `router.refresh()` is called at most once per day change; the
 * reference is updated before refreshing, so a re-render cannot trigger an
 * endless refresh loop.
 */

const CHECK_INTERVAL_MS = 60_000;

export function MidnightRefresh() {
  const router = useRouter();
  const currentDayRef = useRef<string | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    currentDayRef.current = new Date().toDateString();
    let cancelled = false;

    const syncFreezes = async (): Promise<number | null> => {
      // A slow sync must not overlap with the next interval tick.
      if (syncingRef.current) return null;
      syncingRef.current = true;
      try {
        const result = await syncFreezesAction();
        return result.ok ? result.data : null;
      } catch {
        return null;
      } finally {
        syncingRef.current = false;
      }
    };

    // Catch up once the app is opened: days may have passed while it was shut.
    // Refresh after any successful sync: even when nothing was spent, elapsed
    // months may have granted freezes that the read-only render could not see.
    void syncFreezes().then((spent) => {
      if (!cancelled && spent != null) router.refresh();
    });

    const checkDayChange = () => {
      const today = new Date().toDateString();
      if (today === currentDayRef.current) return;

      // Record the new day first: this both prevents duplicate refreshes from
      // concurrent triggers and keeps the effect idempotent.
      currentDayRef.current = today;

      // Settle freezes for the finished day, then always refresh: even with
      // nothing spent, the date-dependent content changed.
      void syncFreezes().then(() => {
        if (!cancelled) router.refresh();
      });
    };

    const intervalId = window.setInterval(checkDayChange, CHECK_INTERVAL_MS);

    // Timers are paused while the device sleeps or the tab is hidden; re-check
    // as soon as the user comes back so the day cannot stay stale.
    document.addEventListener("visibilitychange", checkDayChange);
    window.addEventListener("focus", checkDayChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", checkDayChange);
      window.removeEventListener("focus", checkDayChange);
    };
  }, [router]);

  return null;
}
