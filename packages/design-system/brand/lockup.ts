/**
 * The horizontal lockup: the bare mark, a gap, the wordmark — one ink, no tile.
 *
 * The proportions are lifted from the live header (`Wordmark` in
 * `apps/web/app/[locale]/components/mark.tsx`), which sets a 24px mark, a 10px
 * gap and 17px type. Expressing them as ratios of the mark keeps the rendered
 * asset and the rendered page the same logo rather than two near-misses.
 *
 * The wordmark is centred on its ink bounds. Its x-height band and its ink box
 * share a centre to within 0.6% here, so there is nothing to correct optically.
 */

import { INK, MARK_SIZE, markShapes, PAPER } from "./mark";
import {
  WORDMARK_HEIGHT,
  WORDMARK_PATH,
  WORDMARK_UPEM,
  WORDMARK_WIDTH,
} from "./wordmark";

const round = (value: number, places = 2): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** Header ratios, as multiples of the mark's size. */
const GAP = round(MARK_SIZE * (10 / 24));
const TYPE_SIZE = MARK_SIZE * (17 / 24);
/** Font units → lockup units. Rounded once, so every derived number agrees. */
export const TYPE_SCALE = round(TYPE_SIZE / WORDMARK_UPEM, 6);

export const WORD_X = round(MARK_SIZE + GAP);
export const WORD_Y = round((MARK_SIZE - WORDMARK_HEIGHT * TYPE_SCALE) / 2);

export const LOCKUP_WIDTH = round(WORD_X + WORDMARK_WIDTH * TYPE_SCALE);
export const LOCKUP_HEIGHT = MARK_SIZE;

interface LockupOptions {
  /**
   * Light ink for a dark surface. The lockup carries no background of its own,
   * so whoever places it decides which of the two it needs.
   */
  inverse?: boolean;
}

export const lockupSvg = ({ inverse = false }: LockupOptions = {}): string => {
  const ink = inverse ? PAPER : INK;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOCKUP_WIDTH} ${LOCKUP_HEIGHT}" width="${LOCKUP_WIDTH}" height="${LOCKUP_HEIGHT}">`,
    markShapes({ badge: false, ink, rounded: false }),
    `<g transform="translate(${WORD_X} ${WORD_Y}) scale(${TYPE_SCALE})">`,
    `<path d="${WORDMARK_PATH}" fill="${ink}"/>`,
    "</g>",
    "</svg>",
  ].join("");
};
