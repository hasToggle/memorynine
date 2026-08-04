import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { getCollections } from "./collections";
import type { GatewayUsage, UsageContext } from "./gateway";
import type { UsageOperation } from "./schemas/usage";

// Spend telemetry. `recordUsage` writes one row per model call so a later
// report can group by tenant/operation/correlationId to answer "what did
// ingesting source X cost." `createUsageRecorder` adapts it to the
// gateway's `onUsage` callback shape: fire-and-forget, because telemetry
// must never fail the pipeline call it's reporting on.

export const recordUsage = async (
  db: Db,
  usage: GatewayUsage,
  context: UsageContext
): Promise<void> => {
  const now = new Date();
  await getCollections(db).usage.insertOne({
    _id: new ObjectId(),
    ...usage,
    ...(context.correlationId === undefined
      ? {}
      : { correlationId: context.correlationId }),
    createdAt: now,
    operation: context.operation as UsageOperation,
    tenantId: context.tenantId,
    updatedAt: now,
  });
};

/**
 * A fire-and-forget `onUsage` handler. Spend telemetry must never fail an
 * extraction, a consolidation, or a contradiction check, so every failure —
 * a rejecting insert, a missing context — is swallowed rather than
 * propagated. Returns `void`, not a promise: nothing awaits an `onUsage`
 * callback, so the `.catch` is attached synchronously here rather than left
 * for a caller to forget.
 */
export const createUsageRecorder =
  (db: Db) =>
  (usage: GatewayUsage, context?: UsageContext): void => {
    if (!context) {
      return;
    }
    recordUsage(db, usage, context).catch(() => {
      // Deliberately swallowed: Mongo being down must not break ingestion.
    });
  };
