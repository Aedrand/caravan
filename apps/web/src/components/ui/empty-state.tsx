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
  headingLevel = 2,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /**
   * Heading level for the title. Defaults to 2; pass 3 when this sits inside a
   * section that already has its own peer `<h2>` (avoids two sibling h2s).
   */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", className)}>
      {Icon && (
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon aria-hidden className="size-7" strokeWidth={1.75} />
        </div>
      )}
      <Heading className={cn("font-display text-2xl font-semibold tracking-tight", Icon && "mt-6")}>
        {title}
      </Heading>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

export { EmptyState };
