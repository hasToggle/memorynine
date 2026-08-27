import { z } from "zod";
import { baseDocFields } from "./shared";

// Operational collections for the initiative loop (spec §5). These are not
// knowledge: nothing here is extracted, reviewed, or erased — settings say who
// wants outbound mail, deliveries record that we sent (or deliberately did not
// send) it. Both live in the knowledge DB because the sweep is tenant-scoped
// the same way every knowledge query is.

export const initiativeSettingsSchema = z.object({
  ...baseDocFields,
  enabled: z.boolean(),
  // Stored directly rather than resolved from the auth DB at send time: the
  // cron must not depend on a second database to deliver mail (spec §10).
  recipients: z.array(z.email()).min(1),
});
export type InitiativeSettings = z.infer<typeof initiativeSettingsSchema>;

export const deliveryOutcomeValues = [
  "claimed",
  "sent",
  "no-news",
  "failed",
] as const;
export type DeliveryOutcome = (typeof deliveryOutcomeValues)[number];

export const initiativeDeliverySchema = z.object({
  ...baseDocFields,
  // UTC day key; combined with tenantId it seeds the deterministic _id that
  // makes "at most one send per tenant per day" an insert-time guarantee.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  error: z.string().optional(),
  outcome: z.enum(deliveryOutcomeValues),
  recipients: z.array(z.string()),
});
export type InitiativeDelivery = z.infer<typeof initiativeDeliverySchema>;
