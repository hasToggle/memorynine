import { createHighlighter } from "shiki";

let highlighterInstance: ReturnType<typeof createHighlighter> | null = null;

export function initHighlighter() {
  if (!highlighterInstance) {
    highlighterInstance = createHighlighter({
      langs: ["jsx", "tsx"],
      themes: ["ayu-dark"],
    });
  }
  return highlighterInstance;
}
