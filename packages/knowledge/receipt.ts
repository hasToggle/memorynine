import type { ObjectId } from "mongodb";
import type { Fact } from "./schemas/facts";
import type { Source } from "./schemas/sources";

// What a citation opens. The demo on the marketing site sets the contract:
// four plain-language rows, the original wording, and a verdict the reader can
// act on. Everything here is derived from stored fields — a model that wrote
// "safe to say out loud" would be asserting exactly the kind of unchecked
// claim the citation mechanism exists to prevent.
//
// Two of the demo's labels are deliberately not reproduced. "Who said it"
// implies a speaker, and we store none: `capturedBy` is whoever recorded the
// material, which in the demo's own scenario is the colleague dictating a memo
// about what the client said. See the design spec for the full argument.

export type ReceiptTier =
  | "checked"
  | "checked-contested"
  | "raw"
  | "raw-reviewed";

export interface ReceiptRow {
  detail: string;
  label: string;
}

export interface Receipt {
  id: string;
  kind: "fact" | "source";
  /** The source's own wording, truncated. Null when there is no source. */
  quote: string | null;
  rows: ReceiptRow[];
  tier: ReceiptTier;
  verdict: string;
}

/**
 * The subset of a source a receipt needs. Both `Source` (whole document) and
 * `SourceSearchHit` (the $project'd search result) satisfy it, so callers can
 * pass whichever they already hold.
 */
export interface ReceiptSource {
  _id: ObjectId;
  capturedBy: string;
  content?: string;
  createdAt?: Date;
  email?: { subject: string };
  excerpt?: string;
  occurredAt?: Date;
  status: Source["status"];
  type: Source["type"];
}

export interface ComposeReceiptInput {
  /** An open contradiction proposal supersedes this fact. */
  contested: boolean;
  fact?: Fact;
  /** Resolves a user id or an email to a display name. */
  nameOf: (idOrEmail: string) => string;
  now: Date;
  source?: ReceiptSource;
}

const TYPE_LABELS: Record<ReceiptSource["type"], string> = {
  email: "Forwarded email",
  manual: "Note",
  voice: "Voice memo",
};

/** Matches the hovercard's old budget; the excerpt is already truncated at 1500. */
const PREVIEW_LENGTH = 280;

/**
 * "13 March", or "5 November 2024" once the year stops being obvious. Uses
 * en-GB locale to prevent day/month reordering, and UTC timezone so output
 * is consistent across all host timezones and matches wholeMonthsBetween.
 */
const formatDay = (date: Date, now: Date): string =>
  date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    ...(date.getUTCFullYear() === now.getUTCFullYear()
      ? {}
      : { year: "numeric" }),
  });

const wholeMonthsBetween = (from: Date, to: Date): number =>
  (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
  (to.getUTCMonth() - from.getUTCMonth());

const truncate = (text: string): string =>
  text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;

const quoteOf = (source: ReceiptSource | undefined): string | null => {
  const raw = source?.excerpt ?? source?.content;
  return raw ? truncate(raw) : null;
};

const provenanceRow = (
  source: ReceiptSource | undefined,
  now: Date
): ReceiptRow => {
  if (!source) {
    // Consolidation and contradiction resolutions have `derivedFrom` instead
    // of a source; saying so beats an empty row.
    return { detail: "Merged from earlier facts", label: "Where it came from" };
  }
  const when = source.occurredAt ?? source.createdAt;
  const parts = [TYPE_LABELS[source.type]];
  if (source.email?.subject) {
    parts.push(`— "${source.email.subject}"`);
  }
  const head = parts.join(" ");
  return {
    detail: when ? `${head}, ${formatDay(when, now)}` : head,
    label: "Where it came from",
  };
};

const stillGoodRow = (
  fact: Fact,
  contested: boolean,
  now: Date
): ReceiptRow => {
  if (contested) {
    return {
      detail: "Disagrees with another fact on record — a review is open.",
      label: "Still good?",
    };
  }
  const since = fact.validFrom ?? fact.createdAt;
  const months = wholeMonthsBetween(since, now);
  return {
    detail:
      months >= 1
        ? `In place ${months} month${months === 1 ? "" : "s"} — nothing has contradicted it.`
        : `Recorded ${formatDay(since, now)} — nothing has contradicted it yet.`,
    label: "Still good?",
  };
};

const factReceipt = (
  fact: Fact,
  { contested, nameOf, now, source }: ComposeReceiptInput
): Receipt => {
  const rows: ReceiptRow[] = [provenanceRow(source, now)];
  if (source) {
    rows.push({ detail: nameOf(source.capturedBy), label: "Who captured it" });
  }
  rows.push(
    {
      detail: `${nameOf(fact.confirmedBy)}, ${formatDay(fact.createdAt, now)}`,
      label: "Who checked it",
    },
    stillGoodRow(fact, contested, now)
  );

  return {
    id: fact._id.toHexString(),
    kind: "fact",
    quote: quoteOf(source),
    rows,
    tier: contested ? "checked-contested" : "checked",
    verdict: contested
      ? "Two versions on record. Settle it in Review before you quote it."
      : "Safe to say out loud.",
  };
};

const sourceReceipt = (
  source: ReceiptSource,
  { nameOf, now }: ComposeReceiptInput
): Receipt => {
  const reviewed = source.status === "reviewed";
  return {
    id: source._id.toHexString(),
    kind: "source",
    quote: quoteOf(source),
    rows: [
      provenanceRow(source, now),
      { detail: nameOf(source.capturedBy), label: "Who captured it" },
      {
        detail: reviewed
          ? "Reviewed — a fact was distilled from it."
          : "Nobody yet — it's in the review queue.",
        label: "Who checked it",
      },
      {
        detail: reviewed
          ? "Quote the fact, not this wording."
          : "Nothing has confirmed it yet.",
        label: "Still good?",
      },
    ],
    tier: reviewed ? "raw-reviewed" : "raw",
    verdict: reviewed
      ? "Reviewed — but this is the raw wording, not a confirmed fact."
      : "Worth knowing. Don't quote it to them yet.",
  };
};

/**
 * A fact wins over a source when both are supplied: the fact is the confirmed
 * tier, and the source is its provenance rather than a citation of its own.
 */
export const composeReceipt = (input: ComposeReceiptInput): Receipt => {
  if (input.fact) {
    return factReceipt(input.fact, input);
  }
  if (input.source) {
    return sourceReceipt(input.source, input);
  }
  throw new Error("composeReceipt needs a fact or a source");
};
