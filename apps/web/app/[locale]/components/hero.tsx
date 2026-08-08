import Link from "next/link";
import { env } from "@/env";
import { Container, Eyebrow } from "./container";
import { Trace } from "./trace";

export function Hero() {
  return (
    <section className="border-mn-rule/70 border-b">
      <Container className="grid gap-14 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16 lg:py-24">
        <div className="max-w-2xl">
          <Eyebrow>For teams whose best work happens on calls</Eyebrow>

          <h1 className="mt-6 font-cabinet font-extrabold text-[2.75rem] text-mn-ink leading-[0.98] tracking-[-0.04em] sm:text-[3.75rem] lg:text-[4.25rem]">
            Walk into every client call already knowing.
          </h1>

          <p className="mt-7 max-w-xl text-[1.0625rem] text-mn-ink-soft leading-[1.7] sm:text-[1.125rem]">
            Talk for ninety seconds when you get back to the car. memorynine
            turns it into something your whole team can ask — so nobody digs
            through Slack before a meeting, and nobody&apos;s knowledge leaves
            when they do.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link
              className="rounded-[5px] bg-mn-ink px-5 py-2.5 font-medium text-[0.9375rem] text-mn-paper transition-colors hover:bg-mn-stamp focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-2"
              href={env.NEXT_PUBLIC_APP_URL}
            >
              Start with one client
            </Link>
            <a
              className="rounded-sm px-1 py-2.5 font-medium text-[0.9375rem] text-mn-ink underline decoration-mn-rule underline-offset-[5px] transition-colors hover:decoration-mn-ink focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-2"
              href="#access"
            >
              Or have us set it up with you
            </a>
          </div>

          <p className="mt-8 max-w-md text-[0.8125rem] text-mn-graphite leading-[1.6]">
            German, English, or whatever your client speaks. No CRM fields to
            fill in. Your first memo can be about a call you had this morning.
          </p>
        </div>

        <div className="lg:pt-12">
          <Trace />
          <p className="mt-4 text-[0.8125rem] text-mn-graphite leading-[1.6]">
            Every answer comes with receipts. Open one to see who said it, and
            whether anybody has checked.
          </p>
        </div>
      </Container>
    </section>
  );
}
