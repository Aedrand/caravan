import type Database from "better-sqlite3";

/**
 * Track A test/dev DDL. Migrations are generated centrally at integration
 * (anti-collision rule 1), so the committed `drizzle/` folder doesn't yet know
 * about the Track A tables. Until the integrator runs `db:generate`, this
 * helper creates them directly so tests (and a local dev DB) have the tables.
 *
 * It mirrors the `activity_votes`/`comments`/`polls`/`poll_options`/`poll_votes`
 * definitions in `db/schema.ts` exactly. INTEGRATOR: once the migration exists,
 * this file becomes redundant and can be deleted along with its call sites.
 */
export function createDecisionsTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS activity_votes (
      id TEXT PRIMARY KEY NOT NULL,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS activity_votes_activity_member
      ON activity_votes (activity_id, member_id);
    CREATE INDEX IF NOT EXISTS activity_votes_trip ON activity_votes (trip_id);

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY NOT NULL,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      edited_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS comments_trip_target
      ON comments (trip_id, target_type, target_id);

    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY NOT NULL,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      multi_select INTEGER NOT NULL DEFAULT 0,
      allow_member_options INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      closes_at INTEGER,
      closed_at INTEGER,
      converted_activity_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS polls_trip ON polls (trip_id);

    CREATE TABLE IF NOT EXISTS poll_options (
      id TEXT PRIMARY KEY NOT NULL,
      poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS poll_options_poll ON poll_options (poll_id);

    CREATE TABLE IF NOT EXISTS poll_votes (
      id TEXT PRIMARY KEY NOT NULL,
      poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_option_member
      ON poll_votes (option_id, member_id);
    CREATE INDEX IF NOT EXISTS poll_votes_poll ON poll_votes (poll_id);
  `);
}
