import { cn } from "@repo/design-system/lib/utils";
import { Container, Eyebrow, SectionHeading } from "./container";

// Four steps, priced in the reader's time rather than described as a pipeline.
// The number that sells this is what step three costs, so step three is the one
// that gets the tint: it is the only new habit anybody has to pick up.
const STEPS: readonly {
  body: string;
  cost: string;
  habit?: boolean;
  title: string;
}[] = [
  {
    body: "Back at the car, on the train, walking to the next thing. Say the names, say the numbers, say the bit you would never sit down and type. Money and health details are stripped out on the way in.",
    cost: "90 seconds",
    title: "You talk",
  },
  {
    body: "By the time you are at your desk it has pulled out who was there, what they want, what they decided, and what just changed since last time.",
    cost: "None of your time",
    title: "It writes it up",
  },
  {
    body: "It shows you what it found, one line at a time. Yes, no, or fix the wording. This is the only new habit the whole thing asks of anyone.",
    cost: "About a minute a day",
    habit: true,
    title: "You tap yes",
  },
  {
    body: "Not just you. The colleague covering while you are away. The account lead who starts in March and is useful in week one instead of month three.",
    cost: "Forever, by anyone",
    title: "Everybody can ask",
  },
];

export function Effort() {
  return (
    <section className="border-mn-rule/70 border-b py-20 sm:py-24" id="how">
      <Container>
        <div className="max-w-2xl">
          <Eyebrow>What it costs you</Eyebrow>
          <SectionHeading className="mt-5">
            Ninety seconds of talking. That is the whole ask.
          </SectionHeading>
        </div>

        <ol className="mt-14 grid gap-px border border-mn-rule bg-mn-rule sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li
              className={cn(
                "flex flex-col p-6 lg:p-7",
                step.habit ? "bg-mn-stamp-tint" : "bg-mn-raised"
              )}
              key={step.title}
            >
              <span
                className={cn(
                  "font-medium font-mono text-[0.6875rem] uppercase tracking-[0.14em]",
                  step.habit ? "text-mn-stamp" : "text-mn-graphite"
                )}
              >
                {step.cost}
              </span>
              <h3
                className={cn(
                  "mt-5 font-bold font-cabinet text-[1.375rem] tracking-[-0.025em]",
                  step.habit ? "text-mn-stamp" : "text-mn-ink"
                )}
              >
                {step.title}
              </h3>
              <p className="mt-3 text-[0.9375rem] text-mn-ink-soft leading-[1.65]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        <p className="mt-10 max-w-2xl text-[1.0625rem] text-mn-ink leading-[1.7]">
          Ninety seconds in. Twenty minutes back, on every call after that one.
        </p>
      </Container>
    </section>
  );
}
