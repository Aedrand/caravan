CREATE TABLE `route_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `days` ADD `route_mode` text;--> statement-breakpoint
ALTER TABLE `trips` ADD `default_route_mode` text DEFAULT 'walking' NOT NULL;