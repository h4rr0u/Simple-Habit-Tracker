"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Keeps every open Habit Tracker tab in sync without a manual refresh.
 *
 * Mutations broadcast on a `BroadcastChannel`; other tabs refresh their
 * Server Components immediately. Tabs also refresh when they regain focus or
 * become visible again, which catches changes made by the Telegram bot or
 * another device.
 */

const CHANNEL_NAME = "habit-tracker:mutations";
const MUTATION_EVENT = "habit-tracker:mutation";
const REFRESH_THROTTLE_MS = 700;

let notifyChannel: BroadcastChannel | null = null;

/** Sends a mutation notification to the other open tabs. */
export function notifyHabitMutation(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(MUTATION_EVENT));
  } catch {
    // Ignore environments that do not support custom events.
  }
  if (typeof BroadcastChannel === "undefined") return;
  try {
    notifyChannel ??= new BroadcastChannel(CHANNEL_NAME);
    notifyChannel.postMessage({ type: "mutation" });
  } catch {
    // BroadcastChannel can be unavailable in private/embedded contexts; the
    // focus refresh still covers those cases.
  }
}

/** Mount once inside the app providers. Renders nothing. */
export function HabitSyncProvider() {
  const router = useRouter();
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    const refresh = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_THROTTLE_MS) return;
      lastRefreshRef.current = now;
      router.refresh();
    };

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = refresh;
    }

    window.addEventListener("focus", refresh);
    window.addEventListener(MUTATION_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      channel?.close();
      window.removeEventListener("focus", refresh);
      window.removeEventListener(MUTATION_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
}
