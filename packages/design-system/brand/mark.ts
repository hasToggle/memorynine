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
 *
 * Two forms come out of here. The badged one is the app icon: it brings its
 * own dark tile because a favicon lands on a background nobody controls. The
 * bare one is the logo mark, drawn in a single ink on a surface you already
 * chose — that is the one the lockup uses.
 */

/** oklch(0.145 0 0) — the badge, and the brand's ink everywhere else. */
export const INK = "#0a0a0a";
/** oklch(0.985 0 0) — the confirmed line, and the ink for dark surfaces. */
export const PAPER = "#fafafa";
/** PAPER at ~28% over INK — the unreviewed field. */
const MUTED = "#4a4a4a";
/** The bare mark has no tile to pre-composite against, so it uses real alpha. */
export const BARE_MUTED_OPACITY = 0.3;

/** Everything below is expressed on a 32-unit grid. */
export const MARK_SIZE = 32;
const BADGE_RADIUS = 7;
export const CELL = 5.6;
export const CELL_RADIUS = 1.6;
export const CONNECTOR_WIDTH = 2.2;
/** Cell centres: a 5-unit inset either side leaves 5.6/2.6/5.6/2.6/5.6. */
export const CENTRES = [8, 16, 24] as const;
/** Column/row pairs on the rising diagonal, bottom-left to top-right. */
export const ACCENT_CELLS = new Set(["0,2", "1,1", "2,0"]);

interface MarkOptions {
  /**
   * The dark tile behind the lattice. On for icons, which land on backgrounds
   * nobody controls; off for the logo mark, which is drawn in `ink` alone.
   */
  badge?: boolean;
  /** Single ink for the bare mark. Ignored when the badge is on. */
  ink?: string;
  /**
   * Browsers paint a favicon exactly as given, so it carries its own corners.
   * iOS applies a squircle mask to the touch icon and clips anything already
   * rounded, so that one ships square.
   */
  rounded: boolean;
}

/** The lattice on its own, for embedding in a lockup at an arbitrary offset. */
export const markShapes = ({
  badge = true,
  ink = INK,
  rounded,
}: MarkOptions): string => {
  const accent = badge ? PAPER : ink;
  const tile = badge
    ? `<rect width="${MARK_SIZE}" height="${MARK_SIZE}"${rounded ? ` rx="${BADGE_RADIUS}"` : ""} fill="${INK}"/>`
    : "";

  const connector = CENTRES.map((c, i) => `${c},${CENTRES[2 - i]}`).join(" ");

  const cells = CENTRES.flatMap((cx, col) =>
    CENTRES.map((cy, row) => {
      const lit = ACCENT_CELLS.has(`${col},${row}`);
      // Badged: the muted cells are pre-composited, so they survive a 16px
      // downscale. Bare: there is no tile to composite against, so they are
      // the same ink at real alpha.
      const dimmed = !lit && badge;
      let fill = ink;
      if (lit) {
        fill = accent;
      } else if (dimmed) {
        fill = MUTED;
      }
      const opacity =
        lit || dimmed ? "" : ` fill-opacity="${BARE_MUTED_OPACITY}"`;
      const offset = CELL / 2;
      return `<rect x="${cx - offset}" y="${cy - offset}" width="${CELL}" height="${CELL}" rx="${CELL_RADIUS}" fill="${fill}"${opacity}/>`;
    })
  );

  return [
    tile,
    // Drawn beneath the cells so the three accents read as one continuous line.
    `<polyline points="${connector}" fill="none" stroke="${accent}" stroke-width="${CONNECTOR_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`,
    ...cells,
  ].join("");
};

export const markSvg = (options: MarkOptions): string =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_SIZE} ${MARK_SIZE}" width="${MARK_SIZE}" height="${MARK_SIZE}">`,
    markShapes(options),
    "</svg>",
  ].join("");
