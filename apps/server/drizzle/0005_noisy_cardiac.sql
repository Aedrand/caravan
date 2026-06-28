CREATE TABLE `days` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`date` text NOT NULL,
	`subtitle` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `days_trip_date` ON `days` (`trip_id`,`date`);--> statement-breakpoint
CREATE TABLE `idea_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`name` text NOT NULL,
	`position` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idea_lists_trip` ON `idea_lists` (`trip_id`);--> statement-breakpoint
ALTER TABLE `activities` ADD `type` text DEFAULT 'activity' NOT NULL;--> statement-breakpoint
ALTER TABLE `activities` ADD `estimated_cost_minor` integer;--> statement-breakpoint
ALTER TABLE `activities` ADD `list_id` text REFERENCES idea_lists(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `activities` ADD `checklist_items` text;