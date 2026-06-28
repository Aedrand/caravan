import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A centered "nothing here yet" placeholder: an optional icon in a soft circle,
 * a display-font title, a muted description, and an optional action (usually a
 * Button). Modeled on the dashboard's original "No trips yet" block so every
 * surface reads the same. Callers control vertical placement via className
 * (e.g. `flex-1` to fill a panel, or a min-height wrapper).
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", className)}>
      {Icon && (
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon aria-hidden className="size-7" strokeWidth={1.75} />
        </div>
      )}
      <h2 className={cn("font-display text-2xl font-semibold tracking-tight", Icon && "mt-6")}>
        {title}
      </h2>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

export { EmptyState };
