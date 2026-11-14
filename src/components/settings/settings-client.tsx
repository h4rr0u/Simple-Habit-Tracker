"use client";

import { useState } from "react";
import { Bot, Heart, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createReminderAction,
  deleteReminderAction,
  saveChatIdAction,
  toggleReminderAction,
} from "@/actions/settings";
import { AppearanceCard } from "@/components/settings/appearance-card";
import { DataCard } from "@/components/settings/data-card";
import { LanguageCard } from "@/components/settings/language-card";
import { SystemCard } from "@/components/settings/system-card";
import { useLanguage } from "@/components/language-provider";
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
import { translateActionError } from "@/lib/action-error";
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
  /** Resolved name of the (non-archived) habit this reminder belongs to. */
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
  /** Support link from DONATION_URL; the card is hidden when null. */
  donationUrl: string | null;
}

export function SettingsClient({
  chatId,
  habits,
  reminders,
  donationUrl,
}: SettingsClientProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </div>
      <LanguageCard />
      <AppearanceCard />
      <DataCard />
      <SystemCard />
      <TelegramCard chatId={chatId} />
      <RemindersCard habits={habits} reminders={reminders} />
      {donationUrl ? <SupportCard donationUrl={donationUrl} /> : null}
    </div>
  );
}

/* ------------------------------- support ------------------------------ */

function SupportCard({ donationUrl }: { donationUrl: string }) {
  const { t } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="size-5 text-primary" />
          {t("settings.support.title")}
        </CardTitle>
        <CardDescription>{t("settings.support.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <a href={donationUrl} target="_blank" rel="noopener noreferrer">
            <Heart data-icon="inline-start" />
            {t("common.support")}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ telegram ------------------------------ */

function TelegramCard({ chatId }: { chatId: number | null }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(chatId != null ? String(chatId) : "");
  const [pending, setPending] = useState(false);

  const save = async () => {
    setPending(true);
    try {
      const result = await saveChatIdAction({ chatId: value });
      if (result.ok) {
        toast.success(t("settings.telegram.chatLinked"));
      } else {
        toast.error(translateActionError(t, result.error));
      }
    } catch {
      toast.error(t("settings.telegram.chatSaveFailed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="size-5 text-primary" />
          {t("settings.telegram.title")}
        </CardTitle>
        <CardDescription>{t("settings.telegram.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          {chatId != null ? (
            <>
              <Badge>{t("settings.telegram.connected")}</Badge>
              <span className="text-muted-foreground">
                {t("settings.telegram.chatId", { id: chatId })}
              </span>
            </>
          ) : (
            <>
              <Badge variant="outline">{t("settings.telegram.notConnected")}</Badge>
            </>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.telegram.instructions")}</p>
          <ol className="list-decimal space-y-1 rounded-lg border bg-muted/30 p-3 pl-7 text-sm text-muted-foreground">
            <li>
              {t("settings.telegram.stepCreateBefore")}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">@BotFather</code>
              {t("settings.telegram.stepCreateAfter")}
            </li>
            <li>
              {t("settings.telegram.stepTokenBefore")}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code>
              {t("settings.telegram.stepTokenMid")}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                TELEGRAM_BOT_TOKEN=…
              </code>
              {t("settings.telegram.stepTokenAfter")}
            </li>
            <li>
              {t("settings.telegram.stepRunBefore")}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run bot:dev</code>
              {t("settings.telegram.stepRunAfter")}
            </li>
            <li>
              {t("settings.telegram.stepStartBefore")}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">/start</code>
              {t("settings.telegram.stepStartAfter")}
            </li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label htmlFor="chat-id">{t("settings.telegram.chatIdLabel")}</Label>
          <div className="flex max-w-sm items-center gap-2">
            <Input
              id="chat-id"
              placeholder={t("settings.telegram.chatIdPlaceholder")}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Button onClick={save} disabled={pending || value.trim() === ""}>
              <Send data-icon="inline-start" />
              {t("common.save")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("settings.telegram.chatIdHint")}
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
  const { t } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.reminders.title")}</CardTitle>
        <CardDescription>{t("settings.reminders.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AddReminderForm habits={habits} />

        {reminders.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("settings.reminders.empty")}
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
  const { t } = useLanguage();
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
      toast.error(t("settings.reminders.pickHabit"));
      return;
    }
    if (days.length === 0) {
      toast.error(t("settings.reminders.pickDay"));
      return;
    }
    setPending(true);
    try {
      const result = await createReminderAction({ habitId: id, time, daysOfWeek: days });
      if (result.ok) {
        toast.success(t("settings.reminders.created", { time }));
      } else {
        toast.error(translateActionError(t, result.error));
      }
    } catch {
      toast.error(t("settings.reminders.createFailed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("settings.reminders.habit")}</Label>
          <Select value={habitId} onValueChange={setHabitId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("settings.reminders.selectHabit")} />
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
          <Label htmlFor="reminder-time">{t("settings.reminders.time")}</Label>
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
              {dowLabel(day, t)}
            </button>
          );
        })}
      </div>
      <Button
        onClick={submit}
        disabled={pending || habits.length === 0}
        className="w-full sm:w-auto"
      >
        {t("settings.reminders.add")}
      </Button>
    </div>
  );
}

function ReminderRowItem({ reminder }: { reminder: ReminderRow }) {
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState(reminder.enabled);
  const [pending, setPending] = useState(false);

  const toggle = async (next: boolean) => {
    setPending(true);
    try {
      const result = await toggleReminderAction({ id: reminder.id, enabled: next });
      if (result.ok) {
        setEnabled(next);
      } else {
        toast.error(translateActionError(t, result.error));
      }
    } catch {
      toast.error(t("settings.reminders.updateFailed"));
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    setPending(true);
    try {
      const result = await deleteReminderAction({ id: reminder.id });
      if (!result.ok) toast.error(translateActionError(t, result.error));
    } catch {
      toast.error(t("settings.reminders.deleteFailed"));
    } finally {
      setPending(false);
    }
  };

  const days = reminder.daysOfWeek.length === 7
    ? t("settings.reminders.everyDay")
    : [...reminder.daysOfWeek]
        .sort((a, b) => a - b)
        .map((day) => dowLabel(day, t))
        .join(", ");

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="font-mono text-sm tabular-nums">{reminder.time}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {reminder.habitName}
        </p>
        <p className="truncate text-xs text-muted-foreground">{days}</p>
      </div>
      <Switch checked={enabled} disabled={pending} onCheckedChange={toggle} />
      <Button
        variant="ghost"
        size="icon"
        onClick={remove}
        disabled={pending}
        aria-label={t("common.deleteReminderFor", {
          name: reminder.habitName,
        })}
      >
        <Trash2 className="text-muted-foreground" />
      </Button>
    </li>
  );
}
