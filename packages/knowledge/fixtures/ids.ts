import { ObjectId } from "mongodb";

/** Fixture id namespaces. Kept apart so an org id can never collide with a fact id. */
export const ID_KIND = {
  engagement: 0xa3,
  fact: 0xa5,
  organization: 0xa1,
  person: 0xa2,
  source: 0xa4,
} as const;

/**
 * Deterministic ObjectId: a one-byte namespace followed by the ordinal.
 * Fixtures must never call `new ObjectId()` — a seeded corpus that changes
 * ids between runs cannot be referenced by an eval assertion.
 */
export const oid = (kind: number, n: number): ObjectId =>
  new ObjectId(
    `${kind.toString(16).padStart(2, "0")}${n.toString(16).padStart(22, "0")}`
  );
