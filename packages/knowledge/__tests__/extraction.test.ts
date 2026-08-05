import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { buildExtractionPrompt, parseExtractionResponse } from "../extraction";
import { factCategoryValues } from "../schemas/facts";

const knownOrgId = new ObjectId().toHexString();
const knownFactId = new ObjectId().toHexString();

const promptInput = {
  capturedAt: new Date("2026-08-02T15:00:00Z"),
  capturedBy: "user_ceo1",
  content: "Frau Müller bevorzugt jetzt Termine am Nachmittag.",
  knownEntities: [
    { id: knownOrgId, kind: "organization" as const, name: "Nordwind GmbH" },
  ],
  knownFacts: [
    {
      anchor: "Nordwind GmbH",
      category: "preference" as const,
      id: knownFactId,
      text: "Bevorzugt Termine am Vormittag.",
    },
  ],
  sourceType: "voice" as const,
};

describe("buildExtractionPrompt", () => {
  const prompt = buildExtractionPrompt(promptInput);

  test("includes the source content and metadata", () => {
    expect(prompt).toContain("Frau Müller bevorzugt jetzt Termine");
    expect(prompt).toContain("voice");
  });

  test("lists known entities and facts with their ids for anchoring and supersession", () => {
    expect(prompt).toContain(knownOrgId);
    expect(prompt).toContain("Nordwind GmbH");
    expect(prompt).toContain(knownFactId);
    expect(prompt).toContain("Bevorzugt Termine am Vormittag.");
  });

  test("states the skip contract and the supersedes instruction", () => {
    expect(prompt).toContain('"skip"');
    expect(prompt).toContain("supersedes");
  });

  test("lists every fact category", () => {
    for (const category of factCategoryValues) {
      expect(prompt).toContain(category);
    }
  });
});

describe("parseExtractionResponse", () => {
  test("parses a proposal with entities and facts", () => {
    const raw = JSON.stringify({
      entities: [
        {
          data: { name: "Anna Müller" },
          draftId: "person-1",
          entityType: "person",
        },
      ],
      facts: [
        {
          anchors: { personDraftId: "person-1" },
          category: "preference",
          confidence: 0.9,
          supersedes: [knownFactId],
          text: "Bevorzugt jetzt Termine am Nachmittag.",
        },
      ],
    });
    const parsed = parseExtractionResponse(raw);
    expect(parsed.kind).toBe("proposal");
    if (parsed.kind === "proposal") {
      expect(parsed.entities).toHaveLength(1);
      expect(parsed.facts[0]?.supersedes).toEqual([knownFactId]);
    }
  });

  test("tolerates markdown fences around the JSON", () => {
    const raw = `\`\`\`json\n${JSON.stringify({ entities: [], facts: [{ anchors: { organizationId: knownOrgId }, category: "logistics", confidence: 0.8, text: "Angebot bis Ende August." }] })}\n\`\`\``;
    expect(parseExtractionResponse(raw).kind).toBe("proposal");
  });

  test("returns skip for the explicit skip token", () => {
    const parsed = parseExtractionResponse(
      '{"skip": true, "reason": "greeting only"}'
    );
    expect(parsed).toEqual({ kind: "skip", reason: "greeting only" });
  });

  test("treats an empty proposal as skip", () => {
    const parsed = parseExtractionResponse('{"entities": [], "facts": []}');
    expect(parsed.kind).toBe("skip");
  });

  test("classifies model refusals as failure, not knowledge", () => {
    const parsed = parseExtractionResponse(
      "I'm sorry, but I can't help with extracting personal information."
    );
    expect(parsed.kind).toBe("failure");
  });

  test("classifies invalid JSON as failure", () => {
    expect(parseExtractionResponse("Termine am Nachmittag!").kind).toBe(
      "failure"
    );
  });

  test("classifies schema-violating JSON as failure when it is the only draft", () => {
    const parsed = parseExtractionResponse(
      '{"facts": [{"text": "x", "category": "nonsense", "confidence": 2}]}'
    );
    expect(parsed.kind).toBe("failure");
  });

  test("rejects a fact draft with a malformed supersedes id (the only draft, so failure)", () => {
    const parsed = parseExtractionResponse(
      JSON.stringify({
        entities: [],
        facts: [
          {
            anchors: { organizationId: knownOrgId },
            category: "preference",
            confidence: 0.9,
            supersedes: ["not-a-hex-id"],
            text: "x",
          },
        ],
      })
    );
    expect(parsed.kind).toBe("failure");
  });
});

describe("parseExtractionResponse with reasoning preamble", () => {
  test("extracts the JSON object from leading narration", () => {
    const raw = `We need answer only JSON. Let's parse the source. {"entities": [], "facts": [{"anchors": {"organizationId": "${knownOrgId}"}, "category": "logistics", "confidence": 0.8, "text": "Angebot bis Ende August."}]}`;
    const parsed = parseExtractionResponse(raw);
    expect(parsed.kind).toBe("proposal");
  });

  test("extracts a skip object from leading narration", () => {
    const parsed = parseExtractionResponse(
      'Thinking about it... {"skip": true, "reason": "nur Begrüßung"} done.'
    );
    expect(parsed).toEqual({ kind: "skip", reason: "nur Begrüßung" });
  });

  test("narration with braces in strings does not break extraction", () => {
    const parsed = parseExtractionResponse(
      `Note {weird} text first {"entities": [], "facts": [{"anchors": {"organizationId": "${knownOrgId}"}, "category": "other", "confidence": 0.5, "text": "Enthält {Klammern} im Text."}]}`
    );
    expect(parsed.kind).toBe("proposal");
  });
});

describe("parseExtractionResponse candidate selection", () => {
  const realProposal = JSON.stringify({
    entities: [],
    facts: [
      {
        anchors: { organizationId: knownOrgId },
        category: "logistics",
        confidence: 0.9,
        text: "Angebot bis Ende August.",
      },
    ],
  });

  test("an empty-object fragment in the narration does not shadow the real answer", () => {
    const parsed = parseExtractionResponse(
      `Considering the shape {} of the reply... ${realProposal}`
    );
    expect(parsed.kind).toBe("proposal");
  });

  test("a skip example echoed from the prompt does not shadow the real answer", () => {
    const parsed = parseExtractionResponse(
      `Should I return {"skip": true, "reason": "..."}? No — there are facts. ${realProposal}`
    );
    expect(parsed.kind).toBe("proposal");
  });

  test("a lone unrelated object is a failure, not an empty proposal", () => {
    expect(parseExtractionResponse('{"name": "x"}').kind).toBe("failure");
  });

  test("a facts-only reply without an entities key still parses", () => {
    const parsed = parseExtractionResponse(
      JSON.stringify({
        facts: [
          {
            anchors: { organizationId: knownOrgId },
            category: "logistics",
            confidence: 0.9,
            text: "Angebot bis Ende August.",
          },
        ],
      })
    );
    expect(parsed.kind).toBe("proposal");
  });
});

describe("parseExtractionResponse with unclosed braces in narration", () => {
  test("a stray unclosed brace before the answer does not abort the scan", () => {
    const real = JSON.stringify({
      entities: [],
      facts: [
        {
          anchors: { organizationId: knownOrgId },
          category: "logistics",
          confidence: 0.9,
          text: "Angebot bis Ende August.",
        },
      ],
    });
    const parsed = parseExtractionResponse(
      `We need shape { entities... hmm. Here: ${real}`
    );
    expect(parsed.kind).toBe("proposal");
  });
});

// The verbatim reply that failed in the live eval run (source ordinal 13):
// three facts, the third with an array-valued personId — a meeting between
// two people, which the anchor schema cannot express. Do not "correct" it.
const SOURCE_13_REPLY = JSON.stringify({
  entities: [],
  facts: [
    {
      anchors: {
        organizationId: "a10000000000000000000001",
        personId: "a20000000000000000000004",
      },
      category: "relationship",
      confidence: 0.8,
      supersedes: [],
      text: "Martin Kowalski verantwortet bei Hafenlogistik Nord GmbH seit letzter Woche zusätzlich die Verhandlung der Rahmenverträge mit Lieferanten.",
    },
    {
      anchors: { organizationId: "a10000000000000000000001" },
      category: "logistics",
      confidence: 0.7,
      supersedes: [],
      text: "Die Rahmenverträge mit Lieferanten werden bei Hafenlogistik Nord künftig quartalsweise überprüft.",
    },
    {
      // Two people in one fact. factAnchorsSchema allows exactly one.
      anchors: {
        engagementId: "a30000000000000000000003",
        organizationId: "a10000000000000000000003",
        personId: ["a20000000000000000000006", "a20000000000000000000007"],
      },
      category: "logistics",
      confidence: 0.8,
      supersedes: [],
      text: "Für Prozessoptimierung Fertigung bei Vogelsang Maschinenbau ist ein wöchentliches Steering-Meeting mit Katrin Suhrbier und Bjarne Petersen angedacht.",
    },
  ],
});

describe("parseExtractionResponse — partial tolerance", () => {
  test("keeps the valid facts and reports the rejected one", () => {
    const parsed = parseExtractionResponse(SOURCE_13_REPLY);
    expect(parsed.kind).toBe("proposal");
    if (parsed.kind !== "proposal") {
      throw new Error("expected a proposal");
    }
    expect(parsed.facts).toHaveLength(2);
    expect(parsed.rejected).toHaveLength(1);
    // The reason must name the offending field, or a reviewer cannot act on it.
    expect(parsed.rejected[0]?.reason).toContain("personId");
    // The raw draft is preserved verbatim so nothing is lost.
    expect(parsed.rejected[0]?.raw).toMatchObject({ category: "logistics" });
  });

  test("all drafts rejected is a FAILURE, not a skip", () => {
    // A failure consumes the retry budget and runs again; a skip is terminal.
    // Malformed output deserves a retry, judged-empty does not.
    const allBad = JSON.stringify({ facts: [{ text: "x" }, { text: "y" }] });
    const parsed = parseExtractionResponse(allBad);
    expect(parsed.kind).toBe("failure");
  });

  test("an explicit skip is unchanged", () => {
    const parsed = parseExtractionResponse(
      '{"skip": true, "reason": "Terminchatter"}'
    );
    expect(parsed).toEqual({ kind: "skip", reason: "Terminchatter" });
  });

  test("an empty proposal is still a skip", () => {
    const parsed = parseExtractionResponse('{"entities": [], "facts": []}');
    expect(parsed.kind).toBe("skip");
  });

  test("a narration fragment with no recognized key is still rejected", () => {
    // The anti-narration guard: with loose objects plus defaults, ANY {} would
    // validate as an empty proposal. A live DeepSeek run once turned a
    // narration fragment into a false skip exactly that way.
    expect(parseExtractionResponse("Ich denke nach... {} ...fertig").kind).toBe(
      "failure"
    );
  });

  test("the real reply still wins over an echoed prompt example", () => {
    // extractLastValidObject keeps the LAST schema-valid object. Loosening the
    // element types must not let an earlier echo beat the real answer.
    const echo = '{"entities": [], "facts": []}';
    const real = JSON.stringify({
      facts: [
        {
          anchors: { organizationId: "a10000000000000000000001" },
          category: "logistics",
          confidence: 0.5,
          text: "Echt.",
        },
      ],
    });
    const parsed = parseExtractionResponse(`${echo}\nblah\n${real}`);
    expect(parsed.kind).toBe("proposal");
    if (parsed.kind !== "proposal") {
      throw new Error("expected a proposal");
    }
    expect(parsed.facts).toHaveLength(1);
  });
});
