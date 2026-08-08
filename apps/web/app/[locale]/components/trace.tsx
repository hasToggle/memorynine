"use client";

import { cn } from "@repo/design-system/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useState } from "react";

/**
 * The signature element: one answer, and the receipts behind it.
 *
 * Every claim the assistant makes carries the id of the fact or the raw source
 * it rests on. This walks one of those citations backwards — fact, to the human
 * who confirmed it, to the extraction that proposed it, to the line in the voice
 * memo somebody actually said. The ochre citation stops short on purpose: it is
 * raw material nobody has reviewed, and the trace says so instead of dressing it
 * up as knowledge.
 */

interface TraceRow {
  readonly detail: string;
  readonly label: string;
}

interface Citation {
  readonly id: string;
  readonly kind: "fact" | "source";
  readonly quote: string;
  readonly rows: readonly TraceRow[];
  readonly verdict: string;
}

const CITATIONS: readonly Citation[] = [
  {
    id: "6a70f2",
    kind: "fact",
    quote:
      "„Die überarbeitete Fassung brauchen sie bis Ende August, sonst rutscht das Ganze ins nächste Quartal.“",
    rows: [
      {
        detail: "logistics · confidence 0.91 · valid from 02 Jul 2026",
        label: "Fact",
      },
      {
        detail: "Eric Stolz · 02 Jul 2026, 08:26 · saved as proposed",
        label: "Confirmed",
      },
      {
        detail: "extraction run 1 · 1 of 4 drafts from this source",
        label: "Proposed",
      },
      {
        detail: "Forwarded mail · Nordwind Logistik · 01 Jul 2026, 17:09",
        label: "Source",
      },
    ],
    verdict: "Confirmed knowledge. Safe to state plainly.",
  },
  {
    id: "8c14b9",
    kind: "fact",
    quote:
      "„…und bitte nichts vor zehn, die Anna macht ihre Entscheidungen am liebsten morgens, aber nicht früh.“",
    rows: [
      {
        detail: "preference · confidence 0.86 · valid from 14 Mar 2026",
        label: "Fact",
      },
      {
        detail: "Eric Stolz · 14 Mar 2026, 09:12 · edited before saving",
        label: "Confirmed",
      },
      {
        detail: "extraction run 2 · re-run after the transcript was corrected",
        label: "Proposed",
      },
      {
        detail: "Voice memo · 13 Mar 2026, 18:04 · 3:41 · redacted",
        label: "Source",
      },
    ],
    verdict: "Confirmed knowledge. Safe to state plainly.",
  },
  {
    id: "4d09e1",
    kind: "source",
    quote:
      "„…klang so, als würde das Budget ins erste Quartal rutschen — muss ich aber noch bestätigen lassen.“",
    rows: [
      { detail: "Voice memo · 07 Aug 2026, 17:22 · 2:08", label: "Source" },
      {
        detail: "transcribed · extracted · waiting for review",
        label: "Status",
      },
      { detail: "2 fact drafts proposed, none confirmed", label: "Review" },
    ],
    verdict: "Not knowledge. Quoted as raw material, attributed, and flagged.",
  },
];

const findCitation = (id: string) =>
  CITATIONS.find((citation) => citation.id === id) ?? CITATIONS[0];

const CitationChip = ({
  citation,
  onSelect,
  selected,
}: {
  citation: Citation;
  onSelect: (id: string) => void;
  selected: boolean;
}) => {
  const select = useCallback(
    () => onSelect(citation.id),
    [citation.id, onSelect]
  );
  const isFact = citation.kind === "fact";

  return (
    <button
      aria-expanded={selected}
      className={cn(
        // JSX drops the newline between the preceding word and this tag, so
        // the chip carries its own leading space — and none on the right, so
        // the full stop after a citation sits where a full stop belongs.
        "ml-1 inline-flex translate-y-[-0.06em] items-center gap-1.5 rounded-[3px] px-1.5 py-0.5 align-baseline font-medium font-mono text-[0.6875rem] leading-none transition-colors",
        "focus-visible:outline-2 focus-visible:outline-mn-ink focus-visible:outline-offset-2",
        isFact
          ? "bg-mn-stamp-tint text-mn-stamp hover:bg-mn-stamp hover:text-mn-paper"
          : "bg-mn-ochre-tint text-mn-ochre hover:bg-mn-ochre hover:text-mn-paper",
        selected &&
          (isFact ? "bg-mn-stamp text-mn-paper" : "bg-mn-ochre text-mn-paper")
      )}
      onClick={select}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-[1px]",
          isFact ? "bg-current" : "border border-current"
        )}
      />
      {citation.id}
      <span className="sr-only">
        {isFact
          ? " — confirmed fact, show its trace"
          : " — raw source, show its trace"}
      </span>
    </button>
  );
};

export function Trace() {
  const [selectedId, setSelectedId] = useState("8c14b9");
  const reduceMotion = useReducedMotion();
  const citation = findCitation(selectedId);
  const isFact = citation.kind === "fact";

  return (
    <figure className="overflow-hidden rounded-lg border border-mn-rule bg-mn-raised shadow-[0_1px_0_var(--color-mn-rule),0_18px_50px_-32px_rgb(20_22_26/0.45)]">
      <figcaption className="flex items-center justify-between border-mn-rule border-b px-5 py-3 font-medium font-mono text-[0.625rem] text-mn-graphite uppercase tracking-[0.18em]">
        <span>Ask the brain</span>
        <span>08 Aug 2026 · 09:41</span>
      </figcaption>

      <div className="px-5 pt-5 pb-4">
        <p className="font-bold font-cabinet text-[1.375rem] text-mn-ink leading-[1.2] tracking-[-0.02em]">
          What does Nordwind think of the revised quote?
        </p>
        <p className="mt-4 text-[0.9375rem] text-mn-ink-soft leading-[1.75]">
          Nordwind needs the revised quote by the end of August, or the work
          moves into the next quarter
          <CitationChip
            citation={CITATIONS[0]}
            onSelect={setSelectedId}
            selected={selectedId === "6a70f2"}
          />
          . Anna Bergmann signs it off and keeps her decisions to late mornings
          <CitationChip
            citation={CITATIONS[1]}
            onSelect={setSelectedId}
            selected={selectedId === "8c14b9"}
          />
          . A voice memo from yesterday says the budget may move to Q1
          <CitationChip
            citation={CITATIONS[2]}
            onSelect={setSelectedId}
            selected={selectedId === "4d09e1"}
          />
          {" — that one is unreviewed, and it disagrees with the July mail."}
        </p>
      </div>

      <div className="border-mn-rule border-t bg-mn-paper/70 px-5 py-4">
        <p className="font-medium font-mono text-[0.625rem] text-mn-graphite uppercase tracking-[0.18em]">
          {isFact ? "Fact" : "Raw source"} {citation.id} — where it came from
        </p>

        <AnimatePresence initial={false} mode="wait">
          <motion.div
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            initial={{ opacity: reduceMotion ? 1 : 0 }}
            key={citation.id}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            <ol className="mt-3.5 space-y-0">
              {citation.rows.map((row, index) => (
                <li className="relative flex gap-3 pb-3.5 pl-4" key={row.label}>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-[0.3rem] left-0 size-1.5 rounded-full",
                      isFact ? "bg-mn-stamp" : "bg-mn-ochre"
                    )}
                  />
                  {index < citation.rows.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-[0.7rem] bottom-0 left-[0.1875rem] w-px bg-mn-rule"
                    />
                  ) : null}
                  <span className="w-20 shrink-0 font-medium font-mono text-[0.6875rem] text-mn-graphite uppercase leading-[1.5] tracking-[0.08em]">
                    {row.label}
                  </span>
                  <span className="text-[0.8125rem] text-mn-ink-soft leading-[1.5]">
                    {row.detail}
                  </span>
                </li>
              ))}
            </ol>

            <blockquote
              className={cn(
                "border-l-2 py-1 pl-3.5 text-[0.875rem] leading-[1.6]",
                isFact
                  ? "border-mn-stamp text-mn-ink"
                  : "border-mn-ochre text-mn-ink"
              )}
              lang="de"
            >
              {citation.quote}
            </blockquote>

            <p
              className={cn(
                "mt-3.5 font-medium font-mono text-[0.6875rem] leading-[1.5]",
                isFact ? "text-mn-stamp" : "text-mn-ochre"
              )}
            >
              {citation.verdict}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </figure>
  );
}
