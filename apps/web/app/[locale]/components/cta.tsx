import Link from "next/link";
import { env } from "@/env";
import { Container, Eyebrow } from "./container";
import { EarlyAccess } from "./early-access";

export function Cta() {
  return (
    <section className="bg-mn-ink py-20 text-mn-paper sm:py-24" id="access">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-20">
          <div className="max-w-xl">
            <Eyebrow className="text-mn-paper/60">Start</Eyebrow>
            <h2 className="mt-5 font-cabinet font-extrabold text-[2rem] leading-[1.05] tracking-[-0.035em] sm:text-[2.75rem]">
              Pick one client. Try it for a week.
            </h2>
            <p className="mt-6 text-[1rem] text-mn-paper/65 leading-[1.7]">
              Record a memo after your next call with them. Spend the minute
              confirming what it found. Then, before the following call, ask it
              what you need to know — and notice whether you still open Slack.
            </p>
            <p className="mt-4 text-[1rem] text-mn-paper/65 leading-[1.7]">
              One client is enough to tell. You will know by Friday.
            </p>
            <div className="mt-9">
              <Link
                className="inline-flex rounded-[5px] bg-mn-paper px-5 py-2.5 font-medium text-[0.9375rem] text-mn-ink transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-mn-paper focus-visible:outline-offset-2"
                href={env.NEXT_PUBLIC_APP_URL}
              >
                Start with one client
              </Link>
            </div>
          </div>

          <div className="lg:pt-14">
            <p className="font-medium font-mono text-[0.6875rem] text-mn-paper/60 uppercase tracking-[0.18em]">
              Or have us set it up with you
            </p>
            <p className="mt-4 mb-6 text-[0.9375rem] text-mn-paper/65 leading-[1.65]">
              Half an hour, your own client, your questions about where the data
              sits. Leave your address and we will send a confirmation link.
            </p>
            <EarlyAccess />
          </div>
        </div>
      </Container>
    </section>
  );
}
