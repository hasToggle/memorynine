interface RhythmFigureProps {
  /** Intrinsic pixel height — CSS scales it, but the ratio stays reserved. */
  height?: number;
  /** Local asset path. The figure renders nothing until the asset exists. */
  src?: string;
  /** Intrinsic pixel width, paired with `height`. */
  width?: number;
}

export function RhythmFigure({ src, width, height }: RhythmFigureProps) {
  if (!(src && width && height)) {
    return null;
  }
  return (
    <figure className="mt-10 max-w-2xl">
      {/* biome-ignore lint/performance/noImgElement: static local asset, no optimization pipeline needed */}
      <img
        alt="A week of work: long flat stretches labeled thinking and planning, then narrow bands where twenty parallel sessions land at once"
        className="w-full rounded-lg border border-foreground/10"
        height={height}
        src={src}
        width={width}
      />
      <figcaption className="mt-2 font-mono text-muted-foreground text-xs">
        A normal week. Aesop had opinions about this race — he never considered
        the turtle might employ the rabbits. The mechanism is in room III.
      </figcaption>
    </figure>
  );
}
