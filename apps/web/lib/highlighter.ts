import type { createHighlighter } from "shiki";

type Highlighter = Awaited<ReturnType<typeof createHighlighter>>;

let highlighterInstance: Promise<Highlighter> | null = null;

export function initHighlighter() {
  if (!highlighterInstance) {
    highlighterInstance = import("shiki").then(
      ({ createHighlighter: create }) =>
        create({
          langs: ["jsx", "tsx"],
          themes: ["ayu-dark"],
        })
    );
  }
  return highlighterInstance;
}
