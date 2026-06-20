import { createRootRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { UserMenu } from "@/components/user-menu";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  // The trip workspace (C.4) is a full-screen shell with its own consolidated
  // top bar (logo + account folded in), so the app's global header steps aside
  // there — one bar, not two.
  const fullBleed = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/trips/$tripId"),
  });
  if (fullBleed) return <Outlet />;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex items-center rounded-control outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <BrandMark size={26} />
          </Link>
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
