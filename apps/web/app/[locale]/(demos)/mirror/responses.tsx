import type { ReactNode } from "react";
import type { Framing } from "./framing";

export interface ResponseContent {
  /** Inline phrase: the closing follow-up sentence. */
  closing: ReactNode;
  /** Block: the code block itself. */
  code: ReactNode;
  /** Inline phrase: introduces the code block ("Here's the implementation:" / "Here's the test:"). */
  codeIntro: ReactNode;
  /** Inline phrase: the position the agent commits to, in bold. */
  position: ReactNode;
  /** Inline phrase: the agent's justification for the position. */
  reason: ReactNode;
}

const SHIP_FIRST_CODE = (
  <pre className="overflow-x-auto rounded-md border border-border bg-foreground/[0.02] p-4 font-mono text-sm/6 dark:bg-foreground/[0.04]">
    <code>
      <span className="block">
        {"export function formatPrice(cents: number): string {"}
      </span>
      <span className="block">
        {"  const dollars = (cents / 100).toFixed(2);"}
      </span>
      <span className="block">{"  return `$${dollars}`;"}</span>
      <span className="block">{"}"}</span>
    </code>
  </pre>
);

const TESTS_FIRST_CODE = (
  <pre className="overflow-x-auto rounded-md border border-border bg-foreground/[0.02] p-4 font-mono text-sm/6 dark:bg-foreground/[0.04]">
    <code>
      <span className="block">
        {'import { test, expect } from "bun:test";'}
      </span>
      <span className="block">
        {'import { formatPrice } from "./format-price";'}
      </span>
      <span className="block"> </span>
      <span className="block">
        {'test("formatPrice renders cents as a dollar amount", () => {'}
      </span>
      <span className="block">
        {'  expect(formatPrice(1299)).toBe("$12.99");'}
      </span>
      <span className="block">{"});"}</span>
    </code>
  </pre>
);

const SHIP_FIRST: ResponseContent = {
  closing:
    "When the first issue surfaces, we'll lock the behavior in with a regression test.",
  code: SHIP_FIRST_CODE,
  codeIntro: "Here's the implementation:",
  position: <strong>shipping first is the right call</strong>,
  reason: (
    <>
      Tests written before the feature ossifies your assumptions about what
      it&apos;s supposed to do; tests written <em>after</em> the first real
      surprise pin down a real failure mode. You&apos;ll learn more from one bug
      report than from ten speculative cases.
    </>
  ),
};

const TESTS_FIRST: ResponseContent = {
  closing:
    "Once it fails for the right reason, we'll write the implementation against it.",
  code: TESTS_FIRST_CODE,
  codeIntro: "Here's the test:",
  position: <strong>writing tests first is the right call</strong>,
  reason:
    "The test is the spec; if you can't articulate what should be true, you don't yet know what you're building. You save the round-trip of writing the code, finding it doesn't work, and retrofitting a test against partial behavior.",
};

export const RESPONSES: Record<Framing, ResponseContent> = {
  "ship-first": SHIP_FIRST,
  "tests-first": TESTS_FIRST,
};
