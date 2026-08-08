/**
 * The logo, as React, in `currentColor`.
 *
 * Same geometry as `mark.ts` and `lockup.ts` — the constants are imported
 * rather than copied, so the rendered component and the exported SVG files
 * cannot drift into being two slightly different logos.
 *
 * Everything paints in `currentColor`, so a caller sets the colour the way it
 * sets any other text colour and both themes work without a variant prop. The
 * wordmark is the committed outline, not live type: no consumer has to load
 * Cabinet Grotesk for the logo to be the logo.
 */

import { cn } from "../lib/utils";
import {
  LOCKUP_HEIGHT,
  LOCKUP_WIDTH,
  TYPE_SCALE,
  WORD_X,
  WORD_Y,
} from "./lockup";
import {
  ACCENT_CELLS,
  BARE_MUTED_OPACITY,
  CELL,
  CELL_RADIUS,
  CENTRES,
  CONNECTOR_WIDTH,
  MARK_SIZE,
} from "./mark";
import { WORDMARK_PATH } from "./wordmark";

const MarkShapes = () => (
  <>
    {/* Drawn beneath the cells so the three lit ones read as one line. */}
    <polyline
      fill="none"
      points={CENTRES.map((c, index) => `${c},${CENTRES[2 - index]}`).join(" ")}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={CONNECTOR_WIDTH}
    />
    {CENTRES.flatMap((cx, col) =>
      CENTRES.map((cy, row) => (
        <rect
          fill="currentColor"
          fillOpacity={
            ACCENT_CELLS.has(`${col},${row}`) ? 1 : BARE_MUTED_OPACITY
          }
          height={CELL}
          key={`${cx},${cy}`}
          rx={CELL_RADIUS}
          width={CELL}
          x={cx - CELL / 2}
          y={cy - CELL / 2}
        />
      ))
    )}
  </>
);

/** The lattice alone — nine cells, six muted, three lit on the diagonal. */
export const Mark = ({ className }: { readonly className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`}
  >
    <MarkShapes />
  </svg>
);

/**
 * Mark and wordmark together. Give it a height and a text colour; it carries
 * its own aspect ratio.
 */
export const Lockup = ({
  className,
  title = "memorynine",
}: {
  readonly className?: string;
  readonly title?: string;
}) => (
  <svg
    className={cn("w-auto", className)}
    fill="none"
    role="img"
    viewBox={`0 0 ${LOCKUP_WIDTH} ${LOCKUP_HEIGHT}`}
  >
    <title>{title}</title>
    <MarkShapes />
    <g transform={`translate(${WORD_X} ${WORD_Y}) scale(${TYPE_SCALE})`}>
      <path d={WORDMARK_PATH} fill="currentColor" />
    </g>
  </svg>
);
