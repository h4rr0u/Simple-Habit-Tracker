"use client";

import { useState } from "react";
import { Bot, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createReminderAction,
  deleteReminderAction,
  saveChatIdAction,
  toggleReminderAction,
} from "@/actions/settings";
import { AppearanceCard } from "@/components/settings/appearance-card";
import { DataCard } from "@/components/settings/data-card";
import { SystemCard } from "@/components/settings/system-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { dowLabel } from "@/lib/habit-ui";
import { cn } from "@/lib/utils";

/**
 * Settings client: Telegram bot binding (chat id with a /start how-to) and
 * the reminder list with add / enable / delete controls.
 */

export interface HabitOption {
  id: number;
  name: string;
  color: string;
}

export interface ReminderRow {
  id: number;
  habitId: number;
  habitName: string;
  /** HH:mm (24h). */
  time: string;
  /** Day-of-week numbers (0 = Sunday … 6 = Saturday). */
  daysOfWeek: number[];
  enabled: boolean;
}

/** Monday-first weekday order used by the day chips. */
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface SettingsClientProps {
  /** Bound chat id, or null when the bot is not linked yet. */
  chatId: number | null;
  habits: HabitOption[];
  reminders: ReminderRow[];
}

export function SettingsClient({ chatId, habits, reminders }: SettingsClientProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Appearance, data backups, system, Telegram integration and habit reminders.
        </p>
      </div>
      <AppearanceCard />
      <DataCard />
      <SystemCard />
      <TelegramCard chatId={chatId} />
      <RemindersCard habits={habits} reminders={reminders} />
    </div>
  );
}

/* ------------------------------ telegram ------------------------------ */

function TelegramCard({ chatId }: { chatId: number | null }) {
  const [value, setValue] = useState(chatId != null ? String(chatId) : "");
  const [pending, setPending] = useState(false);

  const save = async () => {
    setPending(true);
    try {
      const result = await saveChatIdAction({ chatId: value });
      if (result.ok) {
        toast.success("Telegram chat linked");
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to save chat id");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="size-5 text-primary" />
          Telegram
        </CardTitle>
        <CardDescription>
          The bot delivers reminders and accepts quick check-ins.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          {chatId != null ? (
            <>
              <Badge>Connected</Badge>
              <span className="text-muted-foreground">chat id {chatId}</span>
            </>
          ) : (
            <>
              <Badge variant="outline">Not connected</Badge>
            </>
          )}
        </div>

        <ol className="list-decimal space-y-1 rounded-lg border bg-muted/30 p-3 pl-7 text-sm text-muted-foreground">
          <li>
            Create a bot with{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">@BotFather</code> and
            copy the token.
          </li>
          <li>
            Put it into <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code> as{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">TELEGRAM_BOT_TOKEN=…</code>
          </li>
          <li>
            Run <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run bot:dev</code>
          </li>
          <li>
            Send <code className="rounded bg-muted px-1 py-0.5 text-xs">/start</code> to your
            bot — the chat links automatically.
          </li>
        </ol>

        <div className="space-y-2">
          <Label htmlFor="chat-id">Chat id (optional, manual binding)</Label>
          <div className="flex max-w-sm items-center gap-2">
            <Input
              id="chat-id"
              placeholder="e.g. 123456789"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Button onClick={save} disabled={pending || value.trim() === ""}>
              <Send data-icon="inline-start" />
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Sending /start to the bot fills this automatically.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ reminders ----------------------------- */

const ALL_DAYS = [...DOW_ORDER];

function RemindersCard({
  habits,
  reminders,
}: {
  habits: HabitOption[];
  reminders: ReminderRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reminders</CardTitle>
        <CardDescription>
          Time-based nudges per habit; delivered only while the habit is still
          unchecked for the day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AddReminderForm habits={habits} />

        {reminders.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No reminders yet — add one above.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {reminders.map((reminder) => (
              <ReminderRowItem key={reminder.id} reminder={reminder} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AddReminderForm({ habits }: { habits: HabitOption[] }) {
  const [habitId, setHabitId] = useState<string>("");
  const [time, setTime] = useState("09:00");
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [pending, setPending] = useState(false);

  const toggleDay = (day: number) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const submit = async () => {
    const id = Number(habitId);
    if (!Number.isInteger(id) || id < 1) {
      toast.error("Pick a habit first");
      return;
    }
    if (days.length === 0) {
      toast.error("Pick at least one day");
      return;
    }
    setPending(true);
    try {
      const result = await createReminderAction({ habitId: id, time, daysOfWeek: days });
      if (result.ok) {
        toast.success(`Reminder set for ${time}`);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to create reminder");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Habit</Label>
          <Select value={habitId} onValueChange={setHabitId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a habit" />
            </SelectTrigger>
            <SelectContent>
              {habits.map((habit) => (
                <SelectItem key={habit.id} value={String(habit.id)}>
                  {habit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reminder-time">Time</Label>
          <Input
            id="reminder-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DOW_ORDER.map((day) => {
          const active = days.includes(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={cn(
                "h-8 min-w-9 rounded-lg border px-2 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              )}
            >
              {dowLabel(day)}
            </button>
          );
        })}
      </div>
      <Button
        onClick={submit}
        disabled={pending || habits.length === 0}
        className="w-full sm:w-auto"
      >
        Add reminder
      </Button>
    </div>
  );
}

function ReminderRowItem({ reminder }: { reminder: ReminderRow }) {
  const [enabled, setEnabled] = useState(reminder.enabled);
  const [pending, setPending] = useState(false);

  const toggle = async (next: boolean) => {
    setPending(true);
    try {
      const result = await toggleReminderAction({ id: reminder.id, enabled: next });
      if (result.ok) {
        setEnabled(next);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to update reminder");
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    setPending(true);
    try {
      const result = await deleteReminderAction({ id: reminder.id });
      if (!result.ok) toast.error(result.error);
    } catch {
      toast.error("Failed to delete reminder");
    } finally {
      setPending(false);
    }
  };

  const days = reminder.daysOfWeek.length === 7
    ? "Every day"
    : [...reminder.daysOfWeek]
        .sort((a, b) => a - b)
        .map(dowLabel)
        .join(", ");

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="font-mono text-sm tabular-nums">{reminder.time}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{reminder.habitName}</p>
        <p className="truncate text-xs text-muted-foreground">{days}</p>
      </div>
      <Switch checked={enabled} disabled={pending} onCheckedChange={toggle} />
      <Button
        variant="ghost"
        size="icon"
        onClick={remove}
        disabled={pending}
        aria-label={`Delete reminder for ${reminder.habitName}`}
      >
        <Trash2 className="text-muted-foreground" />
      </Button>
    </li>
  );
}
