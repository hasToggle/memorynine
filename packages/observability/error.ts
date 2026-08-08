// biome-ignore lint/performance/noNamespaceImport: Sentry SDK requires namespace import for proper initialization
import * as Sentry from "@sentry/nextjs";
import { log } from "./log";

const toMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    return error.message as string;
  }

  return String(error);
};

export const parseError = (error: unknown): string => {
  const message = toMessage(error);

  try {
    Sentry.captureException(error);
    log.error(`Parsing error: ${message}`);
  } catch (newError) {
    console.error("Error parsing error:", newError);
  }

  return message;
};
