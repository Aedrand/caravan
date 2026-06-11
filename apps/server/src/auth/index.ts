import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { count } from "drizzle-orm";
import type { Config } from "../config";
import { isRegistrationOpen } from "../core/settings";
import type { Db } from "../db";
import { schema } from "../db";

export interface AuthDeps {
  db: Db;
  config: Pick<Config, "baseUrl" | "secretKey">;
  /**
   * Lets a valid trip-invite token open the sign-up gate on invite-only
   * instances (PD-10: registration only via trip invite links). Injected to
   * keep auth/ free of feature imports.
   */
  isInviteTokenValid?: (token: string) => boolean;
}

function countUsers(db: Db): number {
  return db.select({ n: count() }).from(schema.user).get()?.n ?? 0;
}

/**
 * Better Auth instance (M0.4): email/password only for now; magic links and
 * OIDC are plugins to add later (TD-2). Two instance rules live here:
 *  - sign-up gate: allowed only for the very first user (bootstrap) or while
 *    the admin has opened registration — invite links are the normal door (PD-10)
 *  - first user becomes the instance admin
 */
export function createAuth({ db, config, isInviteTokenValid }: AuthDeps) {
  return betterAuth({
    baseURL: config.baseUrl,
    secret: config.secretKey,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
    },
    user: {
      additionalFields: {
        // never client-settable; admin is assigned by the create hook below
        role: { type: "string", input: false, defaultValue: "member" },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (userToCreate) => {
            const isFirstUser = countUsers(db) === 0;
            return {
              data: { ...userToCreate, role: isFirstUser ? "admin" : "member" },
            };
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        if (countUsers(db) === 0) return; // instance bootstrap
        if (isRegistrationOpen(db)) return;
        // Invite links are the normal door (PD-10): a valid trip invite in
        // the header opens the gate; the membership itself is attached by
        // POST /api/invites/:token/accept after sign-in.
        const inviteToken = ctx.headers?.get("x-caravan-invite");
        if (inviteToken && isInviteTokenValid?.(inviteToken)) return;
        throw new APIError("FORBIDDEN", {
          message: "Registration is invite-only on this instance.",
        });
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
