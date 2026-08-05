"use client";

import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationQuote,
  InlineCitationSource,
} from "@repo/design-system/components/ai-elements/inline-citation";

// Every fact the agent has returned in this conversation, keyed by the id it
// must cite. Built from tool output rather than from the prose, so a claim can
// only cite something the knowledge base actually returned.
export interface CitedFact {
  category: string;
  confidence: number;
  id: string;
  text: string;
  validFrom: string | null;
}

const germanDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("de-DE", { dateStyle: "medium" })
    : null;

/**
 * Renders one `<fact id="…"/>` marker the model emitted inline.
 *
 * An id we never returned is shown as broken rather than dropped. A dropped
 * citation is indistinguishable from an uncited claim, which is precisely the
 * failure this whole mechanism exists to make visible.
 */
export const FactCitation = ({
  facts,
  id,
}: {
  facts: Map<string, CitedFact>;
  id?: string;
}) => {
  const fact = id ? facts.get(id) : undefined;

  if (!fact) {
    return (
      <sup
        className="ml-0.5 cursor-help rounded bg-destructive/10 px-1 font-medium text-destructive text-xs"
        title={
          id
            ? `Zitiert Fakt ${id}, der in dieser Unterhaltung nicht gefunden wurde.`
            : "Zitat ohne Fakt-ID."
        }
      >
        ?
      </sup>
    );
  }

  const since = germanDate(fact.validFrom);

  return (
    <InlineCitation>
      <InlineCitationCard>
        <InlineCitationCardTrigger sources={[fact.category]} />
        <InlineCitationCardBody>
          <InlineCitationSource
            description={since ? `gültig seit ${since}` : undefined}
            title={fact.category}
          >
            <p className="text-muted-foreground text-xs">
              Konfidenz {Math.round(fact.confidence * 100)}%
            </p>
          </InlineCitationSource>
          <InlineCitationQuote>{fact.text}</InlineCitationQuote>
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  );
};
