CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`date` text,
	`position` text NOT NULL,
	`title` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`place_name` text,
	`address` text,
	`lat` real,
	`lng` real,
	`place_provider` text,
	`place_ref` text,
	`category` text DEFAULT 'other' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`link_url` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activities_trip_date` ON `activities` (`trip_id`,`date`);--> statement-breakpoint
CREATE TABLE `feed_events` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`version` integer NOT NULL,
	`actor_type` text DEFAULT 'user' NOT NULL,
	`actor_member_id` text,
	`type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feed_events_trip_version` ON `feed_events` (`trip_id`,`version`);--> statement-breakpoint
CREATE TABLE `invite_links` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_links_token_hash_unique` ON `invite_links` (`token_hash`);--> statement-breakpoint
CREATE TABLE `trip_members` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`ai_write_enabled` integer DEFAULT false NOT NULL,
	`last_seen_version` integer DEFAULT 0 NOT NULL,
	`joined_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_members_trip_user` ON `trip_members` (`trip_id`,`user_id`);