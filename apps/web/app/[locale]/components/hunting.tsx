import { Container, Eyebrow, SectionHeading } from "./container";
import { TimeLost } from "./time-lost";

const MOMENTS: readonly { body: string; title: string }[] = [
  {
    body: "Scrolling back through Slack, opening the last proposal, skimming a mail thread from March. You find most of it. You walk in half-sure about the rest.",
    title: "The twenty minutes before the call",
  },
  {
    body: "Now it costs two people's afternoon instead of one person's. And the answer was in a memo Marie recorded in April, which nobody else has heard.",
    title: "“Quick question — what did they say about pricing?”",
  },
  {
    body: "Four years of knowing this client is in her head. The handover is three bullet points and a folder of PDFs. The next call is on Thursday.",
    title: "The Monday your account lead resigns",
  },
];

export function Hunting() {
  return (
    <section className="border-mn-rule/70 border-b py-20 sm:py-24" id="hunting">
      <Container>
        <div className="max-w-2xl">
          <Eyebrow>The part nobody budgets for</Eyebrow>
          <SectionHeading className="mt-5">
            You already know all of this. That&apos;s the problem.
          </SectionHeading>
          <p className="mt-6 text-[1.0625rem] text-mn-ink-soft leading-[1.7]">
            Nothing is lost. It is in somebody&apos;s inbox, somebody&apos;s
            head, and a call nobody wrote up. Finding it again is the job that
            eats the week.
          </p>
        </div>

        <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16">
          <ul className="flex flex-col gap-8">
            {MOMENTS.map((moment) => (
              <li className="border-mn-rule border-t pt-6" key={moment.title}>
                <h3 className="font-bold font-cabinet text-[1.375rem] text-mn-ink leading-[1.25] tracking-[-0.025em]">
                  {moment.title}
                </h3>
                <p className="mt-3 max-w-xl text-[0.9375rem] text-mn-ink-soft leading-[1.7]">
                  {moment.body}
                </p>
              </li>
            ))}
          </ul>

          <div className="lg:pt-6">
            <TimeLost />
            <p className="mt-5 text-[0.9375rem] text-mn-ink-soft leading-[1.7]">
              memorynine does not ask you to type more. It makes the ninety
              seconds you already spend talking do the work instead.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
