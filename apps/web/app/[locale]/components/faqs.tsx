import { Separator } from "@repo/design-system/components/ui/separator";
import { Container } from "./container";
import { MetaAside } from "./meta-aside";
import { Heading, Subheading } from "./text";

const faqs: {
  answer: string;
  meta?: string;
  question: string;
}[] = [
  {
    answer:
      "It does. Frequently. With absolute confidence. That\u2019s exactly why you need to understand the fundamentals. AI is powerful but not infallible. We teach you to review, debug, and guide AI so you catch mistakes before they ship. Understanding how code works is what separates builders from prompt-typists.",
    meta: "It does. Frequently. With absolute confidence. That\u2019s lesson one.",
    question: "Does AI really get things wrong?",
  },
  {
    answer:
      "A short email every Monday. One misconception about AI or web development \u2014 what it is, why it\u2019s wrong, and what\u2019s actually true. Some editions come with interactive demos like the ones on this page. All of them are designed to leave you sharper than you were before you opened them. It\u2019s free, it takes five minutes, and it\u2019s the most useful thing in your inbox that you actually open on purpose.",
    question: "What do I actually get?",
  },
  {
    answer:
      "Two things, mostly. Taste \u2014 knowing which answer is the right one when AI gives you four that all compile. And craft \u2014 turning that answer into code that holds up after you\u2019ve moved on. AI can produce both kinds of output. It can\u2019t tell you which one matters here. That\u2019s the work this site sharpens.",
    question: "What do you actually mean by \u201cjudgment\u201d?",
  },
  {
    answer:
      "The weekly digest is free. Completely, permanently, no-asterisk free. We\u2019re building something bigger \u2014 a live cohort where you build production web apps with AI, guided by the same thinking that runs through everything on this page. That\u2019s coming, and it won\u2019t be free. But the digest stands on its own. You don\u2019t need to buy anything to get value here.",
    meta: "See? We told you what we\u2019re selling. Most landing pages hide that part.",
    question: "Is this free?",
  },
  {
    answer:
      "You write code \u2014 professionally, seriously, or getting there. You use AI and you\u2019re good at it, but sometimes you ship something and you can\u2019t quite explain why it works. Or it doesn\u2019t work and you can\u2019t quite explain why. You know enough to build things but you suspect there are gaps you haven\u2019t found yet. You\u2019re right. There are. Everyone has them. This is a place where finding them feels like progress, not failure.",
    question: "Who is this for?",
  },
  {
    answer:
      "Because it\u2019s what we use, and we teach from experience, not theory. Claude is the AI we build with every day. But nothing here is locked to one tool. The thinking skills \u2014 knowing what to ask, catching wrong defaults, seeing through surface simplicity \u2014 those work whether you\u2019re using Claude, Cursor, Copilot, or whatever ships next Tuesday. We teach with Claude. You\u2019ll carry it everywhere.",
    question: "Why Claude specifically?",
  },
];

function FaqItem({
  question,
  answer,
  meta,
}: {
  question: string;
  answer: string;
  meta?: string;
}) {
  return (
    <div className="grid gap-x-12 gap-y-4 py-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <h3 className="font-display font-medium text-foreground text-xl leading-tight tracking-tight sm:text-2xl">
        {question}
      </h3>
      <div className="max-w-2xl">
        <p className="text-base text-foreground/75 leading-8">{answer}</p>
        {meta ? <MetaAside className="mt-3">{meta}</MetaAside> : null}
      </div>
    </div>
  );
}

export function FrequentlyAskedQuestions() {
  return (
    <section
      aria-labelledby="faq-title"
      className="relative bg-muted/40 py-24 sm:py-32"
      id="faq"
    >
      <Container>
        <div className="mb-16 max-w-2xl">
          <Subheading id="faq-title">Frequently asked questions</Subheading>
          <Heading
            as="h2"
            className="mt-3 text-balance text-4xl sm:text-5xl md:text-6xl"
          >
            Your questions answered.
          </Heading>
        </div>

        <div id="faqs">
          {faqs.map((faq, index) => (
            <div key={faq.question}>
              {index > 0 && <Separator className="bg-foreground/10" />}
              <FaqItem
                answer={faq.answer}
                meta={faq.meta}
                question={faq.question}
              />
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
