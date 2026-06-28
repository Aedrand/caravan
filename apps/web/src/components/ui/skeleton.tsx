import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A single pulsing placeholder block. Minimal and composable: size and shape
 * come from the caller's className (callers render N of these to sketch out a
 * loading layout). Uses the muted token so it re-themes with the rest of the UI.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
