import { createFileRoute } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <section className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-border/70 bg-card px-8 py-12 text-center shadow-sm sm:px-12">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Compass aria-hidden className="size-7" strokeWidth={1.75} />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">No trips yet</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Plan your first trip together.
        </p>
        <Button className="mt-8" size="lg">
          Create a trip
        </Button>
      </div>
    </section>
  );
}
