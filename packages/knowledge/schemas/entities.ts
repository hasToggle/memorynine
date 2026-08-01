import { z } from "zod";
import { baseDocFields, zodObjectId } from "./shared";

export const organizationStatusValues = ["lead", "active", "former"] as const;

export const organizationSchema = z.object({
  ...baseDocFields,
  domains: z.array(z.string().min(1)).default([]),
  industry: z.string().min(1).optional(),
  name: z.string().min(1),
  status: z.enum(organizationStatusValues),
});
export type Organization = z.infer<typeof organizationSchema>;

export const personSchema = z.object({
  ...baseDocFields,
  emails: z.array(z.email()).default([]),
  name: z.string().min(1),
  organizationId: zodObjectId.optional(),
  role: z.string().min(1).optional(),
});
export type Person = z.infer<typeof personSchema>;

export const engagementStatusValues = [
  "planned",
  "active",
  "completed",
  "cancelled",
] as const;

export const engagementSchema = z.object({
  ...baseDocFields,
  endDate: z.date().optional(),
  organizationId: zodObjectId,
  startDate: z.date().optional(),
  status: z.enum(engagementStatusValues),
  title: z.string().min(1),
  type: z.string().min(1),
});
export type Engagement = z.infer<typeof engagementSchema>;
