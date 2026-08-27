"use client";

import { cn } from "@repo/design-system/lib/utils";
import type { ReceiptTier } from "@repo/knowledge";
import { createContext, type ReactNode, useCallback, useContext } from "react";
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

/**
 * Which citation is currently open, read from context rather than passed in.
 *
 * In the chat these chips render inside `MessageResponse`, which is memo'd on
 * `children` and `isAnimating` alone. Once a message finishes streaming its
 * text never changes again, so a selection passed down through the `components`
 * prop is swallowed by that comparator and the chip never repaints — no ring,
 * and `aria-expanded` frozen at "false" for the rest of the session. A context
 * consumer re-renders when the value changes even when an ancestor memo bailed
 * out, which is exactly the property needed here.
 *
 * Default `undefined` means "nothing selected", so a chip rendered outside any
 * provider is simply never selected.
 */
const SelectedCitationContext = createContext<string | undefined>(undefined);

/**
 * Scopes a selection to one surface. The chat provides one per message (each
 * answer owns its own open receipt); BriefPane provides one per card.
 */
export const SelectedCitationProvider = ({
  children,
  selectedId,
}: {
  children: ReactNode;
  selectedId: string | undefined;
}) => (
  <SelectedCitationContext value={selectedId}>
    {children}
  </SelectedCitationContext>
);

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
  tone,
}: {
  index: number;
  onSelect: (reference: CitationRef) => void;
  reference: CitationRef;
  tone: ChipTone;
}) => {
  const selectedId = useContext(SelectedCitationContext);
  const select = useCallback(() => onSelect(reference), [onSelect, reference]);

  if (tone === "broken") {
    // An id the tools never returned. Dropping it would make an invented claim
    // indistinguishable from a sourced one, which is the failure this whole
    // mechanism exists to make visible — so it stays exactly as loud as every
    // other tier is quiet.
    //
    // Not a control: there is no receipt behind an id the knowledge base never
    // returned, so a button here could only ever do nothing (the empty
    // reference trips the caller's own guard) or open a panel reporting a
    // fetch failure — which would read as our bug rather than as the model
    // citing something that does not exist. A span says the true thing. The
    // explanation moves from an aria-label, which is unreliable on a
    // non-interactive element, into visually hidden text that every reader
    // gets.
    //
    // `inline-block` restores what the <button> gave for free: a UA button is
    // inline-block, a span is inline, and with only px-1 and no py the painted
    // background would drop from the text-xs line box to the font content box
    // — about 2px shorter. This marker stays loud to the pixel.
    return (
      <span className="ml-0.5 inline-block rounded bg-destructive/10 px-1 align-super font-medium text-destructive text-xs">
        <span aria-hidden="true">?</span>
        <span className="sr-only">
          Unsupported citation — the knowledge base never returned this
        </span>
      </span>
    );
  }

  const label = LABELS[tone];
  const selected = reference.id.length > 0 && selectedId === reference.id;
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
