"use client";

import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
} from "@repo/design-system/components/ai-elements/inline-citation";
import { Badge } from "@repo/design-system/components/ui/badge";
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

// The category enum values are storage keys, not UI copy.
const CATEGORY_LABELS: Record<string, string> = {
  background: "Hintergrund",
  "decision-process": "Entscheidungsweg",
  logistics: "Logistik",
  objection: "Einwand",
  other: "Sonstiges",
  preference: "Präferenz",
  relationship: "Beziehung",
};

const categoryLabel = (category: string): string =>
  CATEGORY_LABELS[category] ?? category;

const germanDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("de-DE", { dateStyle: "medium" })
    : null;

// Streamdown's sanitizer rewrites `id` attributes to "user-content-…" as
// DOM-clobbering protection (the GitHub convention), so the attribute arrives
// prefixed even though the model emitted the bare fact id. Strip it before
// resolving against the retrieved facts.
const CLOBBER_PREFIX = /^user-content-/;

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
  const factId = id?.replace(CLOBBER_PREFIX, "");
  const fact = factId ? facts.get(factId) : undefined;

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
          <InlineCitationCardBody className="w-80 overflow-hidden">
            <div className="px-4 py-3.5">
              <p className="font-medium text-destructive text-sm">
                Unbelegtes Zitat
              </p>
              <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                Die Wissensdatenbank hat den zitierten Fakt in dieser
                Unterhaltung nicht geliefert. Diese Aussage ist damit nicht
                belegt.
              </p>
            </div>
            {factId ? (
              <footer className="border-t bg-muted/30 px-4 py-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  Fakt {factId}
                </span>
              </footer>
            ) : null}
          </InlineCitationCardBody>
        </InlineCitationCard>
      </InlineCitation>
    );
  }

  const since = germanDate(fact.validFrom);
  const confidence = Math.round(fact.confidence * 100);

  return (
    <InlineCitation>
      <InlineCitationCard>
        <HoverCardTrigger asChild>
          <Badge
            asChild
            className="ml-1 cursor-help rounded-full"
            variant="secondary"
          >
            <button type="button">{categoryLabel(fact.category)}</button>
          </Badge>
        </HoverCardTrigger>
        <InlineCitationCardBody className="w-80 overflow-hidden">
          <blockquote className="px-4 py-3.5 text-sm leading-relaxed">
            <span aria-hidden className="text-muted-foreground">
              „
            </span>
            {fact.text}
            <span aria-hidden className="text-muted-foreground">
              “
            </span>
          </blockquote>
          <footer className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-2 text-muted-foreground text-xs">
            <span>{since ? `gültig seit ${since}` : " "}</span>
            <span className="tabular-nums">
              Konfidenz{" "}
              <span className="font-medium text-foreground">
                {confidence}&thinsp;%
              </span>
            </span>
          </footer>
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  );
};
