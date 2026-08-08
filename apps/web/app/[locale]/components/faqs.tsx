import { Container, Eyebrow, SectionHeading } from "./container";

const FAQS: readonly { answer: string; question: string }[] = [
  {
    answer:
      "No. A CRM holds the fields somebody decided to have — stage, value, next step. memorynine holds what people actually said, in the words they said it in, anchored to the person, the company or the engagement it was about. The two answer different questions, and only one of them survives a colleague leaving.",
    question: "Does this replace our CRM?",
  },
  {
    answer:
      "Yes. It answers in the language the question was asked in, and it keeps German fact text in German rather than translating it quietly — a paraphrase is a claim, and a quote is evidence.",
    question: "Does it work in German?",
  },
  {
    answer:
      "Then you have an archive, not a memory. Raw sources are searchable the moment they land, so nothing is lost, but the assistant marks everything it takes from them as unreviewed and attributes it to the recording. Review is what turns a pile of memos into something the company can state.",
    question: "What if nobody on the team ever reviews anything?",
  },
  {
    answer:
      "Audio goes to a private blob store; the transcription provider only ever receives a short-lived signed link, never a stored URL. Financial and medical details are redacted during transcription, before extraction sees them. Data sits in MongoDB Atlas, one database per deployment, scoped to your organisation on every read.",
    question: "Where does the audio and the text actually go?",
  },
  {
    answer:
      "No. Erasure deletes the facts, deletes what was consolidated out of them, redacts the person out of the transcripts and the review trail, and marks the orphaned audio for deletion. There is no undo, because an undo would mean we kept a copy.",
    question: "Can I get a fact back after erasing someone?",
  },
];

export function Faqs() {
  return (
    <section className="py-20 sm:py-24" id="faq">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-20">
          <div>
            <Eyebrow>Questions</Eyebrow>
            <SectionHeading className="mt-5">Before you ask.</SectionHeading>
          </div>

          <dl>
            {FAQS.map((faq) => (
              <div
                className="border-mn-rule border-t py-7 first:border-t-0 first:pt-0 last:pb-0"
                key={faq.question}
              >
                <dt className="font-bold font-cabinet text-[1.1875rem] text-mn-ink leading-[1.3] tracking-[-0.02em]">
                  {faq.question}
                </dt>
                <dd className="mt-3 max-w-2xl text-[0.9375rem] text-mn-ink-soft leading-[1.7]">
                  {faq.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}
