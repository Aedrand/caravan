import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import { schema } from "../../db";

/**
 * Invite token service (PD-10): tokens are multi-use, role-carrying, and
 * stored ONLY as a sha256 hash — the raw token is returned once at creation
 * and never again.
 */

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 192 bits of entropy, base64url — safe in a URL path segment. */
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

/** The single validity rule: exists, not revoked, not expired. */
export function findValidInvite(db: Db, token: string, now: number) {
  const row = db
    .select()
    .from(schema.inviteLinks)
    .where(eq(schema.inviteLinks.tokenHash, hashInviteToken(token)))
    .get();
  if (!row || row.revokedAt !== null) return undefined;
  if (row.expiresAt !== null && row.expiresAt <= now) return undefined;
  return row;
}
