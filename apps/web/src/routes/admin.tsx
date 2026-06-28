import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import { fetchSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * Instance admin panel (Track D.3). Admin-only: settings (name, registration,
 * default theme), a read-only overview (counts + on-disk size), and a backup
 * download. Mirrors the app's TanStack Query + apiFetch data flow and the
 * shared UI primitives; the server gates every /api/admin/* call too.
 */

type ThemeStyle = "poster" | "material";
type ThemePalette = "warm" | "dusk";
interface ThemeSetting {
  style: ThemeStyle;
  theme: ThemePalette;
}
interface AdminSettings {
  registrationOpen: boolean;
  instanceName: string | null;
  theme: ThemeSetting | null;
}
interface AdminOverview {
  users: number;
  trips: number;
  activeMembers: number;
  dbBytes: number;
  walBytes: number;
}

const DEFAULT_THEME: ThemeSetting = { style: "poster", theme: "warm" };

// Same native-select styling members-panel uses — no Select primitive in the kit.
const selectClassName =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value.toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const session = await fetchSession();
    // Guests start at the door; signed-in non-admins go to their dashboard.
    if (!session) throw redirect({ to: "/login" });
    // `role` is a Better Auth additional field the client type doesn't infer
    // (same narrowing the server's requireUser uses).
    if ((session.user as { role?: string | null }).role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
  component: AdminPage,
});

function AdminPage() {
  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Instance admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Settings, health, and backups for this Caravan instance.
        </p>
      </header>
      <SettingsCard />
      <OverviewCard />
      <BackupCard />
    </section>
  );
}

function SettingsCard() {
  const queryClient = useQueryClient();
  const settingsKey = ["admin", "settings"] as const;
  const settingsQuery = useQuery({
    queryKey: settingsKey,
    queryFn: () => apiFetch<AdminSettings>("/api/admin/settings"),
  });

  const [instanceName, setInstanceName] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeSetting>(DEFAULT_THEME);
  const [saved, setSaved] = useState(false);

  // Seed the form once the saved settings load (and on any refetch).
  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    setInstanceName(data.instanceName ?? "");
    setRegistrationOpen(data.registrationOpen);
    setTheme(data.theme ?? DEFAULT_THEME);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (body: { instanceName: string; registrationOpen: boolean; theme: ThemeSetting }) =>
      apiFetch<AdminSettings>("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKey, data);
      // Apply the new instance default to the live page so the change is visible.
      document.documentElement.setAttribute("data-style", theme.style);
      document.documentElement.setAttribute("data-theme", theme.theme);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    saveMutation.mutate({ instanceName: instanceName.trim(), registrationOpen, theme });
  }

  const pending = saveMutation.isPending;
  const saveError =
    saveMutation.error instanceof ApiError
      ? saveMutation.error.message
      : saveMutation.isError
        ? "Couldn't save settings. Please try again."
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Instance name, registration, and the default theme.</CardDescription>
      </CardHeader>
      <CardContent>
        {settingsQuery.isPending ? (
          <Skeleton className="h-40 bg-muted/60" aria-busy="true" />
        ) : settingsQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn't load settings.
          </p>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="instance-name">Instance name</Label>
              <Input
                id="instance-name"
                value={instanceName}
                maxLength={100}
                placeholder="Caravan"
                disabled={pending}
                onChange={(event) => setInstanceName(event.target.value)}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="registration-open">Open registration</Label>
                <p className="text-xs text-muted-foreground">
                  When off, new accounts arrive only through trip invite links.
                </p>
              </div>
              <button
                type="button"
                id="registration-open"
                role="switch"
                aria-checked={registrationOpen}
                disabled={pending}
                onClick={() => setRegistrationOpen((open) => !open)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                  registrationOpen ? "bg-primary" : "bg-input",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-block size-5 transform rounded-full bg-background shadow-xs transition-transform",
                    registrationOpen ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="theme-style">Theme style</Label>
                <select
                  id="theme-style"
                  className={selectClassName}
                  value={theme.style}
                  disabled={pending}
                  onChange={(event) =>
                    setTheme((t) => ({ ...t, style: event.target.value as ThemeStyle }))
                  }
                >
                  <option value="poster">Poster</option>
                  <option value="material">Material</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="theme-palette">Theme palette</Label>
                <select
                  id="theme-palette"
                  className={selectClassName}
                  value={theme.theme}
                  disabled={pending}
                  onChange={(event) =>
                    setTheme((t) => ({ ...t, theme: event.target.value as ThemePalette }))
                  }
                >
                  <option value="warm">Warm</option>
                  <option value="dusk">Dusk</option>
                </select>
              </div>
            </div>

            {saveError && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive"
              >
                {saveError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save settings"}
              </Button>
              {saved && <span className="text-sm text-muted-foreground">Saved</span>}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewCard() {
  const overviewQuery = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => apiFetch<AdminOverview>("/api/admin/overview"),
  });

  const stats = overviewQuery.data
    ? [
        { label: "Users", value: String(overviewQuery.data.users) },
        { label: "Trips", value: String(overviewQuery.data.trips) },
        { label: "Active members", value: String(overviewQuery.data.activeMembers) },
        { label: "Database", value: formatBytes(overviewQuery.data.dbBytes) },
        { label: "WAL", value: formatBytes(overviewQuery.data.walBytes) },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Overview</CardTitle>
        <CardDescription>Members, trips, and on-disk size.</CardDescription>
      </CardHeader>
      <CardContent>
        {overviewQuery.isPending ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {["a", "b", "c", "d", "e"].map((key) => (
              <Skeleton key={key} className="h-16 bg-muted/60" />
            ))}
          </div>
        ) : overviewQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn't load the overview.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border/60 px-4 py-3">
                <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function BackupCard() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadBackup() {
    setError(null);
    setDownloading(true);
    try {
      const res = await fetch("/api/admin/backup");
      if (!res.ok) {
        let message = "Couldn't create the backup.";
        try {
          const body = (await res.json()) as { error?: { message?: unknown } };
          if (typeof body?.error?.message === "string") message = body.error.message;
        } catch {
          // Non-JSON error body — keep the fallback.
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "caravan-backup.db";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the backup.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup</CardTitle>
        <CardDescription>
          Download a consistent snapshot of the database (VACUUM INTO).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" disabled={downloading} onClick={() => void downloadBackup()}>
          {downloading ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <Download aria-hidden />
          )}
          {downloading ? "Preparing…" : "Download backup"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
