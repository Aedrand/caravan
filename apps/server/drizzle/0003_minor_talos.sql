CREATE TABLE `activity_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`member_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_votes_activity_member` ON `activity_votes` (`activity_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `activity_votes_trip` ON `activity_votes` (`trip_id`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_trip_target` ON `comments` (`trip_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `expense_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`member_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expense_shares_expense` ON `expense_shares` (`expense_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `expense_shares_expense_member` ON `expense_shares` (`expense_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`paid_by` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`description` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`date` text,
	`activity_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expenses_trip` ON `expenses` (`trip_id`);--> statement-breakpoint
CREATE TABLE `geocode_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`from_member` text NOT NULL,
	`to_member` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`date` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payments_trip` ON `payments` (`trip_id`);--> statement-breakpoint
CREATE TABLE `poll_options` (
	`id` text PRIMARY KEY NOT NULL,
	`poll_id` text NOT NULL,
	`label` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`poll_id`) REFERENCES `polls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `poll_options_poll` ON `poll_options` (`poll_id`);--> statement-breakpoint
CREATE TABLE `poll_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`poll_id` text NOT NULL,
	`option_id` text NOT NULL,
	`member_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`poll_id`) REFERENCES `polls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`option_id`) REFERENCES `poll_options`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `poll_votes_option_member` ON `poll_votes` (`option_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `poll_votes_poll` ON `poll_votes` (`poll_id`);--> statement-breakpoint
CREATE TABLE `polls` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`question` text NOT NULL,
	`multi_select` integer DEFAULT false NOT NULL,
	`allow_member_options` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`closes_at` integer,
	`closed_at` integer,
	`converted_activity_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `polls_trip` ON `polls` (`trip_id`);