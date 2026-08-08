import { cn } from "@repo/design-system/lib/utils";
import { Container, Eyebrow, SectionHeading } from "./container";
import { Mark } from "./mark";

const QUESTIONS = [
  "Who vouched for it",
  "How an answer may use it",
  "What happens on a conflict",
  "What happens when it changes",
] as const;

const TIERS: readonly {
  answers: readonly string[];
  kind: "fact" | "source";
  title: string;
}[] = [
  {
    answers: [
      "A person on your team, by name, on a date you can read.",
      "Stated plainly, as something the company knows.",
      "Both facts are shown and the disagreement is named. Nothing is settled quietly.",
      "Superseded — keeping the date you stopped believing it apart from the date it stopped being true.",
    ],
    kind: "fact",
    title: "Confirmed fact",
  },
  {
    answers: [
      "Nobody. It is what somebody said, verbatim.",
      "Quoted and attributed, always marked unreviewed.",
      "The confirmed fact wins, and the answer still says the newer material disagrees.",
      "Nothing. It is a record of a moment, and moments do not update.",
    ],
    kind: "source",
    title: "Raw source",
  },
];

export function Gate() {
  return (
    <section className="border-mn-rule/70 border-b py-20 sm:py-24" id="gate">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-20">
          <div>
            <Eyebrow>The review gate</Eyebrow>
            <SectionHeading className="mt-5">
              Two tiers. Never blurred.
            </SectionHeading>
            <p className="mt-6 text-[1rem] text-mn-ink-soft leading-[1.7]">
              Everything your team captures is searchable straight away. Only
              what a human confirmed counts as something the company knows. The
              assistant is built so it cannot quietly promote one into the
              other.
            </p>

            <figure className="mt-10 flex items-center gap-5">
              <Mark className="size-16 shrink-0" tone="stamp" />
              <figcaption className="text-[0.8125rem] text-mn-graphite leading-[1.6]">
                Nine cells. Six captured, three confirmed, one line drawn
                through them. That is the mark, and it is also the product.
              </figcaption>
            </figure>
          </div>

          <div className="grid gap-px border border-mn-rule bg-mn-rule sm:grid-cols-2">
            {TIERS.map((tier) => (
              <div className="bg-mn-raised p-6 lg:p-7" key={tier.kind}>
                <h3
                  className={cn(
                    "inline-flex items-center gap-2 font-medium font-mono text-[0.6875rem] uppercase tracking-[0.16em]",
                    tier.kind === "fact" ? "text-mn-stamp" : "text-mn-ochre"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 rounded-[1px]",
                      tier.kind === "fact"
                        ? "bg-mn-stamp"
                        : "border border-mn-ochre"
                    )}
                  />
                  {tier.title}
                </h3>

                <dl className="mt-5">
                  {tier.answers.map((answer, index) => (
                    <div
                      className="border-mn-rule border-t py-4 first:border-t-0 first:pt-0"
                      key={QUESTIONS[index]}
                    >
                      <dt className="font-medium font-mono text-[0.6875rem] text-mn-graphite uppercase tracking-[0.08em]">
                        {QUESTIONS[index]}
                      </dt>
                      <dd className="mt-2 text-[0.9375rem] text-mn-ink leading-[1.6]">
                        {answer}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
