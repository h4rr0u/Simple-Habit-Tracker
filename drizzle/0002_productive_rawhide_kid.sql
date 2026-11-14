DROP INDEX `reminder_log_habit_date_uq`;--> statement-breakpoint
ALTER TABLE `reminder_log` ADD `reminder_id` integer REFERENCES reminders(id);--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_log_reminder_date_uq` ON `reminder_log` (`reminder_id`,`date`);