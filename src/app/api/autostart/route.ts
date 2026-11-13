import { join } from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import AutoLaunch from "auto-launch";

/**
 * API for the "Launch at computer startup" option (Settings → System).
 *
 * On Windows it manages a single value in the *user* registry key
 * HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run through the
 * `auto-launch` package, so no administrator rights are needed. The value
 * points at the hidden launcher `start-hidden.vbs` in the project root, which
 * starts `start.bat` without a console window.
 *
 * GET  → { enabled: boolean, supported: boolean }
 * POST { enabled: boolean } → { ok: true } | { ok: false, error }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Name of the auto-launch entry (and therefore of the Run registry value). */
const AUTOSTART_NAME = "Habit Tracker";

/** Hidden launcher in the project root; it runs start.bat windowless. */
const LAUNCHER_FILE = "start-hidden.vbs";

/** Only the Windows registry flow is supported in this project. */
function isSupported(): boolean {
  return process.platform === "win32";
}

/** Pre-configured auto-launch instance bound to the hidden VBS launcher. */
function createAutoLaunch(): AutoLaunch {
  const autoLaunch = new AutoLaunch({
    name: AUTOSTART_NAME,
    path: join(process.cwd(), LAUNCHER_FILE),
  });
  // auto-launch 5.x derives the registry value name from the basename of
  // `path` (stripping 4 trailing characters) and ignores the `name` option,
  // which would create a "start-hidden" entry. Restore the requested name so
  // the Run key entry reads `Habit Tracker`.
  (autoLaunch as AutoLaunch & { opts: { appName: string } }).opts.appName =
    AUTOSTART_NAME;
  return autoLaunch;
}

/** Extracts a message from an unknown thrown value. */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

const autostartSchema = z.object({
  enabled: z.boolean(),
});

/** GET: current auto-start state and whether the platform supports it. */
export async function GET() {
  if (!isSupported()) {
    return NextResponse.json({ enabled: false, supported: false });
  }

  try {
    const enabled = await createAutoLaunch().isEnabled();
    return NextResponse.json({ enabled, supported: true });
  } catch (error) {
    return NextResponse.json(
      { error: toErrorMessage(error) },
      { status: 500 },
    );
  }
}

/** POST: enable or disable the auto-start registry entry. */
export async function POST(request: Request) {
  if (!isSupported()) {
    return NextResponse.json(
      { ok: false, error: "Auto-start is only available on Windows" },
      { status: 400 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = autostartSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Body must be { enabled: boolean }" },
      { status: 400 },
    );
  }

  try {
    const autoLaunch = createAutoLaunch();
    if (parsed.data.enabled) {
      await autoLaunch.enable();
    } else {
      await autoLaunch.disable();
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(error) },
      { status: 500 },
    );
  }
}
