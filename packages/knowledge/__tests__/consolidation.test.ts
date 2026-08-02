import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import {
  buildConsolidationPrompt,
  parseConsolidationResponse,
} from "../consolidation";

const factIdA = new ObjectId().toHexString();
const factIdB = new ObjectId().toHexString();

describe("buildConsolidationPrompt", () => {
  const prompt = buildConsolidationPrompt({
    anchorName: "Nordwind GmbH",
    facts: [
      {
        category: "preference",
        id: factIdA,
        text: "Bevorzugt Termine am Vormittag.",
      },
      {
        category: "preference",
        id: factIdB,
        text: "Termine bitte vormittags, nie freitags.",
      },
    ],
  });

  test("lists the anchor and every fact with its id", () => {
    expect(prompt).toContain("Nordwind GmbH");
    expect(prompt).toContain(factIdA);
    expect(prompt).toContain(factIdB);
    expect(prompt).toContain("Bevorzugt Termine am Vormittag.");
  });

  test("states the merge contract and the skip contract", () => {
    expect(prompt).toContain("supersedes");
    expect(prompt).toContain('"skip"');
  });
});

describe("parseConsolidationResponse", () => {
  test("parses merges", () => {
    const parsed = parseConsolidationResponse(
      JSON.stringify({
        merges: [
          {
            category: "preference",
            confidence: 0.9,
            supersedes: [factIdA, factIdB],
            text: "Bevorzugt Termine am Vormittag; freitags nie.",
          },
        ],
      })
    );
    expect(parsed.kind).toBe("merges");
    if (parsed.kind === "merges") {
      expect(parsed.merges[0]?.supersedes).toEqual([factIdA, factIdB]);
    }
  });

  test("a merge of fewer than two facts is rejected", () => {
    const parsed = parseConsolidationResponse(
      JSON.stringify({
        merges: [
          {
            category: "preference",
            confidence: 0.9,
            supersedes: [factIdA],
            text: "Nur ein Fakt.",
          },
        ],
      })
    );
    expect(parsed.kind).toBe("failure");
  });

  test("skip token and empty merges both mean skip", () => {
    expect(
      parseConsolidationResponse(
        '{"skip": true, "reason": "nothing redundant"}'
      )
    ).toEqual({ kind: "skip", reason: "nothing redundant" });
    expect(parseConsolidationResponse('{"merges": []}').kind).toBe("skip");
  });

  test("narrated reasoning around the JSON is tolerated", () => {
    const parsed = parseConsolidationResponse(
      `Let me think { about } this... ${JSON.stringify({
        merges: [
          {
            category: "preference",
            confidence: 0.8,
            supersedes: [factIdA, factIdB],
            text: "Zusammengefasst.",
          },
        ],
      })} done.`
    );
    expect(parsed.kind).toBe("merges");
  });

  test("refusals and garbage are failures", () => {
    expect(parseConsolidationResponse("I'm sorry, I cannot.").kind).toBe(
      "failure"
    );
    expect(parseConsolidationResponse("kein JSON hier").kind).toBe("failure");
  });
});
