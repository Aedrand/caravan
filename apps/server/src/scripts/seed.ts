/**
 * Demo seed (Track D.5). Populates the configured DATA_DIR database with a
 * small, realistic trip so a fresh self-host (or a dev checkout) has something
 * to look at: a few members, a dated itinerary with real places, an idea in the
 * pool, and an open poll with some votes.
 *
 * Design choices that keep invariants honest:
 *  - Users are created through Better Auth (`signUpEmail`) so password hashes,
 *    the `account` row, and the first-user-is-admin hook all behave exactly as
 *    they do in production. The first seeded user becomes the instance admin.
 *  - The trip + owner membership go through the real `createTrip` service; the
 *    extra members are attached via `joinTrip` (the same path a real invite
 *    accept uses), so every membership row, version bump, and feed event is
 *    genuine.
 *  - Activities and the poll go through `executeMutation` — the single write
 *    pipeline — so foreign keys, the per-trip version counter, and the feed
 *    log stay consistent (no hand-rolled inserts that skip the rails).
 *
 * Safe to re-run: if a trip named "Demo Trip" already exists the script is a
 * no-op. Intended for empty/dev databases; it does not delete anything.
 *
 *   pnpm seed                       # against ./data (or $DATA_DIR)
 *   DATA_DIR=/tmp/x pnpm seed       # against a throwaway DB
 */
import { createId, firstPosition, positionsBetween } from "@caravan/shared";
import { eq } from "drizzle-orm";
import { createAuth } from "../auth";
import { loadConfig } from "../config";
import { executeMutation } from "../core/mutations";
import { getSetting, setSetting } from "../core/settings";
import { createDb, schema } from "../db";
import { runMigrations } from "../db/migrate";
// Side-effect: register every feature's mutation handlers with the pipeline.
import "../features";
import { joinTrip } from "../features/trips/join";
import { createTrip } from "../features/trips/service";
import { createLogger } from "../logger";

const DEMO_TRIP_NAME = "Demo Trip";

interface SeedUser {
  name: string;
  email: string;
  password: string;
}

const USERS: SeedUser[] = [
  { name: "Ada Demo", email: "ada@demo.caravan", password: "demo-password-1" },
  { name: "Bao Demo", email: "bao@demo.caravan", password: "demo-password-2" },
  { name: "Cleo Demo", email: "cleo@demo.caravan", password: "demo-password-3" },
];

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const { db, sqlite } = createDb(config.dbPath);

  try {
    // A standalone script can hit a DB that predates the latest migration
    // (or a brand-new file) — bring it up to date before touching tables.
    runMigrations(db);

    const existing = db
      .select({ id: schema.trips.id })
      .from(schema.trips)
      .where(eq(schema.trips.name, DEMO_TRIP_NAME))
      .get();
    if (existing) {
      logger.info({ tripId: existing.id }, `"${DEMO_TRIP_NAME}" already exists — nothing to seed`);
      return;
    }

    const auth = createAuth({ db, config });

    // 1. Users via Better Auth. The first one created becomes instance admin
    //    (auth create hook); the rest would be blocked by the invite-only
    //    sign-up gate (PD-10), so temporarily open registration while seeding
    //    and restore the prior setting afterwards.
    const priorRegistration = getSetting(db, "registration_open");
    setSetting(db, "registration_open", "true");
    const userIds: string[] = [];
    try {
      for (const u of USERS) {
        const found = db
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(eq(schema.user.email, u.email))
          .get();
        if (found) {
          userIds.push(found.id);
          continue;
        }
        const res = await auth.api.signUpEmail({
          body: { name: u.name, email: u.email, password: u.password },
        });
        userIds.push(res.user.id);
      }
    } finally {
      // Restore the front door to whatever it was (closed by default — PD-10).
      if (priorRegistration === undefined) setSetting(db, "registration_open", "false");
      else setSetting(db, "registration_open", priorRegistration);
    }
    const [ownerId, secondId, thirdId] = userIds as [string, string, string];

    const now = Date.now();
    // ISO yyyy-mm-dd in local time, today + n days.
    const isoDate = (offsetDays: number): string => {
      const d = new Date(now + offsetDays * 86_400_000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
    };
    const day1 = isoDate(14);
    const day2 = isoDate(15);

    // 2. Trip + owner membership through the real service.
    const { trip, member: owner } = createTrip(db, {
      userId: ownerId,
      input: {
        name: DEMO_TRIP_NAME,
        destination: "Lisbon, Portugal",
        startDate: day1,
        endDate: day2,
        currency: "EUR",
      },
      now,
    });

    // 3. Extra members via the join path (mints an invite link, then accepts it
    //    the way POST /api/invites/:token/accept does). Editors, like a normal
    //    invite grant.
    const addMember = (userId: string): string => {
      const inviteId = createId();
      db.insert(schema.inviteLinks)
        .values({
          id: inviteId,
          tripId: trip.id,
          tokenHash: createId(), // unused after accept; just needs to be unique
          role: "editor",
          expiresAt: null,
          revokedAt: null,
          createdBy: owner.id,
          createdAt: now,
        })
        .run();
      const invite = db
        .select()
        .from(schema.inviteLinks)
        .where(eq(schema.inviteLinks.id, inviteId))
        .get();
      if (!invite) throw new Error("seed: failed to read freshly inserted invite");
      const { memberId } = joinTrip(db, { userId, invite, now });
      return memberId;
    };
    addMember(secondId);
    addMember(thirdId);

    // 4. Itinerary + an idea + a poll, all through the mutation pipeline so the
    //    version counter and feed stay correct. `actor.userId` is the trip
    //    member doing the writing.
    const run = (
      userId: string,
      type: Parameters<typeof executeMutation>[1]["mutation"]["type"],
      payload: unknown,
    ) => {
      executeMutation(
        { db },
        {
          tripId: trip.id,
          actor: { userId, type: "user" },
          // The payloads below already match each mutation's schema.
          mutation: { id: createId(), type, payload } as never,
        },
      );
    };

    // Day 1 — two dated activities, one with a real geocoded place.
    const [d1a, d1b] = positionsBetween(null, null, 2);
    run(ownerId, "activity.create", {
      activityId: createId(),
      title: "Pastéis de Belém",
      date: day1,
      position: d1a,
      category: "food",
      startTime: "09:30",
      endTime: "10:30",
      notes: "The original custard tarts — get there before the queue.",
      linkUrl: null,
      place: {
        name: "Pastéis de Belém",
        address: "R. de Belém 84-92, 1300-085 Lisboa, Portugal",
        lat: 38.6975,
        lng: -9.2033,
        provider: "seed",
      },
    });
    run(secondId, "activity.create", {
      activityId: createId(),
      title: "Jerónimos Monastery",
      date: day1,
      position: d1b,
      category: "sights",
      startTime: "11:00",
      endTime: "12:30",
      notes: "",
      linkUrl: null,
      place: {
        name: "Jerónimos Monastery",
        address: "Praça do Império 1400-206 Lisboa, Portugal",
        lat: 38.6979,
        lng: -9.2065,
        provider: "seed",
      },
    });

    // Day 2 — one activity.
    run(thirdId, "activity.create", {
      activityId: createId(),
      title: "Tram 28 ride through Alfama",
      date: day2,
      position: firstPosition(),
      category: "activity",
      startTime: "14:00",
      endTime: null,
      notes: "Hop on at Martim Moniz to get a seat.",
      linkUrl: null,
      place: null,
    });

    // An undated idea in the pool (date: null).
    run(secondId, "activity.create", {
      activityId: createId(),
      title: "Day trip to Sintra?",
      date: null,
      position: firstPosition(),
      category: "sights",
      startTime: null,
      endTime: null,
      notes: "Pena Palace + Quinta da Regaleira if we have a free day.",
      linkUrl: null,
      place: null,
    });

    // A poll with three options, then a couple of votes.
    const pollId = createId();
    const optHotel = createId();
    const optAirbnb = createId();
    const optHostel = createId();
    run(ownerId, "poll.create", {
      pollId,
      question: "Where should we stay?",
      multiSelect: false,
      allowMemberOptions: true,
      closesAt: null,
      options: [
        { optionId: optHotel, label: "Boutique hotel in Baixa" },
        { optionId: optAirbnb, label: "Airbnb in Alfama" },
        { optionId: optHostel, label: "Hostel near Cais do Sodré" },
      ],
    });
    run(ownerId, "poll.vote", { pollId, optionIds: [optAirbnb] });
    run(secondId, "poll.vote", { pollId, optionIds: [optAirbnb] });
    run(thirdId, "poll.vote", { pollId, optionIds: [optHotel] });

    const finalTrip = db.select().from(schema.trips).where(eq(schema.trips.id, trip.id)).get();
    logger.info(
      { tripId: trip.id, members: USERS.length, version: finalTrip?.version },
      `seeded "${DEMO_TRIP_NAME}" — sign in as ${USERS[0]?.email} (password "${USERS[0]?.password}")`,
    );
  } finally {
    sqlite.close();
  }
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
