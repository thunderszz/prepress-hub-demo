import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Visual identity of the demo (fictional company "Acme Flexo").
 * Pure SVG: no real logo, no external images.
 * Colours echo the CMYK process inks of flexographic printing.
 */
export const BRAND_COLORS = [
  "#00AEEF", // cyan
  "#EC008C", // magenta
  "#FFD200", // yellow
  "#1F2933", // black (K)
];

/**
 * Halftone dot pattern in the four inks, purely decorative.
 * Opacity is controlled by the parent (e.g. className="opacity-[0.06]").
 */
export function HalftoneField({ className }: { className?: string }) {
  const patId = useId();
  const CELL = 28;
  return (
    <svg className={className} width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={patId} width={CELL * 2} height={CELL * 2} patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
          <circle cx={CELL / 2} cy={CELL / 2} r={5} fill={BRAND_COLORS[0]} />
          <circle cx={CELL * 1.5} cy={CELL / 2} r={3.5} fill={BRAND_COLORS[1]} />
          <circle cx={CELL / 2} cy={CELL * 1.5} r={3.5} fill={BRAND_COLORS[2]} />
          <circle cx={CELL * 1.5} cy={CELL * 1.5} r={2.5} fill={BRAND_COLORS[3]} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patId})`} />
    </svg>
  );
}

/** Thin CMYK stripe: a discreet brand accent (top of cards/headers). */
export function BrandStripe({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-[3px] w-full overflow-hidden", className)} aria-hidden="true">
      {BRAND_COLORS.map((c) => (
        <span key={c} className="flex-1" style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

/** Mark: overlapping CMYK circles on a white tile. */
function MarkSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <g style={{ mixBlendMode: "multiply" }}>
        <circle cx="19" cy="19" r="11" fill={BRAND_COLORS[0]} opacity="0.9" />
        <circle cx="29" cy="19" r="11" fill={BRAND_COLORS[1]} opacity="0.85" />
        <circle cx="24" cy="28" r="11" fill={BRAND_COLORS[2]} opacity="0.9" />
      </g>
      <circle cx="24" cy="23" r="3.2" fill={BRAND_COLORS[3]} />
    </svg>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-white shadow-sm",
        className,
      )}
      role="img"
      aria-label="Acme Flexo"
    >
      <MarkSvg className="h-full w-full p-[5px]" />
    </div>
  );
}

/** Full lockup (login / reset password). */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-4 select-none", className)} role="img" aria-label="Acme Flexo — Prepress Hub">
      <MarkSvg className="h-32 w-32" />
      <div className="text-center leading-tight">
        <div className="text-[28px] font-extrabold tracking-tight text-foreground">Acme Flexo</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          Prepress &amp; flexo plates
        </div>
      </div>
    </div>
  );
}
