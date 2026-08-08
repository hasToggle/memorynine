import { Badge } from "@repo/design-system/components/ui/badge";
import { Container } from "../components/container";
import { MetaAside } from "../components/meta-aside";
import { Heading } from "../components/text";

interface MisconceptionWrapperProps {
  children: React.ReactNode;
  hook: string;
  id?: string;
  meta?: string;
  number: number;
  question?: React.ReactNode;
  reality?: string;
  tag?: string;
}

export function MisconceptionWrapper({
  children,
  hook,
  id,
  meta,
  number,
  question,
  reality,
  tag,
}: MisconceptionWrapperProps) {
  const chapterNumber = String(number).padStart(2, "0");

  return (
    <Container className="py-16 sm:py-20 md:py-24" id={id}>
      <div className="relative">
        <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[7rem_minmax(0,1fr)]">
          <div className="flex items-start justify-between gap-4 lg:block">
            <span className="font-mono text-4xl text-muted-foreground/40 tabular-nums leading-none tracking-tight lg:text-right lg:text-5xl">
              {chapterNumber}
            </span>
            {tag ? (
              <Badge
                className="border-ht-cyan-700/25 font-mono font-normal text-[0.65rem] text-ht-cyan-800/70 uppercase tracking-[0.2em] lg:mt-4 dark:border-ht-cyan-500/35 dark:text-ht-cyan-300/85"
                variant="outline"
              >
                {tag}
              </Badge>
            ) : null}
          </div>

          <div className="max-w-2xl">
            <p className="font-medium font-mono text-[0.7rem] text-red-600/80 uppercase tracking-[0.2em] dark:text-red-400/90">
              Misconception
            </p>

            <Heading
              as="h3"
              className="mt-3 text-3xl/[1.1] sm:text-4xl/[1.1] md:text-5xl/[1.05]"
            >
              {hook}
            </Heading>

            {question ? (
              <div className="mt-6">
                <p className="mb-1 font-medium font-mono text-[0.7rem] text-muted-foreground uppercase tracking-[0.2em]">
                  Question you didn&apos;t ask
                </p>
                <p className="text-balance font-display text-foreground/85 text-xl italic leading-7">
                  {question}
                </p>
              </div>
            ) : null}

            {meta ? <MetaAside className="mt-5">{meta}</MetaAside> : null}

            {reality ? (
              <div className="mt-10">
                <p className="mb-2 font-medium font-mono text-[0.7rem] text-ht-cyan-700 uppercase tracking-[0.2em] dark:text-ht-cyan-300/90">
                  Reality
                </p>
                <p className="text-balance text-foreground/80 text-lg leading-8">
                  {reality}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-12 lg:ml-12 lg:pl-28">{children}</div>
      </div>
    </Container>
  );
}
