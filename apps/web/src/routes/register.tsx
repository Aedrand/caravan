import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { MailOpen, TentTree } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AuthShell, FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, fetchSession } from "@/lib/auth-client";

export const Route = createFileRoute("/register")({
  beforeLoad: async () => {
    // Already signed in? The dashboard is home.
    if (await fetchSession()) throw redirect({ to: "/" });
  },
  component: RegisterPage,
});

function validate(name: string, email: string, password: string): string | null {
  if (!name) return "Enter your name.";
  if (!email) return "Enter your email.";
  if (!password) return "Choose a password.";
  if (password.length < 8) return "Passwords must be at least 8 characters.";
  return null;
}

function RegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [inviteOnly, setInviteOnly] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const problem = validate(name, email, password);
    if (problem) {
      setError(problem);
      setInviteOnly(false);
      return;
    }

    setError(null);
    setInviteOnly(false);
    setPending(true);
    const { error: signUpError } = await authClient.signUp.email({ name, email, password });
    if (signUpError) {
      setPending(false);
      // The instance only opens registration for the very first user (or when
      // an admin opens it) — everyone else arrives via invite links.
      if (signUpError.status === 403) {
        setInviteOnly(true);
        return;
      }
      setError(signUpError.message ?? "Could not create your account. Please try again.");
      return;
    }
    await navigate({ to: "/" });
  }

  return (
    <AuthShell
      icon={TentTree}
      title="Join the caravan"
      description="Create an account to start planning trips together."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="register-name">Name</Label>
          <Input
            id="register-name"
            name="name"
            autoComplete="name"
            placeholder="Sam Wanderer"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="register-email">Email</Label>
          <Input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="register-password">Password</Label>
          <Input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        {inviteOnly && (
          <div
            role="alert"
            className="flex gap-3 rounded-lg border border-accent-foreground/20 bg-accent px-4 py-3 text-sm text-accent-foreground"
          >
            <MailOpen aria-hidden className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Registration is invite-only</p>
              <p className="mt-1 leading-relaxed">
                This Caravan instance accepts new members by invitation. Ask a trip organizer to
                send you an invite link and join from there.
              </p>
            </div>
          </div>
        )}
        {error && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
