// biome-ignore-all assist/source/useSortedKeys: MongoDB compound-index key order is semantically significant (tenantId must lead)

import type { Collection, Db } from "mongodb";
import type { Dossier } from "./dossier";
import type { Engagement, Organization, Person } from "./schemas/entities";
import type { Fact } from "./schemas/facts";
import type { Proposal } from "./schemas/proposals";
import type { Source } from "./schemas/sources";
import type { Usage } from "./schemas/usage";

export interface KnowledgeCollections {
  dossiers: Collection<Dossier>;
  engagements: Collection<Engagement>;
  facts: Collection<Fact>;
  organizations: Collection<Organization>;
  people: Collection<Person>;
  proposals: Collection<Proposal>;
  sources: Collection<Source>;
  usage: Collection<Usage>;
}

export const getCollections = (db: Db): KnowledgeCollections => ({
  dossiers: db.collection<Dossier>("dossiers"),
  engagements: db.collection<Engagement>("engagements"),
  facts: db.collection<Fact>("facts"),
  organizations: db.collection<Organization>("organizations"),
  people: db.collection<Person>("people"),
  proposals: db.collection<Proposal>("proposals"),
  sources: db.collection<Source>("sources"),
  usage: db.collection<Usage>("usage"),
});

export const ensureIndexes = async (db: Db): Promise<void> => {
  const {
    organizations,
    people,
    engagements,
    sources,
    proposals,
    facts,
    dossiers,
    usage,
  } = getCollections(db);

  await Promise.all([
    dossiers.createIndexes([
      {
        key: { tenantId: 1, "anchor.kind": 1, "anchor.id": 1 },
        name: "tenant_anchor",
        unique: true,
      },
      // listBriefTargets sorts a tenant's dossiers by recency; the unique
      // index above leads with anchor.kind and cannot serve that sort.
      { key: { tenantId: 1, updatedAt: -1 }, name: "tenant_recency" },
    ]),
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
        key: { tenantId: 1, "email.messageId": 1 },
        name: "tenant_message",
        partialFilterExpression: { "email.messageId": { $exists: true } },
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
    usage.createIndexes([
      { key: { tenantId: 1, createdAt: -1 }, name: "tenant_recency" },
      {
        key: { tenantId: 1, operation: 1, createdAt: -1 },
        name: "tenant_operation_recency",
      },
      // No TTL here, deliberately. Raw rows are kept indefinitely: this is
      // billing history, and the plan's original shape was a 90-day TTL plus
      // a monthly roll-up that would survive it — only the TTL got built.
      // Shipping that half was worse than shipping neither: at one tenant's
      // volume, even a busy year is on the order of 100k small documents,
      // which MongoDB does not notice, so unbounded growth here is a
      // non-problem. Silently deleting the only record of what a tenant cost
      // is a real one, and it is a one-way door — a TTL can always be added
      // later once a roll-up exists to hand off to, but there is no adding
      // back rows a TTL already expired. So: keep everything, add the
      // roll-up + TTL together when retention actually needs to bound this
      // collection's size.
    ]),
  ]);
};
