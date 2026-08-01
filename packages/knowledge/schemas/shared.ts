import { ObjectId } from "mongodb";
import { z } from "zod";

export const zodObjectId = z.instanceof(ObjectId);

export const baseDocFields = {
  _id: zodObjectId,
  createdAt: z.date(),
  tenantId: z.string().min(1),
  updatedAt: z.date(),
};
