ALTER TABLE `activities` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `confirmation_code` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `arr_place_name` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `arr_address` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `arr_lat` real;--> statement-breakpoint
ALTER TABLE `activities` ADD `arr_lng` real;--> statement-breakpoint
ALTER TABLE `activities` ADD `arr_place_provider` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `arr_place_ref` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `flight_number` text;--> statement-breakpoint
ALTER TABLE `days` ADD `home_base_place_name` text;--> statement-breakpoint
ALTER TABLE `days` ADD `home_base_address` text;--> statement-breakpoint
ALTER TABLE `days` ADD `home_base_lat` real;--> statement-breakpoint
ALTER TABLE `days` ADD `home_base_lng` real;--> statement-breakpoint
ALTER TABLE `days` ADD `home_base_place_provider` text;--> statement-breakpoint
ALTER TABLE `days` ADD `home_base_place_ref` text;