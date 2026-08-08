# Brand assets

Everything here is generated. `bun render-brand` (from `packages/design-system`)
rewrites the SVGs in this folder, every app icon, and the PNGs under
`apps/web/public/brand/`. The `.ts` files are the sources of truth; the `.svg`
files are committed so the logo can be opened in a design tool or handed to
someone without running a build.

## What is what

| File                 | Use                                                            |
| -------------------- | -------------------------------------------------------------- |
| `mark.svg`           | App icon. Carries its own dark tile, because a favicon lands on a background nobody controls. |
| `mark-logo.svg`      | The bare mark, single ink, no tile. For surfaces you already chose. |
| `wordmark.svg`       | "memorynine" alone, outlined.                                   |
| `lockup.svg`         | Mark + wordmark, dark ink. The default logo.                    |
| `lockup-inverse.svg` | The same, light ink, for dark surfaces.                         |

Rasters: `apps/web/public/brand/lockup.png` (email — 2× its placed width,
flattened onto white) and `apps/web/public/brand/mark.png` (128px square).

The mark is drawn from geometry in `mark.ts`, so it needs nothing external. Nine
cells, six muted and three lit along a rising diagonal: captured versus
confirmed, which is the product.

## Regenerating the wordmark outlines

`wordmark.ts` holds "memorynine" as a path rather than a `<text>` element, so
email clients and rasterisers do not fall back to a system face. Nothing at build
time reaches for a font CDN — the path is committed.

You only need this if the typeface or the tracking changes. It uses HarfBuzz for
shaping and fontTools for the outlines, both Python; neither is a repo
dependency, because this runs roughly never.

```bash
pip install fonttools brotli uharfbuzz

# Cabinet Grotesk Extrabold, from the same CDN the marketing layout loads.
curl -s "https://api.fontshare.com/v2/css?f%5B%5D=cabinet-grotesk@800" \
  | grep -o "//cdn.fontshare.com/[^']*\.woff2" | head -1 \
  | sed 's|^|https:|' | xargs curl -s -o cg800.woff2

# HarfBuzz does not read woff2 — decompress it first.
python3 -c "from fontTools.ttLib import TTFont; f=TTFont('cg800.woff2'); f.flavor=None; f.save('cg800.ttf')"
```

Then shape `memorynine` at `-0.03em` tracking (the same tracking the `Wordmark`
component sets), draw each glyph through a `TransformPen` flipped in Y and
offset by the pen position, and normalise the result so the path starts at 0,0.
Copy out the ink bounds as `WORDMARK_WIDTH` / `WORDMARK_HEIGHT`, the distance
from the top of that box to the baseline as `WORDMARK_BASELINE`, and split the
path at fixed offsets — **not** on whitespace, since the separators inside path
data are significant and the chunks have to concatenate back byte for byte.

Cabinet Grotesk is licensed under the ITF Free Font License, which permits
commercial use and converting glyphs to outlines for a logo.
