import { and, eq } from "drizzle-orm";
import type { Config } from "../../config";
import { getDigestOptedOut } from "../../core/notification-prefs";
import type { Db } from "../../db";
import { schema } from "../../db";
import type { Logger } from "../../logger";
import type { EmailService } from "../../services/email";
import { renderEmail } from "../../services/email";
import { DigestEmail } from "../../services/email/templates/digest";
import {
  DIGEST_WINDOW_MS,
  type DigestEvent,
  recentEventsByTrip,
  summarizeLine,
} from "./digest-data";

export interface DigestDeps {
  db: Db;
  logger: Logger;
  config: Config;
  email: EmailService;
}

/** An active member who can receive mail: their membership + login email. */
interface Recipient {
  memberId: string;
  email: string;
  userId: string;
}

/**
 * Active members of `tripId` who have an email address, in one query. Returns
 * the membership id (to match against event actors) alongside the login email
 * and user id (for the per-user digest opt-out check).
 */
function tripRecipients(db: Db, tripId: string): Recipient[] {
  return db
    .select({
      memberId: schema.tripMembers.id,
      email: schema.user.email,
      userId: schema.user.id,
    })
    .from(schema.tripMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.tripMembers.userId))
    .where(and(eq(schema.tripMembers.tripId, tripId), eq(schema.tripMembers.status, "active")))
    .all();
}

/**
 * Daily digest job (D.2). For each trip with activity in the last 24h, email an
 * active members a readable "what changed today" summary — unless they've opted
 * out of the digest. Email is best-effort: it never throws (sendMail swallows
 * transport errors) and one failing trip/member can't abort the rest.
 *
 * Efficiency: one pass over feed_events for the whole instance (grouped by
 * trip), then one members+users query per *active* trip — no per-member or
 * per-event lookups. Digest opt-outs are fetched once up front (one query for
 * the whole instance) rather than per recipient. The rendered body is identical
 * for every recipient of a trip, so it's rendered once per trip and reused.
 */
export async function runDailyDigest(deps: DigestDeps): Promise<void> {
  const { db, logger, config, email } = deps;

  if (!email.enabled) {
    logger.info("digest skipped: email disabled");
    return;
  }

  const since = Date.now() - DIGEST_WINDOW_MS;
  const eventsByTrip = recentEventsByTrip(db, since);
  if (eventsByTrip.size === 0) {
    logger.info("daily digest: no trips with recent activity");
    return;
  }

  // Opt-outs in one query for the whole instance; "not in the set" = opted in
  // (default), matching getDigestEnabled's no-row-means-enabled semantics.
  const optedOut = getDigestOptedOut(db);

  let tripsSent = 0;
  let emailsSent = 0;

  for (const [tripId, events] of eventsByTrip) {
    try {
      const trip = db
        .select({ name: schema.trips.name })
        .from(schema.trips)
        .where(eq(schema.trips.id, tripId))
        .get();
      // The cascade should keep these in lockstep, but a trip deleted between
      // the event scan and now would leave orphan events — skip defensively.
      if (!trip) continue;

      const recipients = tripRecipients(db, tripId);
      if (recipients.length === 0) continue;

      const lines = events.map(summarizeLine);
      // The body is the same for everyone on the trip, so render once and reuse.
      const { html, text } = await renderEmail(
        DigestEmail({
          tripName: trip.name,
          lines,
          tripUrl: `${config.baseUrl}/trips/${tripId}`,
        }),
      );
      const subject = `${trip.name}: what changed today`;

      let sentForThisTrip = false;
      for (const recipient of recipients) {
        try {
          if (optedOut.has(recipient.userId)) continue;
          // Nice-to-have: don't email someone whose only "news" is their own
          // actions — there's nothing new for them to catch up on.
          if (everyEventBy(events, recipient.memberId)) continue;

          await email.sendMail({ to: recipient.email, subject, html, text });
          emailsSent += 1;
          sentForThisTrip = true;
        } catch (err) {
          // Guard our own per-recipient work; sendMail already swallows.
          logger.error({ err, tripId, to: recipient.email }, "digest: recipient send failed");
        }
      }
      if (sentForThisTrip) tripsSent += 1;
    } catch (err) {
      logger.error({ err, tripId }, "digest: trip failed, continuing");
    }
  }

  logger.info({ tripsSent, emailsSent }, "daily digest complete");
}

/** True when every recent event on the trip was this member's own action. */
function everyEventBy(events: DigestEvent[], memberId: string): boolean {
  return events.every((e) => e.actorMemberId === memberId);
}
