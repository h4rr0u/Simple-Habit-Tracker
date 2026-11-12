"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/actions/habits";

/**
 * Client-side binding for habit Server Actions with pending state and
 * sonner toasts on success / error.
 */

interface UseHabitMutations {
  /** Runs an action, toasts the outcome and returns the ActionResult. */
  run: <T>(
    promise: Promise<ActionResult<T>>,
    messages?: { success?: string; error?: string }
  ) => Promise<ActionResult<T>>;
  /** True while any action is in flight. */
  isPending: boolean;
}

export function useHabitMutations(): UseHabitMutations {
  const [pendingCount, setPendingCount] = useState(0);

  const run = useCallback(
    async <T,>(
      promise: Promise<ActionResult<T>>,
      messages?: { success?: string; error?: string }
    ): Promise<ActionResult<T>> => {
      setPendingCount((c) => c + 1);
      try {
        const result = await promise;
        if (result.ok) {
          if (messages?.success) toast.success(messages.success);
        } else {
          toast.error(messages?.error ?? "Something went wrong", {
            description: result.error,
          });
        }
        return result;
      } catch (error) {
        toast.error(messages?.error ?? "Something went wrong", {
          description: error instanceof Error ? error.message : undefined,
        });
        return { ok: false, error: "Network error" };
      } finally {
        setPendingCount((c) => c - 1);
      }
    },
    []
  );

  return {
    run,
    isPending: pendingCount > 0,
  };
}
