import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Copy, Crown, Ellipsis, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api";
import { useMyMember, useTripMutation, useTripSnapshot } from "@/lib/sync";
import type { InviteLink, InviteRole, TripMember } from "@/lib/sync/shared";

/**
 * Membership management card for the trip page (must render inside a
 * <TripSyncProvider>). The member list is live — snapshot updates from sync
 * events (member.join included) flow straight through useTripSnapshot.
 */

const DAY_MS = 86_400_000;

type Expiry = "never" | "7" | "30";

type PendingAction =
  | { kind: "transfer"; member: TripMember }
  | { kind: "remove"; member: TripMember }
  | { kind: "leave" };

const ROLE_BADGE_VARIANT = {
  owner: "default",
  editor: "secondary",
  viewer: "outline",
} as const;

function expiresAtFor(expiry: Expiry): number | null {
  if (expiry === "never") return null;
  return Date.now() + Number(expiry) * DAY_MS;
}

function formatExpiry(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function mutationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

export function MembersPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMyMember();
  const { data: snapshot } = useTripSnapshot();
  const { mutateAsync, isPending } = useTripMutation();

  const [action, setAction] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<InviteRole>("editor");
  const [inviteExpiry, setInviteExpiry] = useState<Expiry>("never");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tripId = snapshot?.trip.id;
  const archived = snapshot ? snapshot.trip.archivedAt !== null : true;
  const isOwner = me?.role === "owner";
  const canManage = isOwner && !archived;
  const invitesKey = ["trip", tripId, "invites"] as const;

  const invitesQuery = useQuery({
    queryKey: invitesKey,
    queryFn: () => apiFetch<{ invites: InviteLink[] }>(`/api/trips/${tripId}/invites`),
    enabled: Boolean(tripId) && canManage,
  });

  if (!snapshot || !tripId) return null;

  const activeMembers = snapshot.members.filter((member) => member.status === "active");
  const canLeave = me !== null && me.role !== "owner" && !archived;
  const activeInvites = (invitesQuery.data?.invites ?? []).filter(
    (invite) => invite.revokedAt === null,
  );

  function closeAction() {
    setAction(null);
    setActionError(null);
  }

  async function setRole(member: TripMember, role: InviteRole) {
    // Failures roll back via the sync lib's snapshot invalidation.
    await mutateAsync("member.setRole", { memberId: member.id, role }).catch(() => {});
  }

  async function confirmAction() {
    if (!action) return;
    setActionError(null);
    try {
      if (action.kind === "transfer") {
        await mutateAsync("trip.transferOwnership", { memberId: action.member.id });
      } else if (action.kind === "remove") {
        await mutateAsync("member.remove", { memberId: action.member.id });
      } else {
        await mutateAsync("member.leave", {});
        closeAction();
        await navigate({ to: "/" });
        return;
      }
      closeAction();
    } catch (error) {
      setActionError(mutationErrorMessage(error, "Something went wrong. Please try again."));
    }
  }

  async function createInvite() {
    setInviteError(null);
    // Recipient is optional: when given, the server emails the join link (if the
    // admin configured SMTP); the copyable link below is always the fallback.
    const recipient = inviteEmail.trim();
    try {
      const response = await mutateAsync("invite.create", {
        role: inviteRole,
        expiresAt: expiresAtFor(inviteExpiry),
        email: recipient || null,
      });
      const token = (response.result as { token?: unknown } | undefined)?.token;
      if (typeof token === "string") {
        setInviteLink(`${window.location.origin}/join/${token}`);
        setInvitedEmail(recipient || null);
        setInviteEmail("");
        setCopied(false);
      } else {
        setInviteError("The invite was created but no link came back. Please try again.");
      }
      await queryClient.invalidateQueries({ queryKey: invitesKey });
    } catch (error) {
      setInviteError(
        mutationErrorMessage(error, "Couldn't create the invite link. Please try again."),
      );
    }
  }

  async function revokeInvite(inviteId: string) {
    setInviteError(null);
    try {
      await mutateAsync("invite.revoke", { inviteId });
      await queryClient.invalidateQueries({ queryKey: invitesKey });
    } catch (error) {
      setInviteError(mutationErrorMessage(error, "Couldn't revoke that invite. Please try again."));
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the readOnly input is still selectable by hand.
    }
  }

  return (
    <Card role="region" aria-labelledby="members-panel-heading">
      <CardHeader>
        <CardTitle id="members-panel-heading">Members</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/60">
          {activeMembers.map((member) => {
            const isSelf = member.id === me?.id;
            return (
              <li key={member.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-accent text-xs font-semibold uppercase text-accent-foreground"
                >
                  {member.name.trim().charAt(0) || "?"}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {member.name}
                  {isSelf && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">you</span>
                  )}
                </span>
                <Badge variant={ROLE_BADGE_VARIANT[member.role]} className="capitalize">
                  {member.role}
                </Badge>
                {canManage && !isSelf && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Member actions for ${member.name}`}
                        className="text-muted-foreground"
                        disabled={isPending}
                      >
                        <Ellipsis aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {member.role !== "owner" && (
                        <DropdownMenuItem
                          disabled={isPending}
                          onSelect={() =>
                            void setRole(member, member.role === "editor" ? "viewer" : "editor")
                          }
                        >
                          <ShieldCheck aria-hidden />
                          {member.role === "editor" ? "Make viewer" : "Make editor"}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        disabled={isPending}
                        onSelect={() => setAction({ kind: "transfer", member })}
                      >
                        <Crown aria-hidden />
                        Make owner…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={isPending}
                        onSelect={() => setAction({ kind: "remove", member })}
                      >
                        <Trash2 aria-hidden />
                        Remove from trip…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>

        {canManage && (
          <div className="mt-5 border-t border-border/60 pt-5">
            <h3 className="text-sm font-semibold">Invite</h3>
            <div className="mt-3 space-y-2">
              <Label htmlFor="invite-email">Email (optional)</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="name@example.com"
                autoComplete="off"
                value={inviteEmail}
                disabled={isPending}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                We'll email the join link when an admin has configured email. Either way you'll get
                a copyable link below.
              </p>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  className={selectClassName}
                  value={inviteRole}
                  disabled={isPending}
                  onChange={(event) => setInviteRole(event.target.value as InviteRole)}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="invite-expiry">Expires</Label>
                <select
                  id="invite-expiry"
                  className={selectClassName}
                  value={inviteExpiry}
                  disabled={isPending}
                  onChange={(event) => setInviteExpiry(event.target.value as Expiry)}
                >
                  <option value="never">Never</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                </select>
              </div>
              <Button disabled={isPending} onClick={() => void createInvite()}>
                Create invite link
              </Button>
            </div>
            {inviteError && (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive"
              >
                {inviteError}
              </p>
            )}
            {inviteLink && (
              <div className="mt-3 space-y-2">
                {invitedEmail && (
                  <p className="text-sm text-muted-foreground">
                    Invite emailed to{" "}
                    <span className="font-medium text-foreground">{invitedEmail}</span> if email is
                    configured. Share the link below as a backup.
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input readOnly aria-label="Invite link" value={inviteLink} />
                  <Button
                    variant="outline"
                    className="shrink-0"
                    onClick={() => void copyInviteLink()}
                  >
                    {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                    {copied ? "Copied" : "Copy invite link"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Save it now — the link is only shown once.
                </p>
              </div>
            )}
            {activeInvites.length > 0 && (
              <ul className="mt-4 space-y-2" aria-label="Active invite links">
                {activeInvites.map((invite) => (
                  <li key={invite.id} className="flex items-center gap-3 text-sm">
                    <Badge variant="outline" className="capitalize">
                      {invite.role}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {invite.expiresAt !== null
                        ? `Expires ${formatExpiry(invite.expiresAt)}`
                        : "Never expires"}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                      disabled={isPending}
                      onClick={() => void revokeInvite(invite.id)}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>

      {canLeave && (
        <CardFooter className="border-t border-border/60 pt-4">
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => setAction({ kind: "leave" })}
          >
            <LogOut aria-hidden />
            Leave trip
          </Button>
        </CardFooter>
      )}

      <MemberActionDialog
        action={action}
        tripName={snapshot.trip.name}
        pending={isPending}
        errorMessage={actionError}
        onClose={closeAction}
        onConfirm={() => void confirmAction()}
      />
    </Card>
  );
}

/**
 * One confirm dialog for all three destructive-ish membership moves —
 * controlled by the panel because the dropdown unmounts its items on select.
 */
function MemberActionDialog({
  action,
  tripName,
  pending,
  errorMessage,
  onClose,
  onConfirm,
}: {
  action: PendingAction | null;
  tripName: string;
  pending: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const copy =
    action === null
      ? null
      : action.kind === "transfer"
        ? {
            title: `Make ${action.member.name} the owner?`,
            description: `Ownership of “${tripName}” moves to ${action.member.name}, and you become an editor. Only the new owner can transfer it back.`,
            confirmLabel: "Make owner",
            pendingLabel: "Transferring…",
            destructive: false,
          }
        : action.kind === "remove"
          ? {
              title: `Remove ${action.member.name} from the trip?`,
              description: `${action.member.name} loses access to “${tripName}” immediately. Their past contributions stay on the trip.`,
              confirmLabel: "Remove from trip",
              pendingLabel: "Removing…",
              destructive: true,
            }
          : {
              title: "Leave this trip?",
              description: `You'll lose access to “${tripName}”. A trip member can invite you back later.`,
              confirmLabel: "Leave trip",
              pendingLabel: "Leaving…",
              destructive: true,
            };

  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        {copy && (
          <>
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>{copy.description}</DialogDescription>
            </DialogHeader>
            {errorMessage && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive"
              >
                {errorMessage}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" disabled={pending} onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant={copy.destructive ? "destructive" : "default"}
                disabled={pending}
                onClick={onConfirm}
              >
                {pending ? copy.pendingLabel : copy.confirmLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
