import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";

/**
 * Shared chrome for the auth pages: the same warm centered card as the
 * dashboard empty state (src/routes/index.tsx), with an icon badge, heading,
 * and a footer line for the login/register cross-link.
 */
export function AuthShell({
  icon: Icon,
  title,
  description,
  footer,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-1 items-center justify-center">
      <div className="cv-card w-full max-w-md px-8 py-10 sm:px-10">
        <BrandMark className="mb-8 flex w-full justify-center" size={30} />
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon aria-hidden className="size-7" strokeWidth={1.75} />
        </div>
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        <div className="mt-8">{children}</div>
        <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
      </div>
    </section>
  );
}

/** Inline form-level error, in the warm palette's destructive tones. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive"
    >
      {children}
    </div>
  );
}
