import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, apiFetch } from "@/lib/api";
import { fetchSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * Account settings (D.2). Signed-in users manage their own notification
 * preferences here — currently the daily digest opt-out, read from and saved to
 * /api/me/notification-prefs. Mirrors the app's TanStack Query + apiFetch data
 * flow and the shared UI primitives (the toggle matches admin's native switch,
 * since the kit has no Switch primitive).
 */

interface NotificationPrefs {
  digestEnabled: boolean;
}

const prefsKey = ["me", "notification-prefs"] as const;

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    const session = await fetchSession();
    // Settings are personal — guests start at the door.
    if (!session) throw redirect({ to: "/login" });
  },
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your personal preferences for this Caravan account.
        </p>
      </header>
      <NotificationsCard />
    </section>
  );
}

function NotificationsCard() {
  const queryClient = useQueryClient();
  const prefsQuery = useQuery({
    queryKey: prefsKey,
    queryFn: () => apiFetch<NotificationPrefs>("/api/me/notification-prefs"),
  });

  // Optimistic local mirror so the toggle flips instantly; reconciled on save.
  const [digestEnabled, setDigestEnabled] = useState(true);
  useEffect(() => {
    if (prefsQuery.data) setDigestEnabled(prefsQuery.data.digestEnabled);
  }, [prefsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (next: boolean) =>
      apiFetch<NotificationPrefs>("/api/me/notification-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digestEnabled: next }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(prefsKey, data);
      setDigestEnabled(data.digestEnabled);
    },
    onError: () => {
      // Roll the toggle back to the last known-good value on failure.
      if (prefsQuery.data) setDigestEnabled(prefsQuery.data.digestEnabled);
    },
  });

  function toggleDigest() {
    const next = !digestEnabled;
    setDigestEnabled(next); // optimistic
    saveMutation.mutate(next);
  }

  const pending = saveMutation.isPending;
  const saveError =
    saveMutation.error instanceof ApiError
      ? saveMutation.error.message
      : saveMutation.isError
        ? "Couldn't save your preferences. Please try again."
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>How Caravan emails you about your trips.</CardDescription>
      </CardHeader>
      <CardContent>
        {prefsQuery.isPending ? (
          <div className="h-16 animate-pulse rounded-md bg-muted/60" aria-busy="true" />
        ) : prefsQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn't load your preferences.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span id="digest-enabled-label" className="text-sm font-medium">
                  Daily digest email
                </span>
                <p className="text-xs text-muted-foreground">
                  A once-a-day summary of what changed on your trips. Sent only when there's
                  activity.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={digestEnabled}
                aria-labelledby="digest-enabled-label"
                disabled={pending}
                onClick={toggleDigest}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                  digestEnabled ? "bg-primary" : "bg-input",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-block size-5 transform rounded-full bg-background shadow-xs transition-transform",
                    digestEnabled ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>

            {saveError && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive"
              >
                {saveError}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
