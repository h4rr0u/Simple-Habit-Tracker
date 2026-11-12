"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HabitSummary } from "@/types/analytics";

/**
 * Period (7/30/90 days) and habit filters. Both are URL-driven so the
 * Server Component page re-renders with fresh, cached data.
 */

interface AnalyticsFiltersProps {
  habits: HabitSummary[];
  period: string;
  habitId: string;
}

export function AnalyticsFilters({ habits, period, habitId }: AnalyticsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: "period" | "habit", value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 transition-opacity"
      aria-busy={pending}
      style={{ opacity: pending ? 0.6 : 1 }}
    >
      <Tabs value={period} onValueChange={(value) => update("period", value)}>
        <TabsList>
          <TabsTrigger value="7">7d</TabsTrigger>
          <TabsTrigger value="30">30d</TabsTrigger>
          <TabsTrigger value="90">90d</TabsTrigger>
        </TabsList>
      </Tabs>

      <Select value={habitId} onValueChange={(value) => update("habit", value)}>
        <SelectTrigger className="w-52" aria-label="Habit">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <SelectValue />}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All habits</SelectItem>
          {habits.map((habit) => (
            <SelectItem key={habit.id} value={String(habit.id)}>
              {habit.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}