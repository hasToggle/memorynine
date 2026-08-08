import Link from "next/link";
import { env } from "@/env";
import { Container, Eyebrow } from "./container";
import { Trace } from "./trace";

export function Hero() {
  return (
    <section className="border-mn-rule/70 border-b">
      <Container className="grid gap-14 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16 lg:py-24">
        <div className="max-w-2xl">
          <Eyebrow>
            Client memory for teams who talk more than they type
          </Eyebrow>

          <h1 className="mt-6 font-cabinet font-extrabold text-[2.75rem] text-mn-ink leading-[0.98] tracking-[-0.04em] sm:text-[3.75rem] lg:text-[4.25rem]">
            Nothing becomes knowledge until a human says so.
          </h1>

          <p className="mt-7 max-w-xl text-[1.0625rem] text-mn-ink-soft leading-[1.7] sm:text-[1.125rem]">
            memorynine turns the calls, notes and forwarded mail your team
            already produces into a memory anyone can question. Every answer
            carries the line it came from — and everything in the record got
            there because one of you read it and said yes.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link
              className="rounded-[5px] bg-mn-ink px-5 py-2.5 font-medium text-[0.9375rem] text-mn-paper transition-colors hover:bg-mn-stamp focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-2"
              href={env.NEXT_PUBLIC_APP_URL}
            >
              Open your workspace
            </Link>
            <a
              className="rounded-sm px-1 py-2.5 font-medium text-[0.9375rem] text-mn-ink underline decoration-mn-rule underline-offset-[5px] transition-colors hover:decoration-mn-ink focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-2"
              href="#access"
            >
              Request early access
            </a>
          </div>

          <p className="mt-8 max-w-md text-[0.8125rem] text-mn-graphite leading-[1.6]">
            Built for German-speaking client work: it answers in the language
            you asked, and leaves German quotes in German.
          </p>
        </div>

        <div className="lg:pt-12">
          <Trace />
          <p className="mt-4 text-[0.8125rem] text-mn-graphite leading-[1.6]">
            Pick a citation to walk it back to the moment somebody said it.
          </p>
        </div>
      </Container>
    </section>
  );
}
