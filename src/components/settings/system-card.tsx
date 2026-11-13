"use client";

import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

/**
 * System settings: launch the tracker automatically when the computer boots.
 * The state lives in the Windows Run registry and is managed by /api/autostart,
 * which the switch talks to on mount and on every change.
 */

type LoadState = "loading" | "ready" | "error";

/** Shape of GET /api/autostart. */
interface AutostartState {
  enabled: boolean;
  supported: boolean;
}

/** Shape of POST /api/autostart responses. */
interface AutostartResult {
  ok?: boolean;
  error?: string;
}

export function SystemCard() {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [pending, setPending] = useState(false);

  // Read the current state after mount: the server render always shows the
  // switch off, so hydration stays consistent.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/autostart");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as AutostartState;
        if (cancelled) return;
        setEnabled(data.enabled);
        setSupported(data.supported);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (next: boolean) => {
    setPending(true);
    try {
      const response = await fetch("/api/autostart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await response.json()) as AutostartResult;
      if (response.ok && data.ok) {
        setEnabled(next);
        toast.success(
          next
            ? "Habit Tracker will start when the computer boots"
            : "Auto-start turned off",
        );
      } else {
        toast.error(data.error ?? "Failed to update auto-start");
      }
    } catch {
      toast.error("Failed to update auto-start");
    } finally {
      setPending(false);
    }
  };

  const hint = loadState === "loading"
    ? "Checking the current state…"
    : loadState === "error"
      ? "Could not read the current auto-start state."
      : !supported
        ? "Available on Windows only."
        : enabled
          ? "The tracker starts hidden in the background and opens at http://localhost:3000."
          : "Adds an entry to your user registry (no admin rights needed).";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="size-5 text-primary" />
          System
        </CardTitle>
        <CardDescription>
          How the tracker behaves on this computer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Launch at computer startup</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
          <Switch
            checked={enabled}
            disabled={loadState !== "ready" || !supported || pending}
            onCheckedChange={toggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}
