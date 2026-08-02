import { describe, expect, test } from "bun:test";
import { ObjectId } from "@repo/knowledge";
import {
  buildResolveInput,
  collectDossierAnchors,
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
