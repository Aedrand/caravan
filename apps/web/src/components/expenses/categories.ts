import type { ExpenseCategory } from "@caravan/shared";
import {
  BedDouble,
  type LucideIcon,
  MoreHorizontal,
  ShoppingBag,
  Ticket,
  TramFront,
  Utensils,
} from "lucide-react";

/**
 * Per-expense-category label, glyph, and theme tokens. Colors are semantic CSS
 * vars (TD-11) — never raw hex — so they re-tint with the active color theme.
 * The category set is fixed (PD-8).
 */
export const EXPENSE_CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; Icon: LucideIcon; color: string; soft: string }
> = {
  food: { label: "Food", Icon: Utensils, color: "var(--cat-food)", soft: "var(--cat-food-soft)" },
  transport: {
    label: "Transport",
    Icon: TramFront,
    color: "var(--cat-transport)",
    soft: "var(--cat-transport-soft)",
  },
  accommodation: {
    label: "Stay",
    Icon: BedDouble,
    color: "var(--cat-lodging)",
    soft: "var(--cat-lodging-soft)",
  },
  activities: { label: "Activities", Icon: Ticket, color: "var(--info)", soft: "var(--info-soft)" },
  shopping: {
    label: "Shopping",
    Icon: ShoppingBag,
    color: "var(--primary)",
    soft: "var(--primary-soft)",
  },
  other: {
    label: "Other",
    Icon: MoreHorizontal,
    color: "var(--muted-foreground)",
    soft: "var(--muted)",
  },
};
