"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Refreshes the Server Components when the local calendar day changes, so
 * "today" in the UI never stays frozen on the date that was rendered when the
 * page was opened.
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

  useEffect(() => {
    currentDayRef.current = new Date().toDateString();

    const checkDayChange = () => {
      const today = new Date().toDateString();
      if (today === currentDayRef.current) return;

      // Record the new day first: this both prevents duplicate refreshes from
      // concurrent triggers and keeps the effect idempotent.
      currentDayRef.current = today;
      router.refresh();
    };

    const intervalId = window.setInterval(checkDayChange, CHECK_INTERVAL_MS);

    // Timers are paused while the device sleeps or the tab is hidden; re-check
    // as soon as the user comes back so the day cannot stay stale.
    document.addEventListener("visibilitychange", checkDayChange);
    window.addEventListener("focus", checkDayChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", checkDayChange);
      window.removeEventListener("focus", checkDayChange);
    };
  }, [router]);

  return null;
}
