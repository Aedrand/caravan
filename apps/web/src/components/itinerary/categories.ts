import type { ActivityCategory } from "@caravan/shared";
import {
  BedDouble,
  Camera,
  type LucideIcon,
  MapPin,
  ShoppingBag,
  Ticket,
  TramFront,
  Utensils,
} from "lucide-react";

/**
 * Per-category label, glyph, and theme tokens. Colors are semantic CSS vars
 * (TD-11) — never raw hex — so categories re-tint with the active color theme.
 */
export const CATEGORY_META: Record<
  ActivityCategory,
  { label: string; Icon: LucideIcon; color: string; soft: string }
> = {
  food: { label: "Food", Icon: Utensils, color: "var(--cat-food)", soft: "var(--cat-food-soft)" },
  sights: {
    label: "Sights",
    Icon: Camera,
    color: "var(--cat-sight)",
    soft: "var(--cat-sight-soft)",
  },
  activity: { label: "Activity", Icon: Ticket, color: "var(--info)", soft: "var(--info-soft)" },
  transport: {
    label: "Transport",
    Icon: TramFront,
    color: "var(--cat-transport)",
    soft: "var(--cat-transport-soft)",
  },
  lodging: {
    label: "Stay",
    Icon: BedDouble,
    color: "var(--cat-lodging)",
    soft: "var(--cat-lodging-soft)",
  },
  shopping: {
    label: "Shopping",
    Icon: ShoppingBag,
    color: "var(--primary)",
    soft: "var(--primary-soft)",
  },
  other: { label: "Other", Icon: MapPin, color: "var(--muted-foreground)", soft: "var(--muted)" },
};
