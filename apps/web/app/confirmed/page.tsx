import Link from "next/link";

export default function Confirmed() {
  return (
    <main className="mn-surface flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="max-w-xl font-cabinet font-extrabold text-[2rem] text-mn-ink leading-[1.05] tracking-[-0.035em] sm:text-[2.5rem]">
        Address confirmed.
      </h1>
      <p className="mt-5 max-w-md text-[1rem] text-mn-ink-soft leading-[1.7]">
        We&apos;ll be in touch about setting your workspace up. If you&apos;d
        rather not wait, you can start one now.
      </p>
      <Link
        className="mt-9 rounded-[5px] bg-mn-ink px-5 py-2.5 font-medium text-[0.9375rem] text-mn-paper transition-colors hover:bg-mn-stamp focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-2"
        href="/"
      >
        Back to memorynine
      </Link>
    </main>
  );
}
