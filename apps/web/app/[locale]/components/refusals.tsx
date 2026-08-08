import { Container, Eyebrow } from "./container";

const REFUSALS: readonly { body: string; title: string }[] = [
  {
    body: "When the search comes back thin, it says what is missing and where it might live — “nothing has been captured about this engagement since April.” A confident summary of too little is worse than an admitted gap, because nobody can tell which one they are reading.",
    title: "To answer past its evidence",
  },
  {
    body: "When two facts disagree, it shows both and says they disagree. A conflict resolved silently is a conflict nobody fixes: the reviewer never sees it, so it stays wrong for as long as it takes somebody to notice.",
    title: "To settle a contradiction quietly",
  },
  {
    body: "Transcripts and forwarded mail are written by people outside your company. If retrieved text contains something shaped like an instruction, it is treated as a quotation of what someone wrote — never as something to do.",
    title: "To follow instructions it read somewhere",
  },
  {
    body: "The organisation comes from your signed-in session, never from the question. There is no way to phrase a question that reaches another workspace's facts, because the question never gets to name the workspace.",
    title: "To cross a tenant line",
  },
];

export function Refusals() {
  return (
    <section className="bg-mn-ink py-20 text-mn-paper sm:py-24" id="refusals">
      <Container>
        <div className="max-w-2xl">
          <Eyebrow className="text-mn-paper/60">What it refuses to do</Eyebrow>
          <h2 className="mt-5 font-cabinet font-extrabold text-[2rem] leading-[1.05] tracking-[-0.035em] sm:text-[2.75rem]">
            A memory is only worth having if you can trust the shape of its
            silence.
          </h2>
          <p className="mt-6 text-[1rem] text-mn-paper/65 leading-[1.7]">
            Each of these is a rule the assistant is held to, and each one has a
            test in the repository that fails the build when it slips.
          </p>
        </div>

        <ol className="mt-14 grid gap-x-14 gap-y-10 sm:grid-cols-2">
          {REFUSALS.map((refusal) => (
            <li
              className="border-mn-paper/20 border-t pt-6"
              key={refusal.title}
            >
              <h3 className="font-bold font-cabinet text-[1.25rem] leading-[1.25] tracking-[-0.02em]">
                <span aria-hidden="true" className="mr-2 text-mn-paper/35">
                  ✕
                </span>
                {refusal.title}
              </h3>
              <p className="mt-3 text-[0.9375rem] text-mn-paper/65 leading-[1.7]">
                {refusal.body}
              </p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
