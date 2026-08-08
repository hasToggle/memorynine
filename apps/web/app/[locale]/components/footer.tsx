import Link from "next/link";
import { Container } from "./container";
import { Wordmark } from "./mark";

const LINKS: readonly { href: string; label: string }[] = [
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms" },
];

export function Footer() {
  return (
    <footer className="border-mn-rule border-t bg-mn-paper py-12">
      <Container className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-[0.8125rem] text-mn-graphite leading-[1.6]">
            Six captured, three confirmed. The memory your company can stand
            behind.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-7 gap-y-3">
          {LINKS.map((link) => (
            <Link
              className="rounded-sm text-[0.875rem] text-mn-ink-soft transition-colors hover:text-mn-ink focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-4"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </Container>

      <Container className="mt-10 border-mn-rule border-t pt-6">
        <p className="font-mono text-[0.6875rem] text-mn-graphite tracking-[0.06em]">
          © {new Date().getFullYear()} memorynine
        </p>
      </Container>
    </footer>
  );
}
