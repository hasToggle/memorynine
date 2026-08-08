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
  "Every fact anchored to that person is deleted, and so is every fact that was consolidated out of those facts.",
  "Their name and addresses are redacted out of the source transcripts and out of the review trail, so the audit log survives without them in it.",
  "Audio left with nothing pointing at it is marked for deletion and the blobs go with it.",
];

export function Erasure() {
  return (
    <section className="border-mn-rule/70 border-b py-20 sm:py-24">
      <Container>
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <Eyebrow>Erasure · GDPR Art. 17</Eyebrow>
            <SectionHeading className="mt-5">
              One person, one click, the whole trail.
            </SectionHeading>
            <p className="mt-6 text-[1rem] text-mn-ink-soft leading-[1.7]">
              A memory that keeps everything forever is a liability with a
              search box. When someone asks to be forgotten, you open their row
              and erase them.
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
              It is irreversible, and it is supposed to be.
            </p>
          </div>

          <div className="self-start rounded-lg border border-mn-rule bg-mn-raised p-6">
            <p className="font-medium font-mono text-[0.625rem] text-mn-graphite uppercase tracking-[0.18em]">
              Sources, after erasing Anna Bergmann
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
              The memos stay, because the rest of the meeting still happened.
              The person is gone from them.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
