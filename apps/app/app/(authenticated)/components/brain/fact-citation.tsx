"use client";

import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationQuote,
  InlineCitationSource,
} from "@repo/design-system/components/ai-elements/inline-citation";
import { HoverCardTrigger } from "@repo/design-system/components/ui/hover-card";

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
    // Same hover-card interaction as a resolved citation, so the broken
    // marker explains itself instead of relying on the native title tooltip.
    return (
      <InlineCitation>
        <InlineCitationCard>
          <HoverCardTrigger asChild>
            <button
              className="ml-0.5 cursor-help rounded bg-destructive/10 px-1 align-super font-medium text-destructive text-xs"
              type="button"
            >
              ?
            </button>
          </HoverCardTrigger>
          <InlineCitationCardBody className="p-3">
            <p className="font-medium text-sm">Unbelegtes Zitat</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {id
                ? `Die Antwort zitiert Fakt ${id}, den die Wissensdatenbank in dieser Unterhaltung nicht geliefert hat. Diese Aussage ist damit nicht belegt.`
                : "Die Antwort enthält ein Zitat ohne Fakt-ID. Diese Aussage ist damit nicht belegt."}
            </p>
          </InlineCitationCardBody>
        </InlineCitationCard>
      </InlineCitation>
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
