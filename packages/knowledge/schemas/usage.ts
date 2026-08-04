import { z } from "zod";
import { baseDocFields } from "./shared";

export const usageOperationValues = [
  "extraction",
  "consolidation",
  "contradiction",
  "eval-extraction",
  "eval-judge",
  "rerank",
] as const;
export type UsageOperation = (typeof usageOperationValues)[number];

// One row per model call. Costs are plain numbers: the smallest figure of
// interest is $0.0001 and totals are reported to the cent, so float rounding
// is irrelevant at these magnitudes.
export const usageSchema = z.object({
  ...baseDocFields,
  cachedTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  /** What groups this spend: a sourceId, an anchor id, an eval run id. */
  correlationId: z.string().min(1).optional(),
  /** True when cost was computed from a rate constant rather than reported
   *  by the vendor. Set for rerank. Never let an estimate read as exact. */
  estimated: z.boolean().optional(),
  /** Total billed — inference plus surcharges. The number to report. */
  gatewayCost: z.number().min(0),
  /** Reconciliation key against Vercel's dashboard. */
  generationId: z.string().min(1).optional(),
  inferenceCost: z.number().min(0),
  model: z.string().min(1),
  operation: z.enum(usageOperationValues),
  promptTokens: z.number().int().min(0),
  reasoningTokens: z.number().int().min(0),
  surchargeCost: z.number().min(0),
});
export type Usage = z.infer<typeof usageSchema>;
