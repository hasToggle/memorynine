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
  selectedId,
}: {
  facts: Map<string, CitedFact>;
  id?: string;
  numberOf: (id: string) => number;
  onSelect: (reference: CitationRef) => void;
  selectedId: string | undefined;
}) => {
  const factId = normalizeCitationId(id);
  const fact = factId ? facts.get(factId) : undefined;
  const reference: CitationRef = { id: factId ?? "", kind: "fact" };
  const tone = toneFor(fact);

  return (
    <CitationChip
      index={factId ? numberOf(factId) : 0}
      onSelect={onSelect}
      reference={reference}
      selected={selectedId === factId}
      tone={tone}
    />
  );
};
