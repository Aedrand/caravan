import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * Top-bar user menu: avatar initial + name + sign out. Renders an invisible
 * placeholder of the same height while signed out (or while the session is
 * loading) so the header layout never shifts.
 */
export function UserMenu() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  if (isPending || !session) {
    return <div className="size-8" aria-hidden />;
  }

  const name = session.user.name || session.user.email;
  const initial = (name[0] ?? "?").toUpperCase();
  // `role` is a Better Auth additional field the client type doesn't infer
  // (same narrowing the server's requireUser uses).
  const isAdmin = (session.user as { role?: string | null }).role === "admin";

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      await navigate({ to: "/login" });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className="flex items-center gap-2 text-sm font-medium">
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {initial}
        </span>
        <span className="hidden sm:inline">{name}</span>
      </span>
      {isAdmin && (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
        >
          <Link to="/admin">
            <ShieldCheck aria-hidden />
            <span className="hidden sm:inline">Admin</span>
          </Link>
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        disabled={signingOut}
        className="text-muted-foreground hover:text-foreground"
      >
        <LogOut aria-hidden />
        Sign out
      </Button>
    </div>
  );
}
