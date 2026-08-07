import { describe, expect, test } from "bun:test";
import { ObjectId } from "@repo/knowledge";
import {
  applyCascade,
  buildResolveInput,
  cascadedFactIndices,
  collectDossierAnchors,
  friendlyResolveError,
} from "../lib/review-decisions";

describe("buildResolveInput", () => {
  const originals = { 0: "Original A.", 1: "Original B.", 2: "Original C." };

  test("maps entity choices and drops undecided drafts", () => {
    const input = buildResolveInput(
      {
        entities: {
          "org-1": "confirm",
          "person-1": "discard",
          "person-2": undefined,
        },
        facts: {},
      },
      originals
    );
    expect(input.entities).toEqual([
      { action: "confirm", draftId: "org-1" },
      { action: "discard", draftId: "person-1" },
    ]);
    expect(input.facts).toEqual([]);
  });

  test("an unchanged confirmed fact is a confirm, a changed one an edit", () => {
    const input = buildResolveInput(
      {
        entities: {},
        facts: {
          0: { choice: "confirm", text: "Original A." },
          1: { choice: "confirm", text: "Rewritten B." },
          2: { choice: "discard", text: "Original C." },
        },
      },
      originals
    );
    expect(input.facts).toEqual([
      { action: "confirm", index: 0 },
      { action: "edit", finalText: "Rewritten B.", index: 1 },
      { action: "discard", index: 2 },
    ]);
  });

  test("undecided facts are omitted so the proposal stays open", () => {
    const input = buildResolveInput(
      {
        entities: {},
        facts: { 1: { choice: "confirm", text: "Original B." } },
      },
      originals
    );
    expect(input.facts).toEqual([{ action: "confirm", index: 1 }]);
  });
});

// The proposal's dependency graph, as the form sees it: fact 0 and 1 hang
// off the new person draft, fact 2 anchors a known entity (no draft refs).
const FACT_DRAFTS = [
  { anchorDraftIds: ["person-1"], index: 0 },
  { anchorDraftIds: ["person-1", "org-1"], index: 1 },
  { anchorDraftIds: [], index: 2 },
];

describe("cascadedFactIndices", () => {
  test("facts anchoring a discarded entity draft are cascaded", () => {
    const indices = cascadedFactIndices(
      { "org-1": "confirm", "person-1": "discard" },
      FACT_DRAFTS
    );
    expect(indices).toEqual(new Set([0, 1]));
  });

  test("confirmed and undecided drafts cascade nothing", () => {
    expect(
      cascadedFactIndices(
        { "org-1": "confirm", "person-1": undefined },
        FACT_DRAFTS
      )
    ).toEqual(new Set());
  });

  test("facts anchored only to known entities are never cascaded", () => {
    expect(
      cascadedFactIndices({ "person-1": "discard" }, [
        { anchorDraftIds: [], index: 2 },
      ])
    ).toEqual(new Set());
  });
});

describe("applyCascade", () => {
  test("forces dependent facts to discard, including undecided ones", () => {
    const selections = {
      entities: { "person-1": "discard" as const },
      facts: {
        0: { choice: "confirm" as const, text: "Original A." },
        // fact 1 undecided — must still be discarded, or the branch would
        // leave a zombie fact whose anchor can never exist.
      },
    };

    const effective = applyCascade(selections, FACT_DRAFTS);

    expect(effective.facts[0]?.choice).toBe("discard");
    expect(effective.facts[1]?.choice).toBe("discard");
    expect(effective.facts[2]).toBeUndefined();
    // The reviewer's own state is not mutated — reviving the entity must
    // bring the confirm back.
    expect(selections.facts[0]?.choice).toBe("confirm");
  });

  test("without a discarded anchor the selections pass through unchanged", () => {
    const selections = {
      entities: { "person-1": "confirm" as const },
      facts: { 0: { choice: "confirm" as const, text: "Original A." } },
    };
    expect(applyCascade(selections, FACT_DRAFTS)).toEqual(selections);
  });

  test("cascaded discards survive buildResolveInput", () => {
    const effective = applyCascade(
      { entities: { "person-1": "discard" }, facts: {} },
      FACT_DRAFTS
    );
    const input = buildResolveInput(effective, {
      0: "Original A.",
      1: "Original B.",
      2: "Original C.",
    });
    expect(input.facts).toEqual([
      { action: "discard", index: 0 },
      { action: "discard", index: 1 },
    ]);
  });
});

describe("friendlyResolveError", () => {
  test("translates the discarded-anchor invariant", () => {
    expect(
      friendlyResolveError(
        'factDrafts[0] anchors person draft "person-1", which is being discarded'
      )
    ).toBe(
      "A fact can't be kept while the entity it belongs to is discarded. Reload this proposal and decide the whole group together."
    );
  });

  test("translates the never-confirmed-anchor invariant", () => {
    expect(
      friendlyResolveError(
        'factDrafts[1] anchors organization draft "org-1", which is not confirmed in this or any earlier resolution'
      )
    ).toBe(
      "This fact belongs to an entity that was never created. Reload this proposal and decide the whole group together."
    );
  });

  test("passes anything else through untouched", () => {
    expect(friendlyResolveError("Resolution failed")).toBe("Resolution failed");
  });
});

describe("collectDossierAnchors", () => {
  test("collects unique anchors across facts", () => {
    const orgId = new ObjectId();
    const personId = new ObjectId();
    const anchors = collectDossierAnchors([
      { anchors: { organizationId: orgId, personId } },
      { anchors: { organizationId: orgId } },
      { anchors: { engagementId: new ObjectId() } },
    ]);
    expect(anchors).toHaveLength(3);
    expect(
      anchors.filter((anchor) => anchor.kind === "organization")
    ).toHaveLength(1);
    expect(anchors.filter((anchor) => anchor.kind === "person")).toHaveLength(
      1
    );
    expect(
      anchors.filter((anchor) => anchor.kind === "engagement")
    ).toHaveLength(1);
  });
});
