import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { UserRoundPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AuthShell, FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch, apiPost } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import type { InviteRole } from "@/lib/sync/shared";

/**
 * The invite door (/join/:token). Public on purpose — no session guard:
 * guests land here from an invite link, authenticate inline (sign in or
 * create an account, the latter carrying the invite token so invite-only
 * registration lets them through), and are walked straight into the trip.
 */
export const Route = createFileRoute("/join/$token")({
  component: JoinPage,
});

interface InvitePreview {
  trip: { name: string; destination: string | null };
  role: InviteRole;
}

interface AcceptResponse {
  tripId: string;
  memberId: string;
  outcome: "joined" | "rejoined" | "already_member";
}

function acceptInvite(token: string): Promise<AcceptResponse> {
  return apiPost<AcceptResponse>(`/api/invites/${token}/accept`, {});
}

function acceptErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "trip_archived") {
      return "This trip is archived — invites can't be accepted right now.";
    }
    if (error.code === "invite_invalid") {
      return "This invite link is no longer valid.";
    }
    return error.message;
  }
  return "Couldn't join the trip. Please try again.";
}

function validateSignIn(email: string, password: string): string | null {
  if (!email) return "Enter your email.";
  if (!password) return "Enter your password.";
  if (password.length < 8) return "Passwords are at least 8 characters.";
  return null;
}

function validateRegister(name: string, email: string, password: string): string | null {
  if (!name) return "Enter your name.";
  if (!email) return "Enter your email.";
  if (!password) return "Choose a password.";
  if (password.length < 8) return "Passwords must be at least 8 characters.";
  return null;
}

function JoinPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const inviteQuery = useQuery({
    queryKey: ["invite", token],
    queryFn: () => apiFetch<InvitePreview>(`/api/invites/${token}`),
    // A 4xx verdict is final (invalid/expired link) — don't retry it.
    retry: (failureCount, err) =>
      !(err instanceof ApiError && err.status >= 400 && err.status < 500) && failureCount < 2,
  });

  async function acceptAndEnter() {
    setError(null);
    setPending(true);
    try {
      const result = await acceptInvite(token);
      await navigate({ to: "/trips/$tripId", params: { tripId: result.tripId } });
    } catch (err) {
      setPending(false);
      setError(acceptErrorMessage(err));
    }
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const problem = validateSignIn(email, password);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setPending(true);
    const { error: signInError } = await authClient.signIn.email({ email, password });
    if (signInError) {
      setPending(false);
      setError(signInError.message ?? "Sign in failed. Please try again.");
      return;
    }
    await acceptAndEnter();
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const problem = validateRegister(name, email, password);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setPending(true);
    // The invite token rides along so invite-only registration opens the door.
    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
      fetchOptions: { headers: { "x-caravan-invite": token } },
    });
    if (signUpError) {
      setPending(false);
      setError(signUpError.message ?? "Could not create your account. Please try again.");
      return;
    }
    await acceptAndEnter();
  }

  if (inviteQuery.isPending || sessionPending) return <JoinSkeleton />;

  if (inviteQuery.isError) {
    const inviteError = inviteQuery.error;
    if (inviteError instanceof ApiError && inviteError.status >= 400 && inviteError.status < 500) {
      return <InviteInvalid />;
    }
    return (
      <InviteLoadError
        message={
          inviteError instanceof ApiError ? inviteError.message : "Couldn't load this invite."
        }
        onRetry={() => void inviteQuery.refetch()}
      />
    );
  }

  const { trip, role } = inviteQuery.data;
  const subtitle = trip.destination
    ? `${trip.destination} · you're invited as ${role}`
    : `you're invited as ${role}`;

  if (session) {
    const name = session.user.name || session.user.email;
    return (
      <AuthShell
        icon={UserRoundPlus}
        title={`Join ${trip.name}`}
        description={subtitle}
        footer={null}
      >
        <div className="space-y-5">
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            >
              {(name[0] ?? "?").toUpperCase()}
            </span>
            <span>
              Signed in as <span className="font-medium text-foreground">{name}</span>
            </span>
          </p>
          {error && <FormError>{error}</FormError>}
          <Button size="lg" className="w-full" disabled={pending} onClick={acceptAndEnter}>
            {pending ? "Joining…" : "Join trip"}
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      icon={UserRoundPlus}
      title={`Join ${trip.name}`}
      description={subtitle}
      footer={
        mode === "register" ? (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            New to Caravan?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Create an account
            </button>
          </>
        )
      }
    >
      {mode === "register" ? (
        <form noValidate onSubmit={handleRegister} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="join-name">Name</Label>
            <Input
              id="join-name"
              name="name"
              autoComplete="name"
              placeholder="Sam Wanderer"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-email">Email</Label>
            <Input
              id="join-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-password">Password</Label>
            <Input
              id="join-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          {error && <FormError>{error}</FormError>}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
      ) : (
        <form noValidate onSubmit={handleSignIn} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="join-login-email">Email</Label>
            <Input
              id="join-login-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-login-password">Password</Label>
            <Input
              id="join-login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
            />
          </div>
          {error && <FormError>{error}</FormError>}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

function InviteInvalid() {
  return (
    <section className="flex flex-1 items-center justify-center">
      <ErrorState
        title="This invite link is no longer valid"
        description="It may have expired or been revoked. Ask a trip organizer for a fresh link."
        action={
          <Button asChild variant="outline">
            <Link to="/">Go to Caravan</Link>
          </Button>
        }
      />
    </section>
  );
}

function InviteLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="flex flex-1 items-center justify-center">
      <ErrorState
        title="Something went sideways"
        description={message}
        action={
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </section>
  );
}

function JoinSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading invite"
      className="flex flex-1 items-center justify-center"
    >
      <div className="w-full max-w-md rounded-xl border border-border/70 bg-card px-8 py-10 shadow-sm sm:px-10">
        <div className="mx-auto size-14 animate-pulse rounded-full bg-muted" />
        <div className="mx-auto mt-6 h-7 w-48 animate-pulse rounded-md bg-muted" />
        <div className="mx-auto mt-3 h-4 w-64 max-w-full animate-pulse rounded-md bg-muted" />
        <div className="mt-8 h-10 animate-pulse rounded-md bg-muted" />
      </div>
    </section>
  );
}
