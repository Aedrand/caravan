import { z } from "zod";
import { CurrencySchema, EpochMsSchema, IdSchema, IsoDateSchema } from "./common";

export const TRIP_ROLES = ["owner", "editor", "viewer"] as const;
export const RoleSchema = z.enum(TRIP_ROLES);
export type Role = z.infer<typeof RoleSchema>;

/** Roles an invite link may carry — ownership only moves by explicit transfer (PD-9/10). */
export const InviteRoleSchema = z.enum(["editor", "viewer"]);
export type InviteRole = z.infer<typeof InviteRoleSchema>;

export const MEMBER_STATUSES = ["active", "ghost"] as const;
export const MemberStatusSchema = z.enum(MEMBER_STATUSES);

export const TripSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  destination: z.string().max(200).nullable(),
  startDate: IsoDateSchema.nullable(),
  endDate: IsoDateSchema.nullable(),
  currency: CurrencySchema,
  /** Per-trip monotonic version — the sync/feed cursor (TD-1). */
  version: z.number().int().nonnegative(),
  archivedAt: EpochMsSchema.nullable(),
  createdAt: EpochMsSchema,
  updatedAt: EpochMsSchema,
});
export type Trip = z.infer<typeof TripSchema>;

export const TripMemberSchema = z.object({
  id: IdSchema,
  tripId: IdSchema,
  userId: z.string(),
  /** Display name resolved from the user at read time. */
  name: z.string(),
  role: RoleSchema,
  /** Ghosts keep history/expense integrity after leaving (PD-9). */
  status: MemberStatusSchema,
  aiWriteEnabled: z.boolean(),
  joinedAt: EpochMsSchema,
});
export type TripMember = z.infer<typeof TripMemberSchema>;

/** Owner-facing invite DTO — the raw token is returned once at creation, never stored or listed. */
export const InviteLinkSchema = z.object({
  id: IdSchema,
  tripId: IdSchema,
  role: InviteRoleSchema,
  expiresAt: EpochMsSchema.nullable(),
  revokedAt: EpochMsSchema.nullable(),
  createdBy: IdSchema,
  createdAt: EpochMsSchema,
});
export type InviteLink = z.infer<typeof InviteLinkSchema>;
