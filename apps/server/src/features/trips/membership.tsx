import { createId } from "@caravan/shared";
import { and, eq } from "drizzle-orm";
import {
  type EmailCtx,
  type MutationCtx,
  MutationError,
  registerMutation,
} from "../../core/mutations";
import { schema } from "../../db";
import { renderEmail } from "../../services/email";
import { InviteEmail } from "../../services/email/templates/invite";
import { OwnershipTransferEmail } from "../../services/email/templates/ownership-transfer";
import { generateInviteToken } from "./invites";

/**
 * Membership + invite mutations (M1.5, PD-9/PD-10). Member management is the
 * owner's bucket; leaving is the one self-service action. Departures always
 * ghost the membership — history and (later) expense math must not shift.
 *
 * D.1: invite-create and ownership-transfer also send a transactional email.
 * Handlers run inside the (synchronous better-sqlite3) mutation transaction, so
 * a send fired with `void` only runs its async body AFTER the transaction
 * commits — a clean post-commit, non-blocking seam that can't fail the write.
 *
 * The email wiring rides on `ctx.email` (threaded from createApp through the
 * mutation pipeline). It's undefined for callers that don't send mail (seed
 * scripts, unit tests), in which case the sends below are skipped; even when
 * present, sendMail no-ops until SMTP is configured.
 */

/**
 * Fire-and-forget a rendered email post-commit. Renders are wrapped so a
 * template/render error can never bubble into the mutation; sendMail already
 * swallows transport errors and no-ops when email is disabled.
 */
function sendRendered(
  deps: EmailCtx,
  to: string,
  subject: string,
  element: Parameters<typeof renderEmail>[0],
): void {
  void (async () => {
    try {
      const { html, text } = await renderEmail(element);
      await deps.email.sendMail({ to, subject, html, text });
    } catch (err) {
      deps.logger.error({ err, to, subject }, "membership email render/send failed");
    }
  })();
}

function memberName(ctx: MutationCtx, userId: string): string {
  const row = ctx.tx
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .get();
  return row?.name ?? "Someone";
}

function loadMember(ctx: MutationCtx, memberId: string) {
  const member = ctx.tx
    .select()
    .from(schema.tripMembers)
    .where(and(eq(schema.tripMembers.id, memberId), eq(schema.tripMembers.tripId, ctx.trip.id)))
    .get();
  if (!member) throw new MutationError(404, "member_not_found", "member not found");
  return member;
}

registerMutation("invite.create", {
  role: "owner",
  apply(ctx, payload) {
    const { token, tokenHash } = generateInviteToken();
    const id = createId();
    ctx.tx
      .insert(schema.inviteLinks)
      .values({
        id,
        tripId: ctx.trip.id,
        tokenHash,
        role: payload.role,
        // Recipient an invite was sent to (D.1); null for plain share-links.
        email: payload.email,
        expiresAt: payload.expiresAt,
        createdBy: ctx.member.id,
        createdAt: ctx.now,
      })
      .run();

    // D.1: when a recipient was given, email them the join link. Capture the
    // inviter name inside the transaction; the actual render/send is deferred
    // past commit by sendRendered (better-sqlite3 is synchronous).
    if (payload.email && ctx.email) {
      const inviterName = memberName(ctx, ctx.member.userId);
      sendRendered(
        ctx.email,
        payload.email,
        `You're invited to ${ctx.trip.name} on Caravan`,
        <InviteEmail
          tripName={ctx.trip.name}
          inviterName={inviterName}
          inviteRole={payload.role}
          joinUrl={`${ctx.email.config.baseUrl}/join/${token}`}
        />,
      );
    }

    return {
      entityType: "invite",
      entityId: id,
      feedPayload: { role: payload.role },
      // The raw token's only appearance — the response to the creator.
      result: { token },
    };
  },
});

registerMutation("invite.revoke", {
  role: "owner",
  apply(ctx, payload) {
    const invite = ctx.tx
      .select()
      .from(schema.inviteLinks)
      .where(
        and(
          eq(schema.inviteLinks.id, payload.inviteId),
          eq(schema.inviteLinks.tripId, ctx.trip.id),
        ),
      )
      .get();
    if (!invite) throw new MutationError(404, "invite_not_found", "invite not found");
    if (invite.revokedAt === null) {
      ctx.tx
        .update(schema.inviteLinks)
        .set({ revokedAt: ctx.now })
        .where(eq(schema.inviteLinks.id, invite.id))
        .run();
    }
    return { entityType: "invite", entityId: invite.id, feedPayload: {} };
  },
});

registerMutation("member.leave", {
  role: "viewer",
  apply(ctx) {
    if (ctx.member.role === "owner") {
      throw new MutationError(409, "owner_must_transfer", "transfer ownership before leaving");
    }
    ctx.tx
      .update(schema.tripMembers)
      .set({ status: "ghost", updatedAt: ctx.now })
      .where(eq(schema.tripMembers.id, ctx.member.id))
      .run();
    return {
      entityType: "member",
      entityId: ctx.member.id,
      feedPayload: { name: memberName(ctx, ctx.member.userId) },
    };
  },
});

registerMutation("member.remove", {
  role: "owner",
  apply(ctx, payload) {
    const target = loadMember(ctx, payload.memberId);
    // Also covers the owner removing themselves — that's a transfer, then leave.
    if (target.role === "owner") {
      throw new MutationError(409, "cannot_remove_owner", "the owner cannot be removed");
    }
    if (target.status !== "active") {
      throw new MutationError(409, "member_not_active", "member has already left");
    }
    ctx.tx
      .update(schema.tripMembers)
      .set({ status: "ghost", updatedAt: ctx.now })
      .where(eq(schema.tripMembers.id, target.id))
      .run();
    return {
      entityType: "member",
      entityId: target.id,
      feedPayload: { name: memberName(ctx, target.userId) },
    };
  },
});

registerMutation("member.setRole", {
  role: "owner",
  apply(ctx, payload) {
    const target = loadMember(ctx, payload.memberId);
    if (target.role === "owner") {
      throw new MutationError(409, "cannot_change_owner_role", "transfer ownership instead");
    }
    if (target.status !== "active") {
      throw new MutationError(409, "member_not_active", "member has already left");
    }
    ctx.tx
      .update(schema.tripMembers)
      .set({ role: payload.role, updatedAt: ctx.now })
      .where(eq(schema.tripMembers.id, target.id))
      .run();
    return {
      entityType: "member",
      entityId: target.id,
      feedPayload: { name: memberName(ctx, target.userId), role: payload.role },
    };
  },
});

registerMutation("trip.transferOwnership", {
  role: "owner",
  apply(ctx, payload) {
    const target = loadMember(ctx, payload.memberId);
    if (target.id === ctx.member.id) {
      throw new MutationError(409, "already_owner", "you already own this trip");
    }
    if (target.status !== "active") {
      throw new MutationError(409, "member_not_active", "member has already left");
    }
    ctx.tx
      .update(schema.tripMembers)
      .set({ role: "owner", updatedAt: ctx.now })
      .where(eq(schema.tripMembers.id, target.id))
      .run();
    ctx.tx
      .update(schema.tripMembers)
      .set({ role: "editor", updatedAt: ctx.now })
      .where(eq(schema.tripMembers.id, ctx.member.id))
      .run();

    // D.1: tell the NEW owner by email (the only membership-change email). Read
    // their address + names inside the transaction; render/send is deferred past
    // commit by sendRendered.
    const newOwner = ctx.tx
      .select({ name: schema.user.name, email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, target.userId))
      .get();
    if (newOwner?.email && ctx.email) {
      sendRendered(
        ctx.email,
        newOwner.email,
        `You're now the owner of ${ctx.trip.name}`,
        <OwnershipTransferEmail
          tripName={ctx.trip.name}
          newOwnerName={newOwner.name}
          previousOwnerName={memberName(ctx, ctx.member.userId)}
          tripUrl={`${ctx.email.config.baseUrl}/trips/${ctx.trip.id}`}
        />,
      );
    }

    // One event, one post-image (the new owner). The client's applyEvent
    // demotes any other cached owner to editor on this event type — matching
    // exactly what happened server-side.
    return {
      entityType: "member",
      entityId: target.id,
      feedPayload: { toName: newOwner?.name ?? memberName(ctx, target.userId) },
    };
  },
});
