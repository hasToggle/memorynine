"use client";

import { cn } from "@repo/design-system/lib/utils";
import type { ReceiptTier } from "@repo/knowledge";
import { useCallback } from "react";
import type { CitationRef } from "@/lib/citation";

// The reader has to be able to tell, without hovering and without reading,
// whether a claim has been through review. Filled square: the record is a
// confirmed fact. Hollow: it's raw material — nobody has confirmed *this
// wording*, even if it was later distilled into a fact (raw-reviewed).
// Clicking opens the receipt and keeps it open — the old hover-card was
// unreachable on touch, which is where most of these answers get read.
//
// ChipTone mirrors ReceiptTier exactly (plus "broken") so every tier the
// data layer can produce has an explicit, intentional rendering here rather
// than falling through to a default.

export type ChipTone = ReceiptTier | "broken";

const LABELS: Record<ReceiptTier, string> = {
  checked: "confirmed — open the receipt",
  "checked-contested": "confirmed but disputed — open the receipt",
  raw: "nobody has checked this — open the receipt",
  "raw-reviewed":
    "raw wording, reviewed but not a confirmed fact — open the receipt",
};

// Only an actual confirmed fact gets the filled indicator. A reviewed source
// (raw-reviewed) was used to produce a fact, but this citation quotes the raw
// wording itself, which nobody confirmed — same as a plain unreviewed source.
const isConfirmed = (tone: ReceiptTier) =>
  tone === "checked" || tone === "checked-contested";

// "checked" is the only tier a reader can treat as settled. Everything else
// — disputed, raw, or raw-but-reviewed — gets the same amber caution.
const isWarn = (tone: ReceiptTier) => tone !== "checked";

export const CitationChip = ({
  index,
  onSelect,
  reference,
  selected,
  tone,
}: {
  index: number;
  onSelect: (reference: CitationRef) => void;
  reference: CitationRef;
  selected: boolean;
  tone: ChipTone;
}) => {
  const select = useCallback(() => onSelect(reference), [onSelect, reference]);

  if (tone === "broken") {
    // An id the tools never returned. Dropping it would make an invented claim
    // indistinguishable from a sourced one, which is the failure this whole
    // mechanism exists to make visible — so it stays loud.
    return (
      <button
        aria-label="Unsupported citation — the knowledge base never returned this"
        className="ml-0.5 cursor-help rounded bg-destructive/10 px-1 align-super font-medium text-destructive text-xs"
        onClick={select}
        type="button"
      >
        ?
      </button>
    );
  }

  const label = LABELS[tone];
  const warn = isWarn(tone);

  return (
    <button
      aria-expanded={selected}
      className={cn(
        "ml-1 inline-flex translate-y-[-0.06em] items-center gap-1.5 rounded-[3px] px-1.5 py-0.5 align-baseline font-medium font-mono text-[0.6875rem] leading-none transition-colors",
        "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
        !warn && "bg-primary/10 text-primary hover:bg-primary/20",
        warn &&
          "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-400",
        selected && "ring-1 ring-current"
      )}
      onClick={select}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-[1px]",
          isConfirmed(tone) ? "bg-current" : "border border-current"
        )}
      />
      {index}
      <span className="sr-only"> — {label}</span>
    </button>
  );
};
