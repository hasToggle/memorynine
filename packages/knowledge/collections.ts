// biome-ignore-all assist/source/useSortedKeys: MongoDB compound-index key order is semantically significant (tenantId must lead)

import type { Collection, Db } from "mongodb";
import type { Engagement, Organization, Person } from "./schemas/entities";
import type { Fact } from "./schemas/facts";
import type { Proposal } from "./schemas/proposals";
import type { Source } from "./schemas/sources";

export interface KnowledgeCollections {
  engagements: Collection<Engagement>;
  facts: Collection<Fact>;
  organizations: Collection<Organization>;
  people: Collection<Person>;
  proposals: Collection<Proposal>;
  sources: Collection<Source>;
}

export const getCollections = (db: Db): KnowledgeCollections => ({
  engagements: db.collection<Engagement>("engagements"),
  facts: db.collection<Fact>("facts"),
  organizations: db.collection<Organization>("organizations"),
  people: db.collection<Person>("people"),
  proposals: db.collection<Proposal>("proposals"),
  sources: db.collection<Source>("sources"),
});

export const ensureIndexes = async (db: Db): Promise<void> => {
  const { organizations, people, engagements, sources, proposals, facts } =
    getCollections(db);

  await Promise.all([
    organizations.createIndexes([
      { key: { tenantId: 1, name: 1 }, name: "tenant_name" },
      { key: { tenantId: 1, domains: 1 }, name: "tenant_domains" },
    ]),
    people.createIndexes([
      { key: { tenantId: 1, organizationId: 1 }, name: "tenant_org" },
      { key: { tenantId: 1, emails: 1 }, name: "tenant_emails" },
    ]),
    engagements.createIndexes([
      { key: { tenantId: 1, organizationId: 1 }, name: "tenant_org" },
    ]),
    sources.createIndexes([
      {
        key: { tenantId: 1, status: 1, createdAt: -1 },
        name: "tenant_status_recency",
      },
      {
        key: { tenantId: 1, "email.gmailMessageId": 1 },
        name: "tenant_gmail_message",
        partialFilterExpression: { "email.gmailMessageId": { $exists: true } },
        unique: true,
      },
    ]),
    proposals.createIndexes([
      {
        key: { tenantId: 1, status: 1, createdAt: -1 },
        name: "tenant_status_recency",
      },
    ]),
    facts.createIndexes([
      {
        key: { tenantId: 1, "anchors.organizationId": 1 },
        name: "tenant_org_anchor",
      },
      {
        key: { tenantId: 1, "anchors.personId": 1 },
        name: "tenant_person_anchor",
      },
      {
        key: { tenantId: 1, "anchors.engagementId": 1 },
        name: "tenant_engagement_anchor",
      },
      { key: { tenantId: 1, sourceId: 1 }, name: "tenant_source" },
    ]),
  ]);
};
