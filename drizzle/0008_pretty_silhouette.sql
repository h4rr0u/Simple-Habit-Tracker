ALTER TABLE `habits` ADD `position_x` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `habits` ADD `position_y` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
WITH `ranked` AS (
  SELECT `id`, ROW_NUMBER() OVER (ORDER BY `sort_order`, `id`) - 1 AS `slot` FROM `habits`
)
UPDATE `habits` SET
  `position_x` = (SELECT `slot` % 4 FROM `ranked` WHERE `ranked`.`id` = `habits`.`id`),
  `position_y` = (SELECT `slot` / 4 FROM `ranked` WHERE `ranked`.`id` = `habits`.`id`);
