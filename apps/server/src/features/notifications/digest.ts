import type { Config } from "../../config";
import type { Db } from "../../db";
import type { Logger } from "../../logger";
import type { EmailService } from "../../services/email";

export interface DigestDeps {
  db: Db;
  logger: Logger;
  config: Config;
  email: EmailService;
}

/**
 * Daily digest job (D.2) — STUB. Registered on the job registry in index.ts and
 * fired by cron (config.digestCron). The real implementation lands in the D.2
 * feature pass on top of this foundation.
 *
 * D.2 implements: for each active trip, batch eventsSince(db, tripId, <24h ago>)
 * → render the digest template (templates/, composing EmailLayout) → for each
 * member whose getDigestEnabled(db, userId) is true, sendMail the per-trip summary.
 * Email is already gracefully OFF when SMTP isn't configured (sendMail no-ops),
 * so this is safe to run on any instance.
 */
export async function runDailyDigest(deps: DigestDeps): Promise<void> {
  deps.logger.debug("daily digest: stub — D.2 implements per-trip batching + send");
}
