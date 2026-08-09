import type { dossierAnchorKinds } from "./dossier";
import { type ReceiptSource, truncatePreview } from "./receipt";
import type { Fact } from "./schemas/facts";

// What the Ask surface shows before anyone types. Assembled from facts rather
// than from a dossier's rendered content: composeDossier emits `- ${fact.text}`
// and drops the id, and a brief line without an id can open no receipt — which
// is the entire point of the surface.
//
// Nothing here writes prose. Fact text was authored by extraction and then
// confirmed, edited or discarded by a human in the review queue; this selects
// and orders sentences somebody already signed off on.

/** Facts per brief. Beyond this the reader is skimming, not preparing. */
export const BRIEF_FACT_LIMIT = 5;
/** Unreviewed sources appended after the facts. */
export const BRIEF_SOURCE_LIMIT = 2;

export interface BriefAnchor {
  id: string;
  kind: (typeof dossierAnchorKinds)[number];
  name: string;
}

export interface BriefLine {
  /** The fact or source id — what getReceipts is called with. */
  citationId: string;
  contested: boolean;
  kind: "fact" | "source";
  text: string;
}

export interface Brief {
  anchor: BriefAnchor;
  contestedCount: number;
  lines: BriefLine[];
  /** Facts available, before the cap — so the card can say "of 12". */
  totalFacts: number;
}

export interface BuildBriefInput {
  anchor: BriefAnchor;
  contestedIds: Set<string>;
  facts: Fact[];
  now: Date;
  sources: ReceiptSource[];
}

const recencyOf = (fact: Fact): number =>
  (fact.validFrom ?? fact.updatedAt).getTime();

export const buildBrief = ({
  anchor,
  contestedIds,
  facts,
  sources,
}: BuildBriefInput): Brief => {
  const contested = (fact: Fact) => contestedIds.has(fact._id.toHexString());

  // Contested first: it is the one thing that must not be walked into a room
  // and repeated. Everything else newest first, because the newest is what the
  // reader has not heard yet.
  const ordered = [...facts].sort((a, b) => {
    const byContested = Number(contested(b)) - Number(contested(a));
    return byContested === 0 ? recencyOf(b) - recencyOf(a) : byContested;
  });

  const factLines: BriefLine[] = ordered
    .slice(0, BRIEF_FACT_LIMIT)
    .map((fact) => ({
      citationId: fact._id.toHexString(),
      contested: contested(fact),
      kind: "fact",
      text: fact.text,
    }));

  // Only genuinely unchecked material earns the ochre tier. A reviewed source
  // has already become a fact, and offering its raw wording would invite
  // quoting the draft over the confirmed sentence.
  //
  // A source that has no wording yet — still transcribing, or a capture that
  // failed — produces no line at all. Emitting one would put a bare chip on
  // the surface with nothing beside it to read. The empty text can arrive
  // either as a missing field or as the empty string a $substrCP over a
  // missing field returns, so the guard is on the resolved text, not on the
  // field, and it runs before the cap so a silent source cannot eat a slot a
  // readable one would have taken.
  const sourceLines: BriefLine[] = sources
    .filter((source) => source.status !== "reviewed")
    .map((source) => ({
      citationId: source._id.toHexString(),
      contested: false,
      kind: "source" as const,
      text: truncatePreview((source.excerpt ?? source.content ?? "").trim()),
    }))
    .filter((line) => line.text.length > 0)
    .slice(0, BRIEF_SOURCE_LIMIT);

  return {
    anchor,
    contestedCount: facts.filter(contested).length,
    lines: [...factLines, ...sourceLines],
    totalFacts: facts.length,
  };
};
