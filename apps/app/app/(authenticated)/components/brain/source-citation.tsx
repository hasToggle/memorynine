"use client";

import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
} from "@repo/design-system/components/ai-elements/inline-citation";
import { Badge } from "@repo/design-system/components/ui/badge";
import { HoverCardTrigger } from "@repo/design-system/components/ui/hover-card";

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

const TYPE_LABELS: Record<string, string> = {
  email: "E-Mail",
  manual: "Notiz",
  voice: "Sprachmemo",
};

const typeLabel = (type: string): string => TYPE_LABELS[type] ?? type;

const germanDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("de-DE", { dateStyle: "medium" })
    : null;

// Streamdown's sanitizer rewrites `id` attributes to "user-content-…" as
// DOM-clobbering protection — same handling as FactCitation.
const CLOBBER_PREFIX = /^user-content-/;

// The hovercard quotes at most this much; the excerpt itself is already a
// database-side truncation of the full content.
const PREVIEW_LENGTH = 280;

/**
 * Renders one `<source id="…"/>` marker the model emitted inline. Visually
 * distinct from a fact citation: an outline badge with the capture channel,
 * and an explicit "ungeprüft" flag while no reviewer has confirmed the
 * source's proposal — the reader must be able to tell the two tiers apart at
 * a glance.
 */
export const SourceCitation = ({
  id,
  sources,
}: {
  id?: string;
  sources: Map<string, CitedSource>;
}) => {
  const sourceId = id?.replace(CLOBBER_PREFIX, "");
  const source = sourceId ? sources.get(sourceId) : undefined;

  if (!source) {
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
                Die Suche hat die zitierte Quelle in dieser Unterhaltung nicht
                geliefert. Diese Aussage ist damit nicht belegt.
              </p>
            </div>
            {sourceId ? (
              <footer className="border-t bg-muted/30 px-4 py-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  Quelle {sourceId}
                </span>
              </footer>
            ) : null}
          </InlineCitationCardBody>
        </InlineCitationCard>
      </InlineCitation>
    );
  }

  const captured = germanDate(source.capturedAt);
  const preview =
    source.excerpt.length > PREVIEW_LENGTH
      ? `${source.excerpt.slice(0, PREVIEW_LENGTH)}…`
      : source.excerpt;

  return (
    <InlineCitation>
      <InlineCitationCard>
        <HoverCardTrigger asChild>
          <Badge
            asChild
            className="ml-1 cursor-help rounded-full"
            variant="outline"
          >
            <button type="button">
              {typeLabel(source.type)}
              {source.reviewed ? "" : " · ungeprüft"}
            </button>
          </Badge>
        </HoverCardTrigger>
        <InlineCitationCardBody className="w-80 overflow-hidden">
          <div className="px-4 py-3.5">
            {source.subject ? (
              <p className="mb-1 font-medium text-sm">{source.subject}</p>
            ) : null}
            <blockquote className="text-sm leading-relaxed">
              <span aria-hidden className="text-muted-foreground">
                „
              </span>
              {preview}
              <span aria-hidden className="text-muted-foreground">
                “
              </span>
            </blockquote>
            {source.reviewed ? null : (
              <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
                Rohmaterial — noch von niemandem geprüft.
              </p>
            )}
          </div>
          <footer className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-2 text-muted-foreground text-xs">
            <span className="truncate">{source.capturedBy}</span>
            <span>{captured ? `erfasst ${captured}` : " "}</span>
          </footer>
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  );
};
