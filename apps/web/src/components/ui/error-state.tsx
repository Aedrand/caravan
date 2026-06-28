import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A centered error card: an alert icon, a title, a muted description, and an
 * optional action (usually a "Try again" Button). Modeled on the trip page's
 * original TripError / TripNotFound blocks so failures look consistent across
 * surfaces. Callers control placement via className (e.g. `max-w-md`, or a
 * full-height wrapper around it).
 */
function ErrorState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("w-full max-w-md text-center", className)} role="alert">
      <CardHeader className="items-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert aria-hidden className="size-6" strokeWidth={1.75} />
        </div>
        <CardTitle className="mt-4 text-xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {action && <CardContent>{action}</CardContent>}
    </Card>
  );
}

export { ErrorState };
