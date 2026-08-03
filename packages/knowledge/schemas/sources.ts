import { z } from "zod";
import { baseDocFields } from "./shared";

export const sourceStatusValues = [
  "received",
  "transcribing",
  "transcribed",
  "extracting",
  "proposed",
  "reviewed",
  "failed",
] as const;

export const sourceSchema = z.object({
  ...baseDocFields,
  attachments: z
    .array(
      z.object({
        blobUrl: z.url(),
        contentType: z.string().min(1),
        filename: z.string().min(1),
      })
    )
    .optional(),
  audio: z
    .object({
      blobUrl: z.url(),
      contentType: z.string().min(1),
      durationSeconds: z.number().positive().optional(),
    })
    .optional(),
  // Set by the erasure cascade when every fact backed by this source is gone:
  // the caller must delete the referenced blobs, then unset audio/attachments.
  blobsPendingDeletion: z.boolean().optional(),
  capturedBy: z.string().min(1),
  // The textual payload: transcript (voice), body (email), or pasted text (manual).
  content: z.string().optional(),
  email: z
    .object({
      forwardedBy: z.string().min(1),
      messageId: z.string().min(1),
      originalSender: z.string().min(1),
      sentAt: z.date(),
      subject: z.string(),
    })
    .optional(),
  error: z.string().optional(),
  // Failure budget for the extraction worker: consecutive failed attempts.
  // At the worker's maxAttempts the status flips to "failed" instead of
  // retrying forever; a successful run clears it.
  extractionAttempts: z.number().int().min(0).optional(),
  // When the described events actually happened, as distinct from createdAt
  // (when we captured them). An email carries its own sentAt; a forwarded
  // thread can describe something far older than the moment it reached us.
  // Facts extracted from this source inherit it as their validFrom.
  occurredAt: z.date().optional(),
  status: z.enum(sourceStatusValues),
  // Same failure-budget convention as extractionAttempts, for the
  // transcription stage.
  transcriptionAttempts: z.number().int().min(0).optional(),
  type: z.enum(["voice", "email", "manual"]),
});
export type Source = z.infer<typeof sourceSchema>;
