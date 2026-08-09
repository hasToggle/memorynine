"use client";

import type { Brief, BriefLine } from "@repo/knowledge";
import { useCallback, useState } from "react";
import type { CitationRef } from "@/lib/citation";
import {
  type ChipTone,
  CitationChip,
  SelectedCitationProvider,
} from "./citation-chip";
import { ReceiptPanel } from "./receipt-panel";
import { type ReceiptEntry, useReceipts } from "./use-receipts";

// The demo on the marketing site is stamped "two minutes before the call" and
// the answer is already on screen. This is that, with the calendar left out:
// the anchors the brain learned something about most recently, each line a
// sentence a reviewer confirmed, each line opening its own receipt.

// A source line is always raw material — buildBrief only ever emits one from
// an unreviewed source, so there is no "raw-reviewed" case here (that tier
// belongs to a source cited alongside a fact it helped produce, not to the
// source line itself). A fact line is either a confirmed, uncontested claim
// or one under dispute.
const toneFor = (line: BriefLine): ChipTone => {
  if (line.kind === "source") {
    return "raw";
  }
  return line.contested ? "checked-contested" : "checked";
};

const BriefLines = ({
  lines,
  offset,
  select,
}: {
  lines: BriefLine[];
  offset: number;
  select: (reference: CitationRef) => void;
}) => (
  <ul className="space-y-2">
    {lines.map((line, index) => (
      <li className="text-sm leading-relaxed" key={line.citationId}>
        {line.text}
        <CitationChip
          index={offset + index + 1}
          onSelect={select}
          reference={{ id: line.citationId, kind: line.kind }}
          tone={toneFor(line)}
        />
      </li>
    ))}
  </ul>
);

const BriefCard = ({
  brief,
  load,
  onAsk,
  receipts,
}: {
  brief: Brief;
  load: (reference: CitationRef) => void;
  onAsk: (name: string) => void;
  receipts: Record<string, ReceiptEntry>;
}) => {
  const [selected, setSelected] = useState<CitationRef | undefined>();

  const select = useCallback(
    (reference: CitationRef) => {
      setSelected(reference);
      load(reference);
    },
    [load]
  );

  const ask = useCallback(
    () => onAsk(brief.anchor.name),
    [brief.anchor.name, onAsk]
  );

  // Fact lines are this anchor's, confirmed and filed against it. Source lines
  // are not: unreviewed material is anchored to nobody until a reviewer files
  // it, so it is carried on the first card for want of anywhere else to put it.
  // Rendering the two in one list under this anchor's heading, distinguished by
  // nothing but chip colour, reads as "Südlicht wants to renegotiate" being a
  // fact about Nordwind. They get separate lists and the second says out loud
  // whose it isn't.
  const factLines = brief.lines.filter((line) => line.kind === "fact");
  const unfiledLines = brief.lines.filter((line) => line.kind === "source");

  return (
    <article className="rounded-xl border">
      <header className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
        <h3 className="font-medium text-sm">{brief.anchor.name}</h3>
        {/* The count is a statement about this anchor, so it is absent rather
            than zero when the anchor has nothing confirmed and the card is
            carrying only unfiled material. "0 things" above a populated card
            reads as a bug. */}
        {factLines.length > 0 ? (
          <span className="font-medium font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.12em]">
            {factLines.length} thing{factLines.length === 1 ? "" : "s"}
            {brief.contestedCount > 0
              ? ` · ${brief.contestedCount} contested`
              : ""}
          </span>
        ) : null}
      </header>

      <div className="px-4 py-3">
        <SelectedCitationProvider selectedId={selected?.id}>
          {factLines.length > 0 ? (
            <BriefLines lines={factLines} offset={0} select={select} />
          ) : null}

          {unfiledLines.length > 0 ? (
            <section
              className={
                factLines.length > 0 ? "mt-4 border-t pt-3" : undefined
              }
            >
              <h4 className="font-medium font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.12em]">
                Just captured — not yet filed against anyone
              </h4>
              <div className="mt-2">
                <BriefLines
                  lines={unfiledLines}
                  offset={factLines.length}
                  select={select}
                />
              </div>
            </section>
          ) : null}

          {selected ? <ReceiptPanel receipt={receipts[selected.id]} /> : null}
        </SelectedCitationProvider>

        <button
          className="mt-3 rounded-sm text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          onClick={ask}
          type="button"
        >
          Ask about {brief.anchor.name}
        </button>
      </div>
    </article>
  );
};

export const BriefPane = ({
  briefs,
  onAsk,
}: {
  briefs: Brief[];
  onAsk: (name: string) => void;
}) => {
  // One shared cache for every card in the pane, not one per card: several
  // briefs are on screen at once, and a per-card useReceipts() would give
  // each its own Record and its own in-flight guard for no reason — a
  // citation opened in one card would still show as unloaded in another.
  const { load, receipts } = useReceipts();

  if (briefs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="font-medium text-sm">Nothing to brief you on yet</p>
        <p className="mx-auto mt-1 max-w-xs text-muted-foreground text-xs leading-relaxed">
          Capture a voice memo or paste a note. Once a review confirms what it
          found, what matters before your next call shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-medium font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
        Before your next call
      </p>
      {briefs.map((brief) => (
        <BriefCard
          brief={brief}
          key={brief.anchor.id}
          load={load}
          onAsk={onAsk}
          receipts={receipts}
        />
      ))}
    </div>
  );
};
