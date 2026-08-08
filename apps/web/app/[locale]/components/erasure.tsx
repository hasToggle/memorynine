import { Container, Eyebrow, SectionHeading } from "./container";

// Redaction is drawn, not described: this is what the transcript looks like
// after the cascade has run over it.
const TRANSCRIPT: readonly {
  after: readonly (string | number)[];
  before: string;
  meta: string;
}[] = [
  {
    after: ["…nach dem Termin mit ", 15, " von ", 9, " kurz notiert:"],
    before: "…nach dem Termin mit Anna Bergmann von Nordwind kurz notiert:",
    meta: "Voice memo · 13 Mar 2026",
  },
  {
    after: [
      "…schreib ",
      5,
      " am besten direkt an ",
      21,
      ", die liest morgens.",
    ],
    before:
      "…schreib ihr am besten direkt an a.bergmann@nordwind.de, die liest morgens.",
    meta: "Voice memo · 02 Apr 2026",
  },
  {
    after: ["Re: Angebot — Rückfrage von ", 15],
    before: "Re: Angebot — Rückfrage von Anna Bergmann",
    meta: "Forwarded mail · 01 Jul 2026",
  },
];

const CONSEQUENCES: readonly string[] = [
  "Everything you knew about them goes, including the bits that had already been folded into other notes.",
  "Their name and address come out of the transcripts and out of the history, so the record of the meeting survives without them in it.",
  "Recordings with nothing left pointing at them are deleted too.",
];

export function Erasure() {
  return (
    <section className="border-mn-rule/70 border-b py-20 sm:py-24">
      <Container>
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <Eyebrow>The awkward request · GDPR Art. 17</Eyebrow>
            <SectionHeading className="mt-5">
              &ldquo;Please delete everything you have on me.&rdquo;
            </SectionHeading>
            <p className="mt-6 text-[1rem] text-mn-ink-soft leading-[1.7]">
              Anywhere in the EU that is a legal right, and for most teams it is
              a fortnight of somebody chasing files. Here you open their row and
              press erase.
            </p>
            <ul className="mt-8 space-y-4">
              {CONSEQUENCES.map((consequence) => (
                <li
                  className="border-mn-rule border-l-2 pl-4 text-[0.9375rem] text-mn-ink-soft leading-[1.65]"
                  key={consequence}
                >
                  {consequence}
                </li>
              ))}
            </ul>
            <p className="mt-8 font-medium text-[0.9375rem] text-mn-ink leading-[1.65]">
              It cannot be undone, which is the point. You get to say yes to
              that request in a minute, instead of opening a project.
            </p>
          </div>

          <div className="self-start rounded-lg border border-mn-rule bg-mn-raised p-6">
            <p className="font-medium font-mono text-[0.625rem] text-mn-graphite uppercase tracking-[0.18em]">
              What is left afterwards
            </p>
            <ul className="mt-6 space-y-6">
              {TRANSCRIPT.map((line) => (
                <li key={line.before}>
                  <p className="font-medium font-mono text-[0.625rem] text-mn-graphite uppercase tracking-[0.1em]">
                    {line.meta}
                  </p>
                  <p
                    className="mt-2 text-[0.875rem] text-mn-ink leading-[1.9]"
                    lang="de"
                  >
                    {line.after.map((part, index) =>
                      typeof part === "string" ? (
                        // biome-ignore lint/suspicious/noArrayIndexKey: fragments of one fixed sentence, never reordered
                        <span key={index}>{part}</span>
                      ) : (
                        <span
                          aria-label="redacted"
                          className="mx-px inline-block h-[0.85em] translate-y-[0.1em] rounded-[1px] bg-mn-ink"
                          // biome-ignore lint/suspicious/noArrayIndexKey: fragments of one fixed sentence, never reordered
                          key={index}
                          role="img"
                          style={{ width: `${part * 0.5}em` }}
                        />
                      )
                    )}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-8 border-mn-rule border-t pt-5 text-[0.8125rem] text-mn-graphite leading-[1.6]">
              The memos stay, because the rest of those meetings still happened
              and you still need them. She is gone from them.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
