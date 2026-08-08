/**
 * Renders every memorynine brand asset: the app icons, and the SVG and PNG logo
 * files that have to live outside the React tree.
 *
 *   bun render-brand        # from packages/design-system
 *
 * `brand/mark.ts`, `brand/wordmark.ts` and `brand/lockup.ts` are the sources of
 * truth. Everything this writes is generated, including the SVGs under `brand/`
 * — committed so the logo can be opened in a design tool, or handed to someone
 * who asked for "the logo", without running anything.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { LOCKUP_HEIGHT, LOCKUP_WIDTH, lockupSvg } from "../brand/lockup";
import { INK, markSvg } from "../brand/mark";
import { wordmarkSvg } from "../brand/wordmark";

/** The mark's own viewBox, and the density sharp rasterises it at 1:1. */
const MARK_SIZE = 32;
const BASE_DENSITY = 72;

/**
 * The width the lockup is placed at in the transactional emails. The PNG is
 * rendered at twice that so it stays sharp on a retina screen.
 */
const EMAIL_LOCKUP_WIDTH = 160;

const repoRoot = join(import.meta.dirname, "..", "..", "..");

/**
 * sharp rasterises SVG at a DPI rather than a pixel size, so the density has to
 * be scaled to the target — otherwise the bitmap is an upscale of a 32px render.
 */
const rasterise = (svg: string, sourceWidth: number, targetWidth: number) =>
  sharp(Buffer.from(svg), {
    density: (BASE_DENSITY * targetWidth) / sourceWidth,
  });

const markPng = (size: number, { rounded }: { rounded: boolean }) =>
  rasterise(markSvg({ rounded }), MARK_SIZE, size)
    .resize(size, size)
    .png()
    .toBuffer();

/**
 * The lockup for email, where SVG is not a safe bet in any client. Flattened
 * onto white rather than left transparent: the clients that force their own
 * background turn a transparent PNG into a smear.
 */
const lockupPng = (width: number) =>
  rasterise(lockupSvg(), LOCKUP_WIDTH, width)
    .resize(width, Math.round((width * LOCKUP_HEIGHT) / LOCKUP_WIDTH))
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();

/**
 * A minimal ICO container: a 6-byte header, one 16-byte directory entry per
 * size, then the PNG payloads. PNG-in-ICO is understood by every browser that
 * still asks for `/favicon.ico`, so there is no BMP path to write.
 */
const ico = async (sizes: number[]) => {
  const images = await Promise.all(
    sizes.map((size) => markPng(size, { rounded: true }))
  );

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directorySize = 16 * images.length;
  let offset = header.length + directorySize;

  const entries = images.map((image, index) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(sizes[index] % 256, 0); // 256 is encoded as 0
    entry.writeUInt8(sizes[index] % 256, 1);
    entry.writeUInt8(0, 2); // palette size: none
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(image.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images]);
};

const write = async (relativePath: string, data: Buffer | string) => {
  const target = join(repoRoot, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
  return relativePath;
};

const main = async () => {
  const written = await Promise.all([
    // The brand files themselves.
    write("packages/design-system/brand/mark.svg", markSvg({ rounded: true })),
    write(
      "packages/design-system/brand/mark-logo.svg",
      markSvg({ badge: false, ink: INK, rounded: false })
    ),
    write(
      "packages/design-system/brand/wordmark.svg",
      wordmarkSvg({ ink: INK })
    ),
    write("packages/design-system/brand/lockup.svg", lockupSvg()),
    write(
      "packages/design-system/brand/lockup-inverse.svg",
      lockupSvg({ inverse: true })
    ),

    // Next.js metadata files: `icon.png` becomes the favicon, `apple-icon.png`
    // the iOS touch icon. `web` keeps `favicon.ico` so /favicon.ico stays a
    // real route for the crawlers that probe it directly.
    write("apps/app/app/icon.png", await markPng(32, { rounded: true })),
    write(
      "apps/app/app/apple-icon.png",
      await markPng(192, { rounded: false })
    ),
    write("apps/api/app/icon.png", await markPng(32, { rounded: true })),
    write(
      "apps/api/app/apple-icon.png",
      await markPng(192, { rounded: false })
    ),
    write("apps/web/app/favicon.ico", await ico([16, 32, 48])),
    write(
      "apps/web/app/apple-icon.png",
      await markPng(192, { rounded: false })
    ),

    // Served over HTTP for the transactional emails, which cannot reach into
    // the workspace for an SVG.
    write(
      "apps/web/public/brand/lockup.png",
      await lockupPng(EMAIL_LOCKUP_WIDTH * 2)
    ),
    write(
      "apps/web/public/brand/mark.png",
      await markPng(128, { rounded: true })
    ),
  ]);

  for (const path of written) {
    process.stdout.write(`wrote ${path}\n`);
  }
};

await main();
