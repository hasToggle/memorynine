import { PROMPTS } from "./completions";

export type Band = "low" | "mid" | "high";
export type Mode = "base" | "instruct";

/** The dial's standing value. The S3 gate opens only on a band the presenter moved to. */
export const INITIAL_TEMP = 0.7;

export function bandFor(temp: number): Band {
  if (temp < 0.4) {
    return "low";
  }
  if (temp < 1.0) {
    return "mid";
  }
  return "high";
}

export function selectCompletion(
  id: string,
  temp: number,
  mode: Mode = "base"
): string {
  const prompt = PROMPTS.find((p) => p.id === id);
  if (!prompt) {
    return "";
  }
  const band = bandFor(temp);
  return mode === "instruct"
    ? prompt.instructAnswers[band]
    : prompt.continuations[band];
}
