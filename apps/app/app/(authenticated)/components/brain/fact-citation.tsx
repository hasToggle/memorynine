"use client";

import type { CitationRef } from "@/lib/citation";
import { normalizeCitationId } from "@/lib/citation";
import { type ChipTone, CitationChip } from "./citation-chip";

// Every fact the agent has returned in this conversation, keyed by the id it
// must cite. Built from tool output rather than from the prose, so a claim can
// only cite something the knowledge base actually returned.
export interface CitedFact {
  category: string;
  confidence: number;
  contested?: boolean;
  id: string;
  text: string;
  validFrom: string | null;
}

const toneFor = (fact: CitedFact | undefined): ChipTone => {
  if (!fact) {
    return "broken";
  }
  return fact.contested ? "checked-contested" : "checked";
};

/**
 * Renders one `<fact id="…"/>` marker the model emitted inline.
 *
 * An id we never returned renders as broken rather than being dropped. A
 * dropped citation is indistinguishable from an uncited claim, which is
 * precisely the failure this mechanism exists to make visible.
 */
export const FactCitation = ({
  facts,
  id,
  numberOf,
  onSelect,
}: {
  facts: Map<string, CitedFact>;
  id?: string;
  numberOf: (id: string) => number;
  onSelect: (reference: CitationRef) => void;
}) => {
  const factId = normalizeCitationId(id);
  const fact = factId ? facts.get(factId) : undefined;
  // An id that never resolved carries no reference at all: the empty id
  // trips the `reference.id.length === 0` guard in the caller's `select`,
  // so a broken chip can neither be "selected" nor fire a receipt fetch for
  // an id the tools never returned.
  const reference: CitationRef = {
    id: fact ? (factId ?? "") : "",
    kind: "fact",
  };

  return (
    <CitationChip
      // Only a resolved citation draws a sequence number. Numbering a broken
      // one and then discarding it leaves a gap — "1 ? 3" — which reads as a
      // rendering fault rather than as the deliberate alarm it is.
      index={fact && factId ? numberOf(factId) : 0}
      onSelect={onSelect}
      reference={reference}
      tone={toneFor(fact)}
    />
  );
};
