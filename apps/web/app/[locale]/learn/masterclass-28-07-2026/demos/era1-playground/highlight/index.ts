/**
 * The console's two registers. The prefix — what the presenter typed — renders
 * in full theme colour. The completion — what the machine wrote — renders in
 * one hue, with structure carried by weight, opacity and italics, so that
 * "everything cyan is the machine" stays literally true and the boundary
 * between prompt and continuation survives.
 *
 * Shiki must never be imported here: this module reaches the browser.
 */

import { fingerprintText, type Kind } from "../../highlight";
import type { PromptSeed } from "../completions";

export type { Kind } from "../../highlight";
// biome-ignore lint/performance/noBarrelFile: re-exports the shared vocabulary so this module's public surface stays unchanged
export { kindFromScopes } from "../../highlight";

export interface PrefixToken {
  /** Dark-theme hex. */
  d: string;
  k: Kind;
  /** Light-theme hex. */
  l: string;
  t: string;
}

export interface CompletionToken {
  k: Kind;
  t: string;
}

const COMPLETION_CLASS: Record<Kind, string> = {
  comment: "text-ht-cyan-700/70 italic dark:text-ht-cyan-300/75",
  keyword: "font-medium text-ht-cyan-700 dark:text-ht-cyan-300",
  plain: "text-ht-cyan-700 dark:text-ht-cyan-300",
  punct: "text-ht-cyan-700/80 dark:text-ht-cyan-300/85",
  string: "text-ht-cyan-700 dark:text-ht-cyan-300",
};

export function completionClass(kind: Kind): string {
  return COMPLETION_CLASS[kind];
}

/**
 * Comments in the prefix are the one place the theme's own colour is refused.
 * GitHub's comment grey (#6e7781 / #8b949e) is mid-contrast by design, and the
 * question prompt — `// how do I reverse a list in JavaScript?` — is the single
 * line the room has to read off a projector. Italics carry "comment" on their
 * own; the hue does not have to whisper to say it.
 */
export function prefixIsComment(kind: Kind): boolean {
  return kind === "comment";
}

/**
 * Reveals `charCount` characters of a precomputed token list, slicing the token
 * the budget lands inside. The returned text is always exactly the first
 * `charCount` characters of the whole — an off-by-one here would silently drop
 * the machine's last character on every run.
 */
export function visibleTokens(
  tokens: CompletionToken[],
  charCount: number
): CompletionToken[] {
  const out: CompletionToken[] = [];
  let remaining = charCount;
  for (const token of tokens) {
    if (remaining <= 0) {
      break;
    }
    if (token.t.length <= remaining) {
      out.push(token);
      remaining -= token.t.length;
    } else {
      out.push({ k: token.k, t: token.t.slice(0, remaining) });
      remaining = 0;
    }
  }
  return out;
}

/**
 * A cheap stand-in for regenerating. Token data cannot drift unless one of the
 * source strings changes, so hashing the sources catches the real hazard — a
 * completion edited without re-running the generator — without loading Shiki
 * grammars into a suite that otherwise finishes in milliseconds.
 */
export function fingerprintSources(prompts: readonly PromptSeed[]): string {
  const parts: string[] = [];
  for (const p of [...prompts].sort((a, b) => a.id.localeCompare(b.id))) {
    parts.push(p.id, p.prefix);
    for (const band of ["high", "low", "mid"] as const) {
      parts.push(p.continuations[band], p.instructAnswers[band]);
    }
  }
  return fingerprintText(parts);
}
