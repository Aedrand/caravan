import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createId } from "@caravan/shared";
import pino from "pino";
import { afterEach, expect, test } from "vitest";
import type { Config } from "../../config";
import { setDigestEnabled } from "../../core/notification-prefs";
import { createDb, schema } from "../../db";
import { runMigrations } from "../../db/migrate";
import type { EmailService } from "../../services/email";
import { runDailyDigest } from "./digest";
import { DIGEST_WINDOW_MS } from "./digest-data";

const silentLogger = pino({ level: "silent" });
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A config stub carrying only what the digest reads. */
const config = { baseUrl: "https://caravan.test" } as Config;

/** Records every send so tests can assert recipients/subjects. */
function fakeEmail(enabled: boolean): EmailService & { sent: { to: string; subject: string }[] } {
  const sent: { to: string; subject: string }[] = [];
  return {
    enabled,
    async sendMail(opts) {
      sent.push({ to: opts.to, subject: opts.subject });
    },
    sent,
  } as EmailService & { sent: { to: string; subject: string }[] };
}

function harness() {
  const dir = mkdtempSync(path.join(tmpdir(), "caravan-digest-"));
  tempDirs.push(dir);
  const { db } = createDb(path.join(dir, "test.db"));
  runMigrations(db);

  const addUser = (name: string) => {
    const id = createId();
    db.insert(schema.user)
      .values({
        id,
        name,
        email: `${name.toLowerCase()}@example.com`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    return id;
  };

  const addTrip = (name: string) => {
    const id = createId();
    const now = Date.now();
    db.insert(schema.trips)
      .values({ id, name, currency: "USD", createdBy: "x", createdAt: now, updatedAt: now })
      .run();
    return id;
  };

  const addMember = (tripId: string, userId: string, status: "active" | "ghost" = "active") => {
    const id = createId();
    const now = Date.now();
    db.insert(schema.tripMembers)
      .values({ id, tripId, userId, role: "editor", status, joinedAt: now, updatedAt: now })
      .run();
    return id;
  };

  let version = 0;
  const addEvent = (tripId: string, actorMemberId: string, createdAt: number) => {
    version += 1;
    db.insert(schema.feedEvents)
      .values({
        id: createId(),
        tripId,
        version,
        actorType: "user",
        actorMemberId,
        type: "activity.create",
        entityType: "activity",
        entityId: createId(),
        payload: JSON.stringify({ title: "Lunch", date: null }),
        createdAt,
      })
      .run();
  };

  return { db, addUser, addTrip, addMember, addEvent };
}

test("does nothing when email is disabled", async () => {
  const { db, addUser, addTrip, addMember, addEvent } = harness();
  const u = addUser("Alex");
  const t = addTrip("Trip");
  const m = addMember(t, u);
  addEvent(t, m, Date.now());

  const email = fakeEmail(false);
  await runDailyDigest({ db, logger: silentLogger, config, email });
  expect(email.sent).toHaveLength(0);
});

test("emails an active member about another member's recent activity", async () => {
  const { db, addUser, addTrip, addMember, addEvent } = harness();
  const alex = addUser("Alex");
  const sam = addUser("Sam");
  const t = addTrip("Iceland");
  addMember(t, alex);
  const samMember = addMember(t, sam);
  // Sam did something recent; Alex should hear about it.
  addEvent(t, samMember, Date.now());

  const email = fakeEmail(true);
  await runDailyDigest({ db, logger: silentLogger, config, email });

  // Alex gets it. Sam is skipped (own-only activity).
  expect(email.sent.map((s) => s.to)).toEqual(["alex@example.com"]);
  expect(email.sent[0]?.subject).toBe("Iceland: what changed today");
});

test("skips trips with no activity in the last 24h", async () => {
  const { db, addUser, addTrip, addMember, addEvent } = harness();
  const alex = addUser("Alex");
  const sam = addUser("Sam");
  const t = addTrip("Stale");
  addMember(t, alex);
  const samMember = addMember(t, sam);
  // Just outside the window.
  addEvent(t, samMember, Date.now() - DIGEST_WINDOW_MS - 60_000);

  const email = fakeEmail(true);
  await runDailyDigest({ db, logger: silentLogger, config, email });
  expect(email.sent).toHaveLength(0);
});

test("respects the per-user digest opt-out", async () => {
  const { db, addUser, addTrip, addMember, addEvent } = harness();
  const alex = addUser("Alex");
  const sam = addUser("Sam");
  const t = addTrip("Trip");
  addMember(t, alex);
  const samMember = addMember(t, sam);
  addEvent(t, samMember, Date.now());

  setDigestEnabled(db, alex, false);

  const email = fakeEmail(true);
  await runDailyDigest({ db, logger: silentLogger, config, email });
  expect(email.sent).toHaveLength(0);
});

test("skips a member whose only recent activity is their own", async () => {
  const { db, addUser, addTrip, addMember, addEvent } = harness();
  const alex = addUser("Alex");
  const t = addTrip("Solo");
  const alexMember = addMember(t, alex);
  // Only Alex acted — nothing new for Alex to catch up on.
  addEvent(t, alexMember, Date.now());

  const email = fakeEmail(true);
  await runDailyDigest({ db, logger: silentLogger, config, email });
  expect(email.sent).toHaveLength(0);
});

test("does not email ghost (left/removed) members", async () => {
  const { db, addUser, addTrip, addMember, addEvent } = harness();
  const alex = addUser("Alex");
  const ghost = addUser("Ghost");
  const t = addTrip("Trip");
  const alexMember = addMember(t, alex);
  addMember(t, ghost, "ghost");
  // Alex acted; only the ghost would otherwise "receive" — but ghosts are excluded,
  // and Alex is own-only, so nobody is mailed.
  addEvent(t, alexMember, Date.now());

  const email = fakeEmail(true);
  await runDailyDigest({ db, logger: silentLogger, config, email });
  expect(email.sent.map((s) => s.to)).not.toContain("ghost@example.com");
});
