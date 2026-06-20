import type {
  Activity,
  Expense,
  ExpenseShare,
  InviteLink,
  Payment,
  Trip,
  TripMember,
} from "@caravan/shared";
import type { schema } from "../db";

/**
 * Row → wire DTO serializers. The only place that knows which columns are
 * wire-visible: token hashes, cursors, and audit columns stay server-side.
 */

export function serializeTrip(row: typeof schema.trips.$inferSelect): Trip {
  return {
    id: row.id,
    name: row.name,
    destination: row.destination,
    startDate: row.startDate,
    endDate: row.endDate,
    currency: row.currency,
    version: row.version,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeActivity(row: typeof schema.activities.$inferSelect): Activity {
  return {
    id: row.id,
    tripId: row.tripId,
    date: row.date,
    position: row.position,
    title: row.title,
    startTime: row.startTime,
    endTime: row.endTime,
    placeName: row.placeName,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    placeProvider: row.placeProvider,
    placeRef: row.placeRef,
    category: row.category,
    notes: row.notes,
    linkUrl: row.linkUrl,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** `name` is resolved from the user row at read time (TripMemberSchema contract). */
export function serializeMember(
  row: typeof schema.tripMembers.$inferSelect,
  userName: string,
): TripMember {
  return {
    id: row.id,
    tripId: row.tripId,
    userId: row.userId,
    name: userName,
    role: row.role,
    status: row.status,
    aiWriteEnabled: row.aiWriteEnabled,
    joinedAt: row.joinedAt,
  };
}

/**
 * Expense + its participant shares (Track B). Shares come from a separate query
 * (one row per participant); the caller passes the rows for this expense.
 */
export function serializeExpense(
  row: typeof schema.expenses.$inferSelect,
  shareRows: (typeof schema.expenseShares.$inferSelect)[],
): Expense {
  const shares: ExpenseShare[] = shareRows.map((s) => ({
    memberId: s.memberId,
    amountMinor: s.amountMinor,
  }));
  return {
    id: row.id,
    tripId: row.tripId,
    paidBy: row.paidBy,
    amountMinor: row.amountMinor,
    description: row.description,
    category: row.category,
    notes: row.notes,
    date: row.date,
    activityId: row.activityId,
    shares,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializePayment(row: typeof schema.payments.$inferSelect): Payment {
  return {
    id: row.id,
    tripId: row.tripId,
    fromMember: row.fromMember,
    toMember: row.toMember,
    amountMinor: row.amountMinor,
    notes: row.notes,
    date: row.date,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Never includes tokenHash — the raw token is returned once at creation only. */
export function serializeInvite(row: typeof schema.inviteLinks.$inferSelect): InviteLink {
  return {
    id: row.id,
    tripId: row.tripId,
    role: row.role,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}
