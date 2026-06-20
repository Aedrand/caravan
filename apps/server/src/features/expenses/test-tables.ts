import type Database from "better-sqlite3";

/**
 * Create the Track B tables for tests.
 *
 * The anti-collision rules forbid running `pnpm db:generate` during the
 * parallel fan-out, so the `expenses` / `expense_shares` / `payments` tables
 * have no committed migration yet — the integrator generates it at merge. Until
 * then, tests that need these tables call this helper after `runMigrations` to
 * mirror the Drizzle schema exactly. Keep this in sync with `db/schema.ts`.
 */
export function createExpenseTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id text PRIMARY KEY NOT NULL,
      trip_id text NOT NULL REFERENCES trips(id) ON DELETE cascade,
      paid_by text NOT NULL,
      amount_minor integer NOT NULL,
      description text NOT NULL,
      category text DEFAULT 'other' NOT NULL,
      notes text DEFAULT '' NOT NULL,
      date text,
      activity_id text,
      created_by text NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
    CREATE INDEX IF NOT EXISTS expenses_trip ON expenses (trip_id);

    CREATE TABLE IF NOT EXISTS expense_shares (
      id text PRIMARY KEY NOT NULL,
      expense_id text NOT NULL REFERENCES expenses(id) ON DELETE cascade,
      member_id text NOT NULL,
      amount_minor integer NOT NULL
    );
    CREATE INDEX IF NOT EXISTS expense_shares_expense ON expense_shares (expense_id);
    CREATE UNIQUE INDEX IF NOT EXISTS expense_shares_expense_member
      ON expense_shares (expense_id, member_id);

    CREATE TABLE IF NOT EXISTS payments (
      id text PRIMARY KEY NOT NULL,
      trip_id text NOT NULL REFERENCES trips(id) ON DELETE cascade,
      from_member text NOT NULL,
      to_member text NOT NULL,
      amount_minor integer NOT NULL,
      notes text DEFAULT '' NOT NULL,
      date text,
      created_by text NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payments_trip ON payments (trip_id);
  `);
}
