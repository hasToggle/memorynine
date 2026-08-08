import { Container, Eyebrow } from "./container";

// Same four guarantees the product actually holds, but each one is stated as
// what it saves the reader from, because that is the only reason they care.
const REFUSALS: readonly { body: string; title: string }[] = [
  {
    body: "When there is nothing captured, it tells you that, and tells you where to look instead. You would far rather hear “nobody has written anything about this since April” than a smooth paragraph you then repeat to a client.",
    title: "It won't invent an answer",
  },
  {
    body: "If they said one thing in March and something else in July, you get both, side by side, flagged. Better you spot the contradiction on the way in than they do halfway through the meeting.",
    title: "It won't hide a disagreement",
  },
  {
    body: "Anything nobody has checked yet is marked as such, with whose memo it came from. So you can use it to prepare, and still never quote it as fact by accident.",
    title: "It won't pass a rumour off as a fact",
  },
  {
    body: "Your workspace only ever sees its own memory. And material that arrives from outside — a forwarded thread, a transcript — is treated as something a person said, never as an instruction to follow.",
    title: "It won't confuse your memory with anyone else's",
  },
];

export function Refusals() {
  return (
    <section className="bg-mn-ink py-20 text-mn-paper sm:py-24" id="trust">
      <Container>
        <div className="max-w-2xl">
          <Eyebrow className="text-mn-paper/60">Why you can trust it</Eyebrow>
          <h2 className="mt-5 font-cabinet font-extrabold text-[2rem] leading-[1.05] tracking-[-0.035em] sm:text-[2.75rem]">
            The worst thing an assistant can do is sound sure.
          </h2>
          <p className="mt-6 text-[1rem] text-mn-paper/65 leading-[1.7]">
            You are going to repeat this to a paying client, out loud, with your
            name on it. So it is built to be unhelpful rather than confidently
            wrong — and every one of these has a test that fails the build when
            it slips.
          </p>
        </div>

        <ol className="mt-14 grid gap-x-14 gap-y-10 sm:grid-cols-2">
          {REFUSALS.map((refusal) => (
            <li
              className="border-mn-paper/20 border-t pt-6"
              key={refusal.title}
            >
              <h3 className="font-bold font-cabinet text-[1.25rem] leading-[1.25] tracking-[-0.02em]">
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
