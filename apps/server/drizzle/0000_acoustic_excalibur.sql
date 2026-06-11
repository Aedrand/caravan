CREATE TABLE `instance_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`destination` text,
	`start_date` text,
	`end_date` text,
	`currency` text DEFAULT 'USD' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
