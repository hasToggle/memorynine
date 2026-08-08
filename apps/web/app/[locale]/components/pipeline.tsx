import { cn } from "@repo/design-system/lib/utils";
import { Container, Eyebrow, SectionHeading } from "./container";

// A real sequence — a source cannot skip a stage — so the numbering carries
// information rather than decorating the list. Stage 03 is tinted because it
// is the one a person does, which is the claim the heading makes.
const STAGES: readonly {
  body: string;
  human?: boolean;
  note: string;
  step: string;
  title: string;
}[] = [
  {
    body: "Record a memo on the walk back to the car, paste a note, or forward the mail thread. Names and details are the point, so say them out loud.",
    note: "Financial and medical details are redacted while it transcribes.",
    step: "01",
    title: "Capture",
  },
  {
    body: "Extraction reads the source and drafts the people, companies, engagements and facts it found — each one anchored to something and dated.",
    note: "Usually ready in seconds; a sweep every five minutes catches the rest.",
    step: "02",
    title: "Propose",
  },
  {
    body: "You confirm, edit or discard every draft. Discarded drafts stay discarded — the same suggestion will not come back on the next run.",
    human: true,
    note: "This is the only door into the record. There is no other one.",
    step: "03",
    title: "Confirm",
  },
  {
    body: "Ask in plain language. Answers cite the fact or the raw source behind every claim, and never let the two pass for each other.",
    note: "Raw sources are searchable the moment they land, marked unconfirmed.",
    step: "04",
    title: "Ask",
  },
];

export function Pipeline() {
  return (
    <section className="border-mn-rule/70 border-b py-20 sm:py-24" id="how">
      <Container>
        <div className="max-w-2xl">
          <Eyebrow>How a fact gets in</Eyebrow>
          <SectionHeading className="mt-5">
            Four stages, and one of them is a person.
          </SectionHeading>
        </div>

        <ol className="mt-14 grid gap-px border border-mn-rule bg-mn-rule sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map((stage) => (
            <li
              className={cn(
                "flex flex-col p-6 lg:p-7",
                stage.human ? "bg-mn-stamp-tint" : "bg-mn-raised"
              )}
              key={stage.step}
            >
              <span
                className={cn(
                  "font-medium font-mono text-[0.6875rem] tracking-[0.18em]",
                  stage.human ? "text-mn-stamp" : "text-mn-graphite"
                )}
              >
                {stage.step}
                {stage.human ? " · you" : null}
              </span>
              <h3
                className={cn(
                  "mt-5 font-bold font-cabinet text-[1.375rem] tracking-[-0.025em]",
                  stage.human ? "text-mn-stamp" : "text-mn-ink"
                )}
              >
                {stage.title}
              </h3>
              <p className="mt-3 text-[0.9375rem] text-mn-ink-soft leading-[1.65]">
                {stage.body}
              </p>
              <p
                className={cn(
                  "mt-auto border-t pt-4 text-[0.8125rem] leading-[1.55]",
                  stage.human
                    ? "border-mn-stamp/25 text-mn-stamp"
                    : "border-mn-rule text-mn-graphite"
                )}
              >
                {stage.note}
              </p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
