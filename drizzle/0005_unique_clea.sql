CREATE INDEX `habits_archived_at_idx` ON `habits` (`archived_at`);--> statement-breakpoint
CREATE INDEX `reminder_log_date_idx` ON `reminder_log` (`date`);--> statement-breakpoint
CREATE INDEX `reminders_time_enabled_idx` ON `reminders` (`time`,`enabled`);