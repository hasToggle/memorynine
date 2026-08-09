"use client";

import type { CitationRef } from "@/lib/citation";
import { normalizeCitationId } from "@/lib/citation";
import { type ChipTone, CitationChip } from "./citation-chip";

// Every raw source the agent has returned in this conversation, keyed by the
// id it must cite. Built from tool output rather than from the prose — same
// contract as CitedFact, for the unverified tier.
export interface CitedSource {
  capturedAt: string | null;
  capturedBy: string;
  excerpt: string;
  id: string;
  occurredAt: string | null;
  reviewed: boolean;
  subject: string | null;
  type: string;
}

const toneFor = (source: CitedSource | undefined): ChipTone => {
  if (!source) {
    return "broken";
  }
  return source.reviewed ? "raw-reviewed" : "raw";
};

/**
 * Renders one `<source id="…"/>` marker the model emitted inline.
 *
 * An id we never returned renders as broken rather than being dropped — same
 * contract as FactCitation.
 */
export const SourceCitation = ({
  id,
  numberOf,
  onSelect,
  selectedId,
  sources,
}: {
  id?: string;
  numberOf: (id: string) => number;
  onSelect: (reference: CitationRef) => void;
  selectedId: string | undefined;
  sources: Map<string, CitedSource>;
}) => {
  const sourceId = normalizeCitationId(id);
  const source = sourceId ? sources.get(sourceId) : undefined;
  // An id that never resolved carries no reference at all: the empty id
  // trips the `reference.id.length === 0` guard in the caller's `select`,
  // so a broken chip can neither be "selected" nor fire a receipt fetch for
  // an id the tools never returned.
  const reference: CitationRef = {
    id: source ? (sourceId ?? "") : "",
    kind: "source",
  };
  const tone = toneFor(source);

  return (
    <CitationChip
      index={sourceId ? numberOf(sourceId) : 0}
      onSelect={onSelect}
      reference={reference}
      selected={sourceId !== undefined && selectedId === sourceId}
      tone={tone}
    />
  );
};
