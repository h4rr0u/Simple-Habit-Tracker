"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, Pencil } from "lucide-react";
import { toast } from "sonner";

import { archiveHabitAction } from "@/actions/habits";
import { HabitFormDialog } from "@/components/habit-form-dialog";
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

/**
 * Edit / Archive buttons for the habit detail page. Archive asks for
 * confirmation before soft-archiving the habit.
 */

interface HabitDetailActionsProps {
  habit: Habit;
}

export function HabitDetailActions({ habit }: HabitDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const result = await archiveHabitAction({ id: habit.id });
      if (result.ok) {
        toast.success(`"${habit.name}" archived`);
        setArchiveOpen(false);
        router.push("/habits");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to archive habit");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => setEditOpen(true)}>
        <Pencil data-icon="inline-start" />
        Edit
      </Button>
      <Button variant="destructive" onClick={() => setArchiveOpen(true)}>
        <Archive data-icon="inline-start" />
        Archive
      </Button>

      <HabitFormDialog open={editOpen} onOpenChange={setEditOpen} habit={habit} />
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive habit?</DialogTitle>
            <DialogDescription>
              &quot;{habit.name}&quot; will be hidden from the dashboard and habit list.
              Its history is kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleArchive} disabled={archiving}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
