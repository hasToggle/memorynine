import { describe, expect, test } from "bun:test";
import {
  EXPECTED_EXTRACTIONS,
  engagementSchema,
  engagements,
  factSchema,
  facts,
  oid,
  organizationSchema,
  organizations,
  PLANTED,
  people,
  personSchema,
  sourceSchema,
  sources,
  TENANT_ALPHA,
  TENANT_BETA,
} from "../fixtures";
import type { Source } from "../schemas/sources";

const isCurrent = (f: (typeof facts)[number]) =>
  !(f.supersededBy || f.validUntil);

describe("fixture ids", () => {
  test("oid is deterministic and 24 hex chars", () => {
    expect(oid(1, 1).toHexString()).toBe(oid(1, 1).toHexString());
    expect(oid(1, 1).toHexString()).toHaveLength(24);
    expect(oid(1, 1).toHexString()).not.toBe(oid(2, 1).toHexString());
  });
});

describe("entity fixtures", () => {
  test("organizations parse and span both tenants", () => {
    for (const org of organizations) {
      expect(() => organizationSchema.parse(org)).not.toThrow();
    }
    const tenants = new Set(organizations.map((o) => o.tenantId));
    expect(tenants).toEqual(new Set([TENANT_ALPHA, TENANT_BETA]));
  });

  test("people parse and reference real organizations", () => {
    const orgIds = new Set(organizations.map((o) => o._id.toHexString()));
    for (const person of people) {
      expect(() => personSchema.parse(person)).not.toThrow();
      if (person.organizationId) {
        expect(orgIds).toContain(person.organizationId.toHexString());
      }
    }
  });

  test("engagements parse and reference real organizations", () => {
    const orgIds = new Set(organizations.map((o) => o._id.toHexString()));
    for (const engagement of engagements) {
      expect(() => engagementSchema.parse(engagement)).not.toThrow();
      expect(orgIds).toContain(engagement.organizationId.toHexString());
    }
  });

  test("the two tenants share a confusable person name", () => {
    const alpha = people.filter((p) => p.tenantId === TENANT_ALPHA);
    const beta = people.filter((p) => p.tenantId === TENANT_BETA);
    const shared = alpha.filter((a) => beta.some((b) => b.name === a.name));
    expect(shared.length).toBeGreaterThan(0);
  });
});

describe("fact fixtures", () => {
  test("all facts parse", () => {
    for (const fact of facts) {
      expect(() => factSchema.parse(fact)).not.toThrow();
    }
  });

  test("corpus is the documented size and split", () => {
    expect(facts.length).toBeGreaterThanOrEqual(75);
    expect(facts.filter((f) => f.tenantId === TENANT_BETA).length).toBe(15);
  });

  test("every fact anchors to an entity that exists in its own tenant", () => {
    const byTenant = new Map<string, Set<string>>();
    for (const e of [...organizations, ...people, ...engagements]) {
      const set = byTenant.get(e.tenantId) ?? new Set();
      set.add(e._id.toHexString());
      byTenant.set(e.tenantId, set);
    }
    for (const fact of facts) {
      const known = byTenant.get(fact.tenantId) ?? new Set();
      const anchors = [
        fact.anchors.organizationId,
        fact.anchors.personId,
        fact.anchors.engagementId,
      ].filter((id): id is NonNullable<typeof id> => Boolean(id));
      expect(anchors.length).toBeGreaterThan(0);
      for (const anchor of anchors) {
        expect(known).toContain(anchor.toHexString());
      }
    }
  });

  test("supersession chains point at facts that exist and are closed", () => {
    const byId = new Map(facts.map((f) => [f._id.toHexString(), f]));
    for (const fact of facts) {
      if (!fact.supersededBy) {
        continue;
      }
      const successor = byId.get(fact.supersededBy.toHexString());
      expect(successor).toBeDefined();
      // A superseded fact must carry both system time and event time.
      expect(fact.supersededAt).toBeInstanceOf(Date);
      expect(fact.validUntil).toBeInstanceOf(Date);
    }
  });

  test("planted buckets have the documented cardinality", () => {
    expect(PLANTED.roleChanges).toHaveLength(4);
    expect(PLANTED.endedEngagements).toHaveLength(2);
    expect(PLANTED.retractedPreference).toBeDefined();
    expect(PLANTED.contradictions).toHaveLength(3);
    expect(PLANTED.injection).toBeDefined();
    expect(PLANTED.erasureTarget).toBeDefined();
  });

  test("each contradiction pair is two currently-valid facts on one anchor", () => {
    for (const pair of PLANTED.contradictions) {
      expect(pair).toHaveLength(2);
      const [a, b] = pair;
      expect(isCurrent(a)).toBe(true);
      expect(isCurrent(b)).toBe(true);
      expect(a.anchors).toEqual(b.anchors);
      expect(a.category).toBe(b.category);
    }
  });

  test("the erasure target is reachable both directly and through a merge", () => {
    const { directFactIds, derivedFactId } = PLANTED.erasureTarget;
    expect(directFactIds.length).toBeGreaterThanOrEqual(2);
    const derived = facts.find(
      (f) => f._id.toHexString() === derivedFactId.toHexString()
    );
    // The whole point: the merged fact names the person in its text but is
    // anchored to the organization, so an anchor-scoped delete misses it.
    expect(derived?.anchors.personId).toBeUndefined();
    expect(derived?.derivedFrom?.length).toBeGreaterThan(0);
    expect(derived?.text).toContain("Petra");
  });
});

describe("source fixtures", () => {
  test("all sources parse", () => {
    for (const source of sources) {
      expect(() => sourceSchema.parse(source)).not.toThrow();
    }
  });

  test("every source has content and an occurredAt", () => {
    for (const source of sources) {
      expect(source.content?.length ?? 0).toBeGreaterThan(40);
      expect(source.occurredAt).toBeInstanceOf(Date);
    }
  });

  test("sources are ingested out of chronological order", () => {
    // createdAt is capture time, occurredAt is event time. If they sort
    // identically the out-of-order ingestion case is not being exercised.
    const byCapture = [...sources].sort((a, b) => +a.createdAt - +b.createdAt);
    const eventTime = (s: (typeof sources)[number]) =>
      +(s.occurredAt ?? new Date(0));
    const byEvent = [...sources].sort((a, b) => eventTime(a) - eventTime(b));
    expect(byCapture.map((s) => s._id.toHexString())).not.toEqual(
      byEvent.map((s) => s._id.toHexString())
    );
  });

  test("the type mix is roughly half email, a third voice", () => {
    const count = (t: Source["type"]) =>
      sources.filter((s) => s.type === t).length;
    expect(count("email")).toBeGreaterThanOrEqual(15);
    expect(count("voice")).toBeGreaterThanOrEqual(10);
    expect(count("manual")).toBeGreaterThanOrEqual(3);
  });

  test("every source has an expected extraction, and skips are represented", () => {
    expect(EXPECTED_EXTRACTIONS).toHaveLength(sources.length);
    const ids = new Set(sources.map((s) => s._id.toHexString()));
    for (const expected of EXPECTED_EXTRACTIONS) {
      expect(ids).toContain(expected.sourceId.toHexString());
      if (expected.shouldSkip) {
        expect(expected.plantedFacts).toHaveLength(0);
      } else {
        expect(expected.plantedFacts.length).toBeGreaterThan(0);
      }
    }
    // Terminverschiebungen and greetings must be present, or the skip branch
    // of the extraction prompt is never measured.
    expect(
      EXPECTED_EXTRACTIONS.filter((e) => e.shouldSkip).length
    ).toBeGreaterThanOrEqual(3);
  });

  test("email sources carry the email envelope with a unique messageId", () => {
    const emails = sources.filter((s) => s.type === "email");
    const ids = new Set<string>();
    for (const source of emails) {
      const { email } = source;
      expect(email).toBeDefined();
      if (!email) {
        continue;
      }
      expect(ids).not.toContain(email.messageId);
      ids.add(email.messageId);
    }
  });
});
