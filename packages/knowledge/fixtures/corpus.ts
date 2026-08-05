import type { Engagement, Organization, Person } from "../schemas/entities";
import { ID_KIND, oid } from "./ids";

// The owner is a fictional Hamburg B2B consultancy, Nordlicht Consulting.
// Tenant alpha is Nordlicht's own knowledge base. Tenant beta is an
// unrelated second customer of the product, present only to prove
// isolation between tenants sharing lookalike data (see the Kowalski
// name collision below).
export const TENANT_ALPHA = "eval-tenant-alpha";
export const TENANT_BETA = "eval-tenant-beta";

/** Fixed so fixtures are byte-identical across runs. */
const T0 = new Date("2025-09-01T08:00:00.000Z");

const org = (
  n: number,
  tenantId: string,
  fields: Omit<Organization, "_id" | "createdAt" | "tenantId" | "updatedAt">
): Organization => ({
  _id: oid(ID_KIND.organization, n),
  createdAt: T0,
  tenantId,
  updatedAt: T0,
  ...fields,
});

const person = (
  n: number,
  tenantId: string,
  fields: Omit<Person, "_id" | "createdAt" | "tenantId" | "updatedAt">
): Person => ({
  _id: oid(ID_KIND.person, n),
  createdAt: T0,
  tenantId,
  updatedAt: T0,
  ...fields,
});

const engagement = (
  n: number,
  tenantId: string,
  fields: Omit<Engagement, "_id" | "createdAt" | "tenantId" | "updatedAt">
): Engagement => ({
  _id: oid(ID_KIND.engagement, n),
  createdAt: T0,
  tenantId,
  updatedAt: T0,
  ...fields,
});

export const organizations: Organization[] = [
  org(1, TENANT_ALPHA, {
    domains: ["hafenlogistik-nord.de"],
    industry: "Logistik",
    name: "Hafenlogistik Nord GmbH",
    status: "active",
  }),
  org(2, TENANT_ALPHA, {
    domains: ["brauhaus-elbe.de"],
    industry: "Getränke",
    name: "Brauhaus an der Elbe AG",
    status: "active",
  }),
  org(3, TENANT_ALPHA, {
    domains: ["vogelsang-maschinenbau.de"],
    industry: "Maschinenbau",
    name: "Vogelsang Maschinenbau",
    status: "active",
  }),
  org(4, TENANT_ALPHA, {
    domains: ["kranich-versicherung.de"],
    industry: "Versicherung",
    name: "Kranich Versicherung",
    status: "former",
  }),
  org(5, TENANT_ALPHA, {
    domains: ["steinweg-immobilien.de"],
    industry: "Immobilien",
    name: "Steinweg Immobilien",
    status: "lead",
  }),
  // Tenant beta. Same industry word, different company — the lexical arm should
  // still never cross, because the filter is on tenantId, not on text.
  org(6, TENANT_BETA, {
    domains: ["hafenlogistik-sued.de"],
    industry: "Logistik",
    name: "Hafenlogistik Süd GmbH",
    status: "active",
  }),
];

export const people: Person[] = [
  person(1, TENANT_ALPHA, {
    emails: ["anke.feldmann@hafenlogistik-nord.de"],
    name: "Anke Feldmann",
    organizationId: oid(ID_KIND.organization, 1),
    role: "Geschäftsführerin",
  }),
  person(2, TENANT_ALPHA, {
    emails: ["jonas.reimers@hafenlogistik-nord.de"],
    name: "Jonas Reimers",
    organizationId: oid(ID_KIND.organization, 1),
    role: "Lagerleiter",
  }),
  person(3, TENANT_ALPHA, {
    emails: ["sabine.ohlsen@brauhaus-elbe.de"],
    name: "Sabine Ohlsen",
    organizationId: oid(ID_KIND.organization, 2),
    role: "Vertriebsleiterin",
  }),
  // Confusable across tenants with person #11 below — cross-tenant.eval.ts
  // exercises this collision to prove the retrieval agent scopes by tenantId
  // and not by name.
  person(4, TENANT_ALPHA, {
    emails: ["martin.kowalski@hafenlogistik-nord.de"],
    name: "Martin Kowalski",
    organizationId: oid(ID_KIND.organization, 1),
    role: "Einkaufsleiter",
  }),
  person(5, TENANT_ALPHA, {
    emails: ["thorsten.wiechmann@brauhaus-elbe.de"],
    name: "Thorsten Wiechmann",
    organizationId: oid(ID_KIND.organization, 2),
    role: "Braumeister",
  }),
  person(6, TENANT_ALPHA, {
    emails: ["katrin.suhrbier@vogelsang-maschinenbau.de"],
    name: "Katrin Suhrbier",
    organizationId: oid(ID_KIND.organization, 3),
    role: "Konstruktionsleiterin",
  }),
  person(7, TENANT_ALPHA, {
    emails: ["bjarne.petersen@vogelsang-maschinenbau.de"],
    name: "Bjarne Petersen",
    organizationId: oid(ID_KIND.organization, 3),
    role: "Vertriebsleiter",
  }),
  person(8, TENANT_ALPHA, {
    emails: ["ingrid.dahlmann@kranich-versicherung.de"],
    name: "Ingrid Dahlmann",
    organizationId: oid(ID_KIND.organization, 4),
    role: "Schadensreferentin",
  }),
  person(9, TENANT_ALPHA, {
    emails: ["malte.ehlers@steinweg-immobilien.de"],
    name: "Malte Ehlers",
    organizationId: oid(ID_KIND.organization, 5),
    role: "Objektleiter",
  }),
  // Petra Lindqvist exists solely to be the subject of the GDPR erasure
  // eval (erasure-cascade). She is deliberately thin — do not flesh her out.
  person(10, TENANT_ALPHA, {
    emails: ["petra.lindqvist@vogelsang-maschinenbau.de"],
    name: "Petra Lindqvist",
    organizationId: oid(ID_KIND.organization, 3),
    role: "Projektleiterin",
  }),
  // Confusable across tenants with person #4 above.
  person(11, TENANT_BETA, {
    emails: ["martin.kowalski@hafenlogistik-sued.de"],
    name: "Martin Kowalski",
    organizationId: oid(ID_KIND.organization, 6),
    role: "Geschäftsführer",
  }),
  person(12, TENANT_BETA, {
    emails: ["lena.ohlendorf@hafenlogistik-sued.de"],
    name: "Lena Ohlendorf",
    organizationId: oid(ID_KIND.organization, 6),
    role: "Personalleiterin",
  }),
];

export const engagements: Engagement[] = [
  engagement(1, TENANT_ALPHA, {
    endDate: new Date("2025-12-20T00:00:00.000Z"),
    organizationId: oid(ID_KIND.organization, 1),
    startDate: new Date("2025-09-15T00:00:00.000Z"),
    status: "completed",
    title: "Digitalisierung Lagerverwaltung",
    type: "Beratung",
  }),
  engagement(2, TENANT_ALPHA, {
    organizationId: oid(ID_KIND.organization, 2),
    startDate: new Date("2026-01-10T00:00:00.000Z"),
    status: "active",
    title: "Einführung Qualitätsmanagementsystem",
    type: "Beratung",
  }),
  engagement(3, TENANT_ALPHA, {
    organizationId: oid(ID_KIND.organization, 3),
    startDate: new Date("2026-06-01T00:00:00.000Z"),
    status: "planned",
    title: "Prozessoptimierung Fertigung",
    type: "Projekt",
  }),
  engagement(4, TENANT_ALPHA, {
    endDate: new Date("2025-10-15T00:00:00.000Z"),
    organizationId: oid(ID_KIND.organization, 4),
    startDate: new Date("2025-10-01T00:00:00.000Z"),
    status: "cancelled",
    title: "Schadenprozess-Audit",
    type: "Audit",
  }),
  engagement(5, TENANT_ALPHA, {
    endDate: new Date("2026-02-28T00:00:00.000Z"),
    organizationId: oid(ID_KIND.organization, 5),
    startDate: new Date("2025-11-01T00:00:00.000Z"),
    status: "completed",
    title: "Markteinschätzung Gewerbeimmobilien",
    type: "Analyse",
  }),
];

/** Named lookup so later tasks and evals read as prose, not ordinals. */
export const ID = {
  ankeFeldmann: oid(ID_KIND.person, 1),
  bjarnePetersen: oid(ID_KIND.person, 7),
  brauhaus: oid(ID_KIND.organization, 2),
  brauhausQm: oid(ID_KIND.engagement, 2),
  hafenlogistikNord: oid(ID_KIND.organization, 1),
  hafenlogistikNordDigitalisierung: oid(ID_KIND.engagement, 1),
  hafenlogistikSued: oid(ID_KIND.organization, 6),
  ingridDahlmann: oid(ID_KIND.person, 8),
  jonasReimers: oid(ID_KIND.person, 2),
  katrinSuhrbier: oid(ID_KIND.person, 6),
  kranich: oid(ID_KIND.organization, 4),
  kranichAudit: oid(ID_KIND.engagement, 4),
  lenaOhlendorf: oid(ID_KIND.person, 12),
  malteEhlers: oid(ID_KIND.person, 9),
  martinKowalskiAlpha: oid(ID_KIND.person, 4),
  martinKowalskiBeta: oid(ID_KIND.person, 11),
  petraLindqvist: oid(ID_KIND.person, 10),
  sabineOhlsen: oid(ID_KIND.person, 3),
  steinweg: oid(ID_KIND.organization, 5),
  steinwegMarkteinschaetzung: oid(ID_KIND.engagement, 5),
  thorstenWiechmann: oid(ID_KIND.person, 5),
  vogelsang: oid(ID_KIND.organization, 3),
  vogelsangProzessoptimierung: oid(ID_KIND.engagement, 3),
} as const;
