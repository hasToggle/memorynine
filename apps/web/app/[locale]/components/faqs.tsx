import Link from "next/link";
import { Container, Eyebrow, SectionHeading } from "./container";

const FAQS: readonly {
  answer: string;
  link?: { href: string; label: string };
  question: string;
}[] = [
  {
    answer:
      "Keep it. A CRM holds the fields somebody decided to have — stage, value, next step. It has no idea that Anna will not take a meeting before ten, or that their finance lead quietly hated the phased option. That is the stuff that wins the second meeting, and it is exactly the stuff nobody types into a form.",
    question: "We already have a CRM.",
  },
  {
    answer:
      "They do not have to open one. The ask is talking into their phone for ninety seconds on the way back, which most people already do. The only new habit is one person spending a minute a day tapping yes — and if that minute stops happening you still keep every recording, searchable.",
    question: "My team will not adopt another tool.",
  },
  {
    answer:
      "Yes, and it does not quietly translate. Ask in German and you get German back, with your client's words left exactly as they said them — and the same holds for whatever language your team works in. A paraphrase is somebody's interpretation; a quote is what you can repeat.",
    question: "Does it work in German?",
  },
  {
    answer:
      "We are setting the first workspaces up by hand, so pricing is still a conversation rather than a table. Ask on the call and you will get a straight number, not a range.",
    question: "What does it cost?",
  },
  {
    answer:
      "The EU. Recordings, transcripts and the knowledge base all sit in EU regions, and the transcription service only ever receives a link that expires. Money and health details are stripped out before anything else reads them, and every read is scoped to your workspace. The language models we call retain nothing and train on nothing — though a request can fail over to a provider outside the EU when one goes down, under those same terms.",
    link: {
      href: "/legal/privacy",
      label: "The full picture, subprocessors included",
    },
    question: "Where does our client data actually go?",
  },
  {
    answer:
      "Record a memo after your next call with one client. Spend a minute confirming what it found. Then, before the following call with them, ask it what you need to know — and notice whether you still open Slack. That is the entire evaluation.",
    question: "How do we know it works for us?",
  },
];

export function Faqs() {
  return (
    <section className="py-20 sm:py-24" id="faq">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-20">
          <div>
            <Eyebrow>Questions</Eyebrow>
            <SectionHeading className="mt-5">
              The ones you were about to ask.
            </SectionHeading>
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
                  {faq.link ? (
                    <>
                      {" "}
                      <Link
                        className="rounded-sm text-mn-stamp underline decoration-mn-stamp/35 underline-offset-[3px] transition-colors hover:decoration-mn-stamp focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-2"
                        href={faq.link.href}
                      >
                        {faq.link.label}
                      </Link>
                      .
                    </>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}
