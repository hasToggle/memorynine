import { createHash } from "node:crypto";
import {
  type Collection,
  type Document,
  MongoServerError,
  ObjectId,
} from "mongodb";

// Crash safety without transactions, shared by every pipeline writer: _ids are
// derived deterministically from stable seeds, so a re-run after a mid-write
// crash re-attempts the same inserts and duplicate keys mean "already done".

export const deterministicId = (seed: string): ObjectId =>
  new ObjectId(createHash("md5").update(seed).digest("hex").slice(0, 24));

export const insertIgnoringDuplicate = async <T extends Document>(
  collection: Collection<T>,
  doc: T
): Promise<void> => {
  try {
    await collection.insertOne(doc as never);
  } catch (error) {
    const alreadyDone =
      error instanceof MongoServerError && error.code === 11_000;
    if (!alreadyDone) {
      throw error;
    }
  }
};
