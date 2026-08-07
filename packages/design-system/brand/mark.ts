/**
 * The memorynine mark — the single source of truth for every app icon.
 *
 * Nine cells in a 3×3 lattice: the memory grid, and the name. Six sit muted —
 * raw captures, not yet through review. Three light up along a rising diagonal
 * and are joined into one stroke: the through-line of confirmed knowledge
 * traced across the grid, which is what the human review gate produces.
 *
 * Monochrome on purpose. The colours below are `--foreground` and
 * `--primary-foreground` from `styles/globals.css`, whose core tokens are all
 * chroma 0; MUTED is FOREGROUND at ~28% pre-composited over the badge, because
 * flat fills survive downscaling to 16px where real alpha turns to mush.
 *
 * The mark is designed to degrade: at 256px you read nine cells, at 32px a lit
 * line through a dark grid, at 16px a clean diagonal. Nine separate elements
 * cannot survive a favicon, so the accent carries the small sizes alone.
 */

/** oklch(0.145 0 0) — the badge. */
const BACKGROUND = "#0a0a0a";
/** oklch(0.985 0 0) — the confirmed line. */
const ACCENT = "#fafafa";
/** ACCENT at ~28% over BACKGROUND — the unreviewed field. */
const MUTED = "#4a4a4a";

/** Everything below is expressed on a 32-unit grid. */
const SIZE = 32;
const BADGE_RADIUS = 7;
const CELL = 5.6;
const CELL_RADIUS = 1.6;
const CONNECTOR_WIDTH = 2.2;
/** Cell centres: a 5-unit inset either side leaves 5.6/2.6/5.6/2.6/5.6. */
const CENTRES = [8, 16, 24] as const;
/** Column/row pairs on the rising diagonal, bottom-left to top-right. */
const ACCENT_CELLS = new Set(["0,2", "1,1", "2,0"]);

interface MarkOptions {
  /**
   * Browsers paint a favicon exactly as given, so it carries its own corners.
   * iOS applies a squircle mask to the touch icon and clips anything already
   * rounded, so that one ships square.
   */
  rounded: boolean;
}

export const markSvg = ({ rounded }: MarkOptions): string => {
  const badge = rounded
    ? `<rect width="${SIZE}" height="${SIZE}" rx="${BADGE_RADIUS}" fill="${BACKGROUND}"/>`
    : `<rect width="${SIZE}" height="${SIZE}" fill="${BACKGROUND}"/>`;

  const connector = CENTRES.map((c, i) => `${c},${CENTRES[2 - i]}`).join(" ");

  const cells = CENTRES.flatMap((cx, col) =>
    CENTRES.map((cy, row) => {
      const fill = ACCENT_CELLS.has(`${col},${row}`) ? ACCENT : MUTED;
      const offset = CELL / 2;
      return `<rect x="${cx - offset}" y="${cy - offset}" width="${CELL}" height="${CELL}" rx="${CELL_RADIUS}" fill="${fill}"/>`;
    })
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">`,
    badge,
    // Drawn beneath the cells so the three accents read as one continuous line.
    `<polyline points="${connector}" fill="none" stroke="${ACCENT}" stroke-width="${CONNECTOR_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`,
    ...cells,
    "</svg>",
  ].join("");
};
