/**
 * Rasterises the memorynine mark into every app's icon files.
 *
 *   bun render-icons        # from packages/design-system
 *
 * `brand/mark.ts` is the source of truth; everything this writes is generated,
 * including `brand/mark.svg` (committed so the mark can be opened in a design
 * tool without running anything).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { markSvg } from "../brand/mark";

/** The mark's own viewBox, and the density sharp rasterises it at 1:1. */
const MARK_SIZE = 32;
const BASE_DENSITY = 72;

const repoRoot = join(import.meta.dirname, "..", "..", "..");

const png = (size: number, { rounded }: { rounded: boolean }) =>
  sharp(Buffer.from(markSvg({ rounded })), {
    // Rasterise at the target resolution rather than upscaling a 32px bitmap.
    density: (BASE_DENSITY * size) / MARK_SIZE,
  })
    .resize(size, size)
    .png()
    .toBuffer();

/**
 * A minimal ICO container: a 6-byte header, one 16-byte directory entry per
 * size, then the PNG payloads. PNG-in-ICO is understood by every browser that
 * still asks for `/favicon.ico`, so there is no BMP path to write.
 */
const ico = async (sizes: number[]) => {
  const images = await Promise.all(
    sizes.map((size) => png(size, { rounded: true }))
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
    write("packages/design-system/brand/mark.svg", markSvg({ rounded: true })),

    // Next.js metadata files: `icon.png` becomes the favicon, `apple-icon.png`
    // the iOS touch icon. `web` keeps `favicon.ico` so /favicon.ico stays a
    // real route for the crawlers that probe it directly.
    write("apps/app/app/icon.png", await png(32, { rounded: true })),
    write("apps/app/app/apple-icon.png", await png(192, { rounded: false })),
    write("apps/api/app/icon.png", await png(32, { rounded: true })),
    write("apps/api/app/apple-icon.png", await png(192, { rounded: false })),
    write("apps/web/app/favicon.ico", await ico([16, 32, 48])),
    write("apps/web/app/apple-icon.png", await png(192, { rounded: false })),
  ]);

  for (const path of written) {
    process.stdout.write(`wrote ${path}\n`);
  }
};

await main();
