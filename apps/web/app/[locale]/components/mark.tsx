import { cn } from "@repo/design-system/lib/utils";

// The same geometry as the app icon (packages/design-system/brand/mark.ts):
// nine cells in a 3x3 lattice, six muted, three lit along a rising diagonal
// and joined into one stroke. Six captured, three confirmed — the review gate,
// drawn. Reproduced here rather than imported because the icon module emits an
// SVG string for the rasteriser, and the page needs themable elements.
const CENTRES = [8, 16, 24] as const;
const CELL = 5.6;
const CELL_RADIUS = 1.6;
/** Cell centres on the rising diagonal — the same points the stroke joins. */
const ACCENT_CELLS = new Set(["8,24", "16,16", "24,8"]);

// Written out rather than composed, so Tailwind's scanner sees every class.
const TONES = {
  ink: {
    accent: "fill-mn-ink",
    muted: "fill-mn-graphite/40",
    stroke: "stroke-mn-ink",
  },
  // The two tones the brand SVGs ship in: ink for light surfaces, paper for
  // dark ones. See packages/design-system/brand.
  paper: {
    accent: "fill-mn-paper",
    muted: "fill-mn-paper/25",
    stroke: "stroke-mn-paper",
  },
} as const;

interface MarkProperties {
  readonly className?: string;
  readonly tone?: keyof typeof TONES;
}

export function Mark({ className, tone = "ink" }: MarkProperties) {
  const { accent, muted, stroke } = TONES[tone];

  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 32 32">
      <polyline
        className={cn("fill-none", stroke)}
        points="8,24 16,16 24,8"
        strokeLinecap="round"
        strokeWidth={2.2}
      />
      {CENTRES.flatMap((cx) =>
        CENTRES.map((cy) => (
          <rect
            className={ACCENT_CELLS.has(`${cx},${cy}`) ? accent : muted}
            height={CELL}
            key={`${cx},${cy}`}
            rx={CELL_RADIUS}
            width={CELL}
            x={cx - CELL / 2}
            y={cy - CELL / 2}
          />
        ))
      )}
    </svg>
  );
}

export function Wordmark({
  className,
  tone = "ink",
}: {
  readonly className?: string;
  readonly tone?: keyof typeof TONES;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Mark className="size-6 shrink-0" tone={tone} />
      <span className="font-cabinet font-extrabold text-[1.0625rem] tracking-[-0.03em]">
        memorynine
      </span>
    </span>
  );
}
