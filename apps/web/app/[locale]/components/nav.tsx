import Link from "next/link";
import { env } from "@/env";
import { Container } from "./container";
import { Wordmark } from "./mark";

const LINKS: readonly { href: string; label: string }[] = [
  { href: "#how", label: "How a fact gets in" },
  { href: "#gate", label: "The review gate" },
  { href: "#refusals", label: "Refusals" },
];

export function Nav() {
  return (
    <header className="border-mn-rule/70 border-b">
      <Container className="flex h-16 items-center justify-between gap-8">
        <Link
          aria-label="memorynine, home"
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-4"
          href="/"
        >
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              className="rounded-sm text-[0.875rem] text-mn-ink-soft transition-colors hover:text-mn-ink focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-4"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Link
          className="rounded-[5px] border border-mn-ink px-3.5 py-1.5 font-medium text-[0.8125rem] text-mn-ink transition-colors hover:bg-mn-ink hover:text-mn-paper focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-2"
          href={env.NEXT_PUBLIC_APP_URL}
        >
          Sign in
        </Link>
      </Container>
    </header>
  );
}
