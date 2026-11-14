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
import { useLanguage } from "@/components/language-provider";
import { translateActionError } from "@/lib/action-error";
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
  const { t } = useLanguage();
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
            ? t("settings.system.toastEnabled")
            : t("settings.system.toastDisabled"),
        );
      } else {
        toast.error(
          data.error
            ? translateActionError(t, data.error)
            : t("settings.system.toastFailed"),
        );
      }
    } catch {
      toast.error(t("settings.system.toastFailed"));
    } finally {
      setPending(false);
    }
  };

  const hint = loadState === "loading"
    ? t("settings.system.hintLoading")
    : loadState === "error"
      ? t("settings.system.hintError")
      : !supported
        ? t("settings.system.hintUnsupported")
        : enabled
          ? t("settings.system.hintEnabled")
          : t("settings.system.hintDisabled");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="size-5 text-primary" />
          {t("settings.system.title")}
        </CardTitle>
        <CardDescription>{t("settings.system.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{t("settings.system.launch")}</p>
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
