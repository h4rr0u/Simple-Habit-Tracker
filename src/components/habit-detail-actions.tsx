"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, Pencil } from "lucide-react";
import { toast } from "sonner";

import { archiveHabitAction } from "@/actions/habits";
import { HabitFormDialog } from "@/components/habit-form-dialog";
import { notifyHabitMutation } from "@/components/habit-sync";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Habit } from "@/db/schema";
import { translateActionError } from "@/lib/action-error";

/**
 * Edit / Archive buttons for the habit detail page. Archive asks for
 * confirmation before soft-archiving the habit.
 */

interface HabitDetailActionsProps {
  habit: Habit;
}

export function HabitDetailActions({ habit }: HabitDetailActionsProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const result = await archiveHabitAction({ id: habit.id });
      if (result.ok) {
        toast.success(t("habits.archive.success", { name: habit.name }));
        notifyHabitMutation();
        setArchiveOpen(false);
        router.push("/habits");
        router.refresh();
      } else {
        toast.error(translateActionError(t, result.error));
      }
    } catch {
      toast.error(t("habits.archive.failed"));
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => setEditOpen(true)}>
        <Pencil data-icon="inline-start" />
        {t("common.edit")}
      </Button>
      <Button variant="destructive" onClick={() => setArchiveOpen(true)}>
        <Archive data-icon="inline-start" />
        {t("common.archive")}
      </Button>

      <HabitFormDialog open={editOpen} onOpenChange={setEditOpen} habit={habit} />
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("habits.archive.title")}</DialogTitle>
            <DialogDescription>
              {t("habits.archive.description", { name: habit.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleArchive} disabled={archiving}>
              {t("common.archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
