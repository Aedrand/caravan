import markUrl from "@/assets/brand/logo-mark.svg";
import tileUrl from "@/assets/brand/logo-tile.svg";
import wagonUrl from "@/assets/brand/logo-wagon.svg";
import { cn } from "@/lib/utils";

/**
 * The single indirection for Caravan's identity marks (TD-10). Every header,
 * favicon, and auth screen renders the logo through here, so a future
 * per-instance logo swap (the D.3 admin "make it yours" console) only touches
 * this component.
 *
 * - `lockup`  — convoy mark + lowercase "caravan" wordmark (default).
 * - `mark`    — the three-wagon convoy on its own.
 * - `tile`    — the app-icon tile (self-contained, reads on any background).
 * - `wagon`   — single wagon, for ≤24px contexts.
 *
 * Brand rule: below 28px the convoy mark falls back to the single wagon.
 */
type BrandMarkVariant = "lockup" | "mark" | "tile" | "wagon";

type BrandMarkProps = {
  variant?: BrandMarkVariant;
  /** Mark height in px (the wordmark scales from it). */
  size?: number;
  className?: string;
};

const SRC: Record<Exclude<BrandMarkVariant, "lockup">, string> = {
  mark: markUrl,
  tile: tileUrl,
  wagon: wagonUrl,
};

export function BrandMark({ variant = "lockup", size = 32, className }: BrandMarkProps) {
  const markVariant: Exclude<BrandMarkVariant, "lockup"> =
    variant === "tile" || variant === "wagon" ? variant : size < 28 ? "wagon" : "mark";

  const img = (
    <img
      src={SRC[markVariant]}
      alt="Caravan"
      style={{ height: size, width: "auto" }}
      className="block select-none"
      draggable={false}
    />
  );

  if (variant !== "lockup") {
    return <span className={cn("inline-flex", className)}>{img}</span>;
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {img}
      <span
        className="font-display lowercase leading-none"
        style={{
          fontWeight: 800,
          letterSpacing: "-0.04em",
          fontSize: size * 0.92,
          color: "var(--ink)",
        }}
      >
        caravan
      </span>
    </span>
  );
}
