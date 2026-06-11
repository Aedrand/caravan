import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AuthShell, FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, fetchSession } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    // Already signed in? The dashboard is home.
    if (await fetchSession()) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

function validate(email: string, password: string): string | null {
  if (!email) return "Enter your email.";
  if (!password) return "Enter your password.";
  if (password.length < 8) return "Passwords are at least 8 characters.";
  return null;
}

function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const problem = validate(email, password);
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
    await navigate({ to: "/" });
  }

  return (
    <AuthShell
      icon={KeyRound}
      title="Welcome back"
      description="Sign in to pick up the planning where you left off."
      footer={
        <>
          New to this caravan?{" "}
          <Link
            to="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
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
    </AuthShell>
  );
}
