import { Separator } from "@repo/design-system/components/ui/separator";
import { Container } from "./container";
import { HeroAsterisk } from "./hero-asterisk";
import { MarketingButton } from "./marketing-button";
import { MetaAside } from "./meta-aside";
import { Navbar } from "./navbar";

const CHAPTERS: readonly { href: string; label: string; n: string }[] = [
  { href: "#misconception-01", label: "Understanding", n: "01" },
  { href: "#misconception-02", label: "Defaults", n: "02" },
  { href: "#misconception-03", label: "Stance", n: "03" },
  { href: "#misconception-04", label: "Closure", n: "04" },
  { href: "#misconception-05", label: "Compliance", n: "05" },
];

export function Hero() {
  return (
    <div className="relative">
      <Container className="relative">
        <Navbar variant="light" />
        <div className="pt-20 pb-20 sm:pt-28 sm:pb-24 md:pt-36 md:pb-28">
          <p className="mb-8 max-w-2xl font-medium text-foreground/70 text-lg/7 sm:text-xl/8">
            Answers got cheap. Questions didn&apos;t.
          </p>
          <h1 className="max-w-4xl font-display font-medium text-6xl/[0.95] text-foreground tracking-tight sm:text-7xl/[0.95] md:text-8xl/[0.95]">
            AI makes you more.
            <HeroAsterisk />
          </h1>
          <p className="mt-8 max-w-xl font-medium text-muted-foreground text-xl/8 sm:text-2xl/9">
            For developers who&apos;d rather own the answer than borrow it.
          </p>
          <div className="mt-12 flex flex-col items-start gap-x-8 gap-y-4 sm:flex-row sm:flex-wrap sm:items-center">
            <MarketingButton href="#digest">
              Own what AI gave you, weekly
            </MarketingButton>
            <MetaAside className="sm:max-w-xs">
              You knew this was coming. We both did.
            </MetaAside>
          </div>
        </div>

        <Separator className="bg-foreground/10" />

        <section aria-labelledby="contents-heading" className="py-10 md:py-12">
          <h2
            className="mb-6 font-mono font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.2em]"
            id="contents-heading"
          >
            Contents
          </h2>
          <ol className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 md:grid-cols-4">
            {CHAPTERS.map((chapter) => (
              <li key={chapter.n}>
                <a
                  className="group flex items-baseline gap-3 text-foreground/70 transition-colors hover:text-foreground"
                  href={chapter.href}
                >
                  <span className="font-mono text-muted-foreground text-sm tabular-nums transition-colors group-hover:text-ht-cyan-700 dark:group-hover:text-ht-cyan-300">
                    {chapter.n}
                  </span>
                  <span className="font-display text-base tracking-tight">
                    {chapter.label}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <Separator className="bg-foreground/10" />

        <div className="pt-8 pb-16 md:hidden" id="hero-footnote-1">
          <MetaAside noMarker variant="block">
            <span aria-hidden="true" className="select-none opacity-70">
              *&nbsp;
            </span>
            AI doesn&apos;t make you better. It makes you bigger. It&apos;s an
            amplifier, not a compass — it has no opinion on whether you&apos;re
            pointed the right way.
          </MetaAside>
        </div>
      </Container>
    </div>
  );
}
