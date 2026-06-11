import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn-styled label on a native <label> element (no Radix dependency —
 * `htmlFor` association is all we need). Callers must pass `htmlFor`.
 */
function Label({
  className,
  htmlFor,
  children,
  ...props
}: React.ComponentProps<"label"> & { htmlFor: string }) {
  return (
    <label
      data-slot="label"
      htmlFor={htmlFor}
      className={cn(
        "flex select-none items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}

export { Label };
